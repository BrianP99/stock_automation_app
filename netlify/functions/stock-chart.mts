import type { Config } from '@netlify/functions';
import { getPriceHistory, type ChartPeriod } from '../../server/marketData';

const VALID_PERIODS: ChartPeriod[] = ['day', 'week', 'month', 'year'];

export default async (req: Request) => {
  const url = new URL(req.url);
  const symbol = url.searchParams.get('symbol')?.trim();
  const periodParam = url.searchParams.get('period') || 'day';

  if (!symbol) {
    return new Response(JSON.stringify({ error: 'symbol is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!VALID_PERIODS.includes(periodParam as ChartPeriod)) {
    return new Response(JSON.stringify({ error: `period must be one of ${VALID_PERIODS.join(', ')}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const result = await getPriceHistory(symbol, periodParam as ChartPeriod);
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error(`Error fetching price history for ${symbol}:`, err);
    return new Response(
      JSON.stringify({ error: '차트 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const config: Config = {
  path: '/api/stock/chart',
};
