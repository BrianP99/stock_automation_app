// Turns the strategy's decisions into real broker orders, and refuses to let
// trading continue once our book and the broker's disagree.
//
// The engine updates the paper portfolio before these calls run, so ANY broker
// failure — rejection or timeout — means the recorded state no longer matches
// reality. Every such case halts trading for a human rather than continuing on
// a wrong picture, which is how a small error turns into a large one.

import { getKisConfig, placeOrder, fetchBalance, reconcilePositions, type KisPosition } from './kisClient';
import type { BrokerOrderRecord, PortfolioState, TradeOrder } from '../src/types';

/**
 * Limit orders need a price that actually fills. Crossing the spread by this
 * much buys that certainty while bounding how far the fill can drift from the
 * price the decision was made at; a market order would bound nothing.
 */
const LIMIT_CROSS_PERCENT = 0.5;

/**
 * A freshly accepted order has not settled yet, so an immediate balance check
 * would report a mismatch that is really just a pending fill. Reconciliation
 * resumes once an order is older than this.
 */
const RECONCILE_GRACE_MS = 10 * 60 * 1000;

export function isBrokerConnected(): boolean {
  return getKisConfig() !== null;
}

/**
 * KRX market holidays, by KST date.
 *
 * Deliberately a table rather than a lookup against the broker's holiday API.
 * "Is the market open" sits on the critical path of every tick, and a network
 * call there would need its own answer to "what if it does not respond" — which
 * is the exact failure class that halted this system twice. A table cannot time
 * out. The cost is that it has to be extended each year, which is why running
 * past its coverage says so out loud instead of quietly assuming a trading day.
 *
 * Lunar holidays move, substitute holidays depend on which weekday the date
 * falls on, and the exchange adds closures of its own (election day, the last
 * session of the year), so these come from the exchange's published calendar
 * rather than from a rule.
 */
const KRX_HOLIDAYS = new Map<string, string>([
  ['2026-01-01', '신정'],
  ['2026-02-16', '설날 연휴'],
  ['2026-02-17', '설날'],
  ['2026-02-18', '설날 연휴'],
  ['2026-03-02', '삼일절 대체공휴일'],
  ['2026-05-01', '근로자의 날'],
  ['2026-05-05', '어린이날'],
  ['2026-05-25', '부처님오신날 대체공휴일'],
  ['2026-06-03', '전국동시지방선거'],
  ['2026-07-17', '제헌절'],
  ['2026-08-17', '광복절 대체공휴일'],
  ['2026-09-24', '추석 연휴'],
  ['2026-09-25', '추석'],
  ['2026-10-05', '개천절 대체공휴일'],
  ['2026-10-09', '한글날'],
  ['2026-12-25', '성탄절'],
  ['2026-12-31', '연말 휴장'],
]);

/**
 * The last KST date the table above actually covers. Past this the calendar is
 * silent, not empty — so the honest reading is "unknown", surfaced to the
 * dashboard. Trading continues, because assuming a closed market would skip
 * real sessions, which is the worse mistake; an order on an unlisted holiday is
 * still rejected and still pauses, exactly as before this table existed.
 */
const KRX_HOLIDAY_CALENDAR_THROUGH = '2026-12-31';

const MARKET_OPEN_MINUTE = 9 * 60;
const MARKET_CLOSE_MINUTE = 15 * 60 + 30;

/** KST is a fixed offset with no daylight saving, so shifting the clock is enough. */
function kstParts(now: Date): { date: string; weekday: number; minutesIntoDay: number } {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return {
    date: kst.toISOString().slice(0, 10),
    weekday: kst.getUTCDay(),
    minutesIntoDay: kst.getUTCHours() * 60 + kst.getUTCMinutes(),
  };
}

export interface KrxMarketStatus {
  open: boolean;
  /** Null while open. Otherwise why, so the dashboard can say something true. */
  closedReason: 'weekend' | 'holiday' | 'outside-hours' | null;
  /** Set when closedReason is 'holiday'. */
  holidayName?: string;
  /** True once the date is past what KRX_HOLIDAYS covers — the table needs extending. */
  calendarStale: boolean;
}

