import type { Config } from '@netlify/functions';
import { getStockAnalysis, getScreeningSignal } from '../../server/marketData';
import {
  runPortfolioTick,
  runTrendTick,
  resetDailyCountersIfNewDay,
  checkDailyLossLimit,
  CASH_SWEEP_SYMBOL,
  type HeldAnalysis,
  type CandidateAnalysis,
  type CashSweepQuote,
  type TrendTickInput,
} from '../../server/tradingEngine';
import { getCurrentSession, saveCurrentSession, type StoredSession } from '../../server/sessionStore';
import { TRADING_UNIVERSE } from '../../server/data/curatedUniverse';
import { TREND_UNIVERSE } from '../../server/data/trendUniverse';
import { executeOrders, verifyAgainstBroker } from '../../server/brokerExecution';
import { notifyDiscordTrades, notifyDiscordSummary } from '../../server/discord';
import type { PortfolioState, StrategyMode, WatchlistCandidate } from '../../src/types';

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

/** Pushes an alert to Discord and records the attempt in the session's log. */
async function notifyAndLog(session: StoredSession, title: string, detail: string): Promise<void> {
  const result = await notifyDiscordSummary(session.portfolio, [], title);
  session.notificationLog = [
    {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      kind: 'summary' as const,
      title,
      detail,
      ok: result.ok,
      ...(result.ok ? {} : { error: result.error || `HTTP ${result.status}` }),
    },
    ...(session.notificationLog || []),
  ];
}

/**
 * Records the day's opening valuation and trips the circuit breaker when the
 * portfolio has fallen past the configured daily loss limit. Pausing (rather
 * than liquidating) is deliberate: a human decides what to do next.
 */
async function applyDailyLossLimit(session: StoredSession, isNewDay: boolean): Promise<void> {
  if (isNewDay || session.dayStartValuation == null) {
    session.dayStartValuation = session.portfolio.currentValuation;
    return;
  }
  if (session.isPaused) return;

  const check = checkDailyLossLimit(
    session.portfolio.currentValuation,
    session.dayStartValuation,
    session.config.maxDailyLossPercent
  );
  if (!check.breached) return;

  session.isPaused = true;
  session.latestAiMessage =
    `일일 손실 한도 ${check.limitPercent}%를 넘어서(오늘 ${check.lossPercent}%) 자동매매를 멈췄습니다. ` +
    '내용을 확인한 뒤 직접 재개해주세요.';
  await notifyAndLog(
    session,
    '🛑 일일 손실 한도 도달 — 자동매매 정지',
    `오늘 ${check.lossPercent}% 하락 (한도 ${check.limitPercent}%)`
  );
}

/** Runs the index-trend strategy: no screening, just the trend universe's own trend lines. */
async function runIndexTrendTick(resetPortfolio: PortfolioState, cashSweepQuote: CashSweepQuote | null, now: string) {
  // The signal and the instrument are two different tickers: the 200-day trend
  // is measured on SPY, which has the history the strategy was validated on,
  // while the order goes to a KRX-listed tracker that paper trading supports
  // and that carries no currency leg of its own.
  const inputs = (
    await mapWithConcurrency(TREND_UNIVERSE, 4, async (u) => {
      try {
        const [signal, instrument] = await Promise.all([
          getStockAnalysis(u.signalSymbol),
          getStockAnalysis(u.tradeSymbol),
        ]);
        return {
          symbol: u.tradeSymbol,
          name: u.name,
          market: u.market,
          exchange: instrument.exchange,
          sector: u.sector,
          description: u.description,
          currency: instrument.currency,
          // Fill at the instrument's live price...
          priceKrw: instrument.price,
          priceNative: instrument.nativePrice,
          atrKrw: instrument.atrKrw,
          // ...but decide on the signal ticker's settled daily close.
          decisionCloseKrw: signal.trendCloseKrw,
          sma200Krw: signal.trendSma200Krw,
        } as TrendTickInput;
      } catch {
        return null;
      }
    })
  ).filter((x): x is TrendTickInput => x !== null);

  if (inputs.length === 0) {
    throw new Error('지수 시세를 불러오지 못했습니다.');
  }

  const watchlist: WatchlistCandidate[] = inputs.map((i) => {
    // Show the same numbers the decision uses, or the panel would report a gap
    // that doesn't match what the engine acted on.
    const decided = i.decisionCloseKrw;
    const above = i.sma200Krw != null && decided != null && decided > i.sma200Krw;
    const gap = i.sma200Krw && decided != null ? ((decided - i.sma200Krw) / i.sma200Krw) * 100 : 0;
    return {
      symbol: i.symbol,
      name: i.name,
      market: i.market,
      exchange: i.exchange,
      currency: i.currency,
      sector: i.sector,
      description: i.description,
      action: i.sma200Krw == null || decided == null ? 'HOLD' : above ? 'BUY' : 'SELL',
      confidence: 90,
      reason:
        i.sma200Krw == null || decided == null
          ? '200일 추세선을 계산할 데이터가 아직 부족합니다.'
          : `200일 추세선 ${above ? '위' : '아래'} (${gap >= 0 ? '+' : ''}${gap.toFixed(1)}%, 전일 종가 기준)`,
      scannedAt: now,
    };
  });

  return { result: runTrendTick(resetPortfolio, inputs, cashSweepQuote), watchlist };
}

