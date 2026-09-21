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
  /**
   * Where the 200-day signal is measured. SPY has 28 years of history, which is
   * what the strategy was validated on.
   */
  signalSymbol: string;
  /**
   * What actually gets bought. A KRX-listed S&P 500 tracker rather than SPY
   * itself: paper trading supports domestic orders for certain, the holding is
   * priced in KRW so it carries no currency leg of its own, and a ~24,000 KRW
   * share divides into the portfolio far more cleanly than SPY's ~1,055,000.
   *
   * These ETFs only listed around 2020-21, far too short for a 200-day trend
   * study, which is exactly why the signal is taken from SPY instead.
   */
  tradeSymbol: string;
  name: string;
  market: Market;
  currency: 'KRW' | 'USD';
  sector: string;
  description: string;
  /** Currency-hedged trackers follow the index alone, matching the USD-denominated backtest. */
  hedged: boolean;
}

export const TREND_UNIVERSE: TrendSymbol[] = [
  {
    signalSymbol: 'SPY',
    tradeSymbol: '379800',
    name: 'KODEX 미국S&P500',
    market: 'KRX',
    currency: 'KRW',
    sector: '지수 ETF',
    description:
      '미국 대표 500개 기업을 담는 국내 상장 ETF입니다. 개별 종목을 고르지 않고 미국 시장 전체를 삽니다.',
    hedged: false,
  },
];

/** Long-term trend line length in trading days — the 200-day SMA is the tested setting. */
export const TREND_SMA_DAYS = 200;
