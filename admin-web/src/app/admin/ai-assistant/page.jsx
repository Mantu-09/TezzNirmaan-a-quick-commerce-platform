'use client';
// admin/ai-assistant/page.jsx — P17-3
// AI-powered admin chat using Google Gemini with live platform KPI context.
import { useState, useRef, useEffect } from 'react';

const SUGGESTED = [
  "What's today's GMV?",
  "How many orders this week?",
  "Which city is performing best?",
  "How many active shops do we have?",
  "What should we focus on to grow faster?",
  "Summarize this week's performance",
];

function Message({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 14, gap: 10, alignItems: 'flex-end' }}>
      {!isUser && (
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, #f97316, #ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
          🤖
        </div>
      )}
      <div style={{
        maxWidth: '75%', padding: '12px 16px', borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        background: isUser ? '#f97316' : '#fff', color: isUser ? '#fff' : '#1f2937',
        boxShadow: '0 1px 6px rgba(0,0,0,.08)', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap',
      }}>
        {msg.content}
        {msg.source && msg.source !== 'gemini' && (
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>
            {msg.source === 'mock' ? '⚠️ Add GEMINI_API_KEY for real AI' : '⚡ Fallback mode'}
          </div>
        )}
      </div>
      {isUser && (
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
          👤
        </div>
      )}
    </div>
  );
}

export default function AIAssistantPage() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! I'm TezzNirmaan's AI business analyst. Ask me anything about today's performance, GMV, orders, shops, or growth strategy. I have access to real-time platform data.", source: 'system' },
  ]);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef             = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function sendMessage(text) {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');
    const userMsg = { role: 'user', content: msg };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));
      const r = await fetch('/api/backend/admin/ai/chat', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history }),
      });
      const d = await r.json();
      setMessages(prev => [...prev, { role: 'assistant', content: d.data?.reply || 'Sorry, I could not process that.', source: d.data?.source }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Network error. Please try again.', source: 'error' }]);
    }
    setLoading(false);
  }

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: 24, height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #f97316, #ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>🤖</div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>AI Business Analyst</h1>
          <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>Powered by Google Gemini · Real-time platform data</p>
        </div>
        <button onClick={() => setMessages([messages[0]])} style={{ marginLeft: 'auto', padding: '6px 12px', background: '#f3f4f6', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, color: '#6b7280' }}>
          Clear chat
        </button>
      </div>

      {/* Suggested questions */}
      {messages.length === 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {SUGGESTED.map(q => (
            <button key={q} onClick={() => sendMessage(q)} style={{ padding: '7px 14px', background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 20, cursor: 'pointer', fontSize: 12, color: '#92400e', fontWeight: 600 }}>
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Chat messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0', marginBottom: 12 }}>
        {messages.map((msg, i) => <Message key={i} msg={msg} />)}
        {loading && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 14 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, #f97316, #ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🤖</div>
            <div style={{ padding: '12px 16px', borderRadius: '16px 16px 16px 4px', background: '#fff', boxShadow: '0 1px 6px rgba(0,0,0,.08)' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[0, 0.2, 0.4].map(d => (
                  <div key={d} style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316', animation: 'pulse 1s infinite', animationDelay: `${d}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 10, background: '#fff', borderRadius: 14, padding: '8px 8px 8px 16px', boxShadow: '0 1px 8px rgba(0,0,0,.1)' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder="Ask about GMV, orders, shops, growth..."
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, color: '#1f2937', background: 'transparent' }}
          disabled={loading}
        />
        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading}
          style={{ padding: '10px 20px', background: input.trim() ? '#f97316' : '#e5e7eb', color: input.trim() ? '#fff' : '#9ca3af', borderRadius: 10, border: 'none', fontWeight: 700, cursor: input.trim() ? 'pointer' : 'default', fontSize: 14, transition: 'all .2s' }}
        >
          Send
        </button>
      </div>
      <style>{`@keyframes pulse { 0%, 100% { opacity:.3 } 50% { opacity:1 } }`}</style>
    </div>
  );
}
