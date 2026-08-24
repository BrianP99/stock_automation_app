import type { Config } from '@netlify/functions';
import { getStockAnalysis } from '../../server/marketData';
import { getCurrentSession, saveCurrentSession } from '../../server/sessionStore';
import { notifyDiscordSummary, debugWebhookEnv, type PositionWithLivePrice } from '../../server/discord';

// "지금 요약 보내기" — on-demand portfolio snapshot (총평가금액/손익/보유종목별
// 현재가·수익률) pushed to Discord, independent of the 5-min trading tick.
export default async () => {
  const session = await getCurrentSession();
  if (!session || !session.isActive) {
    return new Response(JSON.stringify({ error: '진행 중인 자동매매 세션이 없습니다.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const positions: PositionWithLivePrice[] = await Promise.all(
    session.portfolio.positions.map(async (position) => {
      try {
        const analysis = await getStockAnalysis(position.symbol);
        return { position, currentPriceKrw: analysis.price };
      } catch {
        // Live price unavailable — fall back to the average buy price (0% shown) rather than failing the whole summary.
        return { position, currentPriceKrw: position.avgBuyPriceKrw };
      }
    })
  );

  const notifyResult = await notifyDiscordSummary(session.portfolio, positions);

  session.notificationLog = [
    {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      kind: 'summary',
      title: '포트폴리오 요약 전송',
      detail: `총평가 ${Math.round(session.portfolio.currentValuation).toLocaleString('ko-KR')}원, 수익률 ${
        session.portfolio.totalPnLPercent >= 0 ? '+' : ''
      }${session.portfolio.totalPnLPercent}%`,
      ok: notifyResult.ok,
      ...(notifyResult.ok ? {} : { error: notifyResult.error || `HTTP ${notifyResult.status}` }),
    },
    ...(session.notificationLog || []),
  ];
  await saveCurrentSession(session);

  return new Response(
    JSON.stringify({
      ok: notifyResult.ok,
      error: notifyResult.ok ? undefined : notifyResult.error,
      debug: notifyResult.ok ? undefined : debugWebhookEnv(), // TEMP — remove once resolved
      session,
    }),
    { status: notifyResult.ok ? 200 : 502, headers: { 'Content-Type': 'application/json' } }
  );
};

export const config: Config = {
  path: '/api/session/notify-summary',
};
