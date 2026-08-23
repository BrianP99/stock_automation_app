import type { Config } from '@netlify/functions';
import { GoogleGenAI } from '@google/genai';
import { buildDailyBriefingPrompt, DAILY_BRIEFING_SCHEMA, dailyBriefingFallback } from '../../server/gemini';

// Gemini calls are temporarily disabled: the trading loop must run fully
// unattended, and an occasional slow/unresponsive Gemini request must never
// stall it. Flip this back to true to re-enable AI-written briefings.
const GEMINI_ENABLED = false;

export default async (req: Request) => {
  const { heldStockNames, totalReturnAmount, totalReturnPercent, tradesCount, winRate } = await req.json();
  const fallback = dailyBriefingFallback(heldStockNames || [], totalReturnAmount, totalReturnPercent);

  if (GEMINI_ENABLED) {
    const apiKey = Netlify.env.get('GEMINI_API_KEY');
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const prompt = buildDailyBriefingPrompt(heldStockNames || [], totalReturnAmount, totalReturnPercent, tradesCount, winRate);
        const response = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: prompt,
          config: { responseMimeType: 'application/json', responseSchema: DAILY_BRIEFING_SCHEMA },
        });
        const briefing = JSON.parse(response.text || '{}');
        return new Response(JSON.stringify(briefing), { headers: { 'Content-Type': 'application/json' } });
      } catch (err) {
        console.error('Error generating daily briefing:', err);
      }
    }
  }

  return new Response(JSON.stringify(fallback), { headers: { 'Content-Type': 'application/json' } });
};

export const config: Config = {
  path: '/api/daily-briefing',
};