/**
 * Whether KRX is trading right now (09:00-15:30 KST, weekdays, excluding the
 * holidays above).
 *
 * The scheduled tick runs around the clock, but orders only reach an open
 * exchange. Without this the worst case is precise: SPY closes below its trend
 * line at roughly 05:00 KST, the next tick tries to sell into a shut market,
 * the rejection trips the halt, and the system is still paused when KRX opens
 * four hours later — failing at exactly the moment the strategy exists for.
 */
export function krxMarketStatus(now: Date = new Date()): KrxMarketStatus {
  const { date, weekday, minutesIntoDay } = kstParts(now);
  const calendarStale = date > KRX_HOLIDAY_CALENDAR_THROUGH;

  if (weekday === 0 || weekday === 6) {
    return { open: false, closedReason: 'weekend', calendarStale };
  }

  const holidayName = KRX_HOLIDAYS.get(date);
  if (holidayName) {
    return { open: false, closedReason: 'holiday', holidayName, calendarStale };
  }

  if (minutesIntoDay < MARKET_OPEN_MINUTE || minutesIntoDay > MARKET_CLOSE_MINUTE) {
    return { open: false, closedReason: 'outside-hours', calendarStale };
  }

  return { open: true, closedReason: null, calendarStale };
}

export function isKrxOpen(now: Date = new Date()): boolean {
  return krxMarketStatus(now).open;
}

/** Which account the orders would go to — surfaced so the UI can never hide that it is real. */
export function brokerEnvironment(): 'paper' | 'real' | null {
  return getKisConfig()?.environment ?? null;
}

function limitPriceFor(side: 'BUY' | 'SELL', priceKrw: number): number {
  const factor = side === 'BUY' ? 1 + LIMIT_CROSS_PERCENT / 100 : 1 - LIMIT_CROSS_PERCENT / 100;
  return Math.max(1, Math.round(priceKrw * factor));
}

export interface BrokerExecutionResult {
  records: BrokerOrderRecord[];
  /** Non-null means trading must stop until a human has looked. */
  halt: string | null;
}

/**
 * Sends each order to the broker in sequence, stopping at the first failure.
 *
 * Stopping early is deliberate: once one order's outcome is wrong or unknown,
 * the portfolio state the later orders were computed from is no longer
 * trustworthy, so sending them would compound the error.
 */
