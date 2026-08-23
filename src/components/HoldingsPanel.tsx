import React, { useEffect, useState } from 'react';
import { Position, StockAnalysisResponse } from '../types';
import { StockChart } from './StockChart';
import { marketLabel, marketBadgeClass } from '../lib/market';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, ShieldAlert } from 'lucide-react';

interface HoldingsPanelProps {
  positions: Position[];
  onSellPosition: (symbol: string) => Promise<void>;
  isSelling: string | null; // symbol currently being sold, for a per-card loading state
}

const POLL_INTERVAL_MS = 20000;

export const HoldingsPanel: React.FC<HoldingsPanelProps> = ({ positions, onSellPosition, isSelling }) => {
  const [analyses, setAnalyses] = useState<Record<string, StockAnalysisResponse | undefined>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchAll = () => {
      positions.forEach((p) => {
        fetch(`/api/stock/analysis?symbol=${encodeURIComponent(p.symbol)}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (!cancelled && data) setAnalyses((prev) => ({ ...prev, [p.symbol]: data }));
          })
          .catch(() => {});
      });
    };
    fetchAll();
    const interval = setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions.map((p) => p.symbol).join(',')]);

  if (positions.length === 0) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm text-center text-slate-500">
        <p className="font-semibold">현재 보유 중인 종목이 없습니다.</p>
        <p className="text-xs mt-1">AI가 시장을 스캔하여 매수 조건을 만족하는 종목을 찾는 중입니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {positions.map((position) => {
        const analysis = analyses[position.symbol];
        const currentPrice = analysis?.price ?? position.avgBuyPriceKrw;
        const pnl = (currentPrice - position.avgBuyPriceKrw) * position.quantity;
        const pnlPercent = Number((((currentPrice - position.avgBuyPriceKrw) / position.avgBuyPriceKrw) * 100).toFixed(2));
        const isProfit = pnl >= 0;
        const isExpanded = expanded === position.symbol;

        return (
          <div key={position.symbol} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${marketBadgeClass(position.market)}`}
                  >
                    {marketLabel(position.market)}
                    {position.exchange && ` (${position.exchange})`}
                  </span>
                  <h4 className="text-lg font-extrabold text-slate-900">{position.name}</h4>
                  <span className="text-xs text-slate-400 font-mono">{position.symbol}</span>
                  {position.sector && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                      {position.sector}
                    </span>
                  )}
                </div>
                {position.description && <p className="text-xs text-slate-500 mt-1">{position.description}</p>}
                <p className="text-xs text-slate-500 mt-0.5">
                  {position.quantity}주 보유 · 평단가 {Math.round(position.avgBuyPriceKrw).toLocaleString('ko-KR')}원
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-lg font-black text-slate-900">{Math.round(currentPrice).toLocaleString('ko-KR')}원</div>
                  <div className={`text-xs font-bold flex items-center gap-1 justify-end ${isProfit ? 'text-red-600' : 'text-blue-600'}`}>
                    {isProfit ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    {isProfit ? '+' : ''}
                    {Math.round(pnl).toLocaleString('ko-KR')}원 ({isProfit ? '+' : ''}
                    {pnlPercent}%)
                  </div>
                </div>

                <button
                  onClick={() => setExpanded(isExpanded ? null : position.symbol)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600"
                  title="차트 보기"
                >
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                <button
                  onClick={() => onSellPosition(position.symbol)}
                  disabled={isSelling === position.symbol}
                  className="px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold border border-red-200 flex items-center gap-1.5 disabled:opacity-60"
                  title="이 종목만 지금 긴급 매도"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  {isSelling === position.symbol ? '매도 중...' : '지금 매도'}
                </button>
              </div>
            </div>

            {isExpanded && analysis && (
              <div className="border-t border-slate-100 p-4">
                <StockChart data={analysis.history} avgBuyPrice={position.avgBuyPriceKrw} heightClassName="h-56" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
