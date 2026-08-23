import { Market } from '../types';

export function marketFlag(market: Market): string {
  return market === 'KRX' ? '🇰🇷' : '🇺🇸';
}
