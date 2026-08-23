import React from 'react';
import { WatchlistCandidate } from '../types';
import { marketLabel, marketBadgeClass } from '../lib/market';
import { Eye } from 'lucide-react';

interface WatchlistPanelProps {
  watchlist: WatchlistCandidate[];
  heldSymbols: Set<string>;
}

/** Informational only — shows what the scanner currently likes. No buy button here; entries are AI-only. */
export const WatchlistPanel: React.FC<WatchlistPanelProps> = ({ watchlist, heldSymbols }) => {
  const unheld = watchlist.filter((w) => !heldSymbols.has(w.symbol)).slice(0, 12);

  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
      <div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-3">
        <Eye className="w-4 h-4 text-emerald-600" />
        <h4 className="text-base font-bold text-slate-900">AI 관심 종목</h4>
        <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-bold ml-auto">
          {watchlist.length}개 감지
        </span>
      </div>

      {unheld.length === 0 ? (
        <p className="text-sm text-slate-500 py-6 text-center">현재 매수 신호를 보이는 종목이 없습니다. 계속 스캔 중입니다.</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {unheld.map((c) => (
            <div key={c.symbol} className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${marketBadgeClass(c.market)}`}
                  >
                    {marketLabel(c.market)}
                    {c.exchange && ` (${c.exchange})`}
                  </span>
                  <span className="font-bold text-slate-900 text-sm truncate">{c.name}</span>
                  {c.sector && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600 shrink-0">
                      {c.sector}
                    </span>
                  )}
                </div>
                {c.description && <p className="text-[11px] text-slate-500 mt-0.5 truncate">{c.description}</p>}
                <p className="text-[11px] text-slate-500 mt-0.5 truncate">{c.reason}</p>
              </div>
              <span className="text-xs font-black text-emerald-600 shrink-0">{c.confidence}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
