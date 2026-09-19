// blog/page.jsx — P16-5 Blog Engine (SEO content for Bihar construction)
import Link from 'next/link';

export const metadata = {
  title: 'Construction Tips & Hardware Guide | TezzNirmaan Blog',
  description: 'Expert advice on construction materials, cement mixing ratios, paint selection, waterproofing and more. Bihar\'s trusted hardware delivery blog.',
  alternates: { canonical: 'https://tezznirmaan.com/blog' },
};

export const revalidate = 86400; // 24h ISR

const ARTICLES = [
  {
    slug: 'how-to-choose-cement-grade-bihar',
    title: 'How to Choose the Right Cement Grade for Construction in Bihar',
    excerpt: 'OPC 53, OPC 43, or PPC — which cement grade is right for your Bihar construction project? We break down the differences with practical advice from local engineers.',
    date: '2024-08-15',
    readTime: '5 min',
    category: 'Cement',
    icon: '🏗️',
  },
  {
    slug: 'monsoon-waterproofing-tips-bihar',
    title: 'Monsoon Waterproofing: Protect Your Home in Bihar\'s Rainy Season',
    excerpt: 'Bihar receives heavy rainfall from June to September. Here are the best waterproofing products and techniques to protect your walls, roof and foundation.',
    date: '2024-07-20',
    readTime: '6 min',
    category: 'Paints & Waterproofing',
    icon: '🌧️',
  },
  {
    slug: 'asian-paints-vs-berger-which-is-better',
    title: 'Asian Paints vs Berger Paints: Which Should You Choose in Bihar?',
    excerpt: 'A detailed price and quality comparison of the two most popular paint brands available in Muzaffarpur, Patna, Bhagalpur and Gaya — with local pricing.',
    date: '2024-06-10',
    readTime: '4 min',
    category: 'Paints',
    icon: '🎨',
  },
  {
    slug: 'plumbing-pipe-types-cpvc-upvc-gi',
    title: 'CPVC vs uPVC vs GI Pipes: What Should You Use?',
    excerpt: 'Confused about plumbing pipe types? This guide explains which pipe material is best for hot water, cold water and drainage in Indian construction.',
    date: '2024-05-25',
    readTime: '5 min',
    category: 'Plumbing',
    icon: '🔧',
  },
  {
    slug: 'electrical-wire-selection-guide-india',
    title: 'Electrical Wire Selection Guide for Home Construction in Bihar',
    excerpt: 'Choosing the wrong wire gauge can cause fires. Learn how to select the correct ISI-marked electrical wires for different circuits in your home.',
    date: '2024-04-18',
    readTime: '6 min',
    category: 'Electrical',
    icon: '⚡',
  },
];

export default function BlogPage() {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 16px 80px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#1f2937', margin: '0 0 10px' }}>
          TezzNirmaan Construction Blog
        </h1>
        <p style={{ color: '#6b7280', fontSize: 15, margin: 0 }}>
          Expert tips on construction materials, hardware and home improvement for Bihar
        </p>
      </div>

      {/* Articles grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {ARTICLES.map((article) => (
          <Link key={article.slug} href={`/blog/${article.slug}`} style={{ textDecoration: 'none' }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: '20px 22px', boxShadow: '0 1px 6px rgba(0,0,0,.06)', border: '1.5px solid #f3f4f6', transition: 'border-color .2s, box-shadow .2s', cursor: 'pointer' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                {/* Icon */}
                <div style={{ width: 48, height: 48, background: '#fff7ed', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                  {article.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Meta */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ background: '#fff7ed', color: '#ea580c', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
                      {article.category}
                    </span>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>{article.readTime} read</span>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>
                      {new Date(article.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1f2937', margin: '0 0 6px', lineHeight: 1.4 }}>
                    {article.title}
                  </h2>
                  <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.6 }}>
                    {article.excerpt}
                  </p>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* CTA */}
      <div style={{ marginTop: 36, background: '#f9fafb', borderRadius: 16, padding: '20px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1f2937', marginBottom: 8 }}>
          Need construction materials in Bihar?
        </div>
        <Link href="/" style={{ display: 'inline-block', background: '#f97316', color: '#fff', padding: '10px 24px', borderRadius: 10, fontWeight: 700, textDecoration: 'none', fontSize: 14 }}>
          Order Now — 60 Min Delivery
        </Link>
      </div>
    </div>
  );
}
