import { Market } from '../types';

export function marketLabel(market: Market): string {
  return market === 'KRX' ? '한국' : '미국';
}

export function marketBadgeClass(market: Market): string {
  return market === 'KRX'
    ? 'bg-blue-50 text-blue-700 border-blue-200'
    : 'bg-red-50 text-red-700 border-red-200';
}
