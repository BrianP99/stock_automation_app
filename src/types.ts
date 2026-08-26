export type Market = 'KRX' | 'US';

export type RiskLevel = 'SAFE' | 'BALANCED' | 'AGGRESSIVE';

/** Portfolio-level configuration. No single stock here anymore — the AI picks everything. */
export interface TradingConfig {
  investmentAmount: number; // KRW
  riskLevel: RiskLevel;
  targetProfitPercent: number; // per-position, e.g. 4.5%
  stopLossPercent: number; // per-position, e.g. 2.5%
  autoTradingEnabled: boolean;
  maxTradesPerDay: number;
  maxConcurrentPositions: number; // 3-5
}

/** One currently-held stock in the AI's portfolio. */
export interface Position {
  symbol: string;
  name: string;
  market: Market;
  exchange: string;
  currency: 'KRW' | 'USD';
  sector: string;
  description: string;
  quantity: number;
  avgBuyPriceNative: number;
  avgBuyPriceKrw: number;
  openedAt: string;
}

/** One row in the "알림 로그" — every attempted Discord push, success or failure. */
export interface NotificationLogEntry {
  id: string;
  timestamp: string;
  kind: 'trade' | 'summary';
  title: string;
  detail: string;
  ok: boolean;
  error?: string;
}

export interface TradeOrder {
  id: string;
  timestamp: string;
  type: 'BUY' | 'SELL';
  symbol: string;
  stockName: string;
  market: Market;
  currency: 'KRW' | 'USD';
  price: number; // KRW
  priceNative: number; // native currency (== price when currency is KRW)
  quantity: number;
  totalAmount: number; // KRW
  totalAmountNative: number;
  profitPercent?: number;
  profitAmount?: number; // KRW realized P&L — SELL orders only
  profitAmountNative?: number; // native currency realized P&L — SELL orders only
  reason: string;
  aiConfidence: number;
}

export interface ChartPoint {
  time: string;
  price: number; // close
  open?: number;
  high?: number;
  low?: number;
  sma5?: number | null;
  sma20?: number | null;
  sma60?: number | null;
  rsi14?: number | null;
  goldenCross?: boolean;
  deadCross?: boolean;
}

export type CrossType = 'golden' | 'dead' | null;

export interface TradingSignal {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reason: string;
  cross: CrossType;
}

export interface StockAnalysisResponse {
  symbol: string;
  yahooSymbol: string;
  exchange: string;
  currency: 'KRW' | 'USD';
  price: number;
  nativePrice: number;
  nativeCurrency: string;
  fxRateUsedKrw: number | null;
  previousClose: number;
  changePercent: number;
  asOf: string;
  isLive: boolean;
  history: ChartPoint[];
  signal: TradingSignal;
}

/** A symbol the scanner currently likes, shown in the watchlist panel for transparency. */
export interface WatchlistCandidate {
  symbol: string;
  name: string;
  market: Market;
  exchange: string;
  currency: 'KRW' | 'USD';
  sector: string;
  description: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reason: string;
  scannedAt: string;
}

export interface PortfolioState {
  initialCapital: number;
  cashBalance: number; // KRW, unified across markets
  positions: Position[];
  currentValuation: number;
  totalPnL: number;
  totalPnLPercent: number;
  todayTradesCount: number;
  winCount: number;
  lossCount: number;
}

/**
 * Server-persisted (Netlify Blobs) paper-trading session. A scheduled
 * function advances this every few minutes independent of any open browser
 * tab; the dashboard just polls and displays it.
 */
export interface TradingSession {
  config: TradingConfig;
  portfolio: PortfolioState;
  tradeOrders: TradeOrder[];
  watchlist: WatchlistCandidate[];
  notificationLog: NotificationLogEntry[];
  latestAiMessage: string;
  isPaused: boolean;
  isActive: boolean;
  lastTradeDate: string;
  createdAt: string;
  lastTickAt: string | null;
  lastError: string | null;
}
