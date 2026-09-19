// (storefront)/city/[slug]/page.jsx — P16-3
import Link from 'next/link';
import { notFound } from 'next/navigation';

const CITY_DATA = {
  muzaffarpur: {
    name: 'Muzaffarpur', state: 'Bihar',
    description: 'Order cement, paint, tiles, plumbing and electrical supplies from local hardware shops in Muzaffarpur. Delivered in 60-90 minutes.',
    pinCodes: ['842001','842002','842003','842004'],
    areas: ['Juran Chapra','Mithanpura','Brahampura','Ramna Road','Ahiyapur','Kazi Mohammadpur'],
    phone: '+91 9876543210',
    coords: { lat: 26.1209, lng: 85.3647 },
    faq: [
      { q: 'Does TezzNirmaan deliver in Muzaffarpur?', a: 'Yes! We deliver to all major areas of Muzaffarpur including Juran Chapra, Mithanpura, Brahampura and more.' },
      { q: 'How fast is delivery in Muzaffarpur?', a: 'We deliver within 60-90 minutes from local hardware shops.' },
      { q: 'Can I order cement in bulk in Muzaffarpur?', a: 'Yes, bulk orders above Rs.10,000 qualify for free delivery. B2B contractors can apply for credit.' },
    ],
  },
  patna: {
    name: 'Patna', state: 'Bihar',
    description: 'Order construction materials from local hardware shops in Patna. Cement, paint, tiles, plumbing and electrical supplies delivered in 60-90 minutes.',
    pinCodes: ['800001','800002','800003','800004','800020'],
    areas: ['Boring Road','Patliputra Colony','Kankarbagh','Rajendra Nagar','Danapur','Phulwari Sharif'],
    phone: '+91 9876543210',
    coords: { lat: 25.5941, lng: 85.1376 },
    faq: [
      { q: 'Does TezzNirmaan deliver in Patna?', a: 'Yes! We serve all major areas of Patna.' },
      { q: 'What construction materials are available in Patna?', a: 'Cement, tiles, paint, plumbing pipes, electrical wires, hardware tools and more from verified local shops.' },
      { q: 'Is same-day delivery available in Patna?', a: 'Yes, we deliver within 60-90 minutes anywhere in Patna during 7 AM - 9 PM.' },
    ],
  },
  bhagalpur: {
    name: 'Bhagalpur', state: 'Bihar',
    description: 'Order cement, paint, tiles and hardware supplies from local shops in Bhagalpur. Delivered in 60-90 minutes.',
    pinCodes: ['812001','812002','812003'],
    areas: ['Adampur','Tatarpur','Champanagar','Khalifabagh','Sabour'],
    phone: '+91 9876543210',
    coords: { lat: 25.2425, lng: 86.9842 },
    faq: [
      { q: 'Does TezzNirmaan deliver in Bhagalpur?', a: 'Yes! We deliver to all major areas of Bhagalpur from local hardware shops.' },
      { q: 'Can I order paint online in Bhagalpur?', a: 'Yes, we stock Asian Paints, Berger, Dulux and more. Delivered in 60-90 minutes.' },
    ],
  },
  gaya: {
    name: 'Gaya', state: 'Bihar',
    description: 'Order construction materials and building supplies online in Gaya. Delivered from local shops in 60-90 minutes.',
    pinCodes: ['823001','823002','823003'],
    areas: ['Kotwali','Rampur','Sherghati','Bodh Gaya','Manpur'],
    phone: '+91 9876543210',
    coords: { lat: 24.7955, lng: 85.0002 },
    faq: [
      { q: 'Does TezzNirmaan deliver in Gaya?', a: 'Yes! We deliver construction materials to Gaya and nearby areas.' },
      { q: 'Is TezzNirmaan available in Bodh Gaya?', a: 'Yes, we serve Bodh Gaya as part of our Gaya delivery zone.' },
    ],
  },
};

const CATEGORIES = [
  { slug: 'construction', name: 'Cement & Sand', icon: '??' },
  { slug: 'paints',       name: 'Paints',        icon: '??' },
  { slug: 'tiles',        name: 'Tiles',         icon: '??' },
  { slug: 'plumbing',     name: 'Plumbing',      icon: '??' },
  { slug: 'electrical',   name: 'Electrical',    icon: '??' },
  { slug: 'hardware',     name: 'Hardware',      icon: '??' },
];

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const city = CITY_DATA[slug];
  if (!city) return { title: 'City Not Found' };
  return {
    title: 'Hardware & Construction Materials in ' + city.name + ' | TezzNirmaan',
    description: city.description,
    alternates: { canonical: 'https://tezznirmaan.com/city/' + slug },
    openGraph: { title: 'TezzNirmaan ' + city.name + ' — Fast Hardware Delivery', description: city.description },
  };
}

