import type { TradeOrder, PortfolioState, Position } from '../src/types';

// Reads DISCORD_WEBHOOK_URL from the environment — Netlify Functions expose
// env vars via the global `Netlify.env` object, plain Node (local dev,
// Express) via process.env. Never hardcode the URL: it's a bearer credential
// (anyone with it can post to the channel) and this repo is public.
function getWebhookUrl(): string | undefined {
  const netlifyEnv = (globalThis as any).Netlify?.env;
  return netlifyEnv?.get?.('DISCORD_WEBHOOK_URL') || process.env.DISCORD_WEBHOOK_URL;
}

export interface DiscordNotifyResult {
  ok: boolean;
  status?: number;
  error?: string;
}

async function postToDiscord(payload: unknown): Promise<DiscordNotifyResult> {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) return { ok: false, error: 'DISCORD_WEBHOOK_URL이 설정되지 않았습니다.' };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    // fetch() doesn't throw on 4xx/5xx — a bad/deleted webhook or malformed
    // payload would silently look like success without checking res.ok.
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`Discord webhook responded ${res.status}: ${text}`);
      return { ok: false, status: res.status, error: text || `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Discord notification failed:', err);
    return { ok: false, error: message };
  }
}

/** One trade fill. Never throws — a failed webhook must not break a trading tick. */
export async function notifyDiscordTrade(order: TradeOrder): Promise<DiscordNotifyResult> {
  const isBuy = order.type === 'BUY';
  const fields = [
    { name: '수량', value: `${order.quantity}주`, inline: true },
    { name: '체결가', value: `${Math.round(order.price).toLocaleString('ko-KR')}원`, inline: true },
    { name: '총액', value: `${Math.round(order.totalAmount).toLocaleString('ko-KR')}원`, inline: true },
    ...(order.profitPercent != null
      ? [{ name: '수익률', value: `${order.profitPercent >= 0 ? '+' : ''}${order.profitPercent}%`, inline: true }]
      : []),
    { name: 'AI 신뢰도', value: `${order.aiConfidence}%`, inline: true },
    { name: '사유', value: order.reason },
  ];

  const embed = {
    title: `${isBuy ? '🔴 매수' : '🔵 매도'} 체결 — ${order.stockName} (${order.symbol})`,
    color: isBuy ? 0xef4444 : 0x3b82f6, // 국내 증시 관례: 상승/매수=빨강, 하락/매도=파랑
    fields,
    timestamp: order.timestamp,
  };

  return postToDiscord({ username: 'AI 주식매매 알림봇', embeds: [embed] });
}

/** Notifies for a batch of orders in one tick, pairing each with its own send result for logging. */
export async function notifyDiscordTrades(orders: TradeOrder[]): Promise<{ order: TradeOrder; result: DiscordNotifyResult }[]> {
  const results = await Promise.all(orders.map(async (order) => ({ order, result: await notifyDiscordTrade(order) })));
  return results;
}

export interface PositionWithLivePrice {
  position: Position;
  currentPriceKrw: number;
}

/**
 * Portfolio snapshot — current valuation, P&L, and each held position's live
 * price/return. Used by the on-demand "지금 요약 보내기" button as well as the
 * automatic 시작/종료 notifications (with a different title for each).
 */
export async function notifyDiscordSummary(
  portfolio: PortfolioState,
  positions: PositionWithLivePrice[],
  titleOverride?: string
): Promise<DiscordNotifyResult> {
  const isProfit = portfolio.totalPnL >= 0;
  const cashSweepValueKrw = portfolio.cashSweep?.currentValueKrw ?? 0;
  const totalCashKrw = portfolio.cashBalance + cashSweepValueKrw;

  const positionLines = positions.length
    ? positions
        .map(({ position, currentPriceKrw }) => {
          const pnlPercent = Number(
            (((currentPriceKrw - position.avgBuyPriceKrw) / position.avgBuyPriceKrw) * 100).toFixed(2)
          );
          const sign = pnlPercent >= 0 ? '+' : '';
          return `• ${position.name}(${position.symbol}) ${position.quantity}주 — 현재가 ${Math.round(currentPriceKrw).toLocaleString('ko-KR')}원 (${sign}${pnlPercent}%)`;
        })
        .join('\n')
    : '보유 종목 없음 (현금 대기 중)';

  const embed = {
    title: titleOverride ?? '📊 포트폴리오 요약',
    color: isProfit ? 0xef4444 : 0x3b82f6,
    fields: [
      { name: '총 평가금액', value: `${Math.round(portfolio.currentValuation).toLocaleString('ko-KR')}원`, inline: true },
      {
        name: '실시간 손익',
        value: `${isProfit ? '+' : ''}${Math.round(portfolio.totalPnL).toLocaleString('ko-KR')}원 (${isProfit ? '+' : ''}${portfolio.totalPnLPercent}%)`,
        inline: true,
      },
      {
        name: '현금성 자산',
        value:
          cashSweepValueKrw > 0
            ? `${Math.round(totalCashKrw).toLocaleString('ko-KR')}원 (단기국채 ${Math.round(cashSweepValueKrw).toLocaleString('ko-KR')}원 포함)`
            : `${Math.round(totalCashKrw).toLocaleString('ko-KR')}원`,
        inline: true,
      },
      { name: `보유 종목 (${positions.length}개)`, value: positionLines },
    ],
    timestamp: new Date().toISOString(),
  };

  return postToDiscord({ username: 'AI 주식매매 알림봇', embeds: [embed] });
}
