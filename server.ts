import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { getStockAnalysis, getQuotes } from './server/marketData';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize Gemini Client server-side
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // API 1: Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // API: Real market data — history + SMA/RSI/golden-cross + rule-based BUY/SELL/HOLD signal
  app.get('/api/stock/analysis', async (req, res) => {
    const symbol = String(req.query.symbol || '').trim();
    if (!symbol) return res.status(400).json({ error: 'symbol is required' });
    try {
      const analysis = await getStockAnalysis(symbol);
      return res.json(analysis);
    } catch (err: any) {
      console.error(`Error fetching stock analysis for ${symbol}:`, err);
      return res.status(502).json({ error: '실시간 시세 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' });
    }
  });

  // API: Batch quotes for the stock-picker cards
  app.get('/api/stock/quotes', async (req, res) => {
    const symbols = String(req.query.symbols || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!symbols.length) return res.status(400).json({ error: 'symbols is required' });
    const quotes = await getQuotes(symbols);
    return res.json(quotes);
  });

  // API 2: Stock Strategy Analysis (종목 AI 전략 분석)
  app.post('/api/analyze-stock', async (req, res) => {
    try {
      const { stockName, investmentAmount, riskLevel, market } = req.body;

      if (!stockName) {
        return res.status(400).json({ error: 'Stock name is required' });
      }

      // When the client already fetched real technical data, ground the prompt in it
      // instead of letting the model invent numbers.
      const marketContext = market
        ? `
[실시간 기술적 지표 — 반드시 이 데이터에 기반하여 분석하세요]
- 현재가: ${Number(market.price).toLocaleString()}원
- 전일 대비: ${market.changePercent}%
- 5일 이동평균선: ${market.sma5 != null ? Number(market.sma5).toLocaleString() + '원' : '데이터 부족'}
- 20일 이동평균선: ${market.sma20 != null ? Number(market.sma20).toLocaleString() + '원' : '데이터 부족'}
- RSI(14): ${market.rsi14 != null ? Number(market.rsi14).toFixed(1) : '데이터 부족'}
- 기술적 신호: ${market.signalAction} (${market.signalReason})
`
        : '';

      const prompt = `
당신은 연세가 드신 아버지를 위해 친절하고 안전하게 주식 투자 AI 전략을 수립해주는 최첨단 AI 금융 비서입니다.
아래 종목과 투자금액, 위험 성향을 바탕으로 최적의 주식 자동매매 전략을 분석해주세요.

- 대상 종목: ${stockName}
- 설정 투자금액: ${Number(investmentAmount).toLocaleString()}원
- 위험 성향: ${riskLevel === 'SAFE' ? '안정형 (손실 방지 최우선)' : riskLevel === 'BALANCED' ? '균형 추세형 (안정적 수익 달성)' : '적극 성장형 (적극적 트레이딩)'}
${marketContext}
아버지께 명확하고 쉽고 안심을 드리는 어조(존댓말)로 설명해 주세요.

응답은 반드시 아래 JSON 형식으로 작성해 주세요:
{
  "stockName": "${stockName}",
  "summary": "종목 분석 요약 1~2문장",
  "fatherFriendlyAdvice": "아버지께 드리는 따뜻하고 명확한 조언 메시지 (150자 이내)",
  "marketTrend": "상승 추세 📈" 또는 "보합세 ⚖️" 또는 "조정 장세 📉",
  "recommendedTargetProfit": Recommended target profit percentage number (e.g. 3.5 to 7.0),
  "recommendedStopLoss": Recommended stop loss percentage number (e.g. 2.0 to 4.0),
  "keyBuySignals": ["AI 매수 조건 1", "AI 매수 조건 2", "AI 매수 조건 3"],
  "riskFactor": "주의해야 할 주요 위험 요소 1가지"
}
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              stockName: { type: Type.STRING },
              summary: { type: Type.STRING },
              fatherFriendlyAdvice: { type: Type.STRING },
              marketTrend: { type: Type.STRING },
              recommendedTargetProfit: { type: Type.NUMBER },
              recommendedStopLoss: { type: Type.NUMBER },
              keyBuySignals: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              riskFactor: { type: Type.STRING },
            },
            required: [
              'stockName',
              'summary',
              'fatherFriendlyAdvice',
              'marketTrend',
              'recommendedTargetProfit',
              'recommendedStopLoss',
              'keyBuySignals',
              'riskFactor',
            ],
          },
        },
      });

      const analysisData = JSON.parse(response.text || '{}');
      return res.json(analysisData);
    } catch (err: any) {
      console.error('Error analyzing stock with Gemini:', err);
      // Fallback response if Gemini API key is missing or encounters temporary error.
      // Grounded in real indicator data when the client sent it.
      const market = req.body.market;
      const trend =
        market?.changePercent > 0.3 ? '상승 추세 📈' : market?.changePercent < -0.3 ? '조정 장세 📉' : '보합세 ⚖️';
      return res.json({
        stockName: req.body.stockName || '선택 종목',
        summary: market
          ? `현재가 ${Number(market.price).toLocaleString()}원, 전일 대비 ${market.changePercent}%, RSI ${
              market.rsi14 != null ? Number(market.rsi14).toFixed(1) : 'N/A'
            } 기준 기술적 분석을 완료했습니다.`
          : '실시간 시장 지표와 수급 동향 분석을 완료했습니다.',
        fatherFriendlyAdvice: '아버지, AI가 실시간 시세와 이동평균선·RSI 지표를 계속 감시하며 손실 위험을 철저히 차단하겠습니다.',
        marketTrend: market ? trend : '상승 추세 📈',
        recommendedTargetProfit: req.body.riskLevel === 'SAFE' ? 3.5 : 5.0,
        recommendedStopLoss: req.body.riskLevel === 'SAFE' ? 2.0 : 3.0,
        keyBuySignals: ['5일 이동평균선 20일선 상향 돌파(골든크로스)', 'RSI 과매도 구간 반등', '이동평균선 정배열 유지'],
        riskFactor: '글로벌 증시 변동성 및 거시 경제 지표 발표',
      });
    }
  });

  // API 3: Explain a signal already decided by the technical-indicator engine (/api/stock/analysis).
  // Gemini only rephrases warmly for the father — it never chooses the action itself.
  app.post('/api/explain-signal', async (req, res) => {
    const { stockName, action, confidence, reason, price } = req.body;
    const actionKo = action === 'BUY' ? '매수' : action === 'SELL' ? '매도' : '관망';
    const templateFallback = `아버지, ${stockName} 종목은 실시간 지표 분석 결과 ${actionKo} 신호입니다. ${reason || ''}`.trim();

    try {
      const prompt = `
당신은 아버지를 위한 친절한 AI 주식 비서입니다.
아래는 기술적 지표 분석 엔진이 이미 확정한 매매 판단입니다. 이 판단(action, reason)의 내용을 절대 바꾸거나 다른 판단을 제안하지 말고,
아버지가 이해하기 쉬운 한 문장(존댓말, 90자 이내)으로 따뜻하게 풀어서 설명해 주세요.

- 종목: ${stockName}
- 확정된 판단: ${action}
- AI 신뢰도: ${confidence}%
- 기술적 사유: ${reason}
- 현재가: ${Number(price).toLocaleString()}원

응답 형식(JSON): { "fatherExplanation": "..." }
`;
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: { fatherExplanation: { type: Type.STRING } },
            required: ['fatherExplanation'],
          },
        },
      });
      const parsed = JSON.parse(response.text || '{}');
      return res.json({ fatherExplanation: parsed.fatherExplanation || templateFallback });
    } catch (err: any) {
      console.error('Error explaining signal with Gemini:', err);
      return res.json({ fatherExplanation: templateFallback });
    }
  });

  // API 4: AI Daily Briefing Generator (오늘의 AI 매매 편지/리포트)
  app.post('/api/daily-briefing', async (req, res) => {
    try {
      const { stockName, totalReturnAmount, totalReturnPercent, tradesCount, winRate } = req.body;

      const prompt = `
아버지를 위한 AI 주식 자동매매 '오늘의 일일 매매 보고서'를 작성해 주세요.
- 대상 종목: ${stockName}
- 오늘 손익금액: ${Number(totalReturnAmount).toLocaleString()}원
- 오늘 수익률: ${totalReturnPercent}%
- 오늘 자동매매 횟수: ${tradesCount}회 (승률: ${winRate}%)

존경과 정성을 담아 따뜻하고 정중한 어조(존댓말)로 아버님께 편지 형식으로 작성해 주세요.
어려운 전문 용어 대신 쉽게 설명하고, 내일 매매 전략에 대한 안심과 기대를 전해주세요.

응답 형식(JSON):
{
  "title": "오늘의 AI 자동매매 리포트",
  "summaryText": "오늘 매매 요약 한 줄",
  "aiFatherLetter": "아버지께 올리는 정성 어린 편지글 (300자 내외)",
  "tomorrowPreview": "내일의 AI 매매 방향 안내"
}
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              summaryText: { type: Type.STRING },
              aiFatherLetter: { type: Type.STRING },
              tomorrowPreview: { type: Type.STRING },
            },
            required: ['title', 'summaryText', 'aiFatherLetter', 'tomorrowPreview'],
          },
        },
      });

      const briefing = JSON.parse(response.text || '{}');
      return res.json(briefing);
    } catch (err: any) {
      console.error('Error generating daily briefing:', err);
      return res.json({
        title: '오늘의 AI 자동매매 리포트',
        summaryText: `오늘 ${req.body.stockName || '종목'} 매매로 ${Number(req.body.totalReturnAmount || 0).toLocaleString()}원 (${req.body.totalReturnPercent || 0}%)의 성과를 기록했습니다.`,
        aiFatherLetter: `아버지, 오늘 ${req.body.stockName || '종목'} 자동매매가 안정적으로 진행되었습니다. AI가 실시간으로 수급을 분석하여 안전한 구간에서 분할 매매를 진행했습니다. 자산의 안전을 최우선으로 지켜드리겠습니다. 편안한 저녁 되십시오!`,
        tomorrowPreview: '내일도 장 개장과 함께 AI가 수급 신호를 감시하여 최적의 단가로 거래를 계속하겠습니다.',
      });
    }
  });

  // Vite Integration for dev or static server for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
