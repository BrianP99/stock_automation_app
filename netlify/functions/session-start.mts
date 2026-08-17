import type { Config } from '@netlify/functions';
import { seoulDateString } from '../../server/tradingEngine';
import { saveCurrentSession, getCurrentSession, type StoredSession } from '../../server/sessionStore';
import type { TradingConfig } from '../../src/types';

// Starts a new persistent, fully-autonomous paper-trading session — no stock
// selection. The portfolio starts 100% in cash; the scheduled tick function
// scans the market and opens positions organically from there.
export default async (req: Request) => {
  const body = await req.json();
  const config: TradingConfig = body.config;

  if (!config?.investmentAmount || config.investmentAmount <= 0) {
    return new Response(JSON.stringify({ error: 'config.investmentAmount is required' }), {
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

  const session: StoredSession = {
    config,
    portfolio: {
      initialCapital: config.investmentAmount,
      cashBalance: config.investmentAmount,
      positions: [],
      currentValuation: config.investmentAmount,
      totalPnL: 0,
      totalPnLPercent: 0,
      todayTradesCount: 0,
      winCount: 0,
      lossCount: 0,
    },
    tradeOrders: [],
    watchlist: [],
    latestAiMessage: 'AI 자동매매를 시작했습니다. 시장을 스캔하여 매매 조건을 만족하는 종목을 찾는 중입니다.',
    isPaused: false,
    isActive: true,
    lastTradeDate: seoulDateString(),
    createdAt: new Date().toISOString(),
    lastTickAt: null,
    lastError: null,
  };

  await saveCurrentSession(session);
  return new Response(JSON.stringify(session), { headers: { 'Content-Type': 'application/json' } });
};

export const config: Config = {
  path: '/api/session/start',
};
