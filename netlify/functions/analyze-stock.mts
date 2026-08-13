import type { Config } from '@netlify/functions';
import { GoogleGenAI } from '@google/genai';
import { buildAnalyzeStockPrompt, ANALYZE_STOCK_SCHEMA, analyzeStockFallback } from '../../server/gemini';

export default async (req: Request) => {
  const body = await req.json();
  const { stockName, investmentAmount, riskLevel, market } = body;

  if (!stockName) {
    return new Response(JSON.stringify({ error: 'Stock name is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: Netlify.env.get('GEMINI_API_KEY') });
    const prompt = buildAnalyzeStockPrompt(stockName, investmentAmount, riskLevel, market);
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json', responseSchema: ANALYZE_STOCK_SCHEMA },
    });
    const analysisData = JSON.parse(response.text || '{}');
    return new Response(JSON.stringify(analysisData), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Error analyzing stock with Gemini:', err);
    return new Response(JSON.stringify(analyzeStockFallback(stockName, riskLevel, market)), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config: Config = {
  path: '/api/analyze-stock',
};
