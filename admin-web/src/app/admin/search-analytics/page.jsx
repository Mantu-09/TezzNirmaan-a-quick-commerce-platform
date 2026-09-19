// admin/search-analytics/page.jsx — P13-8
// Shows top search queries, zero-result gaps, and search volume.
'use client';
import { useState, useEffect } from 'react';
import Cookies from 'js-cookie';
import Link from 'next/link';

function getToken() { return Cookies.get('tn_token') || ''; }

export default function SearchAnalyticsPage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [days,    setDays]    = useState(7);
  const [error,   setError]   = useState('');
  const token = getToken();

  useEffect(() => { fetchData(); }, [days]);

  async function fetchData() {
    setLoading(true);
    try {
      const res  = await fetch(`/api/backend/admin/search-analytics?days=${days}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed');
      setData(json.data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>🔍 Search Analytics</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>Understand what users search — stock what they need</p>
        </div>
        <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ padding: '8px 16px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14 }}>
          <option value={1}>Last 24 hours</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
        </select>
      </div>

      {error && <div style={{ background: '#fee2e2', color: '#dc2626', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>Loading analytics…</div>
      ) : data && (
        <>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Total Searches', value: data.total_searches?.toLocaleString('en-IN'), color: '#3b82f6' },
              { label: 'Zero-Result Searches', value: data.zero_results?.length || 0, color: '#dc2626' },
              { label: 'Unique Queries', value: data.top_queries?.length || 0, color: '#f97316' },
            ].map(stat => (
              <div key={stat.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px' }}>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>{stat.label}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: stat.color }}>{stat.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Top Searches */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7eb', fontWeight: 700 }}>🔥 Top Searches</div>
              {data.top_queries?.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>No searches in this period</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <tbody>
                    {(data.top_queries || []).slice(0, 20).map((q, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '10px 20px', color: '#6b7280', width: 28 }}>{i + 1}</td>
                        <td style={{ padding: '10px 0', fontWeight: 600, textTransform: 'capitalize' }}>{q.query}</td>
                        <td style={{ padding: '10px 20px', textAlign: 'right', color: '#6b7280' }}>{q.count || q.total || 1} searches</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Zero Result Searches */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7eb', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>⚠️ No Results Found</span>
                <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}>Stock these → instant revenue</span>
              </div>
              {data.zero_results?.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>No zero-result searches 🎉</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <tbody>
                    {(data.zero_results || []).map((q, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '10px 20px', color: '#dc2626', fontWeight: 600, textTransform: 'capitalize' }}>{q.query}</td>
                        <td style={{ padding: '10px 20px', textAlign: 'right' }}>
                          <Link href={`/admin/products?q=${encodeURIComponent(q.query)}`} style={{ fontSize: 12, color: '#f97316', fontWeight: 700, textDecoration: 'none' }}>
                            + Add Product →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
