// (storefront)/contact/page.jsx — P13-6
import Link from 'next/link';

export const metadata = { title: 'Contact & Support' };

export default function ContactPage() {
  return (
    <div className="sf-wrap">
      <div className="sf-section" style={{ maxWidth: 600, margin: '0 auto' }}>
        <div className="sf-breadcrumb" style={{ marginBottom: 24 }}>
          <Link href="/">Home</Link>
          <span className="sf-breadcrumb-sep">›</span>
          <span>Contact</span>
        </div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: 8 }}>Contact & Support</h1>
        <p style={{ color: 'var(--sf-text-3)', marginBottom: 32 }}>We are here to help — 7 days a week.</p>

        <div style={{ display: 'grid', gap: 16, marginBottom: 40 }}>
          <a href="https://wa.me/918000000000?text=Hi%20TezzNirmaan%20support"
            target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', borderRadius: 14, background: '#dcfce7', border: '1px solid #86efac', textDecoration: 'none', color: 'inherit' }}>
            <span style={{ fontSize: 32 }}>💬</span>
            <div>
              <div style={{ fontWeight: 700 }}>WhatsApp Support</div>
              <div style={{ fontSize: 13, color: '#166534' }}>Fastest response · Usually within 15 min</div>
            </div>
            <span style={{ marginLeft: 'auto', color: '#166534', fontWeight: 700 }}>Chat →</span>
          </a>

          <a href="tel:+918000000000"
            style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', borderRadius: 14, background: 'var(--sf-bg)', border: '1px solid var(--sf-border)', textDecoration: 'none', color: 'inherit' }}>
            <span style={{ fontSize: 32 }}>📞</span>
            <div>
              <div style={{ fontWeight: 700 }}>Call Us</div>
              <div style={{ fontSize: 13, color: 'var(--sf-text-3)' }}>+91-XXXX-XXXXXX · Mon–Sat 9AM–8PM</div>
            </div>
          </a>

          <a href="mailto:support@tezznirmaan.in"
            style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', borderRadius: 14, background: 'var(--sf-bg)', border: '1px solid var(--sf-border)', textDecoration: 'none', color: 'inherit' }}>
            <span style={{ fontSize: 32 }}>📧</span>
            <div>
              <div style={{ fontWeight: 700 }}>Email</div>
              <div style={{ fontSize: 13, color: 'var(--sf-text-3)' }}>support@tezznirmaan.in · Response within 24h</div>
            </div>
          </a>
        </div>

        <div style={{ background: 'var(--sf-bg)', borderRadius: 14, padding: 20, border: '1px solid var(--sf-border)' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 12 }}>Business Hours</h2>
          <table style={{ width: '100%', fontSize: 14 }}>
            <tbody>
              {[
                ['Monday – Saturday', '9:00 AM – 8:00 PM'],
                ['Sunday', '10:00 AM – 6:00 PM'],
                ['Public Holidays', 'WhatsApp only'],
              ].map(([day, hours]) => (
                <tr key={day}>
                  <td style={{ padding: '6px 0', color: 'var(--sf-text-3)' }}>{day}</td>
                  <td style={{ padding: '6px 0', fontWeight: 600, textAlign: 'right' }}>{hours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 13, color: 'var(--sf-text-3)' }}>
          For delivery issues, go to{' '}
          <Link href="/orders" style={{ color: 'var(--sf-primary)' }}>My Orders</Link>
          {' '}and tap "Report Issue" for the fastest resolution.
        </div>
      </div>
    </div>
  );
}
