import type { PortfolioState, Position, TradeOrder, TradingSignal, Market } from '../src/types';
import type { StockAnalysis } from './marketData';

// Pure, I/O-free multi-position trade execution logic shared between the
// Netlify scheduled function (persistent, runs without a browser open) and
// any other runtime that needs to advance a paper-trading portfolio by one
// tick. The AI picks which stocks to hold — there is no user-chosen symbol.

export interface PortfolioRules {
  targetProfitPercent: number; // evaluated PER POSITION, not blended portfolio P&L
  stopLossPercent: number; // evaluated PER POSITION
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
  analysis: StockAnalysis;
}

function makeOrder(
  type: 'BUY' | 'SELL',
  symbol: string,
  stockName: string,
  market: Market,
  price: number,
  qty: number,
  reason: string,
  confidence: number,
  profitPercent?: number
): TradeOrder {
  return {
    id: `order-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    type,
    symbol,
    stockName,
    market,
    price,
    quantity: qty,
    totalAmount: qty * price,
    ...(profitPercent != null ? { profitPercent } : {}),
    reason,
    aiConfidence: confidence,
  };
}

function closePosition(
  portfolio: PortfolioState,
  position: Position,
  priceKrw: number,
  reason: string,
  confidence: number
): { portfolio: PortfolioState; order: TradeOrder } {
  const proceeds = position.quantity * priceKrw;
  const tradePnL = (priceKrw - position.avgBuyPriceKrw) * position.quantity;
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
    order: makeOrder('SELL', position.symbol, position.name, position.market, priceKrw, position.quantity, reason, confidence, profitPercent),
  };
}

function openPosition(
  portfolio: PortfolioState,
  symbol: string,
  name: string,
  market: Market,
  currency: 'KRW' | 'USD',
  priceNative: number,
  priceKrw: number,
  cashToSpendKrw: number,
  reason: string,
  confidence: number
): { portfolio: PortfolioState; order: TradeOrder } | null {
  const qty = Math.floor(cashToSpendKrw / priceKrw);
  if (qty <= 0) return null;
  const cost = qty * priceKrw;
  const position: Position = {
    symbol,
    name,
    market,
    currency,
    quantity: qty,
    avgBuyPriceNative: priceNative,
    avgBuyPriceKrw: priceKrw,
    openedAt: new Date().toISOString(),
  };
  const next: PortfolioState = {
    ...portfolio,
    cashBalance: portfolio.cashBalance - cost,
    positions: [...portfolio.positions, position],
    todayTradesCount: portfolio.todayTradesCount + 1,
  };
  return { portfolio: next, order: makeOrder('BUY', symbol, name, market, priceKrw, qty, reason, confidence) };
}

/** Emergency single-position exit (the "지금 매도" button) — bypasses the daily trade cap. */
export function sellPositionNow(
  portfolio: PortfolioState,
  position: Position,
  priceKrw: number
): { portfolio: PortfolioState; order: TradeOrder } {
  return closePosition(portfolio, position, priceKrw, '사용자 요청으로 긴급 매도했습니다.', 99);
}

export interface PortfolioTickResult {
  portfolio: PortfolioState;
  orders: TradeOrder[];
  justHitTargetProfit: boolean;
}

/**
 * Advances the whole portfolio by one tick.
 * Priority per position: stop-loss > take-profit > technical SELL signal.
 * Then, if there's room and the daily trade cap allows it, opens new
 * positions from the ranked candidate list — highest confidence first,
 * cash split evenly across the remaining open slots (recomputed after each
 * fill so multiple entries in one tick don't over-allocate). Selection is
 * purely rule-based; nothing here ever asks an LLM which stock to trade.
 */
export function runPortfolioTick(
  portfolio: PortfolioState,
  heldAnalyses: HeldAnalysis[],
  candidateAnalyses: CandidateAnalysis[],
  rules: PortfolioRules
): PortfolioTickResult {
  let working = portfolio;
  const orders: TradeOrder[] = [];
  let justHitTargetProfit = false;

  // 1) Evaluate every held position for stop-loss / take-profit / SELL signal.
  for (const { position, analysis } of heldAnalyses) {
    const priceKrw = analysis.price;
    const pnlPercent = Number((((priceKrw - position.avgBuyPriceKrw) / position.avgBuyPriceKrw) * 100).toFixed(2));

    if (pnlPercent <= -rules.stopLossPercent) {
      const result = closePosition(
        working,
        position,
        priceKrw,
        `자동 손절: ${position.name}이(가) 설정하신 손실 한도 -${rules.stopLossPercent}%에 도달해 매도했습니다.`,
        99
      );
      working = result.portfolio;
      orders.push(result.order);
      continue;
    }

    if (pnlPercent >= rules.targetProfitPercent) {
      justHitTargetProfit = true;
      const result = closePosition(
        working,
        position,
        priceKrw,
        `목표 익절: ${position.name}이(가) 목표 수익률 +${rules.targetProfitPercent}%를 달성해 매도했습니다.`,
        96
      );
      working = result.portfolio;
      orders.push(result.order);
      continue;
    }

    if (analysis.signal.action === 'SELL' && working.todayTradesCount < rules.maxTradesPerDay) {
      const result = closePosition(working, position, priceKrw, `${position.name}: ${analysis.signal.reason}`, analysis.signal.confidence);
      working = result.portfolio;
      orders.push(result.order);
    }
  }

  // 2) Fill open slots from the ranked candidate list (highest confidence first).
  const heldSymbols = new Set(working.positions.map((p) => p.symbol));
  const buyCandidates = candidateAnalyses
    .filter((c) => !heldSymbols.has(c.symbol) && c.analysis.signal.action === 'BUY')
    .sort((a, b) => b.analysis.signal.confidence - a.analysis.signal.confidence);

  for (const candidate of buyCandidates) {
    const openSlots = rules.maxConcurrentPositions - working.positions.length;
    if (openSlots <= 0) break;
    if (working.todayTradesCount >= rules.maxTradesPerDay) break;
    if (working.cashBalance < 1) break;

    const cashToSpend = working.cashBalance / openSlots;
    const result = openPosition(
      working,
      candidate.symbol,
      candidate.name,
      candidate.market,
      candidate.analysis.currency,
      candidate.analysis.nativePrice,
      candidate.analysis.price,
      cashToSpend,
      `${candidate.name}: ${candidate.analysis.signal.reason}`,
      candidate.analysis.signal.confidence
    );
    if (result) {
      working = result.portfolio;
      orders.push(result.order);
    }
  }

  // 3) Recompute aggregate valuation from cash + all positions' latest KRW price.
  //    (Uses each held position's analysis price where available; positions
  //    without a fresh analysis this tick keep their last-known valuation via avgBuyPriceKrw.)
  const priceBySymbol = new Map(heldAnalyses.map((h) => [h.position.symbol, h.analysis.price]));
  const holdingsValuation = working.positions.reduce(
    (sum, p) => sum + p.quantity * (priceBySymbol.get(p.symbol) ?? p.avgBuyPriceKrw),
    0
  );
  const currentValuation = working.cashBalance + holdingsValuation;
  const totalPnL = currentValuation - working.initialCapital;
  const totalPnLPercent = Number(((totalPnL / working.initialCapital) * 100).toFixed(2));

  return {
    portfolio: { ...working, currentValuation, totalPnL, totalPnLPercent },
    orders,
    justHitTargetProfit,
  };
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
