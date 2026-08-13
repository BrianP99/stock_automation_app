import { sma, rsi, detectCross, generateSignal, TradingSignal } from './indicators';

// --- Yahoo Finance chart API client (no API key required) --------------------------------

const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
const FETCH_TIMEOUT_MS = 8000;

/** Korean 6-digit KRX codes (e.g. 005930) map to Yahoo's "<code>.KS" symbol. Anything else (US tickers) is used as-is. */
export function toYahooSymbol(symbol: string): string {
  const trimmed = symbol.trim().toUpperCase();
  if (/^\d{6}$/.test(trimmed)) return `${trimmed}.KS`;
  return trimmed;
}

interface ParsedChart {
  timestamp: number[];
  close: number[];
  currency: string;
  previousClose: number | null;
}

async function fetchChartRaw(yahooSymbol: string, range: string, interval: string): Promise<any> {
  let lastError: unknown;
  for (const host of YAHOO_HOSTS) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(
        yahooSymbol
      )}?range=${range}&interval=${interval}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StockAutomationApp/1.0)' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Yahoo Finance responded with HTTP ${res.status}`);
      const json: any = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) throw new Error(json?.chart?.error?.description || 'No chart data returned');
      return result;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Failed to fetch chart data');
}

function parseChart(raw: any): ParsedChart {
  const timestamps: number[] = raw.timestamp || [];
  const closesRaw: (number | null)[] = raw.indicators?.quote?.[0]?.close || [];
  const timestamp: number[] = [];
  const close: number[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (closesRaw[i] == null) continue; // skip non-trading / missing bars
    timestamp.push(timestamps[i]);
    close.push(closesRaw[i] as number);
  }
  return {
    timestamp,
    close,
    currency: raw.meta?.currency || 'USD',
    previousClose: raw.meta?.chartPreviousClose ?? raw.meta?.previousClose ?? null,
  };
}

// --- tiny in-memory TTL cache (single-process; fine for this app's scale) --------------------

const cache = new Map<string, { data: unknown; expires: number }>();

function cacheGet<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return undefined;
  }
  return hit.data as T;
}

function cacheSet(key: string, data: unknown, ttlMs: number): void {
  cache.set(key, { data, expires: Date.now() + ttlMs });
}

const DAILY_HISTORY_TTL_MS = 5 * 60 * 1000; // daily bars barely change intraday
const INTRADAY_TTL_MS = 15 * 1000; // latest live price
const FX_TTL_MS = 10 * 60 * 1000;
const DEFAULT_USD_KRW_RATE = 1400;

async function getDailyHistory(symbol: string): Promise<ParsedChart> {
  const yahooSymbol = toYahooSymbol(symbol);
  const key = `daily:${yahooSymbol}`;
  const cached = cacheGet<ParsedChart>(key);
  if (cached) return cached;
  const raw = await fetchChartRaw(yahooSymbol, '6mo', '1d');
  const parsed = parseChart(raw);
  cacheSet(key, parsed, DAILY_HISTORY_TTL_MS);
  return parsed;
}

async function getLatestIntraday(symbol: string): Promise<{ price: number; time: number } | null> {
  const yahooSymbol = toYahooSymbol(symbol);
  const key = `intraday:${yahooSymbol}`;
  const cached = cacheGet<{ price: number; time: number } | null>(key);
  if (cached !== undefined) return cached;
  try {
    const raw = await fetchChartRaw(yahooSymbol, '1d', '1m');
    const parsed = parseChart(raw);
    const result = parsed.close.length
      ? { price: parsed.close[parsed.close.length - 1], time: parsed.timestamp[parsed.timestamp.length - 1] }
      : null;
    cacheSet(key, result, INTRADAY_TTL_MS);
    return result;
  } catch {
    // Live intraday tick is a nice-to-have; fall back to the daily bar if unavailable.
    cacheSet(key, null, INTRADAY_TTL_MS);
    return null;
  }
}

async function getUsdKrwRate(): Promise<number> {
  const key = 'fx:USDKRW';
  const cached = cacheGet<number>(key);
  if (cached) return cached;
  try {
    const raw = await fetchChartRaw('KRW=X', '5d', '1d');
    const parsed = parseChart(raw);
    const rate = parsed.close.length ? parsed.close[parsed.close.length - 1] : DEFAULT_USD_KRW_RATE;
    cacheSet(key, rate, FX_TTL_MS);
    return rate;
  } catch {
    cacheSet(key, DEFAULT_USD_KRW_RATE, FX_TTL_MS);
    return DEFAULT_USD_KRW_RATE;
  }
}

// --- public API ---------------------------------------------------------------------------

export interface Candle {
  time: string;
  price: number;
  sma5: number | null;
  sma20: number | null;
  sma60: number | null;
  rsi14: number | null;
  goldenCross: boolean;
  deadCross: boolean;
}

