import type { Config } from '@netlify/functions';
import { searchUniverse } from '../../server/universeSearch';

// Search-any-stock is scoped to the curated trading universe for now (the
// same ~200 symbols the AI actually scans) rather than the full NASDAQ/KRX
// listings — simpler to ship; broadening to every listed ticker is a
// straightforward follow-up (fetch+cache the exchanges' public symbol
// directories) if it turns out to matter.
export default async (req: Request) => {
  const q = new URL(req.url).searchParams.get('q') || '';
  return new Response(JSON.stringify({ results: searchUniverse(q) }), { headers: { 'Content-Type': 'application/json' } });
};

export const config: Config = {
  path: '/api/universe/search',
};
