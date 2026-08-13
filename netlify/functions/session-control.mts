import type { Config } from '@netlify/functions';
import { getStockAnalysis } from '../../server/marketData';
import { sell } from '../../server/tradingEngine';
import { getCurrentSession, saveCurrentSession } from '../../server/sessionStore';
import type { TradingConfig } from '../../src/types';

type Action = 'pause' | 'resume' | 'exit' | 'update-config';

export default async (req: Request) => {
  const { action, configUpdates }: { action: Action; configUpdates?: Partial<TradingConfig> } = await req.json();

  const session = await getCurrentSession();
  if (!session || !session.isActive) {
    return new Response(JSON.stringify({ error: '진행 중인 자동매매 세션이 없습니다.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (action === 'pause') {
    session.isPaused = true;
    await saveCurrentSession(session);
    return new Response(JSON.stringify(session), { headers: { 'Content-Type': 'application/json' } });
  }

  if (action === 'resume') {
    session.isPaused = false;
    await saveCurrentSession(session);
    return new Response(JSON.stringify(session), { headers: { 'Content-Type': 'application/json' } });
  }

  if (action === 'update-config') {
    // Safety-guardrail edits (stop-loss/target-profit/max trades) must reach
    // the server-side session, since that's what the scheduled tick reads —
    // updating only the browser's local state would leave the old limits
    // running silently in the background.
    session.config = { ...session.config, ...configUpdates };
    await saveCurrentSession(session);
    return new Response(JSON.stringify(session), { headers: { 'Content-Type': 'application/json' } });
  }

  if (action === 'exit') {
    try {
      if (session.portfolio.holdingQuantity > 0) {
        const analysis = await getStockAnalysis(session.config.stock.symbol);
        const result = sell(
          session.portfolio,
          analysis.price,
          session.portfolio.holdingQuantity,
          {
            stockName: session.config.stock.name,
            targetProfitPercent: session.config.targetProfitPercent,
            stopLossPercent: session.config.stopLossPercent,
            maxTradesPerDay: session.config.maxTradesPerDay,
          },
          '아버지 요청으로 긴급 전량 매도 후 자동매매를 종료했습니다.',
          99
        );
        session.portfolio = result.portfolio;
        if (result.order) session.tradeOrders = [result.order, ...session.tradeOrders];
      }
      session.isActive = false;
      session.isPaused = false;
      await saveCurrentSession(session);
      return new Response(JSON.stringify(session), { headers: { 'Content-Type': 'application/json' } });
    } catch (err) {
      console.error('Error exiting trading session:', err);
      return new Response(
        JSON.stringify({ error: '실시간 시세를 불러오지 못해 전량 매도에 실패했습니다. 잠시 후 다시 시도해주세요.' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  return new Response(JSON.stringify({ error: 'unknown action' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config: Config = {
  path: '/api/session/control',
};
