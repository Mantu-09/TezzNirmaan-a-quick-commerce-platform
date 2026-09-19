// blog/[slug]/page.jsx — P16-5 Blog article page
import Link from 'next/link';
import { notFound } from 'next/navigation';

const ARTICLES = {
  'how-to-choose-cement-grade-bihar': {
    title: 'How to Choose the Right Cement Grade for Construction in Bihar',
    date: '2024-08-15', readTime: '5 min', category: 'Cement', icon: '🏗️',
    description: 'OPC 53, OPC 43, or PPC — which cement grade is right for your Bihar construction project?',
    content: [
      { type: 'h2', text: 'Understanding Cement Grades' },
      { type: 'p', text: 'Cement comes in multiple grades in India — OPC 33, OPC 43, OPC 53, and PPC. Each has different compressive strength and is suited for different types of construction work.' },
      { type: 'h2', text: 'OPC 53 — For RCC and High-Strength Work' },
      { type: 'p', text: 'OPC 53 Grade cement achieves 53 N/mm² compressive strength in 28 days. Use it for: RCC columns, beams, slabs, foundations, pre-stressed concrete. Most builders in Muzaffarpur and Patna use JK Cement 53 Grade or Ultratech OPC 53 for structural work.' },
      { type: 'h2', text: 'OPC 43 — For Plastering and Non-Structural Work' },
      { type: 'p', text: 'OPC 43 Grade achieves 43 N/mm² and is cheaper than OPC 53. Ideal for: masonry work (brick laying), plastering, flooring work, non-load-bearing walls. It sets slightly slower, giving masons more working time.' },
      { type: 'h2', text: 'PPC — Best Choice for Bihar\'s Climate' },
      { type: 'p', text: 'Portland Pozzolana Cement (PPC) contains fly ash and is excellent for Bihar\'s humid climate. Benefits: lower heat of hydration (less cracking in hot summers), better sulfate resistance, good for mass concrete. Recommended for: water tanks, underground structures, basement work.' },
      { type: 'h2', text: 'Price Comparison in Bihar (August 2024)' },
      { type: 'table', headers: ['Grade', 'Brand', 'Price/Bag (50kg)', 'Best For'], rows: [
        ['OPC 53', 'JK Cement', 'Rs. 380-420', 'RCC, foundations'],
        ['OPC 53', 'Ultratech', 'Rs. 390-430', 'Structural work'],
        ['PPC', 'Ambuja Plus', 'Rs. 350-390', 'General construction'],
        ['PPC', 'ACC Gold', 'Rs. 360-400', 'Humid environments'],
      ]},
      { type: 'h2', text: 'Our Recommendation' },
      { type: 'p', text: 'For most Bihar construction projects: Use OPC 53 for all RCC work (pillars, beams, slabs). Use PPC for plastering and brick masonry. This combination gives you structural strength where needed and cost savings on finishing work.' },
      { type: 'cta', text: 'Order Cement in Your City', href: '/?city=muzaffarpur' },
    ],
  },
  'monsoon-waterproofing-tips-bihar': {
    title: 'Monsoon Waterproofing: Protect Your Home in Bihar\'s Rainy Season',
    date: '2024-07-20', readTime: '6 min', category: 'Paints & Waterproofing', icon: '🌧️',
    description: 'Bihar receives heavy rainfall from June to September. Best waterproofing products and techniques.',
    content: [
      { type: 'h2', text: 'Why Waterproofing is Critical in Bihar' },
      { type: 'p', text: 'Bihar receives 1000-1500mm of rainfall annually, concentrated in June-September. Without proper waterproofing, water seeps into walls, damages plaster, causes efflorescence (white salt deposits) and eventually structural damage.' },
      { type: 'h2', text: 'Roof Waterproofing: Your #1 Priority' },
      { type: 'p', text: 'Flat RCC roofs are most vulnerable. Apply: 1. Brush coat of SBR latex modified cement slurry. 2. Dr. Fixit Roofseal or Pidilite Dr. Fixit 2-component waterproofing membrane. 3. Protective screed (50mm lean concrete). Cost: approximately Rs. 80-120 per sq.ft.' },
      { type: 'h2', text: 'External Wall Waterproofing' },
      { type: 'p', text: 'Use Weathershield or Apex Ultima exterior paints with built-in waterproofing properties. Apply 2 coats after a coat of Asian Paints Damp Proof primer. These paints have 7-10 year warranties against dampness.' },
      { type: 'h2', text: 'Basement & Underground Water Tank Waterproofing' },
      { type: 'p', text: 'Apply Krystol Internal Membrane (KIM) — a crystalline waterproofing admixture added to concrete mix. For existing structures, use Dr. Fixit Brushbond RFX applied in 2 coats.' },
      { type: 'h2', text: 'Products Available on TezzNirmaan' },
      { type: 'p', text: 'We stock all major waterproofing products: Dr. Fixit, Pidilite, Sika, Asian Paints Damp Proof. Order before the monsoon arrives — typically stock runs short in June.' },
      { type: 'cta', text: 'Shop Waterproofing Products', href: '/category/paints' },
    ],
  },
  'asian-paints-vs-berger-which-is-better': {
    title: 'Asian Paints vs Berger Paints: Which Should You Choose in Bihar?',
    date: '2024-06-10', readTime: '4 min', category: 'Paints', icon: '🎨',
    description: 'Detailed price and quality comparison of the two most popular paint brands in Bihar.',
    content: [
      { type: 'h2', text: 'Brand Overview' },
      { type: 'p', text: 'Asian Paints is India\'s #1 paint brand with 60%+ market share. Berger Paints is #2, known for excellent durability and often preferred by contractors for its value-for-money products.' },
      { type: 'h2', text: 'Interior Paints Comparison' },
      { type: 'table', headers: ['Product', 'Asian Paints', 'Berger', 'Best Choice'], rows: [
        ['Economy Emulsion', 'Tractor Emulsion (Rs. 180/L)', 'Easy Clean (Rs. 170/L)', 'Berger (price)'],
        ['Premium Emulsion', 'Royale Shyne (Rs. 340/L)', 'Silk Glamour (Rs. 320/L)', 'Asian (finish)'],
        ['Distemper', 'Tractor Distemper (Rs. 80/kg)', 'Rangoli (Rs. 75/kg)', 'Berger (price)'],
      ]},
      { type: 'h2', text: 'Exterior Paints Comparison' },
      { type: 'table', headers: ['Product', 'Asian Paints', 'Berger', 'Best Choice'], rows: [
        ['Weather Resistant', 'Apex Ultima (Rs. 280/L)', 'WeatherCoat (Rs. 260/L)', 'Both excellent'],
        ['Texture Paint', 'Royale Texture (Rs. 95/kg)', 'Bison Panel (Rs. 88/kg)', 'Berger (price)'],
      ]},
      { type: 'h2', text: 'Our Verdict' },
      { type: 'p', text: 'For most Bihar homeowners: Use Asian Paints for living room and bedrooms where finish quality matters. Use Berger for exterior and utility areas for better value. Both brands have excellent dealer networks in Muzaffarpur, Patna, Bhagalpur and Gaya.' },
      { type: 'cta', text: 'Order Paints in 60 Minutes', href: '/category/paints' },
    ],
  },
  'plumbing-pipe-types-cpvc-upvc-gi': {
    title: 'CPVC vs uPVC vs GI Pipes: What Should You Use?',
    date: '2024-05-25', readTime: '5 min', category: 'Plumbing', icon: '🔧',
    description: 'Which pipe material is best for hot water, cold water and drainage in Indian construction.',
    content: [
      { type: 'h2', text: 'The Three Main Pipe Types' },
      { type: 'p', text: 'Most residential construction in Bihar uses three types of pipes: CPVC (hot water), uPVC (cold water and drainage), and GI (galvanized iron, being phased out). Choosing wrong can cause leaks, contamination, or early failure.' },
      { type: 'h2', text: 'CPVC — For Hot Water Lines' },
      { type: 'p', text: 'Chlorinated PVC handles temperatures up to 93°C. Use for: hot water supply lines from geyser/boiler, solar water heater lines, kitchen hot water supply. Top brands: Astral CPVC, Supreme CPVC, Finolex CPVC. Price: Rs. 85-120 per foot (15mm).' },
      { type: 'h2', text: 'uPVC — For Cold Water and Drainage' },
      { type: 'p', text: 'Unplasticized PVC is rigid, corrosion-free and ideal for cold water. Use for: main water supply lines, overhead tank lines, drainage and sewage. Top brands: Astral uPVC, Prince Pipes, Wavin. Price: Rs. 40-65 per foot (20mm).' },
      { type: 'h2', text: 'GI Pipes — Being Phased Out' },
      { type: 'p', text: 'Galvanized Iron pipes rust internally over time, reducing water flow and contaminating drinking water. Avoid using GI for new construction. Use CPVC or uPVC instead. GI is only still used for gas lines and fire fighting systems where mandated.' },
      { type: 'cta', text: 'Order Plumbing Supplies', href: '/category/plumbing' },
    ],
  },
  'electrical-wire-selection-guide-india': {
    title: 'Electrical Wire Selection Guide for Home Construction in Bihar',
    date: '2024-04-18', readTime: '6 min', category: 'Electrical', icon: '⚡',
    description: 'How to select the correct ISI-marked electrical wires for different circuits in your home.',
    content: [
      { type: 'h2', text: 'Why Wire Selection Matters' },
      { type: 'p', text: 'Undersized wires overheat, cause fires and trip MCBs. Oversized wires waste money. Always buy ISI-marked wires from Finolex, Polycab, Havells or KEI — these meet IS:694 standards.' },
      { type: 'h2', text: 'Wire Size Guide by Circuit' },
      { type: 'table', headers: ['Circuit', 'Wire Size', 'Max Load', 'Use For'], rows: [
        ['Lighting', '1.5 sq.mm', '800W', 'Lights, fans, small appliances'],
        ['Power (15A)', '2.5 sq.mm', '2000W', 'AC units, refrigerator, washing machine'],
        ['Geyser/Oven', '4 sq.mm', '3500W', 'Water heater, microwave oven'],
        ['Main line', '6-10 sq.mm', '5000W+', 'Distribution board incoming supply'],
        ['AC (1-1.5 ton)', '4 sq.mm', '2000W', 'Dedicated AC circuit'],
      ]},
      { type: 'h2', text: 'Brand Comparison' },
      { type: 'p', text: 'All four brands (Finolex, Polycab, Havells, KEI) are ISI-certified. Finolex and Polycab offer the best value for residential work. Havells is premium. KEI is preferred for industrial work. Always check for ISI mark and buy from authorized dealers.' },
      { type: 'h2', text: 'Common Mistakes to Avoid' },
      { type: 'p', text: '1. Never join wires with tape alone — use proper connectors. 2. Always use earth wire (green/yellow) — mandatory for safety. 3. Do not use aluminum wire for internal wiring — it causes loose connections over time. 4. Always use MCBs (miniature circuit breakers), not rewirable fuses.' },
      { type: 'cta', text: 'Order Electrical Supplies', href: '/category/electrical' },
    ],
  },
};

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const article = ARTICLES[slug];
  if (!article) return { title: 'Article Not Found' };
  return {
    title: article.title + ' | TezzNirmaan Blog',
    description: article.description,
    alternates: { canonical: 'https://tezznirmaan.com/blog/' + slug },
    openGraph: { title: article.title, description: article.description },
  };
}

