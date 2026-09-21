// Korea Investment & Securities (한국투자증권) Open API client.
//
// Only domestic-stock endpoints are used: the strategy trades a KRX-listed
// S&P 500 ETF rather than SPY itself, so orders go through the 국내주식 API
// that paper trading definitely supports, and the position is priced in KRW
// with no FX leg of its own.
//
// Nothing here trades unless the environment supplies credentials, and the
// real-money host is reachable only when KIS_ENV is explicitly "real" — a
// missing or misspelled value lands on the paper host, never on live money.

import type { Market } from '../src/types';

const PAPER_HOST = 'https://openapivts.koreainvestment.com:29443';
const REAL_HOST = 'https://openapi.koreainvestment.com:9443';

const TOKEN_PATH = '/oauth2/tokenP';
const ORDER_PATH = '/uapi/domestic-stock/v1/trading/order-cash';
const BALANCE_PATH = '/uapi/domestic-stock/v1/trading/inquire-balance';

// tr_id encodes both the action and the environment; a paper id sent to the
// real host (or the reverse) is rejected, which is a useful extra guard.
const TR_ID = {
  paper: { buy: 'VTTC0802U', sell: 'VTTC0801U', balance: 'VTTC8434R' },
  real: { buy: 'TTTC0802U', sell: 'TTTC0801U', balance: 'TTTC8434R' },
} as const;

const REQUEST_TIMEOUT_MS = 10_000;
// KIS throttles token issuance, and a token lasts a day. Re-use it and renew a
// little early rather than asking per request.
const TOKEN_RENEW_MARGIN_MS = 60 * 60 * 1000;

export type KisEnvironment = 'paper' | 'real';

export interface KisConfig {
  appKey: string;
  appSecret: string;
  /** 8-digit account number. */
  accountNo: string;
  /** 2-digit product code, the part after the dash. */
  accountProductCode: string;
  environment: KisEnvironment;
  /** Hard ceiling on a single order's notional value, in KRW. */
  maxOrderKrw: number;
}

function readEnv(name: string): string | undefined {
  // Netlify Functions expose env vars through the Netlify global; plain Node
  // (local dev, scripts) through process.env.
  const netlifyEnv = (globalThis as any).Netlify?.env;
  return netlifyEnv?.get?.(name) || process.env[name];
}

/**
 * Returns the configured client settings, or null when credentials are absent.
 * Callers must treat null as "broker not connected" and fall back to paper
 * bookkeeping — never as "assume it worked".
 */
export function getKisConfig(): KisConfig | null {
  const appKey = readEnv('KIS_APP_KEY');
  const appSecret = readEnv('KIS_APP_SECRET');
  const account = readEnv('KIS_ACCOUNT_NO'); // "12345678-01"
  if (!appKey || !appSecret || !account) return null;

  const [accountNo, accountProductCode = '01'] = account.trim().split('-');
  if (!/^\d{8}$/.test(accountNo)) return null;

  return {
    appKey,
    appSecret,
    accountNo,
    accountProductCode,
    // Anything other than the exact string "real" stays on paper.
    environment: readEnv('KIS_ENV') === 'real' ? 'real' : 'paper',
    maxOrderKrw: Number(readEnv('KIS_MAX_ORDER_KRW') || 2_000_000),
  };
}

function hostFor(env: KisEnvironment): string {
  return env === 'real' ? REAL_HOST : PAPER_HOST;
}

// --- access token -----------------------------------------------------------

let cachedToken: { value: string; expiresAt: number; env: KisEnvironment } | null = null;

