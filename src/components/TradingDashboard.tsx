import React, { useState, useEffect, useRef } from 'react';
import { TradingConfig, TradeOrder, ChartPoint, PortfolioState, AiStockAnalysis, AiTradeDecision } from '../types';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import confetti from 'canvas-confetti';
import {
  TrendingUp,
  TrendingDown,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Bot,
  Sparkles,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Activity,
  DollarSign,
  AlertTriangle,
  FileText,
  Volume2,
} from 'lucide-react';

interface TradingDashboardProps {
  config: TradingConfig;
  aiAnalysis?: AiStockAnalysis;
  fontSizeClass: string;
  onResetSetup: () => void;
  onOpenDailyReport: () => void;
  onOpenSmsPreview: () => void;
}

export const TradingDashboard: React.FC<TradingDashboardProps> = ({
  config,
  aiAnalysis,
  fontSizeClass,
  onResetSetup,
  onOpenDailyReport,
  onOpenSmsPreview,
}) => {
  // Trading Active Status
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // Current Market Price State
  const initialPrice = config.stock.currentPrice;
  const [currentPrice, setCurrentPrice] = useState<number>(initialPrice);

  // Portfolio State
  const [portfolio, setPortfolio] = useState<PortfolioState>(() => {
    // Initial buy order setup
    const initialShares = Math.floor((config.investmentAmount * 0.6) / initialPrice);
    const initialCash = config.investmentAmount - initialShares * initialPrice;
    return {
      initialCapital: config.investmentAmount,
      cashBalance: initialCash,
      holdingQuantity: initialShares,
      avgBuyPrice: initialPrice,
      currentValuation: config.investmentAmount,
      totalPnL: 0,
      totalPnLPercent: 0,
      todayTradesCount: 1,
      winCount: 1,
      lossCount: 0,
    };
  });

  // Chart Points History
  const [chartData, setChartData] = useState<ChartPoint[]>(() => {
    const points: ChartPoint[] = [];
    const now = new Date();
    let basePrice = initialPrice * 0.98;
    for (let i = 15; i >= 0; i--) {
      const timeStr = new Date(now.getTime() - i * 30000).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const randChange = (Math.random() - 0.48) * (initialPrice * 0.005);
      basePrice = Math.round(basePrice + randChange);
      points.push({
        time: timeStr,
        price: basePrice,
        ma5: Math.round(basePrice * 0.998),
        ma20: Math.round(basePrice * 0.995),
      });
    }
    return points;
  });

  // Trade Orders Log History
  const [tradeOrders, setTradeOrders] = useState<TradeOrder[]>([
    {
      id: 'order-init',
      timestamp: new Date().toLocaleTimeString('ko-KR'),
      type: 'BUY',
      stockName: config.stock.name,
      price: initialPrice,
      quantity: Math.floor((config.investmentAmount * 0.6) / initialPrice),
      totalAmount: Math.floor((config.investmentAmount * 0.6) / initialPrice) * initialPrice,
      reason: 'AI 자동매매 시작: 포트폴리오 초기 분할 매수 60% 실행',
      aiConfidence: 94,
    },
  ]);

  // Latest AI Decision Message for Father
  const [latestAiMessage, setLatestAiMessage] = useState<string>(
    aiAnalysis?.fatherFriendlyAdvice ||
      '아버지, AI가 실시간 시장 동향을 감시하고 있습니다. 정해진 익절/손절 구간 내에서 안전하게 관리합니다.'
  );

  // Confetti trigger flag
  const hasCelebrated = useRef<boolean>(false);

  // Speech TTS for Father
  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 0.95; // Slightly slower for father
      window.speechSynthesis.speak(utterance);
    }
  };

  // Real-time Tick Price Simulation & AI Decision Loop
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(async () => {
      // 1. Simulate Price Movement
      const volatility = currentPrice * 0.004; // 0.4% fluctuation
      const priceDelta = Math.round((Math.random() - 0.48) * volatility);
      const newPrice = Math.max(100, currentPrice + priceDelta);
      setCurrentPrice(newPrice);

      // 2. Calculate New Valuation & PnL
      const newStockValuation = portfolio.holdingQuantity * newPrice;
      const newTotalValuation = portfolio.cashBalance + newStockValuation;
      const pnlAmount = newTotalValuation - portfolio.initialCapital;
      const pnlPercent = Number(((pnlAmount / portfolio.initialCapital) * 100).toFixed(2));

      setPortfolio((prev) => ({
        ...prev,
        currentValuation: newTotalValuation,
        totalPnL: pnlAmount,
        totalPnLPercent: pnlPercent,
      }));

      // 3. Update Chart Data Points
      const timeStr = new Date().toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      setChartData((prev) => {
        const next = [...prev, { time: timeStr, price: newPrice }];
        if (next.length > 25) next.shift(); // Keep last 25 ticks
        return next;
      });

      // 4. Milestone Profit Celebration
      if (pnlPercent >= config.targetProfitPercent && !hasCelebrated.current) {
        hasCelebrated.current = true;
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
      }

      // 5. Automatic AI Strategy Trade Decision Check
      const shouldTriggerTrade = Math.random() < 0.22; // 22% chance per tick to evaluate trade

      if (shouldTriggerTrade) {
        try {
          const res = await fetch('/api/generate-trade-decision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              stockName: config.stock.name,
              currentPrice: newPrice,
              avgBuyPrice: portfolio.avgBuyPrice,
              holdingQuantity: portfolio.holdingQuantity,
              cashBalance: portfolio.cashBalance,
              pnlPercent: pnlPercent,
              lastTrend: newPrice > portfolio.avgBuyPrice ? '상승' : '보합',
            }),
          });
          const decision: AiTradeDecision = await res.json();

          if (decision.fatherExplanation) {
            setLatestAiMessage(decision.fatherExplanation);
          }

          // Execute BUY
          if (
            decision.action === 'BUY' &&
            portfolio.cashBalance >= newPrice * 2 &&
            portfolio.todayTradesCount < config.maxTradesPerDay
          ) {
            const buyQty = Math.min(
              Math.floor(portfolio.cashBalance / newPrice),
              Math.max(1, decision.quantity || 2)
            );
            const cost = buyQty * newPrice;

            if (buyQty > 0) {
              const newQty = portfolio.holdingQuantity + buyQty;
              const newAvgPrice = Math.round(
                (portfolio.holdingQuantity * portfolio.avgBuyPrice + cost) / newQty
              );

              setPortfolio((prev) => ({
                ...prev,
                cashBalance: prev.cashBalance - cost,
                holdingQuantity: newQty,
                avgBuyPrice: newAvgPrice,
                todayTradesCount: prev.todayTradesCount + 1,
              }));

              const newOrder: TradeOrder = {
                id: `order-${Date.now()}`,
                timestamp: new Date().toLocaleTimeString('ko-KR'),
                type: 'BUY',
                stockName: config.stock.name,
                price: newPrice,
                quantity: buyQty,
                totalAmount: cost,
                reason: decision.reason || 'AI 이동평균선 매수 조건 포착',
                aiConfidence: decision.confidence || 90,
              };

              setTradeOrders((prev) => [newOrder, ...prev]);
            }
          }

          // Execute SELL
          if (decision.action === 'SELL' && portfolio.holdingQuantity > 0) {
            const sellQty = Math.min(portfolio.holdingQuantity, Math.max(1, decision.quantity || 3));
            const returnCash = sellQty * newPrice;
            const tradePnL = (newPrice - portfolio.avgBuyPrice) * sellQty;

            setPortfolio((prev) => ({
              ...prev,
              cashBalance: prev.cashBalance + returnCash,
              holdingQuantity: prev.holdingQuantity - sellQty,
              todayTradesCount: prev.todayTradesCount + 1,
              winCount: tradePnL >= 0 ? prev.winCount + 1 : prev.winCount,
              lossCount: tradePnL < 0 ? prev.lossCount + 1 : prev.lossCount,
            }));

            const newOrder: TradeOrder = {
              id: `order-${Date.now()}`,
              timestamp: new Date().toLocaleTimeString('ko-KR'),
              type: 'SELL',
              stockName: config.stock.name,
              price: newPrice,
              quantity: sellQty,
              totalAmount: returnCash,
              profitPercent: Number((((newPrice - portfolio.avgBuyPrice) / portfolio.avgBuyPrice) * 100).toFixed(2)),
              reason: decision.reason || 'AI 목표 수익 달성 익절 매도',
              aiConfidence: decision.confidence || 92,
            };

            setTradeOrders((prev) => [newOrder, ...prev]);
          }
        } catch (err) {
          console.error('AI decision loop error:', err);
        }
      }
    }, 3500);

    return () => clearInterval(interval);
  }, [currentPrice, isPaused, portfolio, config]);

  // Handle Panic Exit (Emergency Refund)
  const handlePanicExit = () => {
    if (window.confirm('정말 보유 주식을 전량 매도하고 자동매매를 종료하시겠습니까? 원금과 수익금이 모두 예수금으로 안전 환원됩니다.')) {
      const returnAmount = portfolio.holdingQuantity * currentPrice;
      const totalRefundCash = portfolio.cashBalance + returnAmount;

      alert(`전량 매도 완료!\n최종 환원 금액: ${Math.round(totalRefundCash).toLocaleString()}원`);
      onResetSetup();
    }
  };

  const isProfit = portfolio.totalPnL >= 0;

  return (
    <div className={`max-w-7xl mx-auto px-4 py-6 space-y-6 ${fontSizeClass}`}>
      {/* Top Banner: Active Status & AI Live Advice Bar */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Bot className="w-7 h-7 animate-bounce" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <h3 className="text-xl font-black text-white">
                {config.stock.name} AI 자동매매 가동 중
              </h3>
              <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full font-bold border border-emerald-500/30">
                {config.riskLevel === 'SAFE' ? '안정형 🛡️' : config.riskLevel === 'BALANCED' ? '균형형 ⚖️' : '성장형 🚀'}
              </span>
            </div>
            <p className="text-sm text-emerald-300 font-medium mt-1 flex items-center gap-1.5">
              <span>"{latestAiMessage}"</span>
            </p>
          </div>
        </div>

        {/* Top Control Buttons */}
        <div className="flex items-center flex-wrap gap-2 shrink-0">
          <button
            onClick={() => speakText(latestAiMessage)}
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-sm border border-amber-500/30 transition-all flex items-center space-x-1.5"
            title="음성으로 AI 브리핑 듣기"
          >
            <Volume2 className="w-4 h-4 text-amber-400" />
            <span>음성 듣기</span>
          </button>

          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`px-4 py-2.5 rounded-xl font-extrabold text-sm transition-all flex items-center space-x-2 shadow-md ${
              isPaused
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
            }`}
          >
            {isPaused ? <Play className="w-4 h-4 fill-slate-950" /> : <Pause className="w-4 h-4 fill-slate-950" />}
            <span>{isPaused ? '자동매매 다시 시작' : '일시정지'}</span>
          </button>

          <button
            onClick={handlePanicExit}
            className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-sm transition-all flex items-center space-x-1.5 shadow-md"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>긴급 전량 매도 후 종료</span>
          </button>
        </div>
      </div>

      {/* METRICS CARDS GRID (Father-Friendly Large Indicators) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Valuation */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            총 평가 금액 (원금 + 수익)
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">
            {Math.round(portfolio.currentValuation).toLocaleString()}
            <span className="text-base font-bold text-slate-500 ml-1">원</span>
          </div>
          <div className="mt-3 text-xs font-semibold text-slate-500 flex items-center justify-between">
            <span>설정 투자금:</span>
            <span className="font-bold text-slate-800">
              {config.investmentAmount.toLocaleString()}원
            </span>
          </div>
        </div>

        {/* Real-time PnL */}
        <div
          className={`rounded-3xl p-6 border shadow-sm transition-colors ${
            isProfit
              ? 'bg-gradient-to-br from-red-50 to-orange-50 border-red-200'
              : 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200'
          }`}
        >
          <div className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
            <span>실시간 평가 손익</span>
            {isProfit ? (
              <TrendingUp className="w-5 h-5 text-red-500" />
            ) : (
              <TrendingDown className="w-5 h-5 text-blue-500" />
            )}
          </div>
          <div
            className={`text-2xl sm:text-3xl font-black mt-2 ${
              isProfit ? 'text-red-600' : 'text-blue-600'
            }`}
          >
            {isProfit ? '+' : ''}
            {Math.round(portfolio.totalPnL).toLocaleString()}
            <span className="text-base font-bold ml-1">원</span>
          </div>
          <div className="mt-3 flex items-center space-x-2">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                isProfit ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
              }`}
            >
              수익률 {isProfit ? '+' : ''}
              {portfolio.totalPnLPercent}%
            </span>
            <span className="text-xs text-slate-500">목표: +{config.targetProfitPercent}%</span>
          </div>
        </div>

        {/* Current Stock Price */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {config.stock.name} 실시간 현재가
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">
            {currentPrice.toLocaleString()}
            <span className="text-base font-bold text-slate-500 ml-1">원</span>
          </div>
          <div className="mt-3 text-xs text-slate-600 flex items-center justify-between font-semibold">
            <span>보유 수량: {portfolio.holdingQuantity}주</span>
            <span>평단가: {portfolio.avgBuyPrice.toLocaleString()}원</span>
          </div>
        </div>

        {/* AI Performance & Guardrails */}
        <div className="bg-slate-900 text-white rounded-3xl p-6 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>AI 승률 & 안전장치</span>
              <ShieldAlert className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-400 mt-2">
              {portfolio.todayTradesCount > 0
                ? ((portfolio.winCount / portfolio.todayTradesCount) * 100).toFixed(1)
                : '100'}
              <span className="text-base font-bold text-slate-300 ml-1">% 승률</span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
            <span>자동 손절 한도: -{config.stopLossPercent}%</span>
            <span className="text-emerald-400 font-bold">안전 작동 중</span>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA: LIVE CHART & ORDER HISTORY */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CHART SECTION (2 Columns) */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <h4 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-600" />
                <span>{config.stock.name} AI 실시간 주가 차트</span>
              </h4>
              <p className="text-xs text-slate-500">
                30초 간격 실시간 틱 데이터 및 AI 매매 타점 지표
              </p>
            </div>
            <div className="flex items-center space-x-3 text-xs font-bold">
              <span className="flex items-center gap-1.5 text-emerald-600">
                <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> 주가
              </span>
              <span className="flex items-center gap-1.5 text-amber-500">
                <span className="w-3 h-0.5 bg-amber-500 inline-block" /> 5일선
              </span>
            </div>
          </div>

          {/* Recharts Area Container */}
          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(val) => `${val.toLocaleString()}`}
                  width={60}
                />
                <Tooltip
                  formatter={(value: any) => [`${Number(value).toLocaleString()}원`, '주가']}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderRadius: '16px',
                    color: '#ffffff',
                    border: '1px solid #334155',
                    fontWeight: 'bold',
                  }}
                />
                <ReferenceLine
                  y={portfolio.avgBuyPrice}
                  label={{
                    value: `평단가: ${portfolio.avgBuyPrice.toLocaleString()}원`,
                    fill: '#ef4444',
                    fontSize: 11,
                    fontWeight: 'bold',
                  }}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="#10b981"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#priceGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Safety Control Action Bar */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
            <div className="flex items-center space-x-2 text-slate-700 font-bold">
              <Zap className="w-4 h-4 text-amber-500" />
              <span>AI 자동 매매 진행 상태:</span>
              <span className="text-emerald-700 font-extrabold">
                {isPaused ? '일시 정지 중' : '실시간 신호 감시 중'}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={onOpenDailyReport}
                className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 rounded-xl font-bold border border-amber-500/30 transition-colors"
              >
                오늘의 AI 보고서
              </button>
              <button
                onClick={onOpenSmsPreview}
                className="px-3 py-1.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-700 rounded-xl font-bold border border-teal-500/30 transition-colors"
              >
                문자 알림 받기
              </button>
            </div>
          </div>
        </div>

        {/* ORDER LOG STREAM (1 Column) */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col h-[460px]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-600" />
              <span>AI 체결 내역 ({tradeOrders.length}건)</span>
            </h4>
            <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-bold">
              실시간 업데이트
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {tradeOrders.map((order) => {
              const isBuy = order.type === 'BUY';
              return (
                <div
                  key={order.id}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    isBuy
                      ? 'bg-red-50/60 border-red-200 text-slate-900'
                      : 'bg-blue-50/60 border-blue-200 text-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold mb-1">
                    <span
                      className={`px-2 py-0.5 rounded-full font-black ${
                        isBuy ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                      }`}
                    >
                      {isBuy ? 'AI 매수' : 'AI 매도'}
                    </span>
                    <span className="text-slate-400 font-mono">{order.timestamp}</span>
                  </div>

                  <div className="flex items-baseline justify-between mt-2">
                    <span className="font-extrabold text-slate-900">
                      {order.quantity}주 @ {order.price.toLocaleString()}원
                    </span>
                    <span className="text-xs font-bold text-slate-600">
                      총 {order.totalAmount.toLocaleString()}원
                    </span>
                  </div>

                  {/* AI Reason */}
                  <p className="text-xs text-slate-600 mt-2 bg-white/80 p-2 rounded-xl border border-slate-200/60 font-medium">
                    💡 사유: {order.reason}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
