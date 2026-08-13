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
  ma5?: number;
  ma20?: number;
  buySignal?: boolean;
  sellSignal?: boolean;
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

export interface AiTradeDecision {
  action: 'BUY' | 'SELL' | 'HOLD';
  quantity: number;
  confidence: number;
  reason: string;
  fatherExplanation: string;
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
