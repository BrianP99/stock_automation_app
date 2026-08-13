export interface Stock {
  symbol: string;
  name: string;
  category: string;
  currentPrice: number;
  changePercent: number;
  marketCap: string;
  currency: 'KRW' | 'USD';
  description: string;
}

export type RiskLevel = 'SAFE' | 'BALANCED' | 'AGGRESSIVE';

export interface TradingConfig {
  stock: Stock;
  investmentAmount: number; // in KRW or USD
  riskLevel: RiskLevel;
  targetProfitPercent: number; // e.g. 4.5%
  stopLossPercent: number; // e.g. 2.5%
  autoTradingEnabled: boolean;
  maxTradesPerDay: number;
}

export interface TradeOrder {
  id: string;
  timestamp: string;
  type: 'BUY' | 'SELL';
  stockName: string;
  price: number;
  quantity: number;
  totalAmount: number;
  profitPercent?: number;
  reason: string;
  aiConfidence: number; // e.g., 92%
}

export interface ChartPoint {
  time: string;
  price: number;
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

export interface QuoteSummary {
  price: number;
  changePercent: number;
  currency: 'KRW' | 'USD';
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
  chartData: ChartPoint[];
  latestSignal: TradingSignal | null;
  latestAiMessage: string;
  isPaused: boolean;
  isActive: boolean;
  lastTradeDate: string;
  createdAt: string;
  lastTickAt: string | null;
  lastError: string | null;
}

export interface PortfolioState {
  initialCapital: number;
  cashBalance: number;
  holdingQuantity: number;
  avgBuyPrice: number;
  currentValuation: number;
  totalPnL: number;
  totalPnLPercent: number;
  todayTradesCount: number;
  winCount: number;
  lossCount: number;
}

export interface AiStockAnalysis {
  stockName: string;
  summary: string;
  fatherFriendlyAdvice: string;
  marketTrend: '상승 추세 📈' | '보합세 ⚖️' | '조정 장세 📉';
  recommendedTargetProfit: number;
  recommendedStopLoss: number;
  keyBuySignals: string[];
  riskFactor: string;
}

export interface DailyReport {
  date: string;
  stockName: string;
  todayReturnPercent: number;
  todayReturnAmount: number;
  totalTrades: number;
  summaryText: string;
  aiFatherLetter: string;
}