async function getAccessToken(config: KisConfig): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.env === config.environment && cachedToken.expiresAt - TOKEN_RENEW_MARGIN_MS > now) {
    return cachedToken.value;
  }

  const res = await fetch(`${hostFor(config.environment)}${TOKEN_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: config.appKey,
      appsecret: config.appSecret,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    // Deliberately does not echo the body: it can contain the app key.
    throw new Error(`KIS 토큰 발급 실패 (HTTP ${res.status})`);
  }
  const body: any = await res.json();
  if (!body?.access_token) throw new Error('KIS 토큰 응답에 access_token이 없습니다.');

  const lifetimeMs = (Number(body.expires_in) || 86_400) * 1000;
  cachedToken = { value: body.access_token, expiresAt: now + lifetimeMs, env: config.environment };
  return cachedToken.value;
}

// --- orders -----------------------------------------------------------------

export type KisOrderOutcome =
  /** The broker accepted the order request. Acceptance is not a fill. */
  | { status: 'accepted'; orderNo: string; orderTime: string }
  /** The broker rejected it outright — safe to treat as "no order exists". */
  | { status: 'rejected'; code: string; message: string }
  /**
   * The request failed in a way that leaves the outcome genuinely unknown
   * (timeout, network error). The order may or may not have reached the
   * exchange, so it must NEVER be retried blindly — reconcile against the
   * broker's own records first.
   */
  | { status: 'unknown'; message: string };

export interface KisOrderRequest {
  /** KRX 6-digit code, e.g. '360750' for TIGER 미국S&P500. */
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  /** Omit for a market order. */
  limitPriceKrw?: number;
  /** Used only for our own logs — KIS has no idempotency key of its own. */
  clientOrderId: string;
}

/**
 * Places a cash order for a KRX-listed instrument.
 *
 * The notional ceiling is enforced here rather than at the call site so every
 * path — strategy tick, manual button, future callers — inherits it.
 */
export async function placeOrder(req: KisOrderRequest): Promise<KisOrderOutcome> {
  const config = getKisConfig();
  if (!config) return { status: 'rejected', code: 'NOT_CONFIGURED', message: 'KIS 인증 정보가 설정되지 않았습니다.' };

  if (!Number.isInteger(req.quantity) || req.quantity <= 0) {
    return { status: 'rejected', code: 'BAD_QUANTITY', message: '주문 수량이 올바르지 않습니다.' };
  }

  // A market order has no price to check against, so the cap is applied to the
  // limit price when there is one and refused outright when there isn't.
  if (req.limitPriceKrw == null) {
    return { status: 'rejected', code: 'MARKET_ORDER_BLOCKED', message: '금액 상한을 검증할 수 없어 시장가 주문은 막았습니다.' };
  }
  const notional = req.limitPriceKrw * req.quantity;
  if (notional > config.maxOrderKrw) {
    return {
      status: 'rejected',
      code: 'ORDER_TOO_LARGE',
      message: `1회 주문 한도 ${config.maxOrderKrw.toLocaleString('ko-KR')}원을 초과했습니다 (${Math.round(notional).toLocaleString('ko-KR')}원).`,
    };
  }

  let token: string;
  try {
    token = await getAccessToken(config);
  } catch (err) {
    return { status: 'rejected', code: 'AUTH_FAILED', message: err instanceof Error ? err.message : String(err) };
  }

  const trId = req.side === 'BUY' ? TR_ID[config.environment].buy : TR_ID[config.environment].sell;
  const payload = {
    CANO: config.accountNo,
    ACNT_PRDT_CD: config.accountProductCode,
    PDNO: req.symbol,
    ORD_DVSN: '00', // 지정가
    ORD_QTY: String(req.quantity),
    ORD_UNPR: String(Math.round(req.limitPriceKrw)),
  };

  try {
    const res = await fetch(`${hostFor(config.environment)}${ORDER_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: config.appKey,
        appsecret: config.appSecret,
        tr_id: trId,
        custtype: 'P',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    // A non-2xx here still means the request reached KIS and was refused, so
    // the outcome is known: no order was created.
    const body: any = await res.json().catch(() => null);
    if (!res.ok || body?.rt_cd !== '0') {
      return {
        status: 'rejected',
        code: body?.msg_cd || `HTTP_${res.status}`,
        message: body?.msg1 || `주문이 거부되었습니다 (HTTP ${res.status}).`,
      };
    }

    return {
      status: 'accepted',
      orderNo: body?.output?.ODNO || '',
      orderTime: body?.output?.ORD_TMD || '',
    };
  } catch (err) {
    // Timeout or transport failure: we cannot tell whether the exchange saw it.
    return {
      status: 'unknown',
      message: `주문 결과를 확인할 수 없습니다. 재전송하지 말고 잔고를 대조하세요. (${err instanceof Error ? err.message : String(err)})`,
    };
  }
}

// --- balance ----------------------------------------------------------------

export interface KisPosition {
  symbol: string;
  name: string;
  quantity: number;
  avgPriceKrw: number;
  evalAmountKrw: number;
}

