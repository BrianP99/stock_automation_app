import React, { useState } from 'react';
import { StockAnalysisResponse } from '../types';
import { StockChart } from './StockChart';
import { marketFlag } from '../lib/market';
import { Search, X } from 'lucide-react';

interface UniverseSymbol {
  symbol: string;
  name: string;
  market: 'KRX' | 'US';
  currency: 'KRW' | 'USD';
  sector: string;
  description: string;
}

/** Pure research/view feature — no buy/sell button. Trading stays 100% AI-decided. */
export const StockSearchPanel: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UniverseSymbol[]>([]);
  const [selected, setSelected] = useState<UniverseSymbol | null>(null);
  const [analysis, setAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    fetch(`/api/universe/search?q=${encodeURIComponent(q)}`)
      .then((res) => (res.ok ? res.json() : { results: [] }))
      .then((data) => setResults(data.results || []))
      .catch(() => setResults([]));
  };

  const handleSelect = async (s: UniverseSymbol) => {
    setSelected(s);
    setAnalysis(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/stock/analysis?symbol=${encodeURIComponent(s.symbol)}`);
      if (res.ok) setAnalysis(await res.json());
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
        <h4 className="text-base font-bold text-slate-900">종목 검색 (조회 전용)</h4>
        {selected && (
          <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {!selected ? (
        <>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="종목명 또는 코드 검색"
              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          {results.length > 0 && (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {results.map((r) => (
                <button
                  key={r.symbol}
                  onClick={() => handleSelect(r)}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm leading-none">{marketFlag(r.market)}</span>
                    <span className="font-semibold text-sm text-slate-800">{r.name}</span>
                    <span className="text-xs text-slate-400 font-mono">{r.symbol}</span>
                    {r.sector && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 shrink-0">
                        {r.sector}
                      </span>
                    )}
                  </div>
                  {r.description && <p className="text-[11px] text-slate-500 mt-0.5 truncate">{r.description}</p>}
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-3">* AI가 실제로 감시하는 약 200개 대장주/유망주 범위 내에서 검색됩니다.</p>
        </>
      ) : (
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm leading-none">{marketFlag(selected.market)}</span>
            <h5 className="font-bold text-slate-900">
              {selected.name} ({selected.symbol})
            </h5>
            {selected.sector && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">{selected.sector}</span>
            )}
          </div>
          {selected.description && <p className="text-xs text-slate-500 mb-2">{selected.description}</p>}
          {isLoading ? (
            <div className="py-12 text-center">
              <div className="inline-block w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : analysis ? (
            <>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-xl font-black text-slate-900">{analysis.price.toLocaleString()}원</span>
                <span className={`text-sm font-bold ${analysis.changePercent >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                  {analysis.changePercent >= 0 ? '+' : ''}
                  {analysis.changePercent}%
                </span>
              </div>
              <StockChart data={analysis.history} heightClassName="h-56" />
            </>
          ) : (
            <p className="text-sm text-slate-500 py-6 text-center">시세를 불러오지 못했습니다.</p>
          )}
        </div>
      )}
    </div>
  );
};