export async function generateStaticParams() {
  return Object.keys(ARTICLES).map(slug => ({ slug }));
}

function renderBlock(block, i) {
  switch (block.type) {
    case 'h2':
      return <h2 key={i} style={{ fontSize: 20, fontWeight: 800, color: '#1f2937', margin: '28px 0 10px' }}>{block.text}</h2>;
    case 'p':
      return <p key={i} style={{ fontSize: 15, color: '#374151', lineHeight: 1.8, margin: '0 0 16px' }}>{block.text}</p>;
    case 'table':
      return (
        <div key={i} style={{ overflowX: 'auto', marginBottom: 20 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {block.headers.map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '2px solid #e5e7eb' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  {row.map((cell, ci) => <td key={ci} style={{ padding: '8px 12px', color: '#374151' }}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'cta':
      return (
        <div key={i} style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 12, padding: '16px 20px', margin: '24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontWeight: 700, color: '#1f2937', fontSize: 15 }}>Ready to order?</span>
          <Link href={block.href} style={{ background: '#f97316', color: '#fff', padding: '10px 20px', borderRadius: 8, fontWeight: 700, textDecoration: 'none', fontSize: 14 }}>{block.text}</Link>
        </div>
      );
    default: return null;
  }
}

export default async function BlogArticlePage({ params }) {
  const { slug } = await params;
  const article = ARTICLES[slug];
  if (!article) notFound();

  const articleSchema = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: article.title,
    description: article.description,
    datePublished: article.date,
    dateModified: article.date,
    author: { '@type': 'Organization', name: 'TezzNirmaan' },
    publisher: { '@type': 'Organization', name: 'TezzNirmaan', url: 'https://tezznirmaan.com' },
    url: 'https://tezznirmaan.com/blog/' + slug,
  };

  return (
    <div style={{ maxWidth: 740, margin: '0 auto', padding: '20px 16px 80px' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />

      {/* Breadcrumb */}
      <nav style={{ fontSize: 13, color: '#9ca3af', marginBottom: 20 }}>
        <Link href="/" style={{ color: '#f97316', textDecoration: 'none' }}>Home</Link>
        {' › '}
        <Link href="/blog" style={{ color: '#f97316', textDecoration: 'none' }}>Blog</Link>
        {' › '}
        <span>{article.category}</span>
      </nav>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ background: '#fff7ed', color: '#ea580c', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>{article.category}</span>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>{article.readTime} read</span>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>
            {new Date(article.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1f2937', margin: '0 0 12px', lineHeight: 1.3 }}>{article.title}</h1>
        <p style={{ fontSize: 15, color: '#6b7280', margin: 0, lineHeight: 1.6 }}>{article.description}</p>
      </div>

      {/* Divider */}
      <hr style={{ border: 'none', borderTop: '1px solid #f3f4f6', marginBottom: 24 }} />

      {/* Article content */}
      <div>
        {article.content.map((block, i) => renderBlock(block, i))}
      </div>

      {/* Footer CTA */}
      <div style={{ marginTop: 40, background: 'linear-gradient(135deg, #1f2937, #374151)', borderRadius: 16, padding: '24px', textAlign: 'center', color: '#fff' }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Need materials delivered?</div>
        <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>60–90 minute delivery across Bihar</div>
        <Link href="/" style={{ display: 'inline-block', background: '#f97316', color: '#fff', padding: '10px 24px', borderRadius: 10, fontWeight: 700, textDecoration: 'none' }}>
          Order Now
        </Link>
      </div>

      <div style={{ marginTop: 20, textAlign: 'center' }}>
        <Link href="/blog" style={{ color: '#f97316', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>← Back to all articles</Link>
      </div>
    </div>
  );
}
