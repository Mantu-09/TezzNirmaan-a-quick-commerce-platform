// ────────────────────────────────────────────────────────────
// TezzNirmaan Privacy Policy — P4-1A
//
// Route: /privacy (via (marketing) route group)
// Legal basis: India's Digital Personal Data Protection Act 2023
// This is a real legal document, not a placeholder.
// ────────────────────────────────────────────────────────────

export const metadata = {
  title: 'Privacy Policy — TezzNirmaan',
  description:
    "Learn how TezzNirmaan collects, uses, and protects your personal data. Your rights under India's DPDP Act 2023.",
  robots: { index: true, follow: true },
};

const EFFECTIVE_DATE = '17 July 2026';
const CONTACT_EMAIL  = 'privacy@tezznirmaan.in';

export default function PrivacyPage() {
  return (
    <>
      {/* ── NAV (reuse marketing nav look) ─────────────────── */}
      <nav className="mkt-nav" aria-label="Site navigation">
        <div className="mkt-container mkt-nav-inner">
          <a href="/" className="mkt-logo" style={{ textDecoration: 'none' }}>
            Tezz<span>Nirmaan</span>
          </a>
          <a href="/" className="mkt-nav-link" style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
            ← Back to home
          </a>
        </div>
      </nav>

      {/* ── LEGAL CONTENT ─────────────────────────────────── */}
      <main className="mkt-legal-page" id="main-content">
        <div className="mkt-container">
          <div className="mkt-legal-inner">

            <header className="mkt-legal-header">
              <p className="mkt-legal-tag">Legal</p>
              <h1 className="mkt-legal-title">Privacy Policy</h1>
              <p className="mkt-legal-meta">
                Effective date: <strong>{EFFECTIVE_DATE}</strong> &nbsp;·&nbsp;
                Governing law: Laws of India &nbsp;·&nbsp;
                Jurisdiction: Courts of Patna, Bihar
              </p>
              <p className="mkt-legal-intro">
                This Privacy Policy explains how <strong>TezzNirmaan</strong> ("we", "us", "our") 
                collects, uses, shares, and protects your personal data when you use our mobile 
                application, website, or any related services (collectively, the "Platform"). We 
                have written this in plain English so you can actually understand it. A Hindi 
                translation is coming soon.
              </p>
              <div className="mkt-legal-note">
                <strong>Note on DPDP Act 2023:</strong> This policy is framed in accordance with 
                India's Digital Personal Data Protection Act, 2023 ("DPDP Act"). You are a "Data 
                Principal" under this Act, and TezzNirmaan is the "Data Fiduciary."
              </div>
            </header>

            {/* 1 — What we collect */}
            <section className="mkt-legal-section">
              <h2 className="mkt-legal-h2">1. What Personal Data We Collect</h2>
              <p>We collect only the data we actually need to operate the Platform. Here is exactly what we collect and why we need it:</p>

              <div className="mkt-legal-table-wrap">
                <table className="mkt-legal-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Why we collect it</th>
                      <th>Collected when?</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Mobile phone number</strong></td>
                      <td>OTP-based authentication — we use your phone number as your account identity</td>
                      <td>Account registration / login</td>
                    </tr>
                    <tr>
                      <td><strong>Full name</strong> (optional)</td>
                      <td>Displayed to shop and rider for order handoff; used in payment prefill</td>
                      <td>Profile setup</td>
                    </tr>
                    <tr>
                      <td><strong>Delivery addresses</strong></td>
                      <td>Required to dispatch orders to your construction site or home</td>
                      <td>When you save an address</td>
                    </tr>
                    <tr>
                      <td><strong>Order history</strong></td>
                      <td>Order fulfillment, dispute resolution, reorder convenience, accounting records</td>
                      <td>Each order placement</td>
                    </tr>
                    <tr>
                      <td><strong>Device push notification token</strong></td>
                      <td>Sending order status updates (e.g., "Your cement is on the way") directly to your device</td>
                      <td>When you grant notification permission</td>
                    </tr>
                    <tr>
                      <td><strong>Approximate location</strong></td>
                      <td>Identifying the nearest shops within your delivery radius; displaying your rider's real-time position</td>
                      <td>When you browse shops or track an order (foreground only)</td>
                    </tr>
                    <tr>
                      <td><strong>Payment instrument tokens</strong></td>
                      <td>Processed entirely by Razorpay — we receive only an anonymised order ID and payment status, never your card or UPI details</td>
                      <td>At checkout</td>
                    </tr>
                    <tr>
                      <td><strong>In-app wallet balance & transactions</strong></td>
                      <td>Managing your TezzWallet credits, cashback, and refunds</td>
                      <td>When wallet is credited or debited</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="mkt-legal-h3">What we do NOT collect</h3>
              <ul className="mkt-legal-list">
                <li>We do not collect your Aadhaar number, PAN, or any government ID.</li>
                <li>We do not track your location in the background when the app is closed.</li>
                <li>We do not read your contacts, SMS, call logs, or camera roll.</li>
                <li>We do not sell your data to advertisers. Ever.</li>
              </ul>
            </section>

            {/* 2 — How we use it */}
            <section className="mkt-legal-section">
              <h2 className="mkt-legal-h2">2. How We Use Your Data</h2>
              <p>We use your personal data only for the following purposes:</p>
              <ul className="mkt-legal-list">
                <li>
                  <strong>Order fulfillment:</strong> Your address and phone number are shared with 
                  the fulfilling shop and assigned rider so they can pick, pack, and deliver your order.
                </li>
                <li>
                  <strong>SMS notifications:</strong> We send transactional SMS messages (order 
                  confirmed, OTP, rider assigned) via Fast2SMS. No promotional SMS without your 
                  explicit consent.
                </li>
                <li>
                  <strong>Push notifications:</strong> Real-time order status alerts via Expo Push 
                  Notifications. You can disable these in your device settings at any time.
                </li>
                <li>
                  <strong>Improving delivery accuracy:</strong> Aggregated, anonymised location data 
                  helps us optimise which shops serve which delivery zones.
                </li>
                <li>
                  <strong>Fraud prevention:</strong> Order history and device signals help us detect 
                  and block fraudulent promo code usage and fake accounts.
                </li>
                <li>
                  <strong>Customer support:</strong> When you raise a dispute or refund request, we 
                  access your order history to resolve it.
                </li>
                <li>
                  <strong>Legal and accounting compliance:</strong> Order and payment records are 
                  retained as required by Indian tax and commercial law.
                </li>
              </ul>
            </section>

            {/* 3 — Third-party sharing */}
            <section className="mkt-legal-section">
              <h2 className="mkt-legal-h2">3. What We Share with Third Parties</h2>
              <p>
                We share the minimum necessary data with the following third-party service providers. 
                We do not sell your personal data to any third party.
              </p>

              <div className="mkt-legal-table-wrap">
                <table className="mkt-legal-table">
                  <thead>
                    <tr>
                      <th>Third Party</th>
                      <th>What is shared</th>
                      <th>Purpose</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Razorpay</strong> (Payment gateway)</td>
                      <td>Name, email, phone number, order amount</td>
                      <td>Processing UPI, card, and net banking payments</td>
                    </tr>
                    <tr>
                      <td><strong>Fast2SMS</strong> (SMS gateway)</td>
                      <td>Phone number, OTP or order status text</td>
                      <td>Sending transactional SMS messages</td>
                    </tr>
                    <tr>
                      <td><strong>Expo</strong> (Push notification infrastructure)</td>
                      <td>Device push token, notification payload</td>
                      <td>Delivering in-app push notifications</td>
                    </tr>
                    <tr>
                      <td><strong>Google Maps / Mapbox</strong> (Route optimisation)</td>
                      <td>Delivery address coordinates, rider coordinates</td>
                      <td>Calculating optimal delivery routes</td>
                    </tr>
                    <tr>
                      <td><strong>Supabase</strong> (Database infrastructure)</td>
                      <td>All user and order data</td>
                      <td>Storing and serving platform data; servers are located in AWS ap-south-1 (Mumbai)</td>
                    </tr>
                    <tr>
                      <td><strong>Partner Shops</strong> (Local hardware shops)</td>
                      <td>Your name, phone, delivery address, order details</td>
                      <td>The shop needs this to pick, pack, and hand over to the rider</td>
                    </tr>
                    <tr>
                      <td><strong>Delivery Riders</strong></td>
                      <td>Your name, phone, delivery address</td>
                      <td>The rider needs this to navigate to your location and contact you</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p>
                We may also disclose your data if required by law, court order, or to protect the 
                rights and safety of our users, employees, or the public.
              </p>
            </section>

            {/* 4 — Retention */}
            <section className="mkt-legal-section">
              <h2 className="mkt-legal-h2">4. Data Retention</h2>
              <ul className="mkt-legal-list">
                <li>
                  <strong>Order and payment data:</strong> Retained for <strong>7 years</strong> 
                  from the date of transaction, as required under the Indian Accounting Standards 
                  and GST record-keeping rules.
                </li>
                <li>
                  <strong>Account data (name, phone, addresses):</strong> Retained while your 
                  account is active. Upon a verified account deletion request, account data is 
                  purged within <strong>30 days</strong>. Order records are retained separately for 
                  the accounting period above.
                </li>
                <li>
                  <strong>Push tokens:</strong> Deleted immediately when you uninstall the app or 
                  disable notifications.
                </li>
                <li>
                  <strong>Location data:</strong> Not persistently stored. Rider location is 
                  streamed in real-time during an active order and is not retained after delivery.
                </li>
              </ul>
            </section>

            {/* 5 — User rights (DPDP Act) */}
            <section className="mkt-legal-section">
              <h2 className="mkt-legal-h2">5. Your Rights Under the DPDP Act 2023</h2>
              <p>
                As a Data Principal under India's Digital Personal Data Protection Act 2023, you 
                have the following rights. To exercise any of them, email us at{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="mkt-legal-link">{CONTACT_EMAIL}</a>.
              </p>

              <ul className="mkt-legal-list">
                <li>
                  <strong>Right to access:</strong> You can request a copy of the personal data we 
                  hold about you. We will respond within 30 days.
                </li>
                <li>
                  <strong>Right to correction:</strong> You can update your name, phone number, and 
                  delivery addresses directly in the app. For other corrections, email us.
                </li>
                <li>
                  <strong>Right to erasure ("Right to be Forgotten"):</strong> You can request 
                  deletion of your account and personal data. We will delete account data within 30 
                  days, subject to our legal retention obligations for order and payment records.
                </li>
                <li>
                  <strong>Right to grievance redressal:</strong> If you believe we have handled 
                  your data improperly, you may raise a complaint with our Grievance Officer (see 
                  below) or with the Data Protection Board of India once it is constituted.
                </li>
                <li>
                  <strong>Right to withdraw consent:</strong> Where we process data based on your 
                  consent (e.g., push notifications), you may withdraw consent at any time through 
                  your device settings or by contacting us.
                </li>
                <li>
                  <strong>Right to nominate:</strong> You may nominate another individual to 
                  exercise these rights on your behalf in the event of your death or incapacity.
                </li>
              </ul>
            </section>

            {/* 6 — Security */}
            <section className="mkt-legal-section">
              <h2 className="mkt-legal-h2">6. How We Protect Your Data</h2>
              <ul className="mkt-legal-list">
                <li>All data is encrypted in transit using TLS 1.2+.</li>
                <li>Supabase enforces Row Level Security (RLS) — users can only access their own data.</li>
                <li>Payment card data never touches our servers — Razorpay handles PCI DSS compliance.</li>
                <li>API keys and secrets are stored in environment variables, never in source code.</li>
                <li>Access to the production database is restricted to authorised team members only.</li>
              </ul>
            </section>

            {/* 7 — Children */}
            <section className="mkt-legal-section">
              <h2 className="mkt-legal-h2">7. Children's Privacy</h2>
              <p>
                TezzNirmaan is intended for users aged 18 and above (or with verifiable parental 
                consent). We do not knowingly collect data from anyone under the age of 18. If you 
                believe a minor has created an account, please contact us immediately.
              </p>
            </section>

            {/* 8 — Changes */}
            <section className="mkt-legal-section">
              <h2 className="mkt-legal-h2">8. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy as the Platform evolves or as Indian law requires. 
                When we do, we will update the "Effective date" at the top and, for material changes, 
                notify you via the app. Your continued use of the Platform after the effective date 
                constitutes acceptance of the updated policy.
              </p>
            </section>

            {/* 9 — Contact */}
            <section className="mkt-legal-section">
              <h2 className="mkt-legal-h2">9. Contact & Grievance Officer</h2>
              <p>For any privacy-related questions, requests, or complaints:</p>
              <div className="mkt-legal-contact-card">
                <p><strong>TezzNirmaan</strong></p>
                <p>Grievance Officer: Founder & CEO</p>
                <p>
                  Email:{' '}
                  <a href={`mailto:${CONTACT_EMAIL}`} className="mkt-legal-link">
                    {CONTACT_EMAIL}
                  </a>
                </p>
                <p>Address: Patna, Bihar, India</p>
                <p>Response time: Within 30 days of receipt</p>
              </div>
            </section>

          </div>
        </div>
      </main>

      {/* ── FOOTER ─────────────────────────────────────────── */}
      <footer className="mkt-footer" aria-label="Site footer">
        <div className="mkt-container">
          <div className="mkt-footer-bottom">
            <div className="mkt-footer-copy">
              © {new Date().getFullYear()} TezzNirmaan. All rights reserved.
            </div>
            <div className="mkt-footer-links" style={{ display: 'flex', gap: '20px' }}>
              <a href="/privacy" className="mkt-footer-link">Privacy Policy</a>
              <a href="/terms"   className="mkt-footer-link">Terms of Service</a>
              <a href={`mailto:${CONTACT_EMAIL}`} className="mkt-footer-link">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
