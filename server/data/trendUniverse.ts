import type { Market } from '../../src/types';

// The index-trend strategy does NOT pick stocks. It holds a broad index while
// that index is above its own long-term trend line and sits in cash (swept into
// the short-term treasury ETF) while it is below. Backtested on SPY over
// 1999-2026 — a window covering the dot-com crash, 2008, COVID and 2022 — this
// cut the worst drawdown from -55.2% to -24.7% at roughly half the buy-and-hold
// return. It does not beat buy-and-hold; it loses less when the market breaks.
//
// Deliberately tiny: the whole point is that there is nothing to select. Adding
// names here re-introduces the stock-picking that 3-year backtests showed
// underperforms the index by 77-102 percentage points.

export interface TrendSymbol {
  symbol: string;
  name: string;
  market: Market;
  currency: 'KRW' | 'USD';
  sector: string;
  description: string;
}

export const TREND_UNIVERSE: TrendSymbol[] = [
  {
    symbol: 'SPY',
    name: 'S&P 500 ETF',
    market: 'US',
    currency: 'USD',
    sector: '지수 ETF',
    description: '미국 대표 500개 기업을 통째로 담는 ETF입니다. 개별 종목을 고르지 않고 미국 시장 전체를 삽니다.',
  },
];

/** Long-term trend line length in trading days — the 200-day SMA is the tested setting. */
export const TREND_SMA_DAYS = 200;
