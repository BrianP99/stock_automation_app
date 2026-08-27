import React, { useEffect, useState } from 'react';
import { Position, StockAnalysisResponse } from '../types';
import { marketLabel, marketBadgeClass } from '../lib/market';
import { useCurrencyDisplay, formatStockPrice } from '../lib/currencyDisplay';
import { useChartModal } from '../lib/chartModal';
import { CompanyLogo } from './CompanyLogo';
import { LineChart, TrendingUp, TrendingDown, ShieldAlert } from 'lucide-react';

interface HoldingsPanelProps {
  positions: Position[];
  onSellPosition: (symbol: string) => Promise<void>;
  isSelling: string | null; // symbol currently being sold, for a per-card loading state
}

const POLL_INTERVAL_MS = 20000;

export const HoldingsPanel: React.FC<HoldingsPanelProps> = ({ positions, onSellPosition, isSelling }) => {
  const [analyses, setAnalyses] = useState<Record<string, StockAnalysisResponse | undefined>>({});
  const { mode } = useCurrencyDisplay();
  const { openChart } = useChartModal();

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
        const currentPriceNative = analysis?.nativePrice ?? position.avgBuyPriceNative;
        // 평가금액 — 증권사 앱들이 보유종목에서 가장 크게 보여주는 숫자 (현재가가 아니라 "이 종목 지금 총 얼마").
        const marketValue = currentPrice * position.quantity;
        const marketValueNative = currentPriceNative * position.quantity;
        const pnl = (currentPrice - position.avgBuyPriceKrw) * position.quantity;
        const pnlNative = (currentPriceNative - position.avgBuyPriceNative) * position.quantity;
        const pnlPercent = Number((((currentPrice - position.avgBuyPriceKrw) / position.avgBuyPriceKrw) * 100).toFixed(2));
        const isProfit = pnl >= 0;

        return (
          <div key={position.symbol} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 flex items-center justify-between gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => openChart({ symbol: position.symbol, name: position.name, avgBuyPrice: position.avgBuyPriceKrw })}
                className="flex items-start gap-3 text-left hover:opacity-80 transition-opacity"
                title="차트 보기"
              >
                <CompanyLogo symbol={position.symbol} name={position.name} size={36} className="mt-0.5" />
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
                    {position.quantity}주 보유 · 평단가 {formatStockPrice(position.avgBuyPriceNative, position.avgBuyPriceKrw, position.currency, mode)}
                  </p>
                </div>
              </button>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">평가금액</div>
                  <div className="text-xl font-black text-slate-900 leading-tight">
                    {formatStockPrice(marketValueNative, marketValue, position.currency, mode)}
                  </div>
                  <div className={`text-xs font-bold flex items-center gap-1 justify-end mt-0.5 ${isProfit ? 'text-red-600' : 'text-blue-600'}`}>
                    {isProfit ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    {isProfit ? '+' : ''}
                    {formatStockPrice(pnlNative, pnl, position.currency, mode)} ({isProfit ? '+' : ''}
                    {pnlPercent}%)
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    현재가 {formatStockPrice(currentPriceNative, currentPrice, position.currency, mode)}
                  </div>
                </div>

                <button
                  onClick={() => openChart({ symbol: position.symbol, name: position.name, avgBuyPrice: position.avgBuyPriceKrw })}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600"
                  title="차트 보기"
                >
                  <LineChart className="w-4 h-4" />
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
          </div>
        );
      })}
    </div>
  );
};
