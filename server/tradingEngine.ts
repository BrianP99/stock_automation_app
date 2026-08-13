import type { PortfolioState, TradeOrder, TradingSignal } from '../src/types';

// Pure, I/O-free trade execution logic shared between the Netlify scheduled
// function (persistent, runs without a browser open) and any other runtime
// that needs to advance a paper-trading session by one tick.

export interface TradingRules {
  stockName: string;
  targetProfitPercent: number;
  stopLossPercent: number;
  maxTradesPerDay: number;
}

export interface TickResult {
  portfolio: PortfolioState;
  order: TradeOrder | null;
  /** True the instant the target-profit guardrail fires, so the caller can show a celebration once. */
  justHitTargetProfit: boolean;
}

function makeOrder(
  type: 'BUY' | 'SELL',
  price: number,
  qty: number,
  stockName: string,
  reason: string,
  confidence: number,
  profitPercent?: number
): TradeOrder {
  return {
    id: `order-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    type,
    stockName,
    price,
    quantity: qty,
    totalAmount: qty * price,
    ...(profitPercent != null ? { profitPercent } : {}),
    reason,
    aiConfidence: confidence,
  };
}

function buy(portfolio: PortfolioState, price: number, qty: number, rules: TradingRules, reason: string, confidence: number): TickResult {
  const cost = qty * price;
  const newQty = portfolio.holdingQuantity + qty;
  const newAvgPrice = Math.round((portfolio.holdingQuantity * portfolio.avgBuyPrice + cost) / newQty);
  const next: PortfolioState = {
    ...portfolio,
    cashBalance: portfolio.cashBalance - cost,
    holdingQuantity: newQty,
    avgBuyPrice: newAvgPrice,
    todayTradesCount: portfolio.todayTradesCount + 1,
  };
  return { portfolio: next, order: makeOrder('BUY', price, qty, rules.stockName, reason, confidence), justHitTargetProfit: false };
}

export function sell(portfolio: PortfolioState, price: number, qty: number, rules: TradingRules, reason: string, confidence: number): TickResult {
  const proceeds = qty * price;
  const tradePnL = (price - portfolio.avgBuyPrice) * qty;
  const next: PortfolioState = {
    ...portfolio,
    cashBalance: portfolio.cashBalance + proceeds,
    holdingQuantity: portfolio.holdingQuantity - qty,
    todayTradesCount: portfolio.todayTradesCount + 1,
    winCount: tradePnL >= 0 ? portfolio.winCount + 1 : portfolio.winCount,
    lossCount: tradePnL < 0 ? portfolio.lossCount + 1 : portfolio.lossCount,
  };
  const profitPercent = Number((((price - portfolio.avgBuyPrice) / portfolio.avgBuyPrice) * 100).toFixed(2));
  return {
    portfolio: next,
    order: makeOrder('SELL', price, qty, rules.stockName, reason, confidence, profitPercent),
    justHitTargetProfit: false,
  };
}

/**
 * Advances a paper-trading session by one tick given a fresh price/signal.
 * Priority: stop-loss > take-profit > the technical BUY/SELL signal > HOLD.
 * Mirrors the logic that used to live client-side in TradingDashboard.tsx,
 * now runtime-agnostic so it can run inside a Netlify scheduled function.
 */
export function applyTick(
  portfolio: PortfolioState,
  price: number,
  signal: TradingSignal,
  rules: TradingRules
): TickResult {
  const stockValuation = portfolio.holdingQuantity * price;
  const totalValuation = portfolio.cashBalance + stockValuation;
  const pnlAmount = totalValuation - portfolio.initialCapital;
  const pnlPercent = Number(((pnlAmount / portfolio.initialCapital) * 100).toFixed(2));

  const withValuation: PortfolioState = {
    ...portfolio,
    currentValuation: totalValuation,
    totalPnL: pnlAmount,
    totalPnLPercent: pnlPercent,
  };

  if (portfolio.holdingQuantity > 0 && pnlPercent <= -rules.stopLossPercent) {
    const result = sell(
      withValuation,
      price,
      portfolio.holdingQuantity,
      rules,
      `자동 손절 안전장치가 작동했습니다. 설정하신 손실 한도 -${rules.stopLossPercent}%에 도달해 보유 물량을 전량 매도했습니다.`,
      99
    );
    return { ...result, portfolio: { ...result.portfolio, currentValuation: totalValuation, totalPnL: pnlAmount, totalPnLPercent: pnlPercent } };
  }

  if (portfolio.holdingQuantity > 0 && pnlPercent >= rules.targetProfitPercent) {
    const result = sell(
      withValuation,
      price,
      portfolio.holdingQuantity,
      rules,
      `목표 수익률 +${rules.targetProfitPercent}%를 달성해 AI가 자동으로 익절했습니다.`,
      96
    );
    return {
      ...result,
      portfolio: { ...result.portfolio, currentValuation: totalValuation, totalPnL: pnlAmount, totalPnLPercent: pnlPercent },
      justHitTargetProfit: true,
    };
  }

  if (signal.action === 'BUY' && portfolio.todayTradesCount < rules.maxTradesPerDay) {
    const qty = Math.max(portfolio.cashBalance >= price ? 1 : 0, Math.floor((portfolio.cashBalance * 0.3) / price));
    if (qty > 0 && portfolio.cashBalance >= qty * price) {
      const result = buy(withValuation, price, qty, rules, signal.reason, signal.confidence);
      return { ...result, portfolio: { ...result.portfolio, currentValuation: totalValuation, totalPnL: pnlAmount, totalPnLPercent: pnlPercent } };
    }
  } else if (signal.action === 'SELL' && portfolio.holdingQuantity > 0 && portfolio.todayTradesCount < rules.maxTradesPerDay) {
    const qty = Math.max(1, Math.ceil(portfolio.holdingQuantity * 0.5));
    const result = sell(withValuation, price, qty, rules, signal.reason, signal.confidence);
    return { ...result, portfolio: { ...result.portfolio, currentValuation: totalValuation, totalPnL: pnlAmount, totalPnLPercent: pnlPercent } };
  }

  return { portfolio: withValuation, order: null, justHitTargetProfit: false };
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
