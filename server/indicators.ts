// Pure technical-analysis math. No I/O here so it stays easy to unit test.

export function sma(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) result[i] = sum / period;
  }
  return result;
}

// Wilder's smoothing method (the standard RSI calculation).
export function rsi(values: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period + 1) return result;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = values[i] - values[i - 1];
    avgGain += Math.max(delta, 0);
    avgLoss += Math.max(-delta, 0);
  }
  avgGain /= period;
  avgLoss /= period;
  result[period] = rsiFromAverages(avgGain, avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = rsiFromAverages(avgGain, avgLoss);
  }
  return result;
}

function rsiFromAverages(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// Average True Range (Wilder's smoothing) — how much a stock actually moves
// day to day, used to size stop-loss/trailing-exit distance PER STOCK instead
// of one flat percentage for every symbol. A quiet utility stock and a
// high-beta growth name need very different stop distances; ATR adapts to
// each one's own volatility automatically.
export function atr(highs: number[], lows: number[], closes: number[], period = 14): (number | null)[] {
  const n = closes.length;
  const result: (number | null)[] = new Array(n).fill(null);
  if (n < period + 1) return result;

  const trueRanges: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      trueRanges[i] = highs[i] - lows[i];
      continue;
    }
    trueRanges[i] = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
  }

  let avg = 0;
  for (let i = 1; i <= period; i++) avg += trueRanges[i];
  avg /= period;
  result[period] = avg;

  for (let i = period + 1; i < n; i++) {
    avg = (avg * (period - 1) + trueRanges[i]) / period;
    result[i] = avg;
  }
  return result;
}

export type CrossType = 'golden' | 'dead' | null;

/** Golden cross: short-term MA crosses above long-term MA. Dead cross: the reverse. */
export function detectCross(
  prevShort: number | null,
  prevLong: number | null,
  short: number | null,
  long: number | null
): CrossType {
  if (prevShort == null || prevLong == null || short == null || long == null) return null;
  if (prevShort <= prevLong && short > long) return 'golden';
  if (prevShort >= prevLong && short < long) return 'dead';
  return null;
}

export interface SignalInput {
  price: number;
  sma5: number | null;
  sma20: number | null;
  sma60: number | null;
  prevSma5: number | null;
  prevSma20: number | null;
  rsi14: number | null;
  /** 200-day trend filter — a golden cross firing while price is below its long-term trend is far more likely to be a false signal in a downtrend, not a real reversal. Null when there isn't yet 200 bars of history. */
  sma200: number | null;
  /** Today's volume ÷ its recent (20-day) average — above ~1.2 corroborates that a cross/breakout has real participation behind it, not noise. Null when volume data is unavailable. */
  volumeRatio: number | null;
}

export interface TradingSignal {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reason: string;
  cross: CrossType;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * Deterministic, rule-based BUY/SELL/HOLD signal from moving averages + RSI.
 * Priority: golden/dead cross > RSI overbought/oversold > trend continuation.
 *
 * Every BUY path is gated by a 200-day trend filter — only take a bullish
 * signal when price is above its long-term trend, since the same cross
 * firing in a downtrend is the classic false-signal case (whipsaw). Volume
 * above its recent average corroborates a signal with real participation and
 * boosts confidence, but doesn't block a trade on its own (volume data is
 * occasionally missing/unreliable for some tickers).
 */
export function generateSignal(input: SignalInput): TradingSignal {
  const { price, sma5, sma20, prevSma5, prevSma20, rsi14, sma200, volumeRatio } = input;
  const cross = detectCross(prevSma5, prevSma20, sma5, sma20);
  const rsiLabel = rsi14 != null ? ` (RSI ${rsi14.toFixed(1)})` : '';
  const gapPercent =
    sma5 != null && sma20 != null && sma20 !== 0 ? Math.abs((sma5 - sma20) / sma20) * 100 : 0;
  // Only a hard gate once there's enough history to compute it — don't punish freshly-listed symbols.
  const belowLongTermTrend = sma200 != null && price < sma200;
  const volumeConfirmed = volumeRatio != null && volumeRatio >= 1.2;
  const volumeBoost = volumeConfirmed ? 5 : 0;

  if (cross === 'golden' && (rsi14 == null || rsi14 < 75)) {
    if (belowLongTermTrend) {
      return {
        action: 'HOLD',
        confidence: 52,
        reason: `골든크로스가 발생했지만 200일선 아래 하락 추세라 가짜 신호(휩소) 가능성이 높아 매수를 보류합니다${rsiLabel}.`,
        cross,
      };
    }
    return {
      action: 'BUY',
      confidence: clamp(72 + gapPercent * 8 + (rsi14 != null && rsi14 < 60 ? 6 : 0) + volumeBoost, 60, 97),
      reason: `5일 이동평균선이 20일 이동평균선을 상향 돌파하는 골든크로스가 200일 상승 추세 위에서 발생했습니다${
        volumeConfirmed ? ' (거래량 동반)' : ''
      }${rsiLabel}.`,
      cross,
    };
  }

  if (cross === 'dead') {
    return {
      action: 'SELL',
      confidence: clamp(70 + gapPercent * 8, 60, 97),
      reason: `5일 이동평균선이 20일 이동평균선 아래로 하락하는 데드크로스가 발생했습니다${rsiLabel}.`,
      cross,
    };
  }

  if (rsi14 != null && rsi14 <= 30 && sma20 != null && price >= sma20 * 0.97 && !belowLongTermTrend) {
    return {
      action: 'BUY',
      confidence: clamp(65 + (30 - rsi14) + volumeBoost, 55, 90),
      reason: `RSI ${rsi14.toFixed(1)}로 과매도 구간에 진입해 반등 매수 신호가 감지되었습니다${
        volumeConfirmed ? ' (거래량 동반)' : ''
      }.`,
      cross,
    };
  }

  if (rsi14 != null && rsi14 >= 70) {
    return {
      action: 'SELL',
      confidence: clamp(60 + (rsi14 - 70), 55, 90),
      reason: `RSI ${rsi14.toFixed(1)}로 과매수 구간에 진입해 차익 실현 매도 신호가 감지되었습니다.`,
      cross,
    };
  }

  if (sma5 != null && sma20 != null) {
    if (sma5 > sma20) {
      return {
        action: 'HOLD',
        confidence: 55,
        reason: `5일선이 20일선 위에서 상승 추세를 유지하고 있어 관망합니다${rsiLabel}.`,
        cross,
      };
    }
    return {
      action: 'HOLD',
      confidence: 55,
      reason: `5일선이 20일선 아래에서 조정 중이라 관망합니다${rsiLabel}.`,
      cross,
    };
  }

  return {
    action: 'HOLD',
    confidence: 50,
    reason: '지표 데이터가 충분하지 않아 관망합니다.',
    cross,
  };
}
