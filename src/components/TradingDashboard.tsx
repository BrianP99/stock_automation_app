import React, { useState, useEffect, useRef } from 'react';
import { TradingConfig, TradeOrder, TradingSession } from '../types';
import confetti from 'canvas-confetti';
import {
  TrendingUp,
  TrendingDown,
  Pause,
  Play,
  ShieldAlert,
  Bot,
  Clock,
  AlertTriangle,
  Volume2,
  WifiOff,
  ServerCog,
  LineChart,
} from 'lucide-react';
import { HoldingsPanel } from './HoldingsPanel';
import { WatchlistPanel } from './WatchlistPanel';
import { RealizedPnlPanel } from './RealizedPnlPanel';
import { useCurrencyDisplay, formatStockPrice } from '../lib/currencyDisplay';
import { useChartModal } from '../lib/chartModal';
import { CompanyLogo } from './CompanyLogo';

interface TradingDashboardProps {
  config: TradingConfig;
  fontSizeClass: string;
  onResetSetup: () => void;
  onOpenDailyReport: () => void;
  onOpenSmsPreview: () => void;
}

// 5s (was 20s) — feels live like other stock apps; this just re-reads the
// session blob (no external API calls), so it's cheap to poll often.
const POLL_INTERVAL_MS = 5000;

async function fetchSessionState(): Promise<{ active: boolean; session?: TradingSession }> {
  const res = await fetch('/api/session/state');
  if (!res.ok) throw new Error('세션 상태를 불러오지 못했습니다.');
  return res.json();
}

