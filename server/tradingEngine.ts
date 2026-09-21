import type { PortfolioState, Position, TradeOrder, TradingSignal, Market } from '../src/types';
import type { StockAnalysis } from './marketData';

// Pure, I/O-free multi-position trade execution logic shared between the
// Netlify scheduled function (persistent, runs without a browser open) and
// any other runtime that needs to advance a paper-trading portfolio by one
// tick. The AI picks which stocks to hold — there is no user-chosen symbol,
// and (as of the ATR-based exits below) no user-chosen risk profile either.

// A flat stop-loss/take-profit percentage applied to every stock regardless
// of how much it normally moves was the problem: a volatile growth name
// would get stopped out on completely ordinary daily noise, while a calm
// blue-chip's stop was needlessly loose. Sizing the exit distance to each
// stock's own ATR(14) (its actual average daily range) fixes both — this
// mirrors standard systematic-trading practice (e.g. the Turtle Traders'
// 2xATR stop). See docs/troubleshooting-log.md for the "종목별 변동성 기반
// 손절" change.
const STOP_LOSS_ATR_MULTIPLIER = 2; // exit if price falls this many ATRs below entry
const TRAILING_EXIT_ATR_MULTIPLIER = 2.5; // once profitable, exit this many ATRs below the peak reached — lets winners run instead of capping at a fixed target%

// Fixed-fractional risk sizing (Van Tharp's "R-multiple" position sizing):
// how much to BUY is set so that if the ATR stop is hit, the loss is always
// this fraction of the portfolio — regardless of the stock's own volatility.
// Without this, splitting cash evenly across slots means a volatile stock's
// stop-out loses far more real money than a calm stock's, even though both
// "look like" one position. Position size is still capped at the equal-split
// share of cash so a very low-ATR stock can't swallow the whole portfolio.
const RISK_PER_TRADE_PERCENT = 0.01; // risk 1% of the portfolio per position

// Idle cash sweep: cash not currently needed for a stock position earns 0%
// just sitting in cashBalance, so it's automatically parked in a short-term
// US Treasury ETF (SGOV, ~0-3 month T-bills — near-zero price volatility, a
// functional cash substitute that pays yield) instead. Whenever a new stock
// BUY needs funding, the sweep is fully liquidated back to cash first; any
// cash still idle at the end of the tick is swept back in. This never
// touches todayTradesCount/winCount/lossCount/tradeOrders — it's cash
// management, not a trading decision the win-rate/expectancy tracking
// (see docs/paper-trading-log.md) should see.
// A KRX-listed money-market ETF, not SGOV. Orders go through the domestic API,
// so the parking instrument has to be domestic too — a US ticker could be
// tracked in the ledger but never actually bought, leaving the book claiming a
// holding the account does not have.
export const CASH_SWEEP_SYMBOL = '272580';
const CASH_SWEEP_NAME = 'TIGER 머니마켓액티브';
const CASH_SWEEP_MARKET: Market = 'KRX';
const CASH_SWEEP_CURRENCY = 'KRW' as const;
const CASH_SWEEP_EXCHANGE = '코스피';
const MIN_CASH_SWEEP_KRW = 10000; // skip sweeps too small to matter

export interface CashSweepQuote {
  priceNative: number;
  priceKrw: number;
}

/** Marks the existing sweep holding to the latest known SGOV price without buying/selling. */
function markCashSweepToMarket(portfolio: PortfolioState, quote: CashSweepQuote | null): PortfolioState {
  if (!portfolio.cashSweep || !quote) return portfolio;
  return { ...portfolio, cashSweep: { ...portfolio.cashSweep, currentValueKrw: portfolio.cashSweep.quantity * quote.priceKrw } };
}

/**
 * Fully liquidates the treasury sweep back to cash — used before sizing a new
 * stock buy, and on session exit.
 *
 * Returns the matching order so the caller can send it to the broker. Sweep
 * moves are real trades at the account level even though they are cash
 * management rather than strategy decisions.
 */
