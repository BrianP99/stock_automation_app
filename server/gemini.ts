import { Type } from '@google/genai';

// Shared Gemini prompt/schema/fallback builders, used by both the Express
// server (server.ts, local dev / Cloud Run) and the Netlify functions
// (netlify/functions/*.mts) so the two deploy targets never drift apart.
//
// Gemini NEVER decides which stock to buy/sell or when — the rule-based
// signal engine (server/indicators.ts + server/tradingEngine.ts) already
// made that call. Gemini's only job here is to rephrase an already-decided
// outcome in plain language.

// --- /api/explain-signal -----------------------------------------------------

export function buildExplainSignalPrompt(
  stockName: string,
  action: string,
  confidence: number,
  reason: string,
  price: number
): string {
  return `
당신은 정확한 AI 주식 자동매매 비서입니다.
아래는 기술적 지표 분석 엔진이 이미 확정한 매매 판단입니다. 이 판단(action, reason)의 내용을 절대 바꾸거나 다른 판단을 제안하지 말고,
이해하기 쉬운 한 문장(존댓말, 90자 이내)으로 풀어서 설명해 주세요.

- 종목: ${stockName}
- 확정된 판단: ${action}
- AI 신뢰도: ${confidence}%
- 기술적 사유: ${reason}
- 현재가: ${Number(price).toLocaleString()}원

응답 형식(JSON): { "explanation": "..." }
`;
}

export const EXPLAIN_SIGNAL_SCHEMA = {
  type: Type.OBJECT,
  properties: { explanation: { type: Type.STRING } },
  required: ['explanation'],
};

export function explainSignalFallback(stockName: string, action: string, reason: string): string {
  const actionKo = action === 'BUY' ? '매수' : action === 'SELL' ? '매도' : '관망';
  return `${stockName} 종목은 실시간 지표 분석 결과 ${actionKo} 신호입니다. ${reason || ''}`.trim();
}

// --- /api/daily-briefing -----------------------------------------------------

export function buildDailyBriefingPrompt(
  heldStockNames: string[],
  totalReturnAmount: number,
  totalReturnPercent: number,
  tradesCount: number,
  winRate: number
): string {
  const holdingsLine = heldStockNames.length ? heldStockNames.join(', ') : '보유 종목 없음 (현금 대기 중)';
  return `
AI 주식 자동매매 '오늘의 일일 매매 보고서'를 작성해 주세요. 이 시스템은 사용자가 종목을 고르지 않고, AI가 시장을 스캔해 여러 종목을 자동으로 사고 파는 포트폴리오형 자동매매입니다.
- 현재 보유 종목: ${holdingsLine}
- 오늘 손익금액: ${Number(totalReturnAmount).toLocaleString()}원
- 오늘 수익률: ${totalReturnPercent}%
- 오늘 자동매매 횟수: ${tradesCount}회 (승률: ${winRate}%)

명확하고 간결한 어조(존댓말)로 보고서 형식으로 작성해 주세요.
어려운 전문 용어 대신 쉽게 설명하고, 내일 매매 전략에 대한 전망을 전해주세요.

응답 형식(JSON):
{
  "title": "오늘의 AI 자동매매 리포트",
  "summaryText": "오늘 매매 요약 한 줄",
  "summaryLetter": "오늘의 매매 결과를 정리한 상세 요약 (300자 내외)",
  "tomorrowPreview": "내일의 AI 매매 방향 안내"
}
`;
}

export const DAILY_BRIEFING_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    summaryText: { type: Type.STRING },
    summaryLetter: { type: Type.STRING },
    tomorrowPreview: { type: Type.STRING },
  },
  required: ['title', 'summaryText', 'summaryLetter', 'tomorrowPreview'],
};

export function dailyBriefingFallback(
  heldStockNames: string[],
  totalReturnAmount: number,
  totalReturnPercent: number
): { title: string; summaryText: string; summaryLetter: string; tomorrowPreview: string } {
  const holdingsLine = heldStockNames.length ? heldStockNames.join(', ') : '현금 대기 중';
  return {
    title: '오늘의 AI 자동매매 리포트',
    summaryText: `오늘 포트폴리오 매매로 ${Number(totalReturnAmount || 0).toLocaleString()}원 (${totalReturnPercent || 0}%)의 성과를 기록했습니다.`,
    summaryLetter: `오늘 자동매매가 안정적으로 진행되었습니다. 현재 보유 종목: ${holdingsLine}. AI가 실시간으로 여러 종목의 수급을 분석하여 안전한 구간에서 분할 매매를 진행했습니다. 자산의 안전을 최우선으로 관리합니다.`,
    tomorrowPreview: '내일도 장 개장과 함께 AI가 시장 전체를 스캔하여 최적의 종목과 타이밍으로 거래를 계속합니다.',
  };
}
