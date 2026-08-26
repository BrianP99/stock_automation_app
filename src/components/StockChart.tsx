import React from 'react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceDot } from 'recharts';
import { ChartPoint } from '../types';

interface StockChartProps {
  data: ChartPoint[];
  avgBuyPrice?: number;
  heightClassName?: string;
}

const UP_COLOR = '#ef4444'; // 상승/양봉 = 빨강 (국내 증시 관례)
const DOWN_COLOR = '#3b82f6'; // 하락/음봉 = 파랑

/** Draws one OHLC candle: a thin high-low wick plus an open-close body, colored by direction. */
const Candle: React.FC<any> = (props) => {
  const { x, width, payload, y, height } = props;
  const open = payload.open ?? payload.price;
  const close = payload.price;
  const high = payload.high ?? Math.max(open, close);
  const low = payload.low ?? Math.min(open, close);
  if (high === low) return null;

  const isUp = close >= open;
  const color = isUp ? UP_COLOR : DOWN_COLOR;
  const pxPerUnit = height / (high - low);
  const bodyTopValue = Math.max(open, close);
  const bodyBottomValue = Math.min(open, close);
  const bodyTop = y + (high - bodyTopValue) * pxPerUnit;
  const bodyHeight = Math.max(1, (bodyTopValue - bodyBottomValue) * pxPerUnit);
  const bodyWidth = Math.max(2, width * 0.6);
  const bodyX = x + (width - bodyWidth) / 2;
  const wickX = x + width / 2;

  return (
    <g>
      <line x1={wickX} x2={wickX} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={bodyX} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={color} />
    </g>
  );
};

const ChartTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  const point: ChartPoint = payload[0].payload;
  const fmt = (v: number) => `${Math.round(v).toLocaleString('ko-KR')}원`;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-2xl px-3.5 py-3 text-xs font-bold text-white space-y-1 shadow-xl">
      <div className="text-slate-400 mb-1">{new Date(label).toLocaleString('ko-KR')}</div>
      {point.open != null && (
        <div>
          시가 <span className="text-slate-300">{fmt(point.open)}</span>
        </div>
      )}
      {point.high != null && (
        <div>
          고가 <span className="text-red-400">{fmt(point.high)}</span>
        </div>
      )}
      {point.low != null && (
        <div>
          저가 <span className="text-blue-400">{fmt(point.low)}</span>
        </div>
      )}
      <div>
        종가 <span className="text-slate-300">{fmt(point.price)}</span>
      </div>
      {point.sma5 != null && (
        <div className="text-amber-400">5선 {fmt(point.sma5)}</div>
      )}
      {point.sma20 != null && (
        <div className="text-indigo-400">20선 {fmt(point.sma20)}</div>
      )}
    </div>
  );
};

/**
 * OHLC candlestick chart (every bar shows its own high/low + open/close) with
 * SMA5/SMA20 overlays and golden/dead-cross markers.
 */
export const StockChart: React.FC<StockChartProps> = ({ data, avgBuyPrice, heightClassName = 'h-72' }) => {
  const goldenPoints = data.filter((p) => p.goldenCross);
  const deadPoints = data.filter((p) => p.deadCross);

  // 기간 내 최고가/최저가 지점 — 캔들 하나하나의 고저가 아니라 전체 기간을 통틀어 딱 하나씩.
  let highestPoint: ChartPoint | null = null;
  let lowestPoint: ChartPoint | null = null;
  for (const p of data) {
    const high = p.high ?? p.price;
    const low = p.low ?? p.price;
    if (highestPoint == null || high > (highestPoint.high ?? highestPoint.price)) highestPoint = p;
    if (lowestPoint == null || low < (lowestPoint.low ?? lowestPoint.price)) lowestPoint = p;
  }

  // Recharts' Bar range rendering needs the high/low span as a single field.
  const chartData = data.map((p) => ({ ...p, range: [p.low ?? p.price, p.high ?? p.price] }));

  // Recharts' 'auto' domain only looks at plotted series data — if avgBuyPrice
  // falls outside the fetched price history's range, the dashed reference
  // line would render off-chart. Force the Y domain to always include it.
  const values = data.flatMap((p) => [p.high ?? p.price, p.low ?? p.price]);
  const domainValues = avgBuyPrice != null ? [...values, avgBuyPrice] : values;
  const yDomain: [number, number] | ['auto', 'auto'] =
    domainValues.length > 0
      ? (() => {
          const min = Math.min(...domainValues);
          const max = Math.max(...domainValues);
          const padding = (max - min) * 0.08 || max * 0.05 || 1;
          return [Math.max(0, min - padding), max + padding];
        })()
      : ['auto', 'auto'];

  return (
    <div className={`${heightClassName} w-full`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickFormatter={(val) => new Date(val).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
          />
          <YAxis
            domain={yDomain}
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickFormatter={(val) => `${val.toLocaleString('ko-KR')}`}
            width={60}
          />
          <Tooltip content={<ChartTooltip />} />
          {avgBuyPrice != null && (
            <ReferenceLine
              y={avgBuyPrice}
              label={{ value: `평단가: ${avgBuyPrice.toLocaleString('ko-KR')}원`, fill: '#ef4444', fontSize: 11, fontWeight: 'bold' }}
              stroke="#ef4444"
              strokeDasharray="4 4"
            />
          )}
          <Bar dataKey="range" shape={<Candle />} isAnimationActive={false} />
          <Line type="monotone" dataKey="sma5" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="sma20" stroke="#6366f1" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          {goldenPoints.map((p, i) => (
            <ReferenceDot key={`golden-${i}`} x={p.time} y={p.price} r={5} fill="#ef4444" stroke="white" />
          ))}
          {deadPoints.map((p, i) => (
            <ReferenceDot key={`dead-${i}`} x={p.time} y={p.price} r={5} fill="#3b82f6" stroke="white" />
          ))}
          {highestPoint && (
            <ReferenceDot
              x={highestPoint.time}
              y={highestPoint.high ?? highestPoint.price}
              r={3}
              fill="#ef4444"
              stroke="white"
              label={{
                value: `최고 ${(highestPoint.high ?? highestPoint.price).toLocaleString('ko-KR')}원`,
                position: 'top',
                fill: '#ef4444',
                fontSize: 11,
                fontWeight: 'bold',
              }}
            />
          )}
          {lowestPoint && (
            <ReferenceDot
              x={lowestPoint.time}
              y={lowestPoint.low ?? lowestPoint.price}
              r={3}
              fill="#3b82f6"
              stroke="white"
              label={{
                value: `최저 ${(lowestPoint.low ?? lowestPoint.price).toLocaleString('ko-KR')}원`,
                position: 'bottom',
                fill: '#3b82f6',
                fontSize: 11,
                fontWeight: 'bold',
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