export function liquidateCashSweep(
  portfolio: PortfolioState,
  quote: CashSweepQuote | null
): { portfolio: PortfolioState; order: TradeOrder | null } {
  if (!portfolio.cashSweep) return { portfolio, order: null };
  const sweep = portfolio.cashSweep;
  const priceKrw = quote?.priceKrw ?? sweep.avgBuyPriceKrw;
  const priceNative = quote?.priceNative ?? sweep.avgBuyPriceNative;
  const proceeds = sweep.quantity * priceKrw;
  return {
    portfolio: { ...portfolio, cashBalance: portfolio.cashBalance + proceeds, cashSweep: null },
    order: makeOrder(
      'SELL',
      CASH_SWEEP_SYMBOL,
      CASH_SWEEP_NAME,
      CASH_SWEEP_MARKET,
      CASH_SWEEP_CURRENCY,
      priceKrw,
      priceNative,
      sweep.quantity,
      '대기 자금을 다시 현금으로 돌렸습니다.',
      80
    ),
  };
}

/** Parks whatever cash is left idle into the treasury sweep, averaging cost with any existing holding. */
function sweepIdleCashIntoTreasury(
  portfolio: PortfolioState,
  quote: CashSweepQuote | null
): { portfolio: PortfolioState; order: TradeOrder | null } {
  if (!quote || portfolio.cashBalance < MIN_CASH_SWEEP_KRW) return { portfolio, order: null };
  const addQty = Math.floor(portfolio.cashBalance / quote.priceKrw);
  if (addQty <= 0) return { portfolio, order: null };
  const cost = addQty * quote.priceKrw;
  const existing = portfolio.cashSweep;
  const totalQty = (existing?.quantity ?? 0) + addQty;
  const avgBuyPriceKrw = existing ? (existing.avgBuyPriceKrw * existing.quantity + quote.priceKrw * addQty) / totalQty : quote.priceKrw;
  const avgBuyPriceNative = existing
    ? (existing.avgBuyPriceNative * existing.quantity + quote.priceNative * addQty) / totalQty
    : quote.priceNative;
  return {
    portfolio: {
      ...portfolio,
      cashBalance: portfolio.cashBalance - cost,
      cashSweep: {
        symbol: CASH_SWEEP_SYMBOL,
        name: CASH_SWEEP_NAME,
        quantity: totalQty,
        avgBuyPriceNative,
        avgBuyPriceKrw,
        currentValueKrw: totalQty * quote.priceKrw,
      },
    },
    order: makeOrder(
      'BUY',
      CASH_SWEEP_SYMBOL,
      CASH_SWEEP_NAME,
      CASH_SWEEP_MARKET,
      CASH_SWEEP_CURRENCY,
      quote.priceKrw,
      quote.priceNative,
      addQty,
      '남는 현금을 대기 자금으로 넣어 이자를 받습니다.',
      80
    ),
  };
}

export interface PortfolioRules {
  maxTradesPerDay: number;
  maxConcurrentPositions: number;
}

export interface HeldAnalysis {
  position: Position;
  analysis: StockAnalysis;
}

export interface CandidateAnalysis {
  symbol: string;
  name: string;
  market: Market;
  sector: string;
  description: string;
  analysis: StockAnalysis;
}

