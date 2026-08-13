import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { getStockAnalysis, getQuotes } from './server/marketData';
import {
  buildAnalyzeStockPrompt,
  ANALYZE_STOCK_SCHEMA,
  analyzeStockFallback,
  buildExplainSignalPrompt,
  EXPLAIN_SIGNAL_SCHEMA,
  explainSignalFallback,
  buildDailyBriefingPrompt,
  DAILY_BRIEFING_SCHEMA,
  dailyBriefingFallback,
} from './server/gemini';

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
      const prompt = buildAnalyzeStockPrompt(stockName, investmentAmount, riskLevel, market);

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: ANALYZE_STOCK_SCHEMA,
        },
      });

      const analysisData = JSON.parse(response.text || '{}');
      return res.json(analysisData);
    } catch (err: any) {
      console.error('Error analyzing stock with Gemini:', err);
      // Fallback response if Gemini API key is missing or encounters temporary error.
      // Grounded in real indicator data when the client sent it.
      return res.json(analyzeStockFallback(req.body.stockName, req.body.riskLevel, req.body.market));
    }
  });

  // API 3: Explain a signal already decided by the technical-indicator engine (/api/stock/analysis).
  // Gemini only rephrases it in plain language — it never chooses the action itself.
  app.post('/api/explain-signal', async (req, res) => {
    const { stockName, action, confidence, reason, price } = req.body;
    const templateFallback = explainSignalFallback(stockName, action, reason);

    try {
      const prompt = buildExplainSignalPrompt(stockName, action, confidence, reason, price);
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: EXPLAIN_SIGNAL_SCHEMA,
        },
      });
      const parsed = JSON.parse(response.text || '{}');
      return res.json({ explanation: parsed.explanation || templateFallback });
    } catch (err: any) {
      console.error('Error explaining signal with Gemini:', err);
      return res.json({ explanation: templateFallback });
    }
  });

  // API 4: AI Daily Briefing Generator (오늘의 AI 매매 편지/리포트)
  app.post('/api/daily-briefing', async (req, res) => {
    try {
      const { stockName, totalReturnAmount, totalReturnPercent, tradesCount, winRate } = req.body;

      const prompt = buildDailyBriefingPrompt(stockName, totalReturnAmount, totalReturnPercent, tradesCount, winRate);

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: DAILY_BRIEFING_SCHEMA,
        },
      });

      const briefing = JSON.parse(response.text || '{}');
      return res.json(briefing);
    } catch (err: any) {
      console.error('Error generating daily briefing:', err);
      return res.json(dailyBriefingFallback(req.body.stockName, req.body.totalReturnAmount, req.body.totalReturnPercent));
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