export async function generateStaticParams() {
  return Object.keys(CITY_DATA).map(slug => ({ slug }));
}

export default async function CityLandingPage({ params }) {
  const { slug } = await params;
  const city = CITY_DATA[slug];
  if (!city) notFound();

  const localBizSchema = {
    '@context': 'https://schema.org', '@type': 'LocalBusiness',
    name: 'TezzNirmaan ' + city.name,
    description: city.description,
    telephone: city.phone,
    address: { '@type': 'PostalAddress', addressLocality: city.name, addressRegion: city.state, addressCountry: 'IN' },
    geo: { '@type': 'GeoCoordinates', latitude: city.coords.lat, longitude: city.coords.lng },
    url: 'https://tezznirmaan.com/city/' + slug,
    openingHoursSpecification: { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'], opens: '07:00', closes: '21:00' },
  };

  const faqSchema = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: city.faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };

  return (
    <div className="sf-wrap" style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px 80px' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBizSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      <div style={{ background: 'linear-gradient(135deg, #1f2937 0%, #374151 100%)', borderRadius: 20, padding: '36px 28px', margin: '20px 0', color: '#fff' }}>
        <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>TezzNirmaan &middot; {city.state}</div>
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: '0 0 12px', lineHeight: 1.2 }}>
          Hardware &amp; Construction Materials in {city.name}
        </h1>
        <p style={{ fontSize: 15, color: '#d1d5db', margin: '0 0 24px', lineHeight: 1.6 }}>{city.description}</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href={"/?city=" + slug} style={{ background: '#f97316', color: '#fff', padding: '12px 24px', borderRadius: 10, fontWeight: 700, textDecoration: 'none', fontSize: 15 }}>
            Shop Now in {city.name}
          </Link>
          <Link href="/b2b" style={{ background: 'rgba(255,255,255,.1)', color: '#fff', padding: '12px 24px', borderRadius: 10, fontWeight: 700, textDecoration: 'none', fontSize: 15, border: '1px solid rgba(255,255,255,.2)' }}>
            B2B / Contractor
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
        {[{ icon: '??', label: 'Delivery Time', value: '60-90 min' }, { icon: '??', label: 'Local Shops', value: '10+ verified' }, { icon: '??', label: 'Categories', value: '6+ types' }].map(s => (
          <div key={s.label} style={{ background: '#fff', borderRadius: 14, padding: '16px 12px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#1f2937' }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 14px', color: '#1f2937' }}>Shop by Category in {city.name}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 32 }}>
        {CATEGORIES.map(cat => (
          <Link key={cat.slug} href={"/category/" + cat.slug + "?city=" + slug} style={{ background: '#fff', borderRadius: 14, padding: '18px 12px', textAlign: 'center', textDecoration: 'none', boxShadow: '0 1px 4px rgba(0,0,0,.06)', border: '1.5px solid #f3f4f6' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{cat.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#1f2937' }}>{cat.name}</div>
            <div style={{ fontSize: 12, color: '#f97316', marginTop: 4, fontWeight: 600 }}>Shop</div>
          </Link>
        ))}
      </div>

      <div style={{ background: '#f9fafb', borderRadius: 16, padding: '20px 24px', marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 12px', color: '#1f2937' }}>Areas We Serve in {city.name}</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {city.areas.map(area => (
            <span key={area} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: '4px 14px', fontSize: 13, color: '#374151' }}>
              {area}
            </span>
          ))}
        </div>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 12, marginBottom: 0 }}>Pin codes served: {city.pinCodes.join(', ')} and surrounding areas.</p>
      </div>

      <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 14px', color: '#1f2937' }}>FAQs - {city.name}</h2>
      <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 28, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        {city.faq.map((item, i) => (
          <div key={i} style={{ padding: '16px 20px', borderBottom: i < city.faq.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1f2937', marginBottom: 6 }}>{item.q}</div>
            <div style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>{item.a}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', borderRadius: 16, padding: '24px 28px', textAlign: 'center', color: '#fff' }}>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Ready to order in {city.name}?</div>
        <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 16 }}>60-90 minute delivery &middot; 10+ local shops &middot; Best prices</div>
        <Link href={"/?city=" + slug} style={{ display: 'inline-block', background: '#fff', color: '#f97316', padding: '12px 28px', borderRadius: 10, fontWeight: 800, textDecoration: 'none', fontSize: 15 }}>
          Start Shopping
        </Link>
      </div>
    </div>
  );
}