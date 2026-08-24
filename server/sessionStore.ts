import { getStore } from '@netlify/blobs';
import type { TradingSession } from '../src/types';

// Persists the single active paper-trading session (one pooled AI-managed
// portfolio, possibly holding several stocks) in Netlify Blobs so it survives
// across scheduled-function invocations and browser tab closes — this is
// what lets a multi-day test run without the dashboard staying open.

export type StoredSession = TradingSession;

const STORE_NAME = 'trading-sessions';
const CURRENT_KEY = 'current';
const MAX_ORDERS_KEPT = 300;
const MAX_WATCHLIST_KEPT = 60;
const MAX_NOTIFICATION_LOG_KEPT = 50;

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
    watchlist: session.watchlist
      .slice()
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_WATCHLIST_KEPT),
    // Older sessions (saved before this field existed) won't have it yet.
    notificationLog: (session.notificationLog || []).slice(0, MAX_NOTIFICATION_LOG_KEPT),
  };
  await store().setJSON(CURRENT_KEY, trimmed);
}

export async function clearCurrentSession(): Promise<void> {
  await store().delete(CURRENT_KEY);
}
