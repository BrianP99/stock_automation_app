import type { Config } from '@netlify/functions';
import { TRADING_UNIVERSE } from '../../server/data/curatedUniverse';

// Search-any-stock is scoped to the curated trading universe for now (the
// same ~200 symbols the AI actually scans) rather than the full NASDAQ/KRX
// listings — simpler to ship; broadening to every listed ticker is a
// straightforward follow-up (fetch+cache the exchanges' public symbol
// directories) if it turns out to matter.
const MAX_RESULTS = 20;

export default async (req: Request) => {
  const q = (new URL(req.url).searchParams.get('q') || '').trim().toLowerCase();
  if (!q) {
    return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });
  }
  const results = TRADING_UNIVERSE.filter(
    (u) => u.symbol.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)
  ).slice(0, MAX_RESULTS);
  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
};

export const config: Config = {
  path: '/api/universe/search',
};
