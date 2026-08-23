import type { Config } from '@netlify/functions';
import { getStockAnalysis } from '../../server/marketData';
import { sellPositionNow } from '../../server/tradingEngine';
import { getCurrentSession, saveCurrentSession } from '../../server/sessionStore';
import type { TradingConfig } from '../../src/types';

type Action = 'pause' | 'resume' | 'exit' | 'update-config' | 'sell-position';

export default async (req: Request) => {
  const { action, configUpdates, symbol }: { action: Action; configUpdates?: Partial<TradingConfig>; symbol?: string } =
    await req.json();

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
    // Safety-guardrail edits (stop-loss/target-profit/max trades/max positions) must reach
    // the server-side session, since that's what the scheduled tick reads —
    // updating only the browser's local state would leave the old limits
    // running silently in the background.
    session.config = { ...session.config, ...configUpdates };
    await saveCurrentSession(session);
    return new Response(JSON.stringify(session), { headers: { 'Content-Type': 'application/json' } });
  }

  if (action === 'sell-position') {
    // Emergency single-position exit (the "지금 매도" button) — the one manual
    // override allowed: the AI still decides every BUY, a human can force a SELL.
    const position = session.portfolio.positions.find((p) => p.symbol === symbol);
    if (!position) {
      return new Response(JSON.stringify({ error: '보유하고 있지 않은 종목입니다.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    try {
      const analysis = await getStockAnalysis(position.symbol);
      const result = sellPositionNow(session.portfolio, position, analysis.price);
      session.portfolio = result.portfolio;
      session.tradeOrders = [result.order, ...session.tradeOrders];
      session.latestAiMessage = result.order.reason;
      await saveCurrentSession(session);
      return new Response(JSON.stringify(session), { headers: { 'Content-Type': 'application/json' } });
    } catch (err) {
      console.error('Error selling position:', err);
      return new Response(JSON.stringify({ error: '실시간 시세를 불러오지 못해 매도에 실패했습니다. 잠시 후 다시 시도해주세요.' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (action === 'exit') {
    // Sell every position independently — one symbol's fetch failing shouldn't
    // block liquidating the rest.
    for (const position of [...session.portfolio.positions]) {
      try {
        const analysis = await getStockAnalysis(position.symbol);
        const result = sellPositionNow(session.portfolio, position, analysis.price);
        session.portfolio = result.portfolio;
        session.tradeOrders = [result.order, ...session.tradeOrders];
      } catch (err) {
        console.error(`Error exiting position ${position.symbol}:`, err);
        // Leave this one in place; it'll be retried on the next manual exit attempt.
      }
    }

    if (session.portfolio.positions.length === 0) {
      session.isActive = false;
      session.isPaused = false;
      session.latestAiMessage = '사용자 요청으로 전량 매도 후 자동매매를 종료했습니다.';
      await saveCurrentSession(session);
      return new Response(JSON.stringify(session), { headers: { 'Content-Type': 'application/json' } });
    }

    // Some positions couldn't be liquidated (data fetch failed) — keep the
    // session active so the caller can retry rather than silently losing track of them.
    await saveCurrentSession(session);
    return new Response(
      JSON.stringify({ error: '일부 종목의 시세를 불러오지 못해 전량 매도에 실패했습니다. 잠시 후 다시 시도해주세요.', session }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify({ error: 'unknown action' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config: Config = {
  path: '/api/session/control',
};
