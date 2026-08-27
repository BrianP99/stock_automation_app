import { TRADING_UNIVERSE, type UniverseSymbol } from './data/curatedUniverse';
import { STOCK_ALIASES } from './data/stockAliases';

// Shared by both the Netlify function (netlify/functions/universe-search.mts)
// and the local Express dev server (server.ts) so the two never drift apart.
const MAX_RESULTS = 20;

/** Lower relevance rank = better match; null = doesn't match at all. */
function matchRank(u: UniverseSymbol, q: string): number | null {
  const symbol = u.symbol.toLowerCase();
  const name = u.name.toLowerCase();
  if (symbol === q || name === q) return 0; // exact ticker/name
  if (symbol.startsWith(q) || name.startsWith(q)) return 1; // starts-with — "nvd" -> NVDA
  if (symbol.includes(q) || name.includes(q)) return 2; // ticker/name substring
  const aliases = (STOCK_ALIASES[u.symbol] || []).map((a) => a.toLowerCase());
  if (aliases.some((a) => a.includes(q))) return 3; // "엔비디아" -> NVDA
  if (u.sector.toLowerCase().includes(q)) return 4; // "반도체" -> every chip stock
  if (u.description.toLowerCase().includes(q)) return 5; // looser keyword match
  return null;
}

/** Ticker, name (English or Korean), Korean alias, sector, or description keyword — ranked by relevance. */
export function searchUniverse(rawQuery: string): UniverseSymbol[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];
  return TRADING_UNIVERSE.map((u) => ({ u, rank: matchRank(u, q) }))
    .filter((r): r is { u: UniverseSymbol; rank: number } => r.rank !== null)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_RESULTS)
    .map((r) => r.u);
}
