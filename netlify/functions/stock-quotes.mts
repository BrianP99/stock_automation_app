import type { Config } from '@netlify/functions';
import { getQuotes } from '../../server/marketData';

export default async (req: Request) => {
  const symbolsParam = new URL(req.url).searchParams.get('symbols') || '';
  const symbols = symbolsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!symbols.length) {
    return new Response(JSON.stringify({ error: 'symbols is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const quotes = await getQuotes(symbols);
  return new Response(JSON.stringify(quotes), { headers: { 'Content-Type': 'application/json' } });
};

export const config: Config = {
  path: '/api/stock/quotes',
};
