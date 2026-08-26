import React, { useEffect, useState } from 'react';
import { TradeOrder, StockAnalysisResponse } from '../types';
import { Wallet, TrendingUp, TrendingDown } from 'lucide-react';
import { useCurrencyDisplay, formatStockPrice } from '../lib/currencyDisplay';
import { useChartModal } from '../lib/chartModal';
import { CompanyLogo } from './CompanyLogo';

interface RealizedPnlPanelProps {
  tradeOrders: TradeOrder[];
}

const POLL_INTERVAL_MS = 20000;

/** "실현손익" — closed (SELL) trades only, each with exactly how much was made/lost and on what. */
export const RealizedPnlPanel: React.FC<RealizedPnlPanelProps> = ({ tradeOrders }) => {
  const { mode } = useCurrencyDisplay();
  const { openChart } = useChartModal();
  const closedTrades = tradeOrders.filter((o) => o.type === 'SELL');
  const totalRealized = closedTrades.reduce((sum, o) => sum + (o.profitAmount ?? 0), 0);
  const winCount = closedTrades.filter((o) => (o.profitAmount ?? 0) >= 0).length;
  const isTotalProfit = totalRealized >= 0;

  // "매도 후 이 종목이 어떻게 됐는지" — 계속 들고 있었다면 더 벌었을지 손해를 피했을지 보여주는 재미용 회고 지표.
  const [livePrices, setLivePrices] = useState<Record<string, StockAnalysisResponse | undefined>>({});
  const closedSymbols = Array.from(new Set(closedTrades.map((o) => o.symbol))).join(',');

  useEffect(() => {
    if (!closedSymbols) return;
    let cancelled = false;
    const fetchAll = () => {
      closedSymbols.split(',').forEach((symbol) => {
        fetch(`/api/stock/analysis?symbol=${encodeURIComponent(symbol)}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (!cancelled && data) setLivePrices((prev) => ({ ...prev, [symbol]: data }));
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
  }, [closedSymbols]);

  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3 flex-wrap gap-2">
        <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-emerald-600" />
          <span>실현손익 ({closedTrades.length}건 청산)</span>
        </h4>
        {closedTrades.length > 0 && (
          <div className="flex items-center gap-2">
            <span className={`text-sm font-black ${isTotalProfit ? 'text-red-600' : 'text-blue-600'}`}>
              {isTotalProfit ? '+' : ''}
              {totalRealized.toLocaleString('ko-KR')}원
            </span>
            <span className="text-xs font-bold text-slate-500">
              ({winCount}승 {closedTrades.length - winCount}패)
            </span>
          </div>
        )}
      </div>

      {closedTrades.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-8">아직 실현된 손익이 없습니다 (매도 체결 시 여기에 표시됩니다).</p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-xs font-bold text-slate-500 border-b border-slate-100">
                <th className="text-left py-2 px-1">종목</th>
                <th className="text-right py-2 px-1">매도일시</th>
                <th className="text-right py-2 px-1">수량 · 매도가</th>
                <th className="text-right py-2 px-1">매도금액</th>
                <th className="text-right py-2 px-1">손익</th>
              </tr>
            </thead>
            <tbody>
              {closedTrades.map((order) => {
                const isProfit = (order.profitAmount ?? 0) >= 0;
                const live = livePrices[order.symbol];
                const sincePercent = live ? Number((((live.price - order.price) / order.price) * 100).toFixed(2)) : null;
                const sinceAmountKrw = live ? Math.round((live.price - order.price) * order.quantity) : 0;
                const sinceAmountNative = live ? Number(((live.nativePrice - order.priceNative) * order.quantity).toFixed(2)) : 0;
                const wentUpSinceSold = sincePercent != null && sincePercent > 0;

                return (
                  <tr
                    key={order.id}
                    onClick={() => openChart({ symbol: order.symbol, name: order.stockName })}
                    className="border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50"
                    title="차트 보기"
                  >
                    <td className="py-2.5 px-1">
                      <div className="flex items-start gap-2">
                        <CompanyLogo symbol={order.symbol} name={order.stockName} size={28} className="mt-0.5" />
                        <div>
                          <div className="font-extrabold text-slate-900">{order.stockName}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{order.symbol}</div>
                        </div>
                      </div>
                      {sincePercent != null && Math.abs(sincePercent) >= 0.1 && (
                        <div className={`text-[11px] font-bold mt-1 ${wentUpSinceSold ? 'text-red-600' : 'text-blue-600'}`}>
                          {wentUpSinceSold
                            ? `매도 후 +${sincePercent}% 더 올랐어요 (놓친 수익 약 ${formatStockPrice(sinceAmountNative, sinceAmountKrw, order.currency, mode)})`
                            : `매도 후 ${sincePercent}% 하락 · 잘 파셨어요! (손실 약 ${formatStockPrice(Math.abs(sinceAmountNative), Math.abs(sinceAmountKrw), order.currency, mode)} 피함)`}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-1 text-right text-xs text-slate-500 font-mono whitespace-nowrap">
                      {new Date(order.timestamp).toLocaleString('ko-KR')}
                    </td>
                    <td className="py-2.5 px-1 text-right text-xs text-slate-600 whitespace-nowrap">
                      {order.quantity}주 · {formatStockPrice(order.priceNative, order.price, order.currency, mode)}
                    </td>
                    <td className="py-2.5 px-1 text-right font-bold text-slate-800 whitespace-nowrap">
                      {formatStockPrice(order.totalAmountNative, order.totalAmount, order.currency, mode)}
                    </td>
                    <td className="py-2.5 px-1 text-right whitespace-nowrap">
                      <div className={`font-black flex items-center justify-end gap-1 ${isProfit ? 'text-red-600' : 'text-blue-600'}`}>
                        {isProfit ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                        {isProfit ? '+' : ''}
                        {formatStockPrice(order.profitAmountNative ?? 0, order.profitAmount ?? 0, order.currency, mode)}
                      </div>
                      <div className={`text-xs font-bold ${isProfit ? 'text-red-500' : 'text-blue-500'}`}>
                        ({isProfit ? '+' : ''}
                        {order.profitPercent ?? 0}%)
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
