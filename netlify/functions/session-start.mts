import type { Config } from '@netlify/functions';
import { getStockAnalysis } from '../../server/marketData';
import { seoulDateString } from '../../server/tradingEngine';
import { saveCurrentSession, getCurrentSession, type StoredSession } from '../../server/sessionStore';
import type { TradingConfig, TradeOrder, ChartPoint } from '../../src/types';

// Starts a new persistent paper-trading session (or replaces the current one).
// The scheduled trading-tick function takes over from here — it keeps
// advancing this session every few minutes with no browser tab required.
export default async (req: Request) => {
  const body = await req.json();
  const config: TradingConfig = body.config;
  const initialAdvice: string | undefined = body.advice;

  if (!config?.stock?.symbol) {
    return new Response(JSON.stringify({ error: 'config.stock.symbol is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const existing = await getCurrentSession();
  if (existing?.isActive) {
    return new Response(JSON.stringify({ error: '이미 진행 중인 자동매매 세션이 있습니다. 먼저 종료해주세요.' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const analysis = await getStockAnalysis(config.stock.symbol);

    const initialShares = Math.floor((config.investmentAmount * 0.6) / analysis.price);
    const initialCash = config.investmentAmount - initialShares * analysis.price;

    const initOrder: TradeOrder = {
      id: 'order-init',
      timestamp: new Date().toISOString(),
      type: 'BUY',
      stockName: config.stock.name,
      price: analysis.price,
      quantity: initialShares,
      totalAmount: initialShares * analysis.price,
      reason: 'AI 자동매매 시작: 실시간 시세 기준 포트폴리오 초기 분할 매수 60% 실행',
      aiConfidence: 94,
    };

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

    const session: StoredSession = {
      config,
      portfolio: {
        initialCapital: config.investmentAmount,
        cashBalance: initialCash,
        holdingQuantity: initialShares,
        avgBuyPrice: analysis.price,
        currentValuation: config.investmentAmount,
        totalPnL: 0,
        totalPnLPercent: 0,
        todayTradesCount: 1,
        winCount: 1,
        lossCount: 0,
      },
      tradeOrders: [initOrder],
      chartData,
      latestSignal: analysis.signal,
      latestAiMessage: initialAdvice || analysis.signal.reason,
      isPaused: false,
      isActive: true,
      lastTradeDate: seoulDateString(),
      createdAt: new Date().toISOString(),
      lastTickAt: new Date().toISOString(),
      lastError: null,
    };

    await saveCurrentSession(session);
    return new Response(JSON.stringify(session), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Error starting trading session:', err);
    return new Response(
      JSON.stringify({ error: '실시간 시세를 불러오지 못해 세션을 시작할 수 없습니다. 잠시 후 다시 시도해주세요.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const config: Config = {
  path: '/api/session/start',
};
