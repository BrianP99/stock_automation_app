import type { Config } from '@netlify/functions';
import { getStockAnalysis } from '../../server/marketData';

export default async (req: Request) => {
  const symbol = new URL(req.url).searchParams.get('symbol')?.trim();
  if (!symbol) {
    return new Response(JSON.stringify({ error: 'symbol is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const analysis = await getStockAnalysis(symbol);
    return new Response(JSON.stringify(analysis), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error(`Error fetching stock analysis for ${symbol}:`, err);
    return new Response(
      JSON.stringify({ error: '실시간 시세 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const config: Config = {
  path: '/api/stock/analysis',
};
