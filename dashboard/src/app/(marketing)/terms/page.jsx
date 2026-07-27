// ────────────────────────────────────────────────────────────
// TezzNirmaan Terms of Service — P4-1A
//
// Route: /terms (via (marketing) route group)
// Governing law: Laws of India, Jurisdiction: Patna, Bihar
// This is a real legal document, not a placeholder.
// ────────────────────────────────────────────────────────────

export const metadata = {
  title: 'Terms of Service — TezzNirmaan',
  description:
    'TezzNirmaan Terms of Service — platform usage, order policy, cancellation, refunds, liability, and dispute resolution.',
  robots: { index: true, follow: true },
};

const EFFECTIVE_DATE  = '17 July 2026';
const SUPPORT_EMAIL   = 'support@tezznirmaan.in';
const LEGAL_EMAIL     = 'legal@tezznirmaan.in';

export default function TermsPage() {
  return (
    <>
      {/* ── NAV ─────────────────────────────────────────────── */}
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
              <h1 className="mkt-legal-title">Terms of Service</h1>
              <p className="mkt-legal-meta">
                Effective date: <strong>{EFFECTIVE_DATE}</strong> &nbsp;·&nbsp;
                Governing law: Laws of India &nbsp;·&nbsp;
                Jurisdiction: Patna, Bihar
              </p>
              <p className="mkt-legal-intro">
                These Terms of Service ("Terms") govern your use of the TezzNirmaan platform — 
                our mobile application, website, and related services (collectively, the 
                "Platform"). By creating an account or placing an order, you agree to these Terms. 
                Please read them carefully. If you do not agree, do not use the Platform.
              </p>
            </header>

            {/* 1 — What TezzNirmaan is */}
            <section className="mkt-legal-section">
              <h2 className="mkt-legal-h2">1. What TezzNirmaan Is (and Isn't)</h2>
              <p>
                TezzNirmaan is a <strong>technology platform</strong> that connects customers who 
                need hardware and construction materials with local shops that stock them. We 
                facilitate the order, coordinate pickup and delivery, and process payment.
              </p>
              <div className="mkt-legal-callout mkt-legal-callout--important">
                <strong>Important:</strong> TezzNirmaan is NOT the seller of any product listed on 
                the Platform. Each product is sold by the fulfilling shop ("Partner Shop"). 
                TezzNirmaan's role is that of a marketplace facilitator and logistics coordinator. 
                Product quality, accuracy of listing, and availability are the Partner Shop's 
                responsibility.
              </div>
              <p>
                The Platform currently operates in Patna, Bihar, India. Availability in other 
                cities will be announced separately.
              </p>
            </section>

            {/* 2 — Eligibility */}
            <section className="mkt-legal-section">
              <h2 className="mkt-legal-h2">2. Eligibility</h2>
              <p>To use the Platform, you must:</p>
              <ul className="mkt-legal-list">
                <li>Be at least <strong>18 years of age</strong>, or have verifiable parental/guardian consent;</li>
                <li>Have a valid <strong>Indian mobile phone number</strong> capable of receiving OTP;</li>
                <li>Provide accurate information during registration and keep it updated;</li>
                <li>Not be barred from using the Platform under any applicable law.</li>
              </ul>
              <p>
                By using the Platform, you represent and warrant that you meet all eligibility 
                requirements above.
              </p>
            </section>

            {/* 3 — Account */}
            <section className="mkt-legal-section">
              <h2 className="mkt-legal-h2">3. Your Account</h2>
              <ul className="mkt-legal-list">
                <li>
                  Your account is identified by your phone number. You are responsible for all 
                  activity that occurs under your account.
                </li>
                <li>
                  Do not share your OTP with anyone. TezzNirmaan will <strong>never</strong> call 
                  you to ask for your OTP.
                </li>
                <li>
                  If you suspect unauthorised access to your account, contact us immediately at{' '}
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="mkt-legal-link">{SUPPORT_EMAIL}</a>.
                </li>
              </ul>
            </section>

            {/* 4 — Orders */}
            <section className="mkt-legal-section">
              <h2 className="mkt-legal-h2">4. Placing an Order</h2>
              <ul className="mkt-legal-list">
                <li>
                  When you place an order, you are making an offer to purchase the listed products 
                  from the Partner Shop at the listed price. The order is confirmed when the shop 
                  accepts it.
                </li>
                <li>
                  Prices displayed on the Platform are inclusive of applicable taxes unless stated 
                  otherwise. Prices may vary between shops.
                </li>
                <li>
                  Product availability is confirmed at the time of order acceptance. In the rare 
                  case a product becomes unavailable after you place an order, you will be notified 
                  and offered a full refund.
                </li>
                <li>
                  <strong>Quick Delivery</strong> orders are fulfilled within 60–90 minutes from 
                  order confirmation, subject to rider and shop availability.
                </li>
                <li>
                  <strong>Scheduled Delivery</strong> orders are fulfilled on the selected date 
                  within the chosen time slot. TezzNirmaan will make reasonable efforts to honour 
                  the slot but cannot guarantee it in case of exceptional circumstances (severe 
                  weather, bandh, etc.).
                </li>
              </ul>
            </section>

            {/* 5 — Cancellations */}
            <section className="mkt-legal-section">
              <h2 className="mkt-legal-h2">5. Cancellation Policy</h2>
              <ul className="mkt-legal-list">
                <li>
                  You may cancel an order <strong>within 30 minutes of placement</strong>, provided 
                  the shop has not yet started preparing your order.
                </li>
                <li>
                  Once the shop begins picking or the rider is assigned, cancellation may not be 
                  possible. Contact support at{' '}
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="mkt-legal-link">{SUPPORT_EMAIL}</a>{' '}
                  for assistance.
                </li>
                <li>
                  TezzNirmaan reserves the right to cancel an order if it cannot be fulfilled due 
                  to stock unavailability, no rider available, or breach of these Terms by the 
                  customer. A full refund will be issued in such cases.
                </li>
              </ul>
            </section>

            {/* 6 — Refunds */}
            <section className="mkt-legal-section">
              <h2 className="mkt-legal-h2">6. Refund Policy</h2>
              <p>Refunds are issued for:</p>
              <ul className="mkt-legal-list">
                <li>Orders cancelled within the 30-minute window (before shop preparation);</li>
                <li>Orders cancelled by TezzNirmaan due to non-fulfilment;</li>
                <li>Incorrect or damaged items delivered, upon verification by our support team.</li>
              </ul>
              <p><strong>Refund timelines:</strong></p>
              <div className="mkt-legal-table-wrap">
                <table className="mkt-legal-table">
                  <thead>
                    <tr>
                      <th>Refund method</th>
                      <th>Timeline</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>TezzWallet (in-app wallet credit)</td>
                      <td><strong>Instant</strong> — reflected immediately in your wallet balance</td>
                    </tr>
                    <tr>
                      <td>Original bank account / UPI / Card</td>
                      <td><strong>5–7 business days</strong> — processed via Razorpay to your bank</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p>
                To request a refund, contact us at{' '}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="mkt-legal-link">{SUPPORT_EMAIL}</a>{' '}
                with your order ID and a brief description of the issue.
              </p>
            </section>

            {/* 7 — Payments */}
            <section className="mkt-legal-section">
              <h2 className="mkt-legal-h2">7. Payments</h2>
              <ul className="mkt-legal-list">
                <li>
                  We accept UPI (GPay, PhonePe, Paytm), debit/credit cards, and cash on delivery 
                  (COD) for eligible orders.
                </li>
                <li>
                  All digital payments are processed by <strong>Razorpay</strong>, a PCI DSS 
                  compliant payment gateway. TezzNirmaan does not store your card or UPI details.
                </li>
                <li>
                  <strong>TezzWallet</strong> credits are non-transferable, non-redeemable for 
                  cash, and expire 12 months from the date of credit unless stated otherwise.
                </li>
                <li>
                  For partial wallet payments, the wallet balance is applied first; the remaining 
                  amount is charged via your selected payment method.
                </li>
              </ul>
            </section>

            {/* 8 — Platform liability */}
            <section className="mkt-legal-section">
              <h2 className="mkt-legal-h2">8. Platform Liability</h2>
              <p>TezzNirmaan is liable for:</p>
              <ul className="mkt-legal-list">
                <li>Platform availability and uptime (we target 99% uptime, excluding scheduled maintenance);</li>
                <li>Accurate transmission of orders between customers and shops;</li>
                <li>Secure handling of payment transactions;</li>
                <li>Timely dispatch of delivery riders once the shop confirms the order.</li>
              </ul>
              <p>TezzNirmaan is <strong>NOT</strong> liable for:</p>
              <ul className="mkt-legal-list">
                <li>
                  <strong>Product quality or accuracy</strong> — the Partner Shop is the seller 
                  and is solely responsible for the quality, quantity, and description of products.
                </li>
                <li>
                  Delays caused by traffic, weather, strikes ("bandh"), or other circumstances 
                  outside our reasonable control.
                </li>
                <li>
                  Loss or damage to goods that occurs after delivery has been completed and 
                  acknowledged by the customer.
                </li>
                <li>
                  Actions or omissions of third-party service providers (Razorpay, Fast2SMS, 
                  Google Maps).
                </li>
              </ul>
              <p>
                Our total liability to you for any claim arising out of or in connection with the 
                Platform shall not exceed the value of the order giving rise to the claim.
              </p>
            </section>

            {/* 9 — Prohibited uses */}
            <section className="mkt-legal-section">
              <h2 className="mkt-legal-h2">9. Prohibited Uses</h2>
              <p>You may not use the Platform to:</p>
              <ul className="mkt-legal-list">
                <li>
                  Place bulk orders for <strong>resale or commercial distribution</strong> without 
                  prior written authorisation from TezzNirmaan;
                </li>
                <li>
                  Use, share, or create <strong>fraudulent or unauthorised promo codes</strong>;
                </li>
                <li>
                  Create multiple accounts to abuse referral rewards or cashback offers;
                </li>
                <li>
                  Attempt to reverse-engineer, scrape, or otherwise circumvent the Platform's 
                  technical measures;
                </li>
                <li>
                  Harass, abuse, or threaten shop staff, riders, or TezzNirmaan employees;
                </li>
                <li>Use the Platform for any unlawful purpose under Indian law.</li>
              </ul>
              <p>
                We reserve the right to suspend or terminate accounts that violate these 
                restrictions, without notice and without liability.
              </p>
            </section>

            {/* 10 — Intellectual property */}
            <section className="mkt-legal-section">
              <h2 className="mkt-legal-h2">10. Intellectual Property</h2>
              <p>
                All content on the Platform — including the TezzNirmaan name, logo, design, 
                software, and text — is owned by TezzNirmaan or its licensors. You may not copy, 
                reproduce, or create derivative works without our written permission.
              </p>
            </section>

            {/* 11 — Dispute resolution */}
            <section className="mkt-legal-section">
              <h2 className="mkt-legal-h2">11. Dispute Resolution</h2>
              <p>If you have a dispute with TezzNirmaan, please follow this process:</p>
              <ol className="mkt-legal-list mkt-legal-list--ordered">
                <li>
                  <strong>Step 1 — Contact Support:</strong> Email{' '}
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="mkt-legal-link">{SUPPORT_EMAIL}</a>{' '}
                  with your order ID. We aim to resolve all issues within 3 business days.
                </li>
                <li>
                  <strong>Step 2 — Escalation:</strong> If unresolved after 14 days, email{' '}
                  <a href={`mailto:${LEGAL_EMAIL}`} className="mkt-legal-link">{LEGAL_EMAIL}</a>{' '}
                  to escalate to our legal team.
                </li>
                <li>
                  <strong>Step 3 — Consumer Forum:</strong> If still unresolved, you may approach 
                  the <strong>Bihar Consumer Dispute Redressal Commission</strong> or the National 
                  Consumer Disputes Redressal Commission (NCDRC) as appropriate under the Consumer 
                  Protection Act, 2019.
                </li>
              </ol>
              <p>
                These Terms shall be governed by the Laws of India. Any disputes not resolved 
                through the above process shall be subject to the exclusive jurisdiction of the 
                courts in Patna, Bihar, India.
              </p>
            </section>

            {/* 12 — Changes */}
            <section className="mkt-legal-section">
              <h2 className="mkt-legal-h2">12. Changes to These Terms</h2>
              <p>
                We may update these Terms from time to time. Material changes will be notified 
                via the app or email at least 7 days before taking effect. Continued use of the 
                Platform after the effective date constitutes acceptance of the updated Terms.
              </p>
            </section>

            {/* 13 — Contact */}
            <section className="mkt-legal-section">
              <h2 className="mkt-legal-h2">13. Contact Us</h2>
              <div className="mkt-legal-contact-card">
                <p><strong>TezzNirmaan</strong></p>
                <p>Patna, Bihar, India</p>
                <p>
                  General support:{' '}
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="mkt-legal-link">{SUPPORT_EMAIL}</a>
                </p>
                <p>
                  Legal matters:{' '}
                  <a href={`mailto:${LEGAL_EMAIL}`} className="mkt-legal-link">{LEGAL_EMAIL}</a>
                </p>
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
              <a href={`mailto:${SUPPORT_EMAIL}`} className="mkt-footer-link">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