export async function executeOrders(orders: TradeOrder[]): Promise<BrokerExecutionResult> {
  const records: BrokerOrderRecord[] = [];
  if (!isBrokerConnected() || orders.length === 0) return { records, halt: null };

  for (const order of orders) {
    const limitPriceKrw = limitPriceFor(order.type, order.price);
    const clientOrderId = order.id;

    const outcome = await placeOrder({
      symbol: order.symbol,
      side: order.type,
      quantity: order.quantity,
      limitPriceKrw,
      clientOrderId,
    });

    const base = {
      id: `broker-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      clientOrderId,
      symbol: order.symbol,
      side: order.type,
      quantity: order.quantity,
      limitPriceKrw,
    };

    if (outcome.status === 'accepted') {
      records.push({ ...base, status: 'accepted', orderNo: outcome.orderNo });
      continue;
    }

    if (outcome.status === 'rejected') {
      records.push({ ...base, status: 'rejected', code: outcome.code, message: outcome.message });
      return {
        records,
        halt: `증권사가 주문을 거부했습니다 (${order.type === 'BUY' ? '매수' : '매도'} ${order.stockName} ${order.quantity}주): ${outcome.message}. 기록된 내역과 실제 계좌가 다를 수 있으니 확인이 필요합니다.`,
      };
    }

    // 'unknown' — the exchange may or may not have the order. Never resend.
    records.push({ ...base, status: 'unknown', message: outcome.message });
    return {
      records,
      halt: `주문 결과를 확인하지 못했습니다 (${order.type === 'BUY' ? '매수' : '매도'} ${order.stockName} ${order.quantity}주). 중복 주문 위험이 있어 재전송하지 않았습니다. 증권사 앱에서 체결 여부를 직접 확인해주세요.`,
    };
  }

  return { records, halt: null };
}

/**
 * Corrects our recorded cost basis to the broker's.
 *
 * Orders fill at whatever the market gives, not at the price the decision was
 * made on — the first live buy was booked at 23,970 and filled at 23,964.
 * Reconciliation only compares quantities, so without this the difference
 * compounds quietly with every trade until valuation no longer matches the
 * account. The broker's number is the real one; ours should follow it.
 */
export function syncCostBasisFromBroker(portfolio: PortfolioState, brokerPositions: KisPosition[]): PortfolioState {
  if (!brokerPositions.length) return portfolio;
  const bySymbol = new Map(brokerPositions.map((p) => [p.symbol, p]));

  const sweepAtBroker = portfolio.cashSweep ? bySymbol.get(portfolio.cashSweep.symbol) : undefined;
  return {
    ...portfolio,
    positions: portfolio.positions.map((p) => {
      const broker = bySymbol.get(p.symbol);
      if (!broker?.avgPriceKrw) return p;
      return {
        ...p,
        avgBuyPriceKrw: broker.avgPriceKrw,
        // KRX holdings are quoted in KRW, so the native price is the same number.
        avgBuyPriceNative: p.currency === 'KRW' ? broker.avgPriceKrw : p.avgBuyPriceNative,
      };
    }),
    cashSweep:
      portfolio.cashSweep && sweepAtBroker?.avgPriceKrw
        ? {
            ...portfolio.cashSweep,
            avgBuyPriceKrw: sweepAtBroker.avgPriceKrw,
            avgBuyPriceNative: sweepAtBroker.avgPriceKrw,
          }
        : portfolio.cashSweep,
  };
}

export interface BrokerVerification {
  ok: boolean;
  /** True when the check was deliberately skipped (no broker, or a fill still settling). */
  skipped: boolean;
  /**
   * True when the broker could not be reached at all, as opposed to answering
   * with holdings that disagree with ours. The two need different responses: a
   * confirmed mismatch means our book is wrong and trading must stop, while an
   * unreachable API means we simply do not know yet and should try again.
   */
  unavailable: boolean;
  message: string;
  /** The broker's own holdings when the check actually ran — the reference for correcting our recorded prices. */
  brokerPositions?: KisPosition[];
}

/**
 * Checks our recorded holdings against the broker's before any new trading.
 *
 * Run at the start of a tick rather than straight after ordering: an accepted
 * order is not a filled one, and comparing during settlement would report a
 * mismatch that resolves itself minutes later.
 */
export async function verifyAgainstBroker(
  /** Must include the treasury sweep: it is a real holding at the account, not just a ledger entry. */
  ourPositions: { symbol: string; quantity: number }[],
  lastBrokerOrderAt: string | null
): Promise<BrokerVerification> {
  if (!isBrokerConnected()) {
    return { ok: true, skipped: true, unavailable: false, message: '증권사 미연결 (페이퍼 모드)' };
  }

  if (lastBrokerOrderAt) {
    const age = Date.now() - new Date(lastBrokerOrderAt).getTime();
    if (age >= 0 && age < RECONCILE_GRACE_MS) {
      return { ok: true, skipped: true, unavailable: false, message: '최근 주문 체결 대기 중이라 대조를 건너뜁니다.' };
    }
  }

  try {
    const balance = await fetchBalance();
    if (!balance) return { ok: true, skipped: true, unavailable: false, message: '증권사 미연결 (페이퍼 모드)' };
    const result = reconcilePositions(ourPositions, balance.positions);
    return {
      ok: result.ok,
      skipped: false,
      unavailable: false,
      message: result.message,
      brokerPositions: balance.positions,
    };
  } catch (err) {
    // Unreachable, not wrong. Still not safe to trade on — the caller holds off
    // — but a single blip must not be treated as evidence the book is broken.
    return {
      ok: false,
      skipped: false,
      unavailable: true,
      message: `증권사 잔고를 조회하지 못해 대조할 수 없습니다: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
