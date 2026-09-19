'use client';
// ─────────────────────────────────────────────────────────────────────────────
// MarketingFooter.jsx — 4-column footer matching Blinkit-style layout
// ─────────────────────────────────────────────────────────────────────────────

const CATS   = ['Construction','Paints','Tiles','Electrical','Plumbing','Hardware','Decor','Fittings'];
const CITIES = ['Patna','Muzaffarpur','Bhagalpur','Gaya'];
const COMPANY_LINKS = [
  { label: 'Privacy Policy',   href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Refund Policy',    href: '/refund-policy' },
  { label: 'Contact & Support',href: '/contact' },
  { label: 'Partner With Us 🤝', href: '/shop-signup' },
  { label: 'Construction Blog',  href: '/blog' },
  { label: '🔴 Loyalty Rewards', href: '/loyalty' },
  { label: '🎁 Refer & Earn',    href: '/referral' },
];

function FooterLink({ href, children }) {
  return (
    <a
      href={href}
      style={{ fontSize: 13, color: '#64748b', textDecoration: 'none', lineHeight: 1 }}
      onMouseOver={e => e.currentTarget.style.color = '#E8740C'}
      onMouseOut={e  => e.currentTarget.style.color = '#64748b'}
    >{children}</a>
  );
}

export default function MarketingFooter() {
  return (
    <footer
      aria-label="Site footer"
      style={{ background: '#fff', borderTop: '1px solid #e8ecf0', paddingTop: 48 }}
    >
      {/* ── Main 4-column grid ── */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 40px 48px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.6fr 1fr 1fr 1fr',
          gap: 40,
        }}>

          {/* Column 1 — Brand */}
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 14, lineHeight: 1 }}>
              <span style={{ color: '#E8740C' }}>Tezz</span>
              <span style={{ color: '#0D3B6E' }}>Nirmaan</span>
            </div>
            <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7, margin: '0 0 20px', maxWidth: 220 }}>
              Hardware, construction materials &amp; home improvement supplies from
              local shops — delivered in 60 minutes across Bihar.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <a
                href="https://play.google.com/store"
                target="_blank" rel="noopener noreferrer"
                style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 16px', borderRadius:8, background:'#0f172a', color:'#fff', fontSize:13, fontWeight:600, textDecoration:'none', transition:'background 0.15s' }}
                onMouseOver={e => e.currentTarget.style.background='#1e293b'}
                onMouseOut={e  => e.currentTarget.style.background='#0f172a'}
              >
                <span style={{ fontSize: 14 }}>▶</span> Google Play
              </a>
              <a
                href="https://apps.apple.com"
                target="_blank" rel="noopener noreferrer"
                style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 16px', borderRadius:8, background:'#0f172a', color:'#fff', fontSize:13, fontWeight:600, textDecoration:'none', transition:'background 0.15s' }}
                onMouseOver={e => e.currentTarget.style.background='#1e293b'}
                onMouseOut={e  => e.currentTarget.style.background='#0f172a'}
              >
                <span style={{ fontSize: 15 }}>⊕</span> App Store
              </a>
            </div>
          </div>

          {/* Column 2 — Categories */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>Categories</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {CATS.map(cat => (
                <FooterLink key={cat} href={`/?cat=${encodeURIComponent(cat)}#products`}>{cat}</FooterLink>
              ))}
            </div>
          </div>

          {/* Column 3 — Cities */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>Cities</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {CITIES.map(city => (
                <FooterLink key={city} href={`/?city=${city.toLowerCase()}`}>{city}</FooterLink>
              ))}
            </div>
          </div>

          {/* Column 4 — Company */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>Company</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {COMPANY_LINKS.map(link => (
                <FooterLink key={link.href} href={link.href}>{link.label}</FooterLink>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div style={{
        borderTop: '1px solid #f1f5f9', padding: '16px 40px',
        maxWidth: 1280, margin: '0 auto',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>
          © {new Date().getFullYear()} TezzNirmaan. All rights reserved.
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>
          Made in Bihar 🇮🇳
        </div>
      </div>
    </footer>
  );
}
