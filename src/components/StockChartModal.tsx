import React, { useEffect, useRef, useState } from 'react';
import { X, Search, ArrowLeft } from 'lucide-react';
import { StockChart } from './StockChart';
import { CompanyLogo } from './CompanyLogo';
import { ChartPoint } from '../types';
import type { HoldingSummary } from '../lib/chartModal';

type Period = 'day' | 'week' | 'month' | 'year';
const PERIODS: Period[] = ['day', 'week', 'month', 'year'];
const PERIOD_LABEL: Record<Period, string> = { day: '일', week: '주', month: '월', year: '년' };
const PERIOD_STORAGE_KEY = 'chartPeriod';

// Shown as quick-pick chips before the user types anything — a mix of
// well-known names and sector/keyword searches, so it's obvious search isn't
// limited to exact tickers or English names.
const SUGGESTED_SEARCHES = ['삼성전자', 'NVIDIA', '테슬라', '애플', '반도체', 'AI', '2차전지', '바이오'];

interface UniverseSymbol {
  symbol: string;
  name: string;
  market: 'KRX' | 'US';
  currency: 'KRW' | 'USD';
  sector: string;
  description: string;
}

export interface StockChartModalProps {
  /** Omit both to open in picker mode (used by the floating chart button) — shows holdings + search. */
  symbol?: string;
  name?: string;
  avgBuyPrice?: number;
  /** Only relevant in picker mode — the user's currently held positions, shown first for quick access. */
  holdings?: HoldingSummary[];
  onClose: () => void;
}