function makeOrder(
  type: 'BUY' | 'SELL',
  symbol: string,
  stockName: string,
  market: Market,
  currency: 'KRW' | 'USD',
  price: number,
  priceNative: number,
  qty: number,
  reason: string,
  confidence: number,
  profitPercent?: number,
  profitAmount?: number,
  profitAmountNative?: number
): TradeOrder {
  return {
    id: `order-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    type,
    symbol,
    stockName,
    market,
    currency,
    price,
    priceNative,
    quantity: qty,
    totalAmount: qty * price,
    totalAmountNative: qty * priceNative,
    ...(profitPercent != null ? { profitPercent } : {}),
    ...(profitAmount != null ? { profitAmount } : {}),
    ...(profitAmountNative != null ? { profitAmountNative } : {}),
    reason,
    aiConfidence: confidence,
  };
}

function closePosition(
  portfolio: PortfolioState,
  position: Position,
  priceKrw: number,
  priceNative: number,
  reason: string,
  confidence: number
): { portfolio: PortfolioState; order: TradeOrder } {
  const proceeds = position.quantity * priceKrw;
  const tradePnL = (priceKrw - position.avgBuyPriceKrw) * position.quantity;
  const tradePnLNative = (priceNative - position.avgBuyPriceNative) * position.quantity;
  const profitPercent = Number((((priceKrw - position.avgBuyPriceKrw) / position.avgBuyPriceKrw) * 100).toFixed(2));
  const next: PortfolioState = {
    ...portfolio,
    cashBalance: portfolio.cashBalance + proceeds,
    positions: portfolio.positions.filter((p) => p.symbol !== position.symbol),
    todayTradesCount: portfolio.todayTradesCount + 1,
    winCount: tradePnL >= 0 ? portfolio.winCount + 1 : portfolio.winCount,
    lossCount: tradePnL < 0 ? portfolio.lossCount + 1 : portfolio.lossCount,
  };
  return {
    portfolio: next,
    order: makeOrder(
      'SELL',
      position.symbol,
      position.name,
      position.market,
      position.currency,
      priceKrw,
      priceNative,
      position.quantity,
      reason,
      confidence,
      profitPercent,
      Math.round(tradePnL),
      Number(tradePnLNative.toFixed(2))
    ),
  };
}

function openPosition(
  portfolio: PortfolioState,
  symbol: string,
  name: string,
  market: Market,
  exchange: string,
  sector: string,
  description: string,
  currency: 'KRW' | 'USD',
  priceNative: number,
  priceKrw: number,
  atrKrw: number | null,
  cashToSpendKrw: number,
  reason: string,
  confidence: number
): { portfolio: PortfolioState; order: TradeOrder } | null {
  const qty = Math.floor(cashToSpendKrw / priceKrw);
  if (qty <= 0) return null;
  const cost = qty * priceKrw;
  // Fallback for the rare case ATR isn't computable yet (too little history):
  // treat the stock as if it moves 2% a day rather than leaving the position
  // with no stop distance at all.
  const effectiveAtrKrw = atrKrw ?? priceKrw * 0.02;
  const position: Position = {
    symbol,
    name,
    market,
    exchange,
    sector,
    description,
    currency,
    quantity: qty,
    avgBuyPriceNative: priceNative,
    avgBuyPriceKrw: priceKrw,
    openedAt: new Date().toISOString(),
    atrAtEntryKrw: effectiveAtrKrw,
    highestPriceKrwSinceOpen: priceKrw,
  };
  const next: PortfolioState = {
    ...portfolio,
    cashBalance: portfolio.cashBalance - cost,
    positions: [...portfolio.positions, position],
    todayTradesCount: portfolio.todayTradesCount + 1,
  };
  return { portfolio: next, order: makeOrder('BUY', symbol, name, market, currency, priceKrw, priceNative, qty, reason, confidence) };
}

/** Emergency single-position exit (the "지금 매도" button) — bypasses the daily trade cap. */
export function sellPositionNow(
  portfolio: PortfolioState,
  position: Position,
  priceKrw: number,
  priceNative: number
): { portfolio: PortfolioState; order: TradeOrder } {
  return closePosition(portfolio, position, priceKrw, priceNative, '사용자 요청으로 긴급 매도했습니다.', 99);
}

export interface PortfolioTickResult {
  portfolio: PortfolioState;
  orders: TradeOrder[];
  /**
   * Treasury-sweep moves. Executed at the broker like any other order, but kept
   * out of `orders` so win rate and expectancy stay about strategy decisions
   * rather than cash management.
   */
  cashSweepOrders: TradeOrder[];
  justHitTargetProfit: boolean;
}

/**
 * Advances the whole portfolio by one tick.
 * Priority per position: ATR stop-loss > ATR trailing exit > technical SELL
 * signal. Then, if there's room and the daily trade cap allows it, opens new
 * positions from the ranked candidate list — highest confidence first, cash
 * split evenly across the remaining open slots (recomputed after each fill
 * so multiple entries in one tick don't over-allocate). Selection is purely
 * rule-based; nothing here ever asks an LLM which stock to trade.
 */
export function runPortfolioTick(
  portfolio: PortfolioState,
  heldAnalyses: HeldAnalysis[],
  candidateAnalyses: CandidateAnalysis[],
  rules: PortfolioRules,
  cashSweepQuote: CashSweepQuote | null = null
): PortfolioTickResult {
  let working = portfolio;
  const orders: TradeOrder[] = [];
  let justHitTargetProfit = false;

  // 0) Mark any existing treasury-sweep holding to the latest known price.
  working = markCashSweepToMarket(working, cashSweepQuote);

  // 0.5) Track each position's running peak price — the trailing-exit reference —
  //    before evaluating any exits this tick.
  const priceBySymbol = new Map(heldAnalyses.map((h) => [h.position.symbol, h.analysis.price]));
  working = {
    ...working,
    positions: working.positions.map((p) => {
      const price = priceBySymbol.get(p.symbol);
      if (price == null) return p;
      return { ...p, highestPriceKrwSinceOpen: Math.max(p.highestPriceKrwSinceOpen, price) };
    }),
  };

  // 1) Evaluate every held position for ATR stop-loss / ATR trailing-exit / SELL signal.
  for (const { analysis } of heldAnalyses) {
    const position = working.positions.find((p) => p.symbol === analysis.symbol);
    if (!position) continue; // already closed earlier in this same tick (shouldn't happen, but be safe)

    const priceKrw = analysis.price;
    const priceNative = analysis.nativePrice;
    const stopLossPrice = position.avgBuyPriceKrw - STOP_LOSS_ATR_MULTIPLIER * position.atrAtEntryKrw;
    const trailingExitPrice = position.highestPriceKrwSinceOpen - TRAILING_EXIT_ATR_MULTIPLIER * position.atrAtEntryKrw;
    const isProfitable = priceKrw > position.avgBuyPriceKrw;

    if (priceKrw <= stopLossPrice) {
      const result = closePosition(
        working,
        position,
        priceKrw,
        priceNative,
        `자동 손절: ${position.name}이(가) 진입 시점 변동성(ATR) 기준 ${STOP_LOSS_ATR_MULTIPLIER}배 하락해 매도했습니다.`,
        99
      );
      working = result.portfolio;
      orders.push(result.order);
      continue;
    }

    if (isProfitable && priceKrw <= trailingExitPrice) {
      justHitTargetProfit = true;
      const result = closePosition(
        working,
        position,
        priceKrw,
        priceNative,
        `트레일링 청산: ${position.name}이(가) 고점 대비 변동성(ATR) 기준 ${TRAILING_EXIT_ATR_MULTIPLIER}배 하락해 수익을 확정했습니다.`,
        96
      );
      working = result.portfolio;
      orders.push(result.order);
      continue;
    }

    if (analysis.signal.action === 'SELL' && working.todayTradesCount < rules.maxTradesPerDay) {
      const result = closePosition(
        working,
        position,
        priceKrw,
        priceNative,
        `${position.name}: ${analysis.signal.reason}`,
        analysis.signal.confidence
      );
      working = result.portfolio;
      orders.push(result.order);
    }
  }

  // 2) Fill open slots from the ranked candidate list (highest confidence first).
  const heldSymbols = new Set(working.positions.map((p) => p.symbol));
  const buyCandidates = candidateAnalyses
    .filter((c) => !heldSymbols.has(c.symbol) && c.analysis.signal.action === 'BUY')
    .sort((a, b) => b.analysis.signal.confidence - a.analysis.signal.confidence);

  // Reclaim any cash currently parked in the treasury sweep before sizing new
  // stock buys — the full liquid balance should be available, not just
  // whatever happened to be sitting outside SGOV.
  const cashSweepOrders: TradeOrder[] = [];
  if (buyCandidates.length > 0) {
    const liquidated = liquidateCashSweep(working, cashSweepQuote);
    working = liquidated.portfolio;
    if (liquidated.order) cashSweepOrders.push(liquidated.order);
  }

  // Portfolio value used as the risk base for sizing every buy this tick —
  // computed once up front rather than re-derived after each fill, which is
  // an accepted approximation (equity moves only slightly across a handful
  // of same-tick buys) in exchange for much simpler code.
  const portfolioValueForSizing =
    working.cashBalance +
    working.positions.reduce((sum, p) => sum + p.quantity * (priceBySymbol.get(p.symbol) ?? p.avgBuyPriceKrw), 0) +
    (working.cashSweep?.currentValueKrw ?? 0);

  for (const candidate of buyCandidates) {
    const openSlots = rules.maxConcurrentPositions - working.positions.length;
    if (openSlots <= 0) break;
    if (working.todayTradesCount >= rules.maxTradesPerDay) break;
    if (working.cashBalance < 1) break;

    // Risk-based sizing (fixed-fractional / R-multiple): buy only as much as
    // keeps the loss at exactly RISK_PER_TRADE_PERCENT of the portfolio if
    // this stock's ATR stop is hit — a volatile stock gets a smaller
    // position, a calm one a larger one, for the same dollar risk either
    // way. Still capped at the equal-split share of cash so a very low-ATR
    // stock can't swallow the whole portfolio in one position.
    const priceKrw = candidate.analysis.price;
    const atrKrw = candidate.analysis.atrKrw ?? priceKrw * 0.02;
    const stopDistanceKrw = STOP_LOSS_ATR_MULTIPLIER * atrKrw;
    const riskBudgetKrw = portfolioValueForSizing * RISK_PER_TRADE_PERCENT;
    const riskBasedCostKrw = stopDistanceKrw > 0 ? (riskBudgetKrw / stopDistanceKrw) * priceKrw : 0;
    const equalSplitCeiling = working.cashBalance / openSlots;
    const cashToSpend = Math.min(riskBasedCostKrw, equalSplitCeiling, working.cashBalance);

    const result = openPosition(
      working,
      candidate.symbol,
      candidate.name,
      candidate.market,
      candidate.analysis.exchange,
      candidate.sector,
      candidate.description,
      candidate.analysis.currency,
      candidate.analysis.nativePrice,
      candidate.analysis.price,
      candidate.analysis.atrKrw,
      cashToSpend,
      `${candidate.name}: ${candidate.analysis.signal.reason}`,
      candidate.analysis.signal.confidence
    );
    if (result) {
      working = result.portfolio;
      orders.push(result.order);
    }
  }

  // 2.5) Park whatever cash is left idle after this tick's stock trades into
  //      the treasury sweep rather than let it sit earning nothing.
  const swept = sweepIdleCashIntoTreasury(working, cashSweepQuote);
  working = swept.portfolio;
  if (swept.order) cashSweepOrders.push(swept.order);

  // 3) Recompute aggregate valuation from cash + all positions' latest KRW price.
  //    (Uses each held position's analysis price where available; positions
  //    without a fresh analysis this tick keep their last-known valuation via avgBuyPriceKrw.)
  const holdingsValuation = working.positions.reduce(
    (sum, p) => sum + p.quantity * (priceBySymbol.get(p.symbol) ?? p.avgBuyPriceKrw),
    0
  );
  const currentValuation = working.cashBalance + holdingsValuation + (working.cashSweep?.currentValueKrw ?? 0);
  const totalPnL = currentValuation - working.initialCapital;
  const totalPnLPercent = Number(((totalPnL / working.initialCapital) * 100).toFixed(2));

  return {
    portfolio: { ...working, currentValuation, totalPnL, totalPnLPercent },
    orders,
    cashSweepOrders,
    justHitTargetProfit,
  };
}

// --- index-trend strategy ------------------------------------------------------
// A completely separate decision path from runPortfolioTick's stock picking.
// There is no selection, no ATR stop, no trailing exit and no confidence score:
// the index is either above its 200-day trend line (hold it) or below it (sit in
// the treasury sweep). Rules this simple are the point — the tested edge is
// drawdown reduction, and every extra rule we backtested made things worse.

export interface TrendTickInput {
  symbol: string;
  name: string;
  market: Market;
  exchange: string;
  sector: string;
  description: string;
  currency: 'KRW' | 'USD';
  /** Live price — what a fill is priced at. */
  priceKrw: number;
  priceNative: number;
  atrKrw: number | null;
  /**
   * The signal is judged on the last SETTLED daily close, never the live price.
   * Yahoo's current-day bar moves all session, so comparing it against the
   * trend line would let one intraday dip sell the position and the recovery
   * buy it straight back — several round trips a day, right at the moment the
   * strategy matters. Null means "can't confirm the trend": hold, never buy.
   */
  decisionCloseKrw: number | null;
  sma200Krw: number | null;
}

/**
 * Advances the portfolio by one index-trend tick.
 * Sells any held index that has closed below its trend line, then buys the ones
 * above it, splitting available cash evenly across the universe. Idle cash is
 * swept into the treasury ETF exactly as in the stock-picking path.
 */
export function runTrendTick(
  portfolio: PortfolioState,
  inputs: TrendTickInput[],
  cashSweepQuote: CashSweepQuote | null = null
): PortfolioTickResult {
  let working = markCashSweepToMarket(portfolio, cashSweepQuote);
  const orders: TradeOrder[] = [];
  const priceBySymbol = new Map(inputs.map((i) => [i.symbol, i.priceKrw]));

  // 0.5) Drop anything held that the strategy no longer trades at all. This
  //      covers switching the traded instrument (e.g. SPY to a KRX-listed
  //      tracker): without it the old holding would sit there forever, never
  //      evaluated by any rule.
  const tradedSymbols = new Set(inputs.map((i) => i.symbol));
  for (const position of working.positions.filter((p) => !tradedSymbols.has(p.symbol))) {
    const result = closePosition(
      working,
      position,
      position.avgBuyPriceKrw,
      position.avgBuyPriceNative,
      `${position.name}은(는) 더 이상 이 전략의 매매 대상이 아니어서 정리했습니다.`,
      80
    );
    working = result.portfolio;
    orders.push(result.order);
  }

  // 1) Exit anything that has dropped below its trend line.
  for (const input of inputs) {
    const position = working.positions.find((p) => p.symbol === input.symbol);
    if (!position || input.sma200Krw == null || input.decisionCloseKrw == null) continue;
    if (input.decisionCloseKrw < input.sma200Krw) {
      const result = closePosition(
        working,
        position,
        input.priceKrw,
        input.priceNative,
        `추세 이탈: ${input.name}이(가) 200일 추세선 아래로 내려가 전량 매도하고 현금(단기국채)으로 대피했습니다.`,
        90
      );
      working = result.portfolio;
      orders.push(result.order);
    }
  }

  // 2) Enter anything above its trend line that we don't already hold.
  const buyable = inputs.filter(
    (i) =>
      i.sma200Krw != null &&
      i.decisionCloseKrw != null &&
      i.decisionCloseKrw > i.sma200Krw &&
      !working.positions.some((p) => p.symbol === i.symbol)
  );
  const cashSweepOrders: TradeOrder[] = [];
  if (buyable.length > 0) {
    const liquidated = liquidateCashSweep(working, cashSweepQuote);
    working = liquidated.portfolio;
    if (liquidated.order) cashSweepOrders.push(liquidated.order);
    let slotsLeft = buyable.length;
    for (const input of buyable) {
      const cashToSpend = working.cashBalance / slotsLeft;
      slotsLeft -= 1;
      const result = openPosition(
        working,
        input.symbol,
        input.name,
        input.market,
        input.exchange,
        input.sector,
        input.description,
        input.currency,
        input.priceNative,
        input.priceKrw,
        input.atrKrw,
        cashToSpend,
        `추세 진입: ${input.name}이(가) 200일 추세선 위에 있어 매수했습니다.`,
        90
      );
      if (result) {
        working = result.portfolio;
        orders.push(result.order);
      }
    }
  }

  // 3) Park whatever is idle — in this strategy that is the entire "risk off" state.
  const swept = sweepIdleCashIntoTreasury(working, cashSweepQuote);
  working = swept.portfolio;
  if (swept.order) cashSweepOrders.push(swept.order);

  const holdingsValuation = working.positions.reduce(
    (sum, p) => sum + p.quantity * (priceBySymbol.get(p.symbol) ?? p.avgBuyPriceKrw),
    0
  );
  const currentValuation = working.cashBalance + holdingsValuation + (working.cashSweep?.currentValueKrw ?? 0);
  const totalPnL = currentValuation - working.initialCapital;
  const totalPnLPercent = Number(((totalPnL / working.initialCapital) * 100).toFixed(2));

  return {
    portfolio: { ...working, currentValuation, totalPnL, totalPnLPercent },
    orders,
    cashSweepOrders,
    justHitTargetProfit: false,
  };
}

/** Default circuit-breaker threshold when the session config doesn't set one. */
export const DEFAULT_MAX_DAILY_LOSS_PERCENT = 5;

/**
 * Daily-loss circuit breaker. Compares the live valuation against what the
 * portfolio was worth when the Asia/Seoul day opened; a breach should pause
 * trading rather than let the system keep transacting through a bad day.
 */
export function checkDailyLossLimit(
  currentValuation: number,
  dayStartValuation: number | undefined,
  maxDailyLossPercent: number | undefined
): { breached: boolean; lossPercent: number; limitPercent: number } {
  const limitPercent = maxDailyLossPercent ?? DEFAULT_MAX_DAILY_LOSS_PERCENT;
  if (!dayStartValuation || dayStartValuation <= 0 || limitPercent <= 0) {
    return { breached: false, lossPercent: 0, limitPercent };
  }
  const lossPercent = Number((((currentValuation - dayStartValuation) / dayStartValuation) * 100).toFixed(2));
  return { breached: lossPercent <= -limitPercent, lossPercent, limitPercent };
}

/** Asia/Seoul calendar date (YYYY-MM-DD), used to reset the daily trade counter. */
export function seoulDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Resets todayTradesCount/winCount/lossCount when the Asia/Seoul calendar day has rolled over. */
export function resetDailyCountersIfNewDay(
  portfolio: PortfolioState,
  lastTradeDate: string
): { portfolio: PortfolioState; date: string } {
  const today = seoulDateString();
  if (today === lastTradeDate) return { portfolio, date: lastTradeDate };
  return { portfolio: { ...portfolio, todayTradesCount: 0, winCount: 0, lossCount: 0 }, date: today };
}