export interface KisBalance {
  cashKrw: number;
  positions: KisPosition[];
  /** Broker's own total evaluation, used as the reconciliation reference. */
  totalEvalKrw: number;
}

/** Reads the broker's own view of the account — the truth our state is checked against. */
export async function fetchBalance(): Promise<KisBalance | null> {
  const config = getKisConfig();
  if (!config) return null;

  const token = await getAccessToken(config);
  const params = new URLSearchParams({
    CANO: config.accountNo,
    ACNT_PRDT_CD: config.accountProductCode,
    AFHR_FLPR_YN: 'N',
    OFL_YN: '',
    INQR_DVSN: '02',
    UNPR_DVSN: '01',
    FUND_STTL_ICLD_YN: 'N',
    FNCG_AMT_AUTO_RDPT_YN: 'N',
    PRCS_DVSN: '00',
    CTX_AREA_FK100: '',
    CTX_AREA_NK100: '',
  });

  const res = await fetch(`${hostFor(config.environment)}${BALANCE_PATH}?${params}`, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`,
      appkey: config.appKey,
      appsecret: config.appSecret,
      tr_id: TR_ID[config.environment].balance,
      custtype: 'P',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`잔고 조회 실패 (HTTP ${res.status})`);
  const body: any = await res.json();
  if (body?.rt_cd !== '0') throw new Error(body?.msg1 || '잔고 조회가 거부되었습니다.');

  const holdings: any[] = Array.isArray(body.output1) ? body.output1 : [];
  const summary: any = Array.isArray(body.output2) ? body.output2[0] || {} : body.output2 || {};

  return {
    cashKrw: Number(summary.dnca_tot_amt || 0),
    totalEvalKrw: Number(summary.tot_evlu_amt || 0),
    positions: holdings
      .filter((h) => Number(h.hldg_qty) > 0)
      .map((h) => ({
        symbol: String(h.pdno),
        name: String(h.prdt_name || ''),
        quantity: Number(h.hldg_qty || 0),
        avgPriceKrw: Number(h.pchs_avg_pric || 0),
        evalAmountKrw: Number(h.evlu_amt || 0),
      })),
  };
}

// --- reconciliation ---------------------------------------------------------

export interface ReconcileMismatch {
  symbol: string;
  ours: number;
  broker: number;
}

export interface ReconcileResult {
  ok: boolean;
  mismatches: ReconcileMismatch[];
  message: string;
}

/**
 * Compares our recorded positions against the broker's.
 *
 * Any disagreement means our bookkeeping and reality have diverged — an order
 * that filled when we thought it failed, a partial fill, a manual trade in the
 * app. Trading on a wrong picture is how a small bug becomes a large loss, so
 * callers should pause rather than continue on a mismatch.
 */
export function reconcilePositions(
  ours: { symbol: string; quantity: number }[],
  broker: KisPosition[]
): ReconcileResult {
  const brokerBySymbol = new Map(broker.map((p) => [p.symbol, p.quantity]));
  const symbols = new Set([...ours.map((p) => p.symbol), ...brokerBySymbol.keys()]);

  const mismatches: ReconcileMismatch[] = [];
  for (const symbol of symbols) {
    const oursQty = ours.find((p) => p.symbol === symbol)?.quantity ?? 0;
    const brokerQty = brokerBySymbol.get(symbol) ?? 0;
    if (oursQty !== brokerQty) mismatches.push({ symbol, ours: oursQty, broker: brokerQty });
  }

  return {
    ok: mismatches.length === 0,
    mismatches,
    message: mismatches.length
      ? `보유 수량이 증권사 기록과 다릅니다: ${mismatches
          .map((m) => `${m.symbol} (우리 ${m.ours}주 / 증권사 ${m.broker}주)`)
          .join(', ')}`
      : '증권사 잔고와 일치합니다.',
  };
}

/** KRX-listed S&P 500 trackers the strategy can trade. Market is always KRX here. */
export const KRX_SP500_ETFS: { symbol: string; name: string; market: Market; hedged: boolean }[] = [
  { symbol: '360750', name: 'TIGER 미국S&P500', market: 'KRX', hedged: false },
  { symbol: '379800', name: 'KODEX 미국S&P500', market: 'KRX', hedged: false },
  { symbol: '449180', name: 'KODEX 미국S&P500선물(H)', market: 'KRX', hedged: true },
];
