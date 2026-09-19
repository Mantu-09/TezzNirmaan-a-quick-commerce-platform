// backend/src/services/ai-assistant.service.js — P17-3
// Admin AI assistant powered by Google Gemini Flash.
// Answers natural-language questions about platform performance.
// Gracefully falls back to structured mock data if no API key.

import { supabaseAdmin } from '../config/supabase.js';

let genAI = null;

async function getGenAI() {
  if (genAI) return genAI;
  if (!process.env.GEMINI_API_KEY) return null;
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI;
}

// Fetch current platform KPIs for context
async function getPlatformContext() {
  try {
    const today   = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    const [ordersToday, ordersWeek, activeShops, activeRiders] = await Promise.all([
      supabaseAdmin.from('orders').select('total_amount', { count: 'exact' })
        .gte('created_at', today + 'T00:00:00').neq('status', 'cancelled'),
      supabaseAdmin.from('orders').select('total_amount', { count: 'exact' })
        .gte('created_at', weekAgo + 'T00:00:00').neq('status', 'cancelled'),
      supabaseAdmin.from('shops').select('id', { count: 'exact' }).eq('is_active', true),
      supabaseAdmin.from('profiles').select('id', { count: 'exact' }).eq('role', 'rider'),
    ]);

    const todayGMV = (ordersToday.data || []).reduce((s, o) => s + (o.total_amount || 0), 0);
    const weekGMV  = (ordersWeek.data  || []).reduce((s, o) => s + (o.total_amount || 0), 0);

    return {
      today_orders: ordersToday.count || 0,
      today_gmv_rupees: Math.round(todayGMV / 100),
      week_orders: ordersWeek.count || 0,
      week_gmv_rupees: Math.round(weekGMV / 100),
      active_shops: activeShops.count || 0,
      active_riders: activeRiders.count || 0,
      platform: 'TezzNirmaan — Quick Commerce for Construction Materials in Bihar',
      cities: ['Muzaffarpur', 'Patna', 'Bhagalpur', 'Gaya'],
      date: new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    };
  } catch {
    return {
      today_orders: 0, today_gmv_rupees: 0,
      week_orders: 0, week_gmv_rupees: 0,
      active_shops: 0, active_riders: 0,
      platform: 'TezzNirmaan', cities: ['Muzaffarpur', 'Patna', 'Bhagalpur', 'Gaya'],
      date: new Date().toLocaleDateString('en-IN'),
    };
  }
}

/**
 * chat(message, conversationHistory=[])
 * Returns: { reply, context_used }
 */
export async function chat(message, conversationHistory = []) {
  const context = await getPlatformContext();
  const ai = await getGenAI();

  if (!ai) {
    // No API key — return structured mock
    return {
      reply: generateMockReply(message, context),
      context_used: context,
      source: 'mock',
    };
  }

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const systemPrompt = `You are TezzNirmaan's intelligent business analyst assistant.
TezzNirmaan is a quick-commerce platform for construction materials (cement, paint, tiles, plumbing, electrical) in Bihar, India.

Current Platform Data (as of ${context.date}):
- Today's Orders: ${context.today_orders}
- Today's GMV: ₹${context.today_gmv_rupees.toLocaleString('en-IN')}
- This Week's Orders: ${context.week_orders}  
- This Week's GMV: ₹${context.week_gmv_rupees.toLocaleString('en-IN')}
- Active Shops: ${context.active_shops}
- Active Riders: ${context.active_riders}
- Operating Cities: ${context.cities.join(', ')}

Guidelines:
- Be concise, data-driven and actionable
- Use Indian number format (₹1,23,456 not ₹123,456)
- When you don't have specific data, say so clearly
- Suggest concrete actions when relevant
- Keep responses under 200 words`;

    const chat_session = model.startChat({
      history: conversationHistory.slice(-10).map(m => ({
        role:  m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: { maxOutputTokens: 300, temperature: 0.4 },
    });

    const result = await chat_session.sendMessage(systemPrompt + '\n\nUser question: ' + message);
    const reply  = result.response.text();

    return { reply, context_used: context, source: 'gemini' };
  } catch (err) {
    console.error('[AIAssistant] Gemini error:', err.message);
    return {
      reply: generateMockReply(message, context),
      context_used: context,
      source: 'fallback',
    };
  }
}

function generateMockReply(message, ctx) {
  const q = message.toLowerCase();
  if (q.includes('gmv') || q.includes('revenue') || q.includes('sales')) {
    return `📊 **Today's GMV:** ₹${ctx.today_gmv_rupees.toLocaleString('en-IN')} across ${ctx.today_orders} orders.\n\n**This week:** ₹${ctx.week_gmv_rupees.toLocaleString('en-IN')} across ${ctx.week_orders} orders.\n\n*To get real-time AI insights, add your GEMINI_API_KEY to the backend .env file.*`;
  }
  if (q.includes('order') || q.includes('today')) {
    return `📦 **Today's orders:** ${ctx.today_orders}\n**This week:** ${ctx.week_orders} orders\n\n*Add GEMINI_API_KEY for natural language analytics powered by Gemini AI.*`;
  }
  if (q.includes('shop') || q.includes('partner')) {
    return `🏪 **Active shops:** ${ctx.active_shops} verified shops across ${ctx.cities.join(', ')}.\n\n*Add GEMINI_API_KEY for detailed shop performance analysis.*`;
  }
  if (q.includes('rider') || q.includes('deliver')) {
    return `🛵 **Active riders:** ${ctx.active_riders} on the platform.\n\n*Add GEMINI_API_KEY for rider performance insights.*`;
  }
  return `I have access to today's platform data:\n- GMV: ₹${ctx.today_gmv_rupees.toLocaleString('en-IN')}\n- Orders: ${ctx.today_orders}\n- Active shops: ${ctx.active_shops}\n\n*For full AI-powered analysis, add GEMINI_API_KEY to backend/.env*`;
}
