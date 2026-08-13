import React, { useState, useEffect, useRef } from 'react';
import { TradingConfig, TradeOrder, ChartPoint, TradingSession, AiStockAnalysis } from '../types';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  ReferenceDot,
} from 'recharts';
import confetti from 'canvas-confetti';
import {
  TrendingUp,
  TrendingDown,
  Pause,
  Play,
  ShieldAlert,
  Bot,
  Clock,
  Zap,
  Activity,
  AlertTriangle,
  Volume2,
  WifiOff,
  ServerCog,
} from 'lucide-react';

interface TradingDashboardProps {
  config: TradingConfig;
  aiAnalysis?: AiStockAnalysis;
  fontSizeClass: string;
  onResetSetup: () => void;
  onOpenDailyReport: () => void;
  onOpenSmsPreview: () => void;
}

const POLL_INTERVAL_MS = 20000;

async function fetchSessionState(): Promise<{ active: boolean; session?: TradingSession }> {
  const res = await fetch('/api/session/state');
  if (!res.ok) throw new Error('세션 상태를 불러오지 못했습니다.');
  return res.json();
}

async function controlSession(action: 'pause' | 'resume' | 'exit'): Promise<TradingSession> {
  const res = await fetch('/api/session/control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || '요청을 처리하지 못했습니다.');
  return body;
}

export const TradingDashboard: React.FC<TradingDashboardProps> = ({
  config,
  fontSizeClass,
  onResetSetup,
  onOpenDailyReport,
  onOpenSmsPreview,
}) => {
  const [session, setSession] = useState<TradingSession | null>(null);
  const [initializing, setInitializing] = useState<boolean>(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isControlling, setIsControlling] = useState<boolean>(false);

  const hasCelebrated = useRef<boolean>(false);

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
    }
  };

  const refresh = async () => {
    try {
      const state = await fetchSessionState();
      setConnectionError(null);
      if (!state.active || !state.session) {
        // The scheduled tick (or another tab's panic-exit) ended the session.
        onResetSetup();
        return;
      }
      setSession(state.session);
    } catch (err: any) {
      setConnectionError(err.message || '세션 상태 연결에 실패했습니다. 잠시 후 자동으로 재시도합니다.');
    } finally {
      setInitializing(false);
    }
  };

  // Initial load + periodic refresh — this is a read-only poll now. The
  // actual buy/sell decisions happen server-side in the scheduled function,
  // so this keeps working even if the tab is closed and reopened later.
  useEffect(() => {
    let cancelled = false;
    setInitializing(true);
    setInitError(null);
    hasCelebrated.current = false;

    (async () => {
      try {
        const state = await fetchSessionState();
        if (cancelled) return;
        if (!state.active || !state.session) {
          setInitError('진행 중인 자동매매 세션을 찾을 수 없습니다.');
          return;
        }
        setSession(state.session);
      } catch (err: any) {
        if (!cancelled) setInitError(err.message || '세션을 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();

    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.stock.symbol]);

  // Cosmetic-only: celebrate once per session when target profit is reached.
  useEffect(() => {
    if (!session) return;
    if (session.portfolio.totalPnLPercent >= session.config.targetProfitPercent && !hasCelebrated.current) {
      hasCelebrated.current = true;
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
  }, [session]);

  const handlePause = async () => {
    if (!session) return;
    setIsControlling(true);
    try {
      const updated = await controlSession(session.isPaused ? 'resume' : 'pause');
      setSession(updated);
    } catch (err: any) {
      alert(err.message || '요청을 처리하지 못했습니다.');
    } finally {
      setIsControlling(false);
    }
  };

  const handlePanicExit = async () => {
    if (!session) return;
    if (
      !window.confirm('정말 보유 주식을 전량 매도하고 자동매매를 종료하시겠습니까? 원금과 수익금이 모두 예수금으로 안전 환원됩니다.')
    ) {
      return;
    }
    setIsControlling(true);
    try {
      const updated = await controlSession('exit');
      alert(`전량 매도 완료!\n최종 환원 금액: ${Math.round(updated.portfolio.cashBalance).toLocaleString()}원`);
      onResetSetup();
    } catch (err: any) {
      alert(err.message || '전량 매도에 실패했습니다.');
    } finally {
      setIsControlling(false);
    }
  };

  if (initializing) {
    return (
      <div className={`max-w-3xl mx-auto px-4 py-24 text-center space-y-4 ${fontSizeClass}`}>
        <div className="inline-block w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-600 font-semibold">{config.stock.name} 자동매매 세션을 불러오고 있습니다...</p>
      </div>
    );
  }

  if (initError || !session) {
    return (
      <div className={`max-w-2xl mx-auto px-4 py-24 text-center space-y-5 ${fontSizeClass}`}>
        <WifiOff className="w-12 h-12 text-red-500 mx-auto" />
        <h3 className="text-xl font-bold text-slate-900">자동매매 세션 연결에 실패했습니다</h3>
        <p className="text-slate-500 text-sm">{initError}</p>
        <button
          onClick={onResetSetup}
          className="px-5 py-3 rounded-2xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold"
        >
          종목 다시 선택
        </button>
      </div>
    );
  }

  const { portfolio, tradeOrders, chartData, latestSignal, latestAiMessage, isPaused, lastTickAt, lastError } = session;
  const isProfit = portfolio.totalPnL >= 0;
  const goldenPoints = chartData.filter((p) => p.goldenCross);
  const deadPoints = chartData.filter((p) => p.deadCross);
  const currentPrice = chartData.length > 0 ? chartData[chartData.length - 1].price : portfolio.avgBuyPrice;

  return (
    <div className={`max-w-7xl mx-auto px-4 py-6 space-y-6 ${fontSizeClass}`}>
      {/* Top Banner: Active Status & AI Live Advice Bar */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Bot className="w-7 h-7 animate-bounce" />
          </div>
          <div>
            <div className="flex items-center space-x-2 flex-wrap">
              <span className={`w-2.5 h-2.5 rounded-full ${isPaused ? 'bg-slate-500' : 'bg-emerald-400 animate-ping'}`} />
              <h3 className="text-xl font-black text-white">{config.stock.name} AI 자동매매 가동 중</h3>
              <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full font-bold border border-emerald-500/30">
                {config.riskLevel === 'SAFE' ? '안정형 🛡️' : config.riskLevel === 'BALANCED' ? '균형형 ⚖️' : '성장형 🚀'}
              </span>
              {latestSignal && (
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                    latestSignal.action === 'BUY'
                      ? 'bg-red-500/20 text-red-300 border-red-500/30'
                      : latestSignal.action === 'SELL'
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                      : 'bg-slate-500/20 text-slate-300 border-slate-500/30'
                  }`}
                >
                  기술적 신호: {latestSignal.action} ({latestSignal.confidence}%)
                </span>
              )}
            </div>
            <p className="text-sm text-emerald-300 font-medium mt-1 flex items-center gap-1.5">
              <span>"{latestAiMessage}"</span>
            </p>
          </div>
        </div>

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
            onClick={handlePause}
            disabled={isControlling}
            className={`px-4 py-2.5 rounded-xl font-extrabold text-sm transition-all flex items-center space-x-2 shadow-md disabled:opacity-60 ${
              isPaused ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950' : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
            }`}
          >
            {isPaused ? <Play className="w-4 h-4 fill-slate-950" /> : <Pause className="w-4 h-4 fill-slate-950" />}
            <span>{isPaused ? '자동매매 다시 시작' : '일시정지'}</span>
          </button>

          <button
            onClick={handlePanicExit}
            disabled={isControlling}
            className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-sm transition-all flex items-center space-x-1.5 shadow-md disabled:opacity-60"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>긴급 전량 매도 후 종료</span>
          </button>
        </div>
      </div>

      {/* Persistent-session notice */}
      <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-2xl p-4 flex items-center gap-3 text-xs sm:text-sm font-semibold">
        <ServerCog className="w-5 h-5 shrink-0 text-indigo-500" />
        <span>
          이 자동매매는 서버에서 5분마다 자동으로 실행됩니다. 이 화면을 닫으셔도 계속 진행되며, 다시 열면 이어서 확인하실 수 있습니다.
          {lastTickAt && ` (마지막 확인: ${new Date(lastTickAt).toLocaleString('ko-KR')})`}
        </span>
      </div>

      {(connectionError || lastError) && (
        <div className="bg-amber-50 border border-amber-300 text-amber-800 rounded-2xl p-4 flex items-center gap-3 text-sm font-semibold">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{connectionError || `최근 자동 확인 중 오류가 발생했습니다: ${lastError}`}</span>
        </div>
      )}

      {/* METRICS CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">총 평가 금액 (원금 + 수익)</div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">
            {Math.round(portfolio.currentValuation).toLocaleString()}
            <span className="text-base font-bold text-slate-500 ml-1">원</span>
          </div>
          <div className="mt-3 text-xs font-semibold text-slate-500 flex items-center justify-between">
            <span>설정 투자금:</span>
            <span className="font-bold text-slate-800">{config.investmentAmount.toLocaleString()}원</span>
          </div>
        </div>

        <div
          className={`rounded-3xl p-6 border shadow-sm transition-colors ${
            isProfit ? 'bg-gradient-to-br from-red-50 to-orange-50 border-red-200' : 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200'
          }`}
        >
          <div className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
            <span>실시간 평가 손익</span>
            {isProfit ? <TrendingUp className="w-5 h-5 text-red-500" /> : <TrendingDown className="w-5 h-5 text-blue-500" />}
          </div>
          <div className={`text-2xl sm:text-3xl font-black mt-2 ${isProfit ? 'text-red-600' : 'text-blue-600'}`}>
            {isProfit ? '+' : ''}
            {Math.round(portfolio.totalPnL).toLocaleString()}
            <span className="text-base font-bold ml-1">원</span>
          </div>
          <div className="mt-3 flex items-center space-x-2 flex-wrap gap-y-1">
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

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
            <span>{config.stock.name} 현재가</span>
            <span className="text-emerald-600 font-bold">{connectionError ? '재연결 중' : '자동 갱신'}</span>
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

        <div className="bg-slate-900 text-white rounded-3xl p-6 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>AI 승률 & 안전장치</span>
              <ShieldAlert className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-400 mt-2">
              {portfolio.todayTradesCount > 0 ? ((portfolio.winCount / portfolio.todayTradesCount) * 100).toFixed(1) : '100'}
              <span className="text-base font-bold text-slate-300 ml-1">% 승률</span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
            <span>자동 손절 한도: -{config.stopLossPercent}%</span>
            <span className="text-emerald-400 font-bold">안전 작동 중</span>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 flex-wrap gap-2">
            <div>
              <h4 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-600" />
                <span>{config.stock.name} 주가 & 이동평균선 차트</span>
              </h4>
              <p className="text-xs text-slate-500">
                5분마다 서버에서 자동 갱신
                {latestSignal?.cross && (latestSignal.cross === 'golden' ? ' · 최근 골든크로스 발생' : ' · 최근 데드크로스 발생')}
              </p>
            </div>
            <div className="flex items-center space-x-3 text-xs font-bold flex-wrap gap-y-1">
              <span className="flex items-center gap-1.5 text-emerald-600">
                <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> 주가
              </span>
              <span className="flex items-center gap-1.5 text-amber-500">
                <span className="w-3 h-0.5 bg-amber-500 inline-block" /> 5일선
              </span>
              <span className="flex items-center gap-1.5 text-indigo-500">
                <span className="w-3 h-0.5 bg-indigo-500 inline-block" /> 20일선
              </span>
            </div>
          </div>

          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(val) => new Date(val).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(val) => `${val.toLocaleString()}`}
                  width={60}
                />
                <Tooltip
                  labelFormatter={(val) => new Date(val).toLocaleString('ko-KR')}
                  formatter={(value: any, name: string) => [
                    `${Number(value).toLocaleString()}원`,
                    name === 'price' ? '주가' : name === 'sma5' ? '5일선' : name === 'sma20' ? '20일선' : name,
                  ]}
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
                <Area type="monotone" dataKey="price" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#priceGradient)" />
                <Line type="monotone" dataKey="sma5" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="sma20" stroke="#6366f1" strokeWidth={2} dot={false} connectNulls />
                {goldenPoints.map((p, i) => (
                  <ReferenceDot key={`golden-${i}`} x={p.time} y={p.price} r={5} fill="#ef4444" stroke="white" />
                ))}
                {deadPoints.map((p, i) => (
                  <ReferenceDot key={`dead-${i}`} x={p.time} y={p.price} r={5} fill="#3b82f6" stroke="white" />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {latestSignal && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
              <div className="flex items-center space-x-2 text-slate-700 font-bold">
                <Zap className="w-4 h-4 text-amber-500" />
                <span>AI 자동 매매 진행 상태:</span>
                <span className="text-emerald-700 font-extrabold">{isPaused ? '일시 정지 중' : '실시간 신호 감시 중'}</span>
                {chartData.length > 0 && chartData[chartData.length - 1].rsi14 != null && (
                  <span className="text-slate-500 font-semibold">
                    · RSI {chartData[chartData.length - 1].rsi14!.toFixed(1)}
                  </span>
                )}
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
          )}
        </div>

        {/* ORDER LOG STREAM */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col h-[460px]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-600" />
              <span>AI 체결 내역 ({tradeOrders.length}건)</span>
            </h4>
            <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-bold">자동 업데이트</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {tradeOrders.map((order: TradeOrder) => {
              const isBuy = order.type === 'BUY';
              return (
                <div
                  key={order.id}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    isBuy ? 'bg-red-50/60 border-red-200 text-slate-900' : 'bg-blue-50/60 border-blue-200 text-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold mb-1">
                    <span className={`px-2 py-0.5 rounded-full font-black ${isBuy ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}>
                      {isBuy ? 'AI 매수' : 'AI 매도'}
                    </span>
                    <span className="text-slate-400 font-mono">{new Date(order.timestamp).toLocaleString('ko-KR')}</span>
                  </div>

                  <div className="flex items-baseline justify-between mt-2">
                    <span className="font-extrabold text-slate-900">
                      {order.quantity}주 @ {order.price.toLocaleString()}원
                    </span>
                    <span className="text-xs font-bold text-slate-600">총 {order.totalAmount.toLocaleString()}원</span>
                  </div>

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
