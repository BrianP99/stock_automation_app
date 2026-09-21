import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { StockAnalysisResponse } from '../types';

interface TrendStatusPanelProps {
  /** Ticker the 200-day signal is measured on (SPY — it has the long history). */
  signalSymbol: string;
  /** Ticker actually held (a KRX-listed tracker). Priced separately: the two move differently. */
  tradeSymbol: string;
  name: string;
  isHolding: boolean;
  /** Capital the session started with, and the entry price — together they give the "what if I'd just held it" line. */
  initialCapital: number;
  firstEntryPriceKrw: number | null;
  currentValuation: number;
}

// How close to the trend line counts as "about to flip". The daily log uses the
// same 2% so the dashboard and the log never disagree about what's imminent.
const IMMINENT_PERCENT = 2;
const POLL_INTERVAL_MS = 60_000; // the decision only moves once a day; a minute is plenty

/**
 * The whole index-trend strategy in one panel: which side of the 200-day line
 * the index closed on, how far, and the price that would flip it. Without this
 * the only trace of the strategy on screen is one line of watchlist text.
 */
export const TrendStatusPanel: React.FC<TrendStatusPanelProps> = ({
  signalSymbol,
  tradeSymbol,
  name,
  isHolding,
  initialCapital,
  firstEntryPriceKrw,
  currentValuation,
}) => {
  const [analysis, setAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [instrument, setInstrument] = useState<StockAnalysisResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      // Two tickers: the signal decides, the instrument is what we own. Pricing
      // the holding off the signal's price would quietly report a wrong return.
      Promise.all([
        fetch(`/api/stock/analysis?symbol=${encodeURIComponent(signalSymbol)}`).then((r) =>
          r.ok ? r.json() : Promise.reject(new Error('실패'))
        ),
        fetch(`/api/stock/analysis?symbol=${encodeURIComponent(tradeSymbol)}`).then((r) => (r.ok ? r.json() : null)),
      ])
        .then(([signal, traded]) => {
          if (cancelled) return;
          setAnalysis(signal);
          setInstrument(traded);
          setFailed(false);
        })
        .catch(() => !cancelled && setFailed(true));
    };
    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [signalSymbol, tradeSymbol]);

  const close = analysis?.trendCloseKrw ?? null;
  const line = analysis?.trendSma200Krw ?? null;
  const gapPercent = close != null && line ? ((close - line) / line) * 100 : null;
  const above = gapPercent != null && gapPercent > 0;
  const imminent = gapPercent != null && Math.abs(gapPercent) < IMMINENT_PERCENT;

  // The bar maps -10%..+10% onto its width; anything beyond just pins to an end.
  const markerPercent = gapPercent == null ? 50 : Math.min(100, Math.max(0, ((gapPercent + 10) / 20) * 100));

  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h4 className="text-base font-bold text-slate-900">추세 상태</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            S&amp;P 500 지수가 200일 추세선 위면 {name}을(를) 보유, 아래면 전량 국채로 대피합니다
          </p>
        </div>
        {gapPercent != null && (
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-extrabold border ${
              above ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-300'
            }`}
          >
            {above ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {above ? '보유 구간' : '현금 대기 구간'}
          </span>
        )}
      </div>

      {failed && !analysis ? (
        <p className="text-sm text-slate-500 py-6 text-center">시세를 불러오지 못했습니다. 잠시 후 다시 시도합니다.</p>
      ) : gapPercent == null ? (
        <p className="text-sm text-slate-500 py-6 text-center">추세선 계산에 필요한 데이터를 준비하는 중입니다.</p>
      ) : (
        <>
          <div className="flex items-end gap-2 mb-1">
            <span className={`text-4xl font-black ${above ? 'text-emerald-600' : 'text-blue-600'}`}>
              {gapPercent >= 0 ? '+' : ''}
              {gapPercent.toFixed(2)}%
            </span>
            <span className="text-sm font-bold text-slate-500 mb-1.5">200일선 대비</span>
          </div>

          {/* Distance bar: the centre line is the decision point. */}
          <div className="relative h-3 rounded-full bg-gradient-to-r from-blue-200 via-slate-200 to-emerald-200 mt-4 mb-2">
            <div className="absolute left-1/2 top-[-4px] bottom-[-4px] w-0.5 bg-slate-700 rounded-full" />
            <div
              className={`absolute top-[-5px] w-5 h-5 rounded-full border-[3px] border-white shadow-md ${
                above ? 'bg-emerald-600' : 'bg-blue-600'
              }`}
              style={{ left: `calc(${markerPercent}% - 10px)` }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-4">
            <span>-10%</span>
            <span className="text-slate-600">추세선 (전환점)</span>
            <span>+10%</span>
          </div>

          {imminent && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 font-semibold leading-relaxed">
                추세선에 가까워졌습니다. 곧 {above ? '매도 후 국채로 대피' : '재매수'}가 일어날 수 있습니다.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div className="text-[11px] font-bold text-slate-500 mb-1">전일 확정 종가</div>
              <div className="font-black text-slate-900">{Math.round(close!).toLocaleString('ko-KR')}원</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div className="text-[11px] font-bold text-slate-500 mb-1">200일 추세선</div>
              <div className="font-black text-slate-900">{Math.round(line!).toLocaleString('ko-KR')}원</div>
            </div>
          </div>

          <div
            className={`mt-3 rounded-xl p-3 border ${
              above ? 'bg-blue-50 border-blue-200' : 'bg-emerald-50 border-emerald-200'
            }`}
          >
            <div className="text-[11px] font-bold text-slate-500 mb-1">다음 행동</div>
            <p className="text-sm font-bold text-slate-800 leading-relaxed">
              {above ? (
                <>
                  종가가 <span className="text-blue-700">{Math.round(line!).toLocaleString('ko-KR')}원</span> 아래로
                  마감하면 {isHolding ? '전량 매도하고 국채로 대피' : '계속 대기'}합니다.
                </>
              ) : (
                <>
                  종가가 <span className="text-emerald-700">{Math.round(line!).toLocaleString('ko-KR')}원</span> 위로
                  올라오면 다시 전량 매수합니다.
                </>
              )}
            </p>
          </div>

          {/* The point of this strategy is not to beat the index but to fall
              less when it breaks, so the honest yardstick is "what if I had
              just held it". Lagging here during a rally is expected. */}
          {firstEntryPriceKrw && instrument?.price ? (
            (() => {
              const heldValue = initialCapital * (instrument.price / firstEntryPriceKrw);
              const strategyPct = (currentValuation / initialCapital - 1) * 100;
              const heldPct = (heldValue / initialCapital - 1) * 100;
              const diff = strategyPct - heldPct;
              return (
                <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="text-[11px] font-bold text-slate-500 mb-2">그냥 계속 들고 있었다면</div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-600">이 전략</span>
                    <span className="font-black text-slate-900">
                      {strategyPct >= 0 ? '+' : ''}
                      {strategyPct.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="font-semibold text-slate-600">계속 보유</span>
                    <span className="font-black text-slate-900">
                      {heldPct >= 0 ? '+' : ''}
                      {heldPct.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-slate-200">
                    <span className="font-bold text-slate-700">차이</span>
                    <span className={`font-black ${diff >= 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                      {diff >= 0 ? '+' : ''}
                      {diff.toFixed(2)}%p
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                    상승장에서는 이 전략이 뒤처지는 게 정상입니다. 하락장에서 덜 잃는 것이 목적이에요.
                  </p>
                </div>
              );
            })()
          ) : null}

          <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
            장중 가격이 아니라 <span className="font-bold">전일 확정 종가</span>로만 판단합니다. 하루 사이에 오르내려도
            신호가 뒤집히지 않아요.
          </p>
        </>
      )}
    </div>
  );
};
