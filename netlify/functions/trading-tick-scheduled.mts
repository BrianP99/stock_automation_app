import type { Config } from '@netlify/functions';
import { getStockAnalysis, getScreeningSignal } from '../../server/marketData';
import { runPortfolioTick, resetDailyCountersIfNewDay, type HeldAnalysis, type CandidateAnalysis } from '../../server/tradingEngine';
import { getCurrentSession, saveCurrentSession } from '../../server/sessionStore';
import { TRADING_UNIVERSE } from '../../server/data/curatedUniverse';
import { notifyDiscordTrades } from '../../server/discord';
import type { WatchlistCandidate } from '../../src/types';

// Runs every 5 minutes regardless of whether anyone has the dashboard open.
// One function does both the market scan AND the trade decision — folding
// them together avoids two schedules racing to read-then-write the same
// singleton session blob.

const CANDIDATE_CONFIDENCE_THRESHOLD = 65;
const MAX_CANDIDATES_TO_CONFIRM = 20; // bound how many get the heavier full-analysis call

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export default async () => {
  const session = await getCurrentSession();
  if (!session || !session.isActive || session.isPaused) {
    return; // nothing to do this tick
  }

  try {
    // 1) Cheap screen of the whole curated universe (daily bars only).
    const screenResults = await mapWithConcurrency(TRADING_UNIVERSE, 10, async (u) => {
      try {
        const { signal, exchange } = await getScreeningSignal(u.symbol);
        return { u, signal, exchange, ok: true as const };
      } catch {
        return { u, signal: null, exchange: '', ok: false as const };
      }
    });

    const now = new Date().toISOString();
    const watchlist: WatchlistCandidate[] = screenResults
      .filter((r) => r.ok && r.signal && r.signal.action === 'BUY' && r.signal.confidence >= CANDIDATE_CONFIDENCE_THRESHOLD)
      .map((r) => ({
        symbol: r.u.symbol,
        name: r.u.name,
        market: r.u.market,
        exchange: r.exchange,
        currency: r.u.currency,
        sector: r.u.sector,
        description: r.u.description,
        action: r.signal!.action,
        confidence: r.signal!.confidence,
        reason: r.signal!.reason,
        scannedAt: now,
      }))
      .sort((a, b) => b.confidence - a.confidence);

    // 2) Reset daily counters if the Asia/Seoul day has rolled over.
    const { portfolio: resetPortfolio, date } = resetDailyCountersIfNewDay(session.portfolio, session.lastTradeDate);

    // 3) Full (intraday+FX) analysis for held positions + top unheld candidates.
    const heldSymbols = new Set(resetPortfolio.positions.map((p) => p.symbol));
    const topCandidates = watchlist.filter((c) => !heldSymbols.has(c.symbol)).slice(0, MAX_CANDIDATES_TO_CONFIRM);

    const heldAnalyses: HeldAnalysis[] = (
      await mapWithConcurrency(resetPortfolio.positions, 8, async (position) => {
        try {
          return { position, analysis: await getStockAnalysis(position.symbol) };
        } catch {
          return null;
        }
      })
    ).filter((x): x is HeldAnalysis => x !== null);

    const candidateAnalyses: CandidateAnalysis[] = (
      await mapWithConcurrency(topCandidates, 8, async (c) => {
        try {
          const analysis = await getStockAnalysis(c.symbol);
          // Re-confirm with fresh intraday data — the screening pass only saw daily bars.
          if (analysis.signal.action !== 'BUY') return null;
          return { symbol: c.symbol, name: c.name, market: c.market, sector: c.sector, description: c.description, analysis };
        } catch {
          return null;
        }
      })
    ).filter((x): x is CandidateAnalysis => x !== null);

    // 4) Run the deterministic multi-position decision.
    const result = runPortfolioTick(resetPortfolio, heldAnalyses, candidateAnalyses, {
      maxTradesPerDay: session.config.maxTradesPerDay,
      maxConcurrentPositions: session.config.maxConcurrentPositions,
    });

    session.portfolio = result.portfolio;
    session.watchlist = watchlist;
    session.lastTradeDate = date;
    session.lastTickAt = now;
    session.lastError = null;
    if (result.orders.length) {
      session.tradeOrders = [...result.orders.reverse(), ...session.tradeOrders];
      session.latestAiMessage = result.orders[result.orders.length - 1].reason;

      const notifyResults = await notifyDiscordTrades(result.orders);
      const logEntries = notifyResults.map(({ order, result: notifyResult }) => ({
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        kind: 'trade' as const,
        title: `${order.type === 'BUY' ? '매수' : '매도'} 체결 — ${order.stockName}`,
        detail: `${order.quantity}주 @ ${Math.round(order.price).toLocaleString('ko-KR')}원`,
        ok: notifyResult.ok,
        ...(notifyResult.ok ? {} : { error: notifyResult.error || `HTTP ${notifyResult.status}` }),
      }));
      session.notificationLog = [...logEntries, ...(session.notificationLog || [])];
    } else if (session.portfolio.positions.length === 0) {
      session.latestAiMessage = '현재 매수 조건을 만족하는 종목을 계속 탐색 중입니다.';
    } else {
      session.latestAiMessage = `${session.portfolio.positions.length}개 종목 보유 중, 실시간 신호를 감시하고 있습니다.`;
    }

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