export interface StockAnalysis {
  symbol: string;
  yahooSymbol: string;
  currency: 'KRW' | 'USD';
  price: number; // always converted to KRW for consistent in-app portfolio math
  nativePrice: number;
  nativeCurrency: string;
  fxRateUsedKrw: number | null; // null when no conversion was applied (already KRW)
  previousClose: number;
  changePercent: number;
  asOf: string;
  isLive: boolean;
  history: Candle[];
  signal: TradingSignal;
}

const HISTORY_POINTS_RETURNED = 90;

export async function getStockAnalysis(symbol: string): Promise<StockAnalysis> {
  const daily = await getDailyHistory(symbol);
  if (daily.close.length < 2) {
    throw new Error('종목의 시세 데이터를 충분히 가져오지 못했습니다.');
  }

  const closes = [...daily.close];
  const timestamps = [...daily.timestamp];
  let isLive = false;

  const intraday = await getLatestIntraday(symbol);
  if (intraday) {
    const lastDailyDay = new Date(timestamps[timestamps.length - 1] * 1000).toISOString().slice(0, 10);
    const intradayDay = new Date(intraday.time * 1000).toISOString().slice(0, 10);
    if (intradayDay === lastDailyDay) {
      // Replace today's still-forming daily bar with the freshest live price.
      closes[closes.length - 1] = intraday.price;
      timestamps[timestamps.length - 1] = intraday.time;
    } else {
      closes.push(intraday.price);
      timestamps.push(intraday.time);
    }
    isLive = true;
  }

  // All technical-analysis math runs on native-currency prices — RSI is scale-invariant and
  // SMA scales linearly, so converting to KRW afterwards for display doesn't change any signal.
  const sma5Series = sma(closes, 5);
  const sma20Series = sma(closes, 20);
  const sma60Series = sma(closes, 60);
  const rsi14Series = rsi(closes, 14);

  const n = closes.length;
  const signal = generateSignal({
    price: closes[n - 1],
    sma5: sma5Series[n - 1],
    sma20: sma20Series[n - 1],
    sma60: sma60Series[n - 1],
    prevSma5: sma5Series[n - 2] ?? null,
    prevSma20: sma20Series[n - 2] ?? null,
    rsi14: rsi14Series[n - 1],
  });

  const nativeCurrency = daily.currency;
  const currency: 'KRW' | 'USD' = nativeCurrency === 'USD' ? 'USD' : 'KRW';
  const fxRate = currency === 'USD' ? await getUsdKrwRate() : 1;

  const fullHistory: Candle[] = closes.map((nativePrice, i) => {
    const cross = detectCross(sma5Series[i - 1] ?? null, sma20Series[i - 1] ?? null, sma5Series[i], sma20Series[i]);
    return {
      time: new Date(timestamps[i] * 1000).toISOString(),
      price: Math.round(nativePrice * fxRate),
      sma5: sma5Series[i] != null ? Math.round((sma5Series[i] as number) * fxRate) : null,
      sma20: sma20Series[i] != null ? Math.round((sma20Series[i] as number) * fxRate) : null,
      sma60: sma60Series[i] != null ? Math.round((sma60Series[i] as number) * fxRate) : null,
      rsi14: rsi14Series[i],
      goldenCross: cross === 'golden',
      deadCross: cross === 'dead',
    };
  });

  const nativePrice = closes[n - 1];
  const nativePreviousClose = daily.previousClose ?? closes[n - (isLive ? 2 : 1)] ?? nativePrice;
  const changePercent = nativePreviousClose
    ? Number((((nativePrice - nativePreviousClose) / nativePreviousClose) * 100).toFixed(2))
    : 0;

  return {
    symbol,
    yahooSymbol: toYahooSymbol(symbol),
    currency,
    price: Math.round(nativePrice * fxRate),
    nativePrice,
    nativeCurrency,
    fxRateUsedKrw: currency === 'USD' ? fxRate : null,
    previousClose: Math.round(nativePreviousClose * fxRate),
    changePercent,
    asOf: new Date().toISOString(),
    isLive,
    history: fullHistory.slice(-HISTORY_POINTS_RETURNED),
    signal,
  };
}

export interface QuoteSummary {
  /** Native-currency price (matches Stock.currency), e.g. $ for US tickers, 원 for KRX tickers. */
  price: number;
  changePercent: number;
  currency: 'KRW' | 'USD';
}

export async function getQuotes(symbols: string[]): Promise<Record<string, QuoteSummary | null>> {
  const entries = await Promise.all(
    symbols.map(async (sym): Promise<[string, QuoteSummary | null]> => {
      try {
        const analysis = await getStockAnalysis(sym);
        return [sym, { price: analysis.nativePrice, changePercent: analysis.changePercent, currency: analysis.currency }];
      } catch {
        return [sym, null];
      }
    })
  );
  return Object.fromEntries(entries);
}
