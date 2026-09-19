// (storefront)/refund-policy/page.jsx — P13-6
import Link from 'next/link';

export const metadata = { title: 'Refund & Return Policy' };

export default function RefundPolicyPage() {
  return (
    <div className="sf-wrap">
      <div className="sf-section" style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="sf-breadcrumb" style={{ marginBottom: 24 }}>
          <Link href="/">Home</Link>
          <span className="sf-breadcrumb-sep">›</span>
          <span>Refund Policy</span>
        </div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: 8 }}>Refund & Return Policy</h1>
        <p style={{ color: 'var(--sf-text-3)', marginBottom: 32, fontSize: 14 }}>Last updated: August 2026</p>

        <div style={{ lineHeight: 1.75 }}>
          <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 12, padding: 16, marginBottom: 24 }}>
            <strong>🎯 Our Promise:</strong> If your order has any issue, we will make it right within 24 hours.
          </div>

          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: 12, marginTop: 24 }}>Cancellation Before Delivery</h2>
          <ul style={{ paddingLeft: 20, marginBottom: 16 }}>
            <li><strong>Before rider assigned:</strong> 100% refund to original payment method within 5–7 business days. Cancel anytime within 30 minutes of order.</li>
            <li><strong>After rider assigned:</strong> Cannot be cancelled digitally. Contact our support at <a href="tel:+918000000000" style={{ color: 'var(--sf-primary)' }}>+91-XXXX-XXXXXX</a>.</li>
            <li><strong>COD orders:</strong> No charge — simply refuse delivery at the door.</li>
          </ul>

          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: 12, marginTop: 24 }}>Damaged or Wrong Items</h2>
          <ul style={{ paddingLeft: 20, marginBottom: 16 }}>
            <li><strong>Damaged goods:</strong> Instant wallet credit for full item value. No questions asked. Raise within 24 hours of delivery.</li>
            <li><strong>Wrong item delivered:</strong> Free replacement within 24 hours OR full wallet credit.</li>
            <li><strong>Missing items:</strong> Wallet credit for missing item value within 2 hours of raising complaint.</li>
          </ul>

          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: 12, marginTop: 24 }}>Returns</h2>
          <ul style={{ paddingLeft: 20, marginBottom: 16 }}>
            <li>Returns accepted within 7 days for defective items with original packaging.</li>
            <li>Non-returnable: cut materials, opened cement bags, custom orders, paints opened after mixing.</li>
            <li>Free pickup for return orders above ₹500.</li>
          </ul>

          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: 12, marginTop: 24 }}>Refund Timeline</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--sf-bg)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', border: '1px solid var(--sf-border)' }}>Refund Type</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', border: '1px solid var(--sf-border)' }}>Timeline</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Wallet credit', 'Instant (within 2 hours)'],
                ['UPI refund', '2–3 business days'],
                ['Card refund', '5–7 business days'],
                ['Net banking', '5–7 business days'],
              ].map(([type, time]) => (
                <tr key={type}>
                  <td style={{ padding: '10px 12px', border: '1px solid var(--sf-border)' }}>{type}</td>
                  <td style={{ padding: '10px 12px', border: '1px solid var(--sf-border)' }}>{time}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: 12, marginTop: 24 }}>How to Raise a Complaint</h2>
          <ol style={{ paddingLeft: 20 }}>
            <li>Go to <Link href="/orders" style={{ color: 'var(--sf-primary)' }}>My Orders</Link> → tap the order</li>
            <li>Tap "Report Issue" and select the problem type</li>
            <li>Upload a photo (for damaged/wrong items)</li>
            <li>Our team reviews and responds within 2 hours during business hours</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