export default async () => {
  const session = await getCurrentSession();
  if (!session || !session.isActive || session.isPaused) {
    return; // nothing to do this tick
  }

  const mode: StrategyMode = session.config.strategyMode ?? 'ai-picks';

  try {
    if (mode === 'index-trend') {
      const now = new Date().toISOString();
      const { portfolio: resetPortfolio, date } = resetDailyCountersIfNewDay(session.portfolio, session.lastTradeDate);
      const isNewDay = date !== session.lastTradeDate;

      // Check our book against the broker's BEFORE deciding anything. Trading
      // on a stale picture is how one bad fill becomes a series of them.
      const verification = await verifyAgainstBroker(
        resetPortfolio.positions.map((p) => ({ symbol: p.symbol, quantity: p.quantity })),
        session.brokerOrders?.[0]?.timestamp ?? null
      );
      if (!verification.ok) {
        session.isPaused = true;
        session.lastTickAt = now;
        session.latestAiMessage = `${verification.message} 자동매매를 멈췄습니다. 확인 후 직접 재개해주세요.`;
        await notifyAndLog(session, '🛑 증권사 잔고 불일치 — 자동매매 정지', verification.message);
        await saveCurrentSession(session);
        return;
      }

      const cashSweepQuote: CashSweepQuote | null = await getStockAnalysis(CASH_SWEEP_SYMBOL)
        .then((a) => ({ priceNative: a.nativePrice, priceKrw: a.price }))
        .catch(() => null);

      const { result, watchlist } = await runIndexTrendTick(resetPortfolio, cashSweepQuote, now);

      // Send the decisions to the broker (a no-op while unconnected). Any
      // failure halts: the portfolio above already assumes these went through.
      const execution = await executeOrders(result.orders);
      if (execution.records.length) {
        session.brokerOrders = [...execution.records, ...(session.brokerOrders || [])];
      }
      session.portfolio = result.portfolio;
      session.watchlist = watchlist;
      session.lastTradeDate = date;
      session.lastTickAt = now;
      session.lastError = null;

      if (result.orders.length) {
        session.tradeOrders = [...result.orders.reverse(), ...session.tradeOrders];
        session.latestAiMessage = result.orders[result.orders.length - 1].reason;
        const notifyResults = await notifyDiscordTrades(result.orders);
        session.notificationLog = [
          ...notifyResults.map(({ order, result: r }) => ({
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: new Date().toISOString(),
            kind: 'trade' as const,
            title: `${order.type === 'BUY' ? '매수' : '매도'} 체결 — ${order.stockName}`,
            detail: `${order.quantity}주 @ ${Math.round(order.price).toLocaleString('ko-KR')}원`,
            ok: r.ok,
            ...(r.ok ? {} : { error: r.error || `HTTP ${r.status}` }),
          })),
          ...(session.notificationLog || []),
        ];
      } else {
        const holding = session.portfolio.positions.length > 0;
        session.latestAiMessage = holding
          ? '지수가 200일 추세선 위에 있어 그대로 보유 중입니다.'
          : '지수가 200일 추세선 아래에 있어 현금(단기국채)으로 대기 중입니다.';
      }

      // A broker failure means the portfolio recorded above no longer matches
      // the account. Stop before the next tick can compound it.
      if (execution.halt) {
        session.isPaused = true;
        session.latestAiMessage = execution.halt;
        await notifyAndLog(session, '🛑 증권사 주문 실패 — 자동매매 정지', execution.halt);
      }

      await applyDailyLossLimit(session, isNewDay);
      await saveCurrentSession(session);
      return;
    }

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
    const isNewDay = date !== session.lastTradeDate;

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

    // 3.5) Latest price for the idle-cash treasury sweep (SGOV) — fetched every
    //      tick regardless of whether it's currently held, so the engine can
    //      value/liquidate/buy into it.
    const cashSweepQuote: CashSweepQuote | null = await getStockAnalysis(CASH_SWEEP_SYMBOL)
      .then((a) => ({ priceNative: a.nativePrice, priceKrw: a.price }))
      .catch(() => null);

    // 4) Run the deterministic multi-position decision.
    const result = runPortfolioTick(
      resetPortfolio,
      heldAnalyses,
      candidateAnalyses,
      {
        maxTradesPerDay: session.config.maxTradesPerDay,
        maxConcurrentPositions: session.config.maxConcurrentPositions,
      },
      cashSweepQuote
    );

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

    await applyDailyLossLimit(session, isNewDay);
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