/** Full-size chart popup with 일/주/월/년 period tabs — opened from any stock row, or as a holdings+search picker. */
export const StockChartModal: React.FC<StockChartModalProps> = ({ symbol, name, avgBuyPrice, holdings = [], onClose }) => {
  const [active, setActive] = useState<{ symbol: string; name: string; avgBuyPrice?: number } | null>(
    symbol && name ? { symbol, name, avgBuyPrice } : null
  );
  const [period, setPeriod] = useState<Period>(() => {
    if (typeof window === 'undefined') return 'day';
    const saved = window.localStorage.getItem(PERIOD_STORAGE_KEY);
    return (PERIODS as string[]).includes(saved || '') ? (saved as Period) : 'day';
  });
  const [history, setHistory] = useState<ChartPoint[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UniverseSymbol[]>([]);
  const searchAbortRef = useRef<AbortController | null>(null);

  // Sector + one-line description for the header — Position/TradeOrder/etc.
  // don't all carry this, so the modal looks it up itself via the same
  // universe-search endpoint (an exact-symbol query always ranks that stock
  // first), rather than threading sector/description through every caller.
  const [activeMeta, setActiveMeta] = useState<{ sector: string; description: string } | null>(null);
  useEffect(() => {
    setActiveMeta(null);
    if (!active) return;
    let cancelled = false;
    fetch(`/api/universe/search?q=${encodeURIComponent(active.symbol)}`)
      .then((res) => (res.ok ? res.json() : { results: [] }))
      .then((data: { results?: UniverseSymbol[] }) => {
        if (cancelled) return;
        const match = (data.results || []).find((r) => r.symbol === active.symbol);
        if (match) setActiveMeta({ sector: match.sector, description: match.description });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [active?.symbol]);

  const isPickerEntry = !symbol; // opened via the floating button, not a specific row

  const changePeriod = (p: Period) => {
    setPeriod(p);
    try {
      window.localStorage.setItem(PERIOD_STORAGE_KEY, p);
    } catch {
      // localStorage unavailable — not worth failing over for a display preference.
    }
  };

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetch(`/api/stock/chart?symbol=${encodeURIComponent(active.symbol)}&period=${period}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('실패'))))
      .then((data) => {
        if (!cancelled) setHistory(data.history);
      })
      .catch(() => {
        if (!cancelled) setError('차트 데이터를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, period]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Fires on every keystroke (no artificial delay) — what actually made this
  // feel very slow before was stale in-flight responses racing and clobbering
  // fresher ones, not the per-keystroke request itself. Canceling the
  // previous request before starting a new one fixes that without needing a
  // debounce delay.
  const handleSearch = (q: string) => {
    setQuery(q);
    searchAbortRef.current?.abort();
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;
    fetch(`/api/universe/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { results: [] }))
      .then((data) => setResults(data.results || []))
      .catch((err) => {
        if (err?.name !== 'AbortError') setResults([]);
      });
  };

  useEffect(
    () => () => {
      searchAbortRef.current?.abort();
    },
    []
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-3xl">
          <div className="flex items-center gap-2">
            {isPickerEntry && active && (
              <button
                onClick={() => setActive(null)}
                className="p-2 -ml-1 rounded-xl hover:bg-slate-100 text-slate-500"
                title="목록으로 돌아가기"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            {active && <CompanyLogo symbol={active.symbol} name={active.name} size={32} className="mt-0.5" />}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-extrabold text-slate-900">{active ? active.name : '내 종목 · 실시간 차트'}</h3>
                {active && <span className="text-xs text-slate-400 font-mono">{active.symbol}</span>}
                {activeMeta?.sector && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    {activeMeta.sector}
                  </span>
                )}
              </div>
              {activeMeta?.description && <p className="text-xs text-slate-500 mt-0.5">{activeMeta.description}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600" title="닫기">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          {!active ? (
            <div>
              {holdings.length > 0 && (
                <div className="mb-5">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">보유 종목</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {holdings.map((h) => (
                      <button
                        key={h.symbol}
                        onClick={() => setActive({ symbol: h.symbol, name: h.name, avgBuyPrice: h.avgBuyPrice })}
                        className="flex items-center gap-2 p-3 rounded-xl hover:bg-slate-50 border border-slate-200 text-left"
                      >
                        <CompanyLogo symbol={h.symbol} name={h.name} size={28} />
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-slate-900 truncate">{h.name}</div>
                          <div className="text-xs text-slate-400 font-mono">{h.symbol}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">다른 종목 검색</h4>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  autoFocus={holdings.length === 0}
                  value={query}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="종목명 또는 코드 검색"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              {results.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto">
                  {results.map((r) => (
                    <button
                      key={r.symbol}
                      onClick={() => setActive({ symbol: r.symbol, name: r.name })}
                      className="text-left p-3 rounded-xl hover:bg-slate-50 border border-slate-100 flex items-center gap-2"
                    >
                      <CompanyLogo symbol={r.symbol} name={r.name} size={24} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-slate-500 shrink-0">{r.market === 'KRX' ? '한국' : '미국'}</span>
                          <span className="font-extrabold text-slate-900 text-sm truncate">{r.name}</span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono">{r.symbol}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : query ? (
                <p className="text-sm text-slate-500 text-center py-8">검색 결과가 없습니다.</p>
              ) : (
                <div className="py-4">
                  <p className="text-xs text-slate-400 mb-2.5">
                    종목명(한글·영문)이나 코드는 물론, "반도체" "AI"처럼 업종·키워드로도 찾을 수 있어요.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {SUGGESTED_SEARCHES.map((term) => (
                      <button
                        key={term}
                        onClick={() => handleSearch(term)}
                        className="px-3 py-1.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200 hover:border-emerald-200 transition-colors"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-4">AI가 감시하는 약 200개 대장주/유망주 범위 내에서 검색됩니다.</p>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1 mb-4 bg-slate-100 rounded-xl p-1 w-fit">
                {PERIODS.map((p) => (
                  <button
                    key={p}
                    onClick={() => changePeriod(p)}
                    className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                      period === p ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {PERIOD_LABEL[p]}봉
                  </button>
                ))}
              </div>

              {isLoading ? (
                <div className="h-96 flex items-center justify-center">
                  <div className="inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : error ? (
                <p className="text-sm text-red-500 text-center py-16">{error}</p>
              ) : history && history.length > 0 ? (
                <StockChart data={history} avgBuyPrice={active.avgBuyPrice} heightClassName="h-96" />
              ) : (
                <p className="text-sm text-slate-500 text-center py-16">표시할 데이터가 없습니다.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