async function controlSession(action: string, extra?: Record<string, unknown>): Promise<TradingSession> {
  const res = await fetch('/api/session/control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || '요청을 처리하지 못했습니다.');
  return body.session ?? body;
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
  const { mode: currencyMode } = useCurrencyDisplay();
  const { openChart, openPicker } = useChartModal();
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isControlling, setIsControlling] = useState<boolean>(false);
  const [sellingSymbol, setSellingSymbol] = useState<string | null>(null);

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
  }, []);

  // Cosmetic-only: celebrate once per session on a solid overall gain — there's
  // no single config-defined "target profit" anymore since exits are now
  // per-position and ATR-based rather than one flat percentage.
  const CELEBRATION_PNL_PERCENT = 5;
  useEffect(() => {
    if (!session) return;
    if (session.portfolio.totalPnLPercent >= CELEBRATION_PNL_PERCENT && !hasCelebrated.current) {
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

  const handleSellPosition = async (symbol: string) => {
    if (!window.confirm('이 종목을 지금 긴급 매도할까요?')) return;
    setSellingSymbol(symbol);
    try {
      const updated = await controlSession('sell-position', { symbol });
      setSession(updated);
    } catch (err: any) {
      alert(err.message || '매도에 실패했습니다.');
    } finally {
      setSellingSymbol(null);
    }
  };

  const handlePanicExit = async () => {
    if (!session) return;
    if (
      !window.confirm('정말 보유 종목을 전량 매도하고 자동매매를 종료하시겠습니까? 원금과 수익금이 모두 예수금으로 안전 환원됩니다.')
    ) {
      return;
    }
    setIsControlling(true);
    try {
      const updated = await controlSession('exit');
      if (!updated.isActive) {
        alert(`전량 매도 완료!\n최종 환원 금액: ${Math.round(updated.portfolio.cashBalance).toLocaleString('ko-KR')}원`);
        onResetSetup();
      } else {
        setSession(updated);
        alert('일부 종목은 시세 조회 실패로 매도되지 못했습니다. 잠시 후 다시 시도해주세요.');
      }
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
        <p className="text-slate-600 font-semibold">AI 자동매매 세션을 불러오고 있습니다...</p>
      </div>
    );
  }

  if (initError || !session) {
    return (
      <div className={`max-w-2xl mx-auto px-4 py-24 text-center space-y-5 ${fontSizeClass}`}>
        <WifiOff className="w-12 h-12 text-red-500 mx-auto" />
        <h3 className="text-xl font-bold text-slate-900">자동매매 세션 연결에 실패했습니다</h3>
        <p className="text-slate-500 text-sm">{initError}</p>
        <button onClick={onResetSetup} className="px-5 py-3 rounded-2xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold">
          처음으로
        </button>
      </div>
    );
  }

  const { portfolio, tradeOrders, watchlist, latestAiMessage, isPaused, lastTickAt, lastError } = session;
  const isProfit = portfolio.totalPnL >= 0;
  const heldSymbols = new Set(portfolio.positions.map((p) => p.symbol));

  return (
    <div className={`max-w-7xl mx-auto px-4 py-6 space-y-6 ${fontSizeClass}`}>
      <button
        onClick={() =>
          openPicker(
            portfolio.positions.map((p) => ({ symbol: p.symbol, name: p.name, avgBuyPrice: p.avgBuyPriceKrw }))
          )
        }
        className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-xl shadow-emerald-500/30 flex items-center justify-center transition-transform hover:scale-105"
        title="현재 주가 차트 보기"
      >
        <LineChart className="w-6 h-6" />
      </button>

      {/* Top Banner */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Bot className="w-7 h-7 animate-bounce" />
          </div>
          <div>
            <div className="flex items-center space-x-2 flex-wrap">
              <span className={`w-2.5 h-2.5 rounded-full ${isPaused ? 'bg-slate-500' : 'bg-emerald-400 animate-ping'}`} />
              <h3 className="text-xl font-black text-white">AI 자동매매 가동 중</h3>
              <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full font-bold border border-emerald-500/30">
                변동성 기반 자동 리스크 관리
              </span>
              <span className="text-xs bg-slate-700/60 text-slate-200 px-2.5 py-0.5 rounded-full font-bold border border-slate-600">
                보유 {portfolio.positions.length}/{config.maxConcurrentPositions}종목
              </span>
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

      <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-2xl p-4 flex items-center gap-3 text-xs sm:text-sm font-semibold">
        <ServerCog className="w-5 h-5 shrink-0 text-indigo-500" />
        <span>
          AI가 서버에서 5분마다 국내외 약 200개 대장주/유망주를 스캔하며 종목을 직접 선정해 매매합니다. 이 화면을 닫으셔도 계속
          진행됩니다.
          {lastTickAt && ` (마지막 확인: ${new Date(lastTickAt).toLocaleString('ko-KR')})`}
        </span>
      </div>

      {(connectionError || lastError) && (
        <div className="bg-amber-50 border border-amber-300 text-amber-800 rounded-2xl p-4 flex items-center gap-3 text-sm font-semibold">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{connectionError || `최근 자동 확인 중 오류가 발생했습니다: ${lastError}`}</span>
        </div>
      )}

      {/* METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">총 평가 금액 (원금 + 수익)</div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">
            {Math.round(portfolio.currentValuation).toLocaleString('ko-KR')}
            <span className="text-base font-bold text-slate-500 ml-1">원</span>
          </div>
          <div className="mt-3 text-xs font-semibold text-slate-500 flex items-center justify-between">
            <span>설정 투자금:</span>
            <span className="font-bold text-slate-800">{config.investmentAmount.toLocaleString('ko-KR')}원</span>
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
            {Math.round(portfolio.totalPnL).toLocaleString('ko-KR')}
            <span className="text-base font-bold ml-1">원</span>
          </div>
          <div className="mt-3 flex items-center space-x-2 flex-wrap gap-y-1">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold ${isProfit ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
              수익률 {isProfit ? '+' : ''}
              {portfolio.totalPnLPercent}%
            </span>
            <span className="text-xs text-slate-500">청산: 고점 대비 하락폭(트레일링)</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">예수금 (대기 현금)</div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">
            {Math.round(portfolio.cashBalance + (portfolio.cashSweep?.currentValueKrw ?? 0)).toLocaleString('ko-KR')}
            <span className="text-base font-bold text-slate-500 ml-1">원</span>
          </div>
          {portfolio.cashSweep && (
            <div className="mt-3 text-xs text-slate-600 font-semibold">
              이 중 <span className="font-bold text-slate-800">{Math.round(portfolio.cashSweep.currentValueKrw).toLocaleString('ko-KR')}원</span>은 단기국채(SGOV)에 파킹되어 배당을 받는 중
            </div>
          )}
          <div className="mt-3 text-xs text-slate-600 flex items-center justify-between font-semibold">
            <span>오늘 매매: {portfolio.todayTradesCount}회</span>
            <span>한도: {config.maxTradesPerDay}회</span>
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
            <span>손절: 종목별 변동성(ATR) 기반</span>
            <span className="text-emerald-400 font-bold">안전 작동 중</span>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h4 className="text-lg font-extrabold text-slate-900 mb-3">보유 종목</h4>
            <HoldingsPanel positions={portfolio.positions} onSellPosition={handleSellPosition} isSelling={sellingSymbol} />
          </div>

          <RealizedPnlPanel tradeOrders={tradeOrders} />

          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-600" />
                <span>AI 체결 내역 ({tradeOrders.length}건)</span>
              </h4>
              <div className="flex items-center gap-2">
                <button
                  onClick={onOpenDailyReport}
                  className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 rounded-xl font-bold border border-amber-500/30 transition-colors text-xs"
                >
                  오늘의 AI 보고서
                </button>
                <button
                  onClick={onOpenSmsPreview}
                  className="px-3 py-1.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-700 rounded-xl font-bold border border-teal-500/30 transition-colors text-xs"
                >
                  알림 로그
                </button>
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto space-y-3 pr-1">
              {tradeOrders.length === 0 && <p className="text-sm text-slate-500 text-center py-8">아직 체결된 매매가 없습니다.</p>}
              {tradeOrders.map((order: TradeOrder) => {
                const isBuy = order.type === 'BUY';
                return (
                  <div
                    key={order.id}
                    onClick={() => openChart({ symbol: order.symbol, name: order.stockName })}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer hover:brightness-95 ${
                      isBuy ? 'bg-red-50/60 border-red-200 text-slate-900' : 'bg-blue-50/60 border-blue-200 text-slate-900'
                    }`}
                    title="차트 보기"
                  >
                    <div className="flex items-center justify-between text-xs font-bold mb-1">
                      <span className={`px-2 py-0.5 rounded-full font-black ${isBuy ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}>
                        {isBuy ? 'AI 매수' : 'AI 매도'}
                      </span>
                      <span className="text-slate-400 font-mono">{new Date(order.timestamp).toLocaleString('ko-KR')}</span>
                    </div>
                    <div className="flex items-baseline justify-between mt-2 gap-2">
                      <span className="font-extrabold text-slate-900 flex items-center gap-2 min-w-0">
                        <CompanyLogo symbol={order.symbol} name={order.stockName} size={24} />
                        <span className="truncate">
                          {order.stockName} {order.quantity}주 @ {formatStockPrice(order.priceNative, order.price, order.currency, currencyMode)}
                        </span>
                      </span>
                      <span className="text-xs font-bold text-slate-600 shrink-0">
                        총 {formatStockPrice(order.totalAmountNative, order.totalAmount, order.currency, currencyMode)}
                      </span>
                    </div>
                    {!isBuy && order.profitAmount != null && (
                      <div
                        className={`text-xs font-black mt-1 ${order.profitAmount >= 0 ? 'text-red-600' : 'text-blue-700'}`}
                      >
                        실현손익 {order.profitAmount >= 0 ? '+' : ''}
                        {formatStockPrice(order.profitAmountNative ?? 0, order.profitAmount ?? 0, order.currency, currencyMode)} (
                        {order.profitAmount >= 0 ? '+' : ''}
                        {order.profitPercent ?? 0}%)
                      </div>
                    )}
                    <p className="text-xs text-slate-600 mt-2 bg-white/80 p-2 rounded-xl border border-slate-200/60 font-medium">
                      💡 사유: {order.reason}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <WatchlistPanel watchlist={watchlist} heldSymbols={heldSymbols} />
        </div>
      </div>
    </div>
  );
};
