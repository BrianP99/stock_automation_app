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
import {
  executeOrders,
  verifyAgainstBroker,
  syncCostBasisFromBroker,
  isBrokerConnected,
  isKrxOpen,
} from '../../server/brokerExecution';
import { notifyDiscordTrades, notifyDiscordSummary } from '../../server/discord';
import type { PortfolioState, StrategyMode, WatchlistCandidate } from '../../src/types';

// Runs every 5 minutes regardless of whether anyone has the dashboard open.
// One function does both the market scan AND the trade decision — folding
// them together avoids two schedules racing to read-then-write the same
// singleton session blob.

const CANDIDATE_CONFIDENCE_THRESHOLD = 65;

/**
 * How many consecutive ticks may fail to reach the broker before trading stops.
 * One HTTP 500 from KIS once halted the system for two days, which is a far
 * worse outcome than waiting three ticks: an unreachable API says nothing about
 * whether our book is right. At a five-minute schedule this rides out roughly
 * fifteen minutes of trouble and still reacts quickly to a genuine outage.
 */
const MAX_BROKER_CHECK_FAILURES = 3;
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

  // Stock picking spans ~225 KRX and US names, and the broker path only places
  // domestic orders. Running it against a live account would trade the US half
  // on paper while the KRX half went to the exchange — a book that is half real.
  if (mode === 'ai-picks' && isBrokerConnected() && !session.isPaused) {
    session.isPaused = true;
    session.latestAiMessage =
      'AI 종목선정은 미국 종목을 포함해 증권사 연동으로 주문할 수 없습니다. 지수 추세추종으로 전환하거나 증권사 연결을 해제해주세요.';
    await notifyAndLog(session, '🛑 증권사 연동과 호환되지 않는 전략 — 정지', session.latestAiMessage);
    await saveCurrentSession(session);
    return;
  }

  try {
    if (mode === 'index-trend') {
      const now = new Date().toISOString();
      const { portfolio: resetPortfolio, date } = resetDailyCountersIfNewDay(session.portfolio, session.lastTradeDate);
      const isNewDay = date !== session.lastTradeDate;

      // Orders only reach an open exchange. Deciding while KRX is shut would
      // update the book and then fail to place the trade, so skip the whole
      // decision until it opens; the signal is drawn from daily closes and will
      // still be there.
      if (isBrokerConnected() && !isKrxOpen()) {
        session.lastTickAt = now;
        session.lastError = null;
        session.latestAiMessage = '한국 증시가 열려 있지 않아 대기 중입니다. 장 시작 후 판단합니다.';
        await saveCurrentSession(session);
        return;
      }

      // Check our book against the broker's BEFORE deciding anything. Trading
      // on a stale picture is how one bad fill becomes a series of them. The
      // sweep is included: it is a real holding at the account.
      const ourHoldings = [
        ...resetPortfolio.positions.map((p) => ({ symbol: p.symbol, quantity: p.quantity })),
        ...(resetPortfolio.cashSweep
          ? [{ symbol: resetPortfolio.cashSweep.symbol, quantity: resetPortfolio.cashSweep.quantity }]
          : []),
      ];
      const verification = await verifyAgainstBroker(ourHoldings, session.brokerOrders?.[0]?.timestamp ?? null);

      if (verification.unavailable) {
        // Could not reach the broker. That is not evidence our book is wrong,
        // so hold off this tick and try the next one; only a run of failures
        // means something a person needs to look at.
        const failures = (session.brokerCheckFailures ?? 0) + 1;
        session.brokerCheckFailures = failures;
        session.lastTickAt = now;
        if (failures >= MAX_BROKER_CHECK_FAILURES) {
          session.isPaused = true;
          session.latestAiMessage = `${verification.message} ${failures}회 연속 실패해 자동매매를 멈췄습니다. 확인 후 직접 재개해주세요.`;
          await notifyAndLog(session, '🛑 증권사 연결 불가 — 자동매매 정지', verification.message);
        } else {
          session.latestAiMessage = `증권사 잔고를 확인하지 못해 이번 회차는 건너뜁니다. 잠시 후 다시 시도합니다. (${failures}/${MAX_BROKER_CHECK_FAILURES})`;
        }
        await saveCurrentSession(session);
        return;
      }

      if (!verification.ok) {
        // The broker answered and disagrees with us — the book really is wrong.
        session.isPaused = true;
        session.lastTickAt = now;
        session.latestAiMessage = `${verification.message} 자동매매를 멈췄습니다. 확인 후 직접 재개해주세요.`;
        await notifyAndLog(session, '🛑 증권사 잔고 불일치 — 자동매매 정지', verification.message);
        await saveCurrentSession(session);
        return;
      }

      session.brokerCheckFailures = 0;

      const cashSweepQuote: CashSweepQuote | null = await getStockAnalysis(CASH_SWEEP_SYMBOL)
        .then((a) => ({ priceNative: a.nativePrice, priceKrw: a.price }))
        .catch(() => null);

      // Adopt the broker's cost basis before deciding, so valuation is measured
      // against what the account actually paid.
      const basePortfolio = verification.brokerPositions
        ? syncCostBasisFromBroker(resetPortfolio, verification.brokerPositions)
        : resetPortfolio;

      const { result, watchlist } = await runIndexTrendTick(basePortfolio, cashSweepQuote, now);

      // Send the decisions to the broker (a no-op while unconnected). Any
      // failure halts: the portfolio above already assumes these went through.
      // Sweep moves go too — they are real orders at the account even though
      // they are kept out of the strategy's trade history.
      const execution = await executeOrders([...result.orders, ...result.cashSweepOrders]);
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
