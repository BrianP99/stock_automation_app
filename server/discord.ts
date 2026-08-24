import type { TradeOrder } from '../src/types';

// Reads DISCORD_WEBHOOK_URL from the environment — Netlify Functions expose
// env vars via the global `Netlify.env` object, plain Node (local dev,
// Express) via process.env. Never hardcode the URL: it's a bearer credential
// (anyone with it can post to the channel) and this repo is public.
function getWebhookUrl(): string | undefined {
  const netlifyEnv = (globalThis as any).Netlify?.env;
  return netlifyEnv?.get?.('DISCORD_WEBHOOK_URL') || process.env.DISCORD_WEBHOOK_URL;
}

/** Fire-and-forget trade notification. Never throws — a failed webhook must not break a trading tick. */
export async function notifyDiscordTrade(order: TradeOrder): Promise<void> {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) return;

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

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'AI 주식매매 알림봇', embeds: [embed] }),
      signal: AbortSignal.timeout(5000),
    });
    // fetch() doesn't throw on 4xx/5xx — a bad/deleted webhook or malformed
    // payload would silently look like success without checking res.ok.
    if (!res.ok) {
      console.error(`Discord webhook responded ${res.status}: ${await res.text().catch(() => '')}`);
    }
  } catch (err) {
    console.error('Discord notification failed:', err);
  }
}

/** Notifies for a batch of orders in one tick, without letting one failure block the rest. */
export async function notifyDiscordTrades(orders: TradeOrder[]): Promise<void> {
  await Promise.allSettled(orders.map(notifyDiscordTrade));
}
