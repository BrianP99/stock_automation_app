import React from 'react';
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
import { ChartPoint } from '../types';

interface StockChartProps {
  data: ChartPoint[];
  avgBuyPrice?: number;
  heightClassName?: string;
}

/**
 * Reusable price + SMA5/SMA20 + golden/dead-cross chart, extracted from the
 * original single-stock TradingDashboard so it can be reused per held
 * position and for the ad-hoc stock-search panel.
 */
export const StockChart: React.FC<StockChartProps> = ({ data, avgBuyPrice, heightClassName = 'h-72' }) => {
  const goldenPoints = data.filter((p) => p.goldenCross);
  const deadPoints = data.filter((p) => p.deadCross);

  return (
    <div className={`${heightClassName} w-full`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
          {avgBuyPrice != null && (
            <ReferenceLine
              y={avgBuyPrice}
              label={{ value: `평단가: ${avgBuyPrice.toLocaleString()}원`, fill: '#ef4444', fontSize: 11, fontWeight: 'bold' }}
              stroke="#ef4444"
              strokeDasharray="4 4"
            />
          )}
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
  );
};
