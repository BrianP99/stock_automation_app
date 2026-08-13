import type { Config } from '@netlify/functions';
import { getStockAnalysis } from '../../server/marketData';
import { applyTick, resetDailyCountersIfNewDay } from '../../server/tradingEngine';
import { getCurrentSession, saveCurrentSession } from '../../server/sessionStore';
import type { ChartPoint } from '../../src/types';

// Runs every 5 minutes regardless of whether anyone has the dashboard open.
// This is what makes a multi-day paper-trading test possible: the browser
// only ever *displays* state that this function already persisted to Blobs.
export default async () => {
  const session = await getCurrentSession();
  if (!session || !session.isActive || session.isPaused) {
    return; // nothing to do this tick
  }

  try {
    const analysis = await getStockAnalysis(session.config.stock.symbol);

    const { portfolio: resetPortfolio, date } = resetDailyCountersIfNewDay(session.portfolio, session.lastTradeDate);

    const result = applyTick(resetPortfolio, analysis.price, analysis.signal, {
      stockName: session.config.stock.name,
      targetProfitPercent: session.config.targetProfitPercent,
      stopLossPercent: session.config.stopLossPercent,
      maxTradesPerDay: session.config.maxTradesPerDay,
    });

    const chartData: ChartPoint[] = analysis.history.map((h) => ({
      time: h.time,
      price: h.price,
      sma5: h.sma5,
      sma20: h.sma20,
      sma60: h.sma60,
      rsi14: h.rsi14,
      goldenCross: h.goldenCross,
      deadCross: h.deadCross,
    }));

    session.portfolio = result.portfolio;
    session.chartData = chartData;
    session.latestSignal = analysis.signal;
    session.latestAiMessage = result.order?.reason ?? analysis.signal.reason;
    session.lastTradeDate = date;
    session.lastTickAt = new Date().toISOString();
    session.lastError = null;
    if (result.order) session.tradeOrders = [result.order, ...session.tradeOrders];

    await saveCurrentSession(session);
  } catch (err) {
    // A blocked/failed market-data fetch shouldn't crash the schedule — just
    // record it so the dashboard can surface "last successful update" info.
    console.error('Trading tick failed:', err);
    session.lastError = err instanceof Error ? err.message : String(err);
    session.lastTickAt = new Date().toISOString();
    await saveCurrentSession(session);
  }
};

export const config: Config = {
  schedule: '*/5 * * * *',
};
