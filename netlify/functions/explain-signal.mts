import type { Config } from '@netlify/functions';
import { GoogleGenAI } from '@google/genai';
import { buildExplainSignalPrompt, EXPLAIN_SIGNAL_SCHEMA, explainSignalFallback } from '../../server/gemini';

export default async (req: Request) => {
  const { stockName, action, confidence, reason, price } = await req.json();
  const templateFallback = explainSignalFallback(stockName, action, reason);

  try {
    const ai = new GoogleGenAI({ apiKey: Netlify.env.get('GEMINI_API_KEY') });
    const prompt = buildExplainSignalPrompt(stockName, action, confidence, reason, price);
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json', responseSchema: EXPLAIN_SIGNAL_SCHEMA },
    });
    const parsed = JSON.parse(response.text || '{}');
    return new Response(JSON.stringify({ explanation: parsed.explanation || templateFallback }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error explaining signal with Gemini:', err);
    return new Response(JSON.stringify({ explanation: templateFallback }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config: Config = {
  path: '/api/explain-signal',
};
