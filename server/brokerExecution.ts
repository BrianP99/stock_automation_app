// Turns the strategy's decisions into real broker orders, and refuses to let
// trading continue once our book and the broker's disagree.
//
// The engine updates the paper portfolio before these calls run, so ANY broker
// failure — rejection or timeout — means the recorded state no longer matches
// reality. Every such case halts trading for a human rather than continuing on
// a wrong picture, which is how a small error turns into a large one.

import { getKisConfig, placeOrder, fetchBalance, reconcilePositions } from './kisClient';
import type { BrokerOrderRecord, TradeOrder } from '../src/types';

/**
 * Limit orders need a price that actually fills. Crossing the spread by this
 * much buys that certainty while bounding how far the fill can drift from the
 * price the decision was made at; a market order would bound nothing.
 */
const LIMIT_CROSS_PERCENT = 0.5;

/**
 * A freshly accepted order has not settled yet, so an immediate balance check
 * would report a mismatch that is really just a pending fill. Reconciliation
 * resumes once an order is older than this.
 */
const RECONCILE_GRACE_MS = 10 * 60 * 1000;

export function isBrokerConnected(): boolean {
  return getKisConfig() !== null;
}

/** Which account the orders would go to — surfaced so the UI can never hide that it is real. */
export function brokerEnvironment(): 'paper' | 'real' | null {
  return getKisConfig()?.environment ?? null;
}

function limitPriceFor(side: 'BUY' | 'SELL', priceKrw: number): number {
  const factor = side === 'BUY' ? 1 + LIMIT_CROSS_PERCENT / 100 : 1 - LIMIT_CROSS_PERCENT / 100;
  return Math.max(1, Math.round(priceKrw * factor));
}

export interface BrokerExecutionResult {
  records: BrokerOrderRecord[];
  /** Non-null means trading must stop until a human has looked. */
  halt: string | null;
}

/**
 * Sends each order to the broker in sequence, stopping at the first failure.
 *
 * Stopping early is deliberate: once one order's outcome is wrong or unknown,
 * the portfolio state the later orders were computed from is no longer
 * trustworthy, so sending them would compound the error.
 */
export async function executeOrders(orders: TradeOrder[]): Promise<BrokerExecutionResult> {
  const records: BrokerOrderRecord[] = [];
  if (!isBrokerConnected() || orders.length === 0) return { records, halt: null };

  for (const order of orders) {
    const limitPriceKrw = limitPriceFor(order.type, order.price);
    const clientOrderId = order.id;

    const outcome = await placeOrder({
      symbol: order.symbol,
      side: order.type,
      quantity: order.quantity,
      limitPriceKrw,
      clientOrderId,
    });

    const base = {
      id: `broker-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      clientOrderId,
      symbol: order.symbol,
      side: order.type,
      quantity: order.quantity,
      limitPriceKrw,
    };

    if (outcome.status === 'accepted') {
      records.push({ ...base, status: 'accepted', orderNo: outcome.orderNo });
      continue;
    }

    if (outcome.status === 'rejected') {
      records.push({ ...base, status: 'rejected', code: outcome.code, message: outcome.message });
      return {
        records,
        halt: `증권사가 주문을 거부했습니다 (${order.type === 'BUY' ? '매수' : '매도'} ${order.stockName} ${order.quantity}주): ${outcome.message}. 기록된 내역과 실제 계좌가 다를 수 있으니 확인이 필요합니다.`,
      };
    }

    // 'unknown' — the exchange may or may not have the order. Never resend.
    records.push({ ...base, status: 'unknown', message: outcome.message });
    return {
      records,
      halt: `주문 결과를 확인하지 못했습니다 (${order.type === 'BUY' ? '매수' : '매도'} ${order.stockName} ${order.quantity}주). 중복 주문 위험이 있어 재전송하지 않았습니다. 증권사 앱에서 체결 여부를 직접 확인해주세요.`,
    };
  }

  return { records, halt: null };
}

export interface BrokerVerification {
  ok: boolean;
  /** True when the check was deliberately skipped (no broker, or a fill still settling). */
  skipped: boolean;
  message: string;
}

/**
 * Checks our recorded holdings against the broker's before any new trading.
 *
 * Run at the start of a tick rather than straight after ordering: an accepted
 * order is not a filled one, and comparing during settlement would report a
 * mismatch that resolves itself minutes later.
 */
export async function verifyAgainstBroker(
  ourPositions: { symbol: string; quantity: number }[],
  lastBrokerOrderAt: string | null
): Promise<BrokerVerification> {
  if (!isBrokerConnected()) return { ok: true, skipped: true, message: '증권사 미연결 (페이퍼 모드)' };

  if (lastBrokerOrderAt) {
    const age = Date.now() - new Date(lastBrokerOrderAt).getTime();
    if (age >= 0 && age < RECONCILE_GRACE_MS) {
      return { ok: true, skipped: true, message: '최근 주문 체결 대기 중이라 대조를 건너뜁니다.' };
    }
  }

  try {
    const balance = await fetchBalance();
    if (!balance) return { ok: true, skipped: true, message: '증권사 미연결 (페이퍼 모드)' };
    const result = reconcilePositions(ourPositions, balance.positions);
    return { ok: result.ok, skipped: false, message: result.message };
  } catch (err) {
    // A failed check is not a passed check: if we cannot confirm the broker's
    // view, we should not trade against a possibly-stale one.
    return {
      ok: false,
      skipped: false,
      message: `증권사 잔고를 조회하지 못해 대조할 수 없습니다: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
