import { Market } from '../types';

// Windows doesn't ship flag glyphs for regional-indicator emoji (renders as
// plain "KR"/"US" text instead of a flag icon), so the flag alone isn't a
// reliable visual cue cross-platform — pair it with a colored, labeled badge.
export function marketFlag(market: Market): string {
  return market === 'KRX' ? '🇰🇷' : '🇺🇸';
}

export function marketLabel(market: Market): string {
  return market === 'KRX' ? '한국' : '미국';
}

export function marketBadgeClass(market: Market): string {
  return market === 'KRX'
    ? 'bg-blue-50 text-blue-700 border-blue-200'
    : 'bg-red-50 text-red-700 border-red-200';
}
