import { getStore } from '@netlify/blobs';
import type { PortfolioState, TradeOrder, TradingConfig, TradingSignal, ChartPoint } from '../src/types';

// Persists the single active paper-trading session in Netlify Blobs so it
// survives across scheduled-function invocations and browser tab closes —
// this is what lets a multi-day test run without the dashboard staying open.

export interface StoredSession {
  config: TradingConfig;
  portfolio: PortfolioState;
  tradeOrders: TradeOrder[];
  chartData: ChartPoint[];
  latestSignal: TradingSignal | null;
  latestAiMessage: string;
  isPaused: boolean;
  isActive: boolean;
  lastTradeDate: string; // Asia/Seoul YYYY-MM-DD, for daily counter reset
  createdAt: string;
  lastTickAt: string | null;
  lastError: string | null;
}

const STORE_NAME = 'trading-sessions';
const CURRENT_KEY = 'current';
const MAX_ORDERS_KEPT = 300;
const MAX_CHART_POINTS_KEPT = 200;

function store() {
  // Strong consistency matters here: pause/exit/config updates must be
  // immediately visible to the next read (both the dashboard's poll and the
  // scheduled tick function), or a paused session could keep trading, or a
  // panic-exit could appear to silently not have happened.
  return getStore(STORE_NAME, { consistency: 'strong' });
}

export async function getCurrentSession(): Promise<StoredSession | null> {
  return store().get(CURRENT_KEY, { type: 'json' });
}

export async function saveCurrentSession(session: StoredSession): Promise<void> {
  const trimmed: StoredSession = {
    ...session,
    tradeOrders: session.tradeOrders.slice(0, MAX_ORDERS_KEPT),
    chartData: session.chartData.slice(-MAX_CHART_POINTS_KEPT),
  };
  await store().setJSON(CURRENT_KEY, trimmed);
}

export async function clearCurrentSession(): Promise<void> {
  await store().delete(CURRENT_KEY);
}
