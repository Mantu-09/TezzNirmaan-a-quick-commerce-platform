// ─────────────────────────────────────────────────────────────
// (storefront)/b2b/page.jsx — P12-7
//
// B2B Contractor Hub — single entry point for all contractor features.
// Shows different UI based on contractor profile status:
//   • Not applied → Application form
//   • Pending approval → Status card
//   • Verified → Full B2B dashboard (credit, projects, invoices)
//
// Uses existing backend routes:
//   GET  /customer/b2b/profile
//   POST /customer/b2b/apply
// ─────────────────────────────────────────────────────────────
'use client';
import { useState, useEffect } from 'react';
import { useRouter }           from 'next/navigation';
import Link                    from 'next/link';
import Cookies                 from 'js-cookie';

const API = '/api/backend';

function fmt(paise) {
  return `₹${Math.round((paise || 0) / 100).toLocaleString('en-IN')}`;
}

// ── Application form ──────────────────────────────────────────
function B2BApplicationForm({ onApplied }) {
  const [form,    setForm]    = useState({
    business_name: '', gstin: '', business_type: 'contractor',
    years_in_business: '', monthly_order_value: '',
    contact_name: '', contact_phone: '',
  });
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.business_name || !form.contact_name || !form.contact_phone) {
      setError('Please fill in all required fields'); return;
    }
    setSaving(true); setError('');
    try {
      const token = Cookies.get('tn_token');
      const res   = await fetch(`${API}/customer/b2b/apply`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          businessName:     form.business_name,
          gstin:            form.gstin || undefined,
          businessType:     form.business_type,
          yearsInBusiness:  parseInt(form.years_in_business) || 0,
          monthlyOrderValue: parseInt(form.monthly_order_value) || 0,
          contactName:      form.contact_name,
          contactPhone:     form.contact_phone,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Application failed');
      onApplied(json.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const inp   = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--sf-border,#e5e7eb)', fontSize: 14, boxSizing: 'border-box', background: 'var(--sf-bg,#f9fafb)', outline: 'none', fontFamily: 'inherit' };
  const label = { fontSize: 12, fontWeight: 700, color: 'var(--sf-text-2,#6b7280)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 };
  const field = { marginBottom: 14 };

  return (
    <form onSubmit={submit}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ ...field, gridColumn: '1/-1' }}>
          <label style={label}>Business Name *</label>
          <input style={inp} value={form.business_name} onChange={e => set('business_name', e.target.value)} placeholder="Sharma Construction Pvt Ltd" required />
        </div>
        <div style={field}>
          <label style={label}>Contact Name *</label>
          <input style={inp} value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="Ramesh Sharma" required />
        </div>
        <div style={field}>
          <label style={label}>Contact Phone *</label>
          <input style={inp} value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} placeholder="9876543210" type="tel" required />
        </div>
        <div style={field}>
          <label style={label}>GSTIN (optional)</label>
          <input style={{ ...inp, fontFamily: 'monospace', letterSpacing: 1 }} value={form.gstin} onChange={e => set('gstin', e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" maxLength={15} />
        </div>
        <div style={field}>
          <label style={label}>Business Type</label>
          <select style={inp} value={form.business_type} onChange={e => set('business_type', e.target.value)}>
            <option value="contractor">General Contractor</option>
            <option value="builder">Builder / Developer</option>
            <option value="plumber">Plumber / MEP</option>
            <option value="electrician">Electrician</option>
            <option value="interior">Interior Designer</option>
            <option value="retailer">Hardware Retailer</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div style={field}>
          <label style={label}>Years in Business</label>
          <input style={inp} value={form.years_in_business} onChange={e => set('years_in_business', e.target.value)} placeholder="5" type="number" min="0" max="100" />
        </div>
        <div style={field}>
          <label style={label}>Est. Monthly Purchases (₹)</label>
          <input style={inp} value={form.monthly_order_value} onChange={e => set('monthly_order_value', e.target.value)} placeholder="50000" type="number" min="0" />
        </div>
      </div>

      {error && <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fee2e2', color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <button type="submit" disabled={saving}
        style={{ width: '100%', padding: '14px', borderRadius: 12, background: 'var(--sf-primary,#f97316)', color: '#fff', border: 'none', fontWeight: 800, fontSize: 15, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
        {saving ? 'Submitting…' : 'Submit B2B Application →'}
      </button>
    </form>
  );
}

// ── Verified dashboard ────────────────────────────────────────
function B2BDashboard({ profile }) {
  const [projects, setProjects] = useState([]);
  const [newProject, setNewProject] = useState(false);
  const [projName,   setProjName]   = useState('');
  const [projAddr,   setProjAddr]   = useState('');
  const [saving,     setSaving]     = useState(false);

  useEffect(() => {
    const token = Cookies.get('tn_token');
    fetch(`${API}/customer/b2b/projects`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(json => setProjects(json.data?.projects || json.projects || []))
      .catch(() => {});
  }, []);

  const createProject = async (e) => {
    e.preventDefault();
    if (!projName.trim()) return;
    setSaving(true);
    const token = Cookies.get('tn_token');
    try {
      const res  = await fetch(`${API}/customer/b2b/projects`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ name: projName.trim(), site_address: projAddr.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setProjects(p => [json.data || json.project, ...p]);
      setProjName(''); setProjAddr(''); setNewProject(false);
    } catch { /* show inline — non-fatal */ }
    finally { setSaving(false); }
  };

  const creditLimit = profile.credit_limit_paise || 0;
  const creditUsed  = profile.credit_used_paise  || 0;
  const creditAvail = Math.max(0, creditLimit - creditUsed);
  const pct         = creditLimit > 0 ? Math.min(100, Math.round((creditUsed / creditLimit) * 100)) : 0;

  return (
    <div>
      {/* Credit card */}
      <div style={{ background: 'linear-gradient(135deg, #1e40af, #1d4ed8)', borderRadius: 16, padding: '24px', color: '#fff', marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.75, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Credit Account</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>Available</div>
            <div style={{ fontSize: 32, fontWeight: 900 }}>{fmt(creditAvail)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, opacity: 0.7 }}>Limit</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(creditLimit)}</div>
          </div>
        </div>
        {/* Credit bar */}
        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.2)', marginBottom: 6 }}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: pct > 80 ? '#fbbf24' : '#34d399', transition: 'width 0.4s' }} />
        </div>
        <div style={{ fontSize: 11, opacity: 0.7 }}>{fmt(creditUsed)} used of {fmt(creditLimit)}</div>
        {profile.payment_terms_days > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 12px', display: 'inline-block' }}>
            {profile.payment_terms_days}-day payment terms
          </div>
        )}
      </div>

      {/* B2B perks */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 20 }}>
        {[
          { icon: '📄', label: 'GST Invoices', href: '/b2b/invoices' },
          { icon: '📋', label: 'Bulk Quote',   href: '/b2b/quote'   },
          { icon: '💳', label: 'EMI Plans',    href: '/b2b/emi'     },
          { icon: '📦', label: 'Bulk Orders',  href: '/b2b/bulk'    },
          { icon: '📊', label: 'Spend Report', href: '/b2b/report'  },
          { icon: '🔄', label: 'Reorder',      href: '/orders'      },
        ].map(item => (
          <Link key={item.href} href={item.href} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            padding: '14px 8px', borderRadius: 12, textDecoration: 'none',
            background: 'var(--sf-surface,#fff)', border: '1px solid var(--sf-border,#e5e7eb)',
            fontSize: 12, fontWeight: 700, color: 'var(--sf-text,#111827)', textAlign: 'center',
          }}>
            <span style={{ fontSize: 24 }}>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </div>

      {/* Projects */}
      <div style={{ background: 'var(--sf-surface,#fff)', borderRadius: 16, border: '1px solid var(--sf-border,#e5e7eb)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderBottom: '1px solid var(--sf-border,#f3f4f6)' }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>📋 My Projects</div>
          <button onClick={() => setNewProject(v => !v)}
            style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--sf-primary,#f97316)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            + New Project
          </button>
        </div>

        {newProject && (
          <form onSubmit={createProject} style={{ padding: '14px 18px', background: '#fff9f5', borderBottom: '1px solid var(--sf-border,#f3f4f6)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={projName} onChange={e => setProjName(e.target.value)} placeholder="Project name *"
              style={{ flex: 1, minWidth: 160, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--sf-border,#e5e7eb)', fontSize: 13 }} required />
            <input value={projAddr} onChange={e => setProjAddr(e.target.value)} placeholder="Site address (optional)"
              style={{ flex: 2, minWidth: 200, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--sf-border,#e5e7eb)', fontSize: 13 }} />
            <button type="submit" disabled={saving}
              style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--sf-primary,#f97316)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              {saving ? '…' : 'Create'}
            </button>
          </form>
        )}

        {projects.length === 0 ? (
          <div style={{ padding: '28px 18px', textAlign: 'center', color: 'var(--sf-text-2,#9ca3af)', fontSize: 14 }}>
            No projects yet. Create one to tag orders and track site spend.
          </div>
        ) : (
          projects.map((proj, i) => (
            <div key={proj.id || i} style={{ padding: '14px 18px', borderBottom: i < projects.length - 1 ? '1px solid var(--sf-border,#f3f4f6)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sf-text,#111827)' }}>{proj.name}</div>
                  {proj.site_address && <div style={{ fontSize: 12, color: 'var(--sf-text-2,#9ca3af)', marginTop: 2 }}>📍 {proj.site_address}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--sf-text,#111827)' }}>{fmt(proj.spent_paise)}</div>
                  {proj.budget_paise && <div style={{ fontSize: 11, color: 'var(--sf-text-3,#9ca3af)' }}>of {fmt(proj.budget_paise)} budget</div>}
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                    background: proj.status === 'active' ? '#dcfce7' : '#f3f4f6',
                    color:      proj.status === 'active' ? '#166534' : '#6b7280',
                  }}>
                    {proj.status}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function B2BPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null); // null=loading, false=not applied, object=profile
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = Cookies.get('tn_token');
    if (!token) { router.push('/auth?redirect=/b2b'); return; }
    fetch(`${API}/customer/b2b/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(json => setProfile(json.data?.profile || json.profile || false))
      .catch(() => setProfile(false))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return (
    <div className="sf-wrap" style={{ paddingTop: 80, textAlign: 'center', color: 'var(--sf-text-2,#9ca3af)' }}>
      Loading B2B profile…
    </div>
  );

  return (
    <div className="sf-wrap sf-section" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ fontSize: 13, color: 'var(--sf-text-2,#6b7280)', marginBottom: 16 }}>
        <Link href="/" style={{ color: 'var(--sf-primary,#f97316)' }}>Home</Link> › B2B / Contractors
      </div>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 900, marginBottom: 6 }}>
          🏗️ B2B Contractor Hub
        </h1>
        <p style={{ fontSize: 14, color: 'var(--sf-text-2,#6b7280)' }}>
          Credit accounts · GST invoices · Project tracking · Bulk orders
        </p>
      </div>

      {/* Not applied — show benefits + form */}
      {profile === false && (
        <>
          {/* Benefits */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginBottom: 28 }}>
            {[
              { icon: '💳', title: 'Credit Account',    desc: 'Up to ₹5L credit · 30/45-day terms'    },
              { icon: '📄', title: 'GST Invoices',      desc: 'Instant PDF invoices for all orders'    },
              { icon: '📦', title: 'Bulk Discounts',    desc: '3–8% off on large quantity orders'       },
              { icon: '📋', title: 'Project Tracking',  desc: 'Tag orders to job sites, track spend'   },
              { icon: '🔄', title: 'Repeat Orders',     desc: 'Reorder full material lists in one tap'  },
              { icon: '📞', title: 'Dedicated Support', desc: 'Priority phone support for site issues' },
            ].map(item => (
              <div key={item.title} style={{ padding: '16px', borderRadius: 12, background: 'var(--sf-surface,#fff)', border: '1px solid var(--sf-border,#e5e7eb)' }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>{item.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: 'var(--sf-text-2,#6b7280)' }}>{item.desc}</div>
              </div>
            ))}
          </div>

          {/* Application form */}
          <div style={{ background: 'var(--sf-surface,#fff)', borderRadius: 16, padding: '24px', border: '1px solid var(--sf-border,#e5e7eb)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Apply for a B2B Account</h2>
            <p style={{ fontSize: 13, color: 'var(--sf-text-2,#6b7280)', marginBottom: 20 }}>
              Free · Approval in 1–2 business days · Call us at +91-XXXX-XXXXXX if urgent
            </p>
            <B2BApplicationForm onApplied={setProfile} />
          </div>
        </>
      )}

      {/* Pending */}
      {profile && profile.is_verified === false && (
        <div style={{ padding: '28px 24px', borderRadius: 16, background: '#fef3c7', border: '1px solid #fcd34d', textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#92400e', marginBottom: 8 }}>Application Under Review</h2>
          <p style={{ fontSize: 14, color: '#92400e', marginBottom: 8 }}>
            We're reviewing your application for <strong>{profile.business_name}</strong>.
          </p>
          <p style={{ fontSize: 12, color: '#b45309' }}>
            Approval usually takes 1–2 business days. We'll notify you via SMS.
          </p>
        </div>
      )}

      {/* Rejected */}
      {profile && profile.rejection_reason && (
        <div style={{ padding: '20px 24px', borderRadius: 16, background: '#fee2e2', border: '1px solid #fca5a5', marginBottom: 24 }}>
          <div style={{ fontWeight: 800, color: '#dc2626', marginBottom: 6 }}>❌ Application Not Approved</div>
          <div style={{ fontSize: 13, color: '#dc2626' }}>Reason: {profile.rejection_reason}</div>
          <div style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>You may reapply after 30 days or contact support.</div>
        </div>
      )}

      {/* Verified dashboard */}
      {profile && profile.is_verified === true && (
        <B2BDashboard profile={profile} />
      )}
    </div>
  );
}
