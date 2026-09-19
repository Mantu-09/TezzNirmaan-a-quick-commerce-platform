# TezzNirmaan — Production Launch Checklist

## P13-10 — Go-Live Checklist

Use this before launching to real users in Patna, Muzaffarpur, Bhagalpur, or Gaya.
Check each item as complete: `[x]`

---

## 1. Infrastructure

- [ ] Backend deployed to Railway / Render / EC2 (not localhost)
- [ ] Frontend deployed to Vercel (or custom domain via Cloudflare Pages)
- [ ] Custom domain `tezznirmaan.in` pointed to Vercel (A record / CNAME)
- [ ] SSL certificate active (auto via Vercel/Cloudflare)
- [ ] Redis deployed (for Socket.IO scaling in production) OR confirmed single-instance
- [ ] Supabase project on Pro plan (for row limits + backup)
- [ ] AWS S3 bucket created, CORS configured for `tezznirmaan.in`

---

## 2. Environment Variables

- [ ] All variables from `.env.production.example` set in Vercel dashboard
- [ ] All variables set in backend deployment (Railway/Render env)
- [ ] `NODE_ENV=production` confirmed
- [ ] `JWT_SECRET` is a cryptographically random 64+ character string
- [ ] Supabase service role key is NOT exposed to frontend

---

## 3. Database (Supabase)

- [ ] All migrations `001_*.sql` through `063_search_analytics.sql` applied
- [ ] RLS (Row Level Security) enabled on all tables — verify with: `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
- [ ] `profiles` table has at least 1 admin user (set `role = 'admin'`)
- [ ] At least 1 active city seeded (Patna minimum)
- [ ] At least 5 products seeded per category in Patna
- [ ] `delivery_slots` seeded for Patna (run `INSERT INTO delivery_slots ...`)

### Seed Data Checklist
- [ ] 1+ cities with `is_active = true`, `center_lat`, `center_lng` set
- [ ] 1+ shops in each active city with `status = 'active'`
- [ ] 5+ products per shop with `stock_qty > 0`
- [ ] Delivery fee configured (check `delivery_fees` table)

---

## 4. Payment Gateway (Razorpay)

- [ ] Razorpay account verified (KYC complete — takes 2–3 days)
- [ ] Live keys active (not test keys)
- [ ] Webhook configured in Razorpay dashboard → `https://api.tezznirmaan.in/api/v1/webhooks/razorpay`
- [ ] Webhook secret matches `RAZORPAY_WEBHOOK_SECRET` env var
- [ ] Test payment of Rs.1 successfully completed in production
- [ ] Razorpay X account set up for rider payouts (optional for launch)

---

## 5. SMS / OTP (Twilio)

- [ ] Twilio account active with DLT (Distributed Ledger Technology) registration
- [ ] DLT template registered: "Your TezzNirmaan OTP is {otp}. Valid for 5 minutes."
- [ ] Twilio test OTP received on real Indian number
- [ ] OTP delivery rate > 95% (check Twilio console)

---

## 6. WhatsApp (WATI.io) — P13-2

- [ ] WATI account created and WhatsApp Business API connected
- [ ] Templates pre-approved (2–3 day review):
  - [ ] `order_confirmed` — approved
  - [ ] `rider_assigned` — approved
  - [ ] `order_delivered` — approved
  - [ ] `order_cancelled` — approved
- [ ] Test WhatsApp message received on real number
- [ ] `WATI_API_URL` and `WATI_API_TOKEN` set in backend env

---

## 7. Analytics & Monitoring — P13-4

- [ ] PostHog project created (posthog.com) — free up to 1M events/month
- [ ] `NEXT_PUBLIC_POSTHOG_KEY` set in Vercel env
- [ ] Verify events in PostHog dashboard after placing test order
- [ ] Sentry project created (sentry.io) — free up to 5K errors/month
- [ ] `SENTRY_DSN` set in both frontend and backend env
- [ ] Test error captured in Sentry dashboard

---

## 8. Google Maps — P13-3

- [ ] Google Cloud project created
- [ ] Maps JavaScript API enabled
- [ ] Places API enabled
- [ ] Billing account set up (Rs.14,000 free credit/month — enough for ~35K searches)
- [ ] API key created and restricted to `tezznirmaan.in` domain
- [ ] `NEXT_PUBLIC_GOOGLE_MAPS_KEY` set in Vercel env
- [ ] Autocomplete tested in checkout page (live site)

---

## 9. Performance & SEO

- [ ] `npm run build` completes without errors
- [ ] Lighthouse score > 85 on mobile (run in Chrome DevTools)
- [ ] Core Web Vitals: LCP < 2.5s, CLS < 0.1, FID < 100ms
- [ ] Sitemap at `tezznirmaan.in/sitemap.xml` accessible
- [ ] robots.txt at `tezznirmaan.in/robots.txt` accessible
- [ ] Google Search Console: site submitted and verified
- [ ] OG image set for social sharing

---

## 10. Security

- [ ] CORS restricted to `tezznirmaan.in` and `www.tezznirmaan.in`
- [ ] Rate limiting active (helmet + express-rate-limit confirmed in logs)
- [ ] Admin routes return 403 for non-admin users (tested)
- [ ] Supabase RLS policies allow only correct user access to their own data
- [ ] No hardcoded secrets in codebase (`git grep -i "password\|secret\|key"`)
- [ ] HTTPS enforced (no HTTP fallback)

---

## 11. Operations

- [ ] At least 2 active riders onboarded with rider app access
- [ ] At least 1 shop owner onboarded with shop dashboard access
- [ ] Admin user can log in to `/admin` dashboard
- [ ] Order lifecycle tested end-to-end:
  - [ ] Customer places order via storefront
  - [ ] Shop receives notification + accepts order
  - [ ] Rider gets assignment + accepts
  - [ ] GPS location visible on customer track page
  - [ ] Order marked delivered
  - [ ] WhatsApp notifications received at each step
- [ ] COD order collection process defined and communicated to riders

---

## 12. Legal & Compliance

- [ ] Terms of Service live at `tezznirmaan.in/terms`
- [ ] Privacy Policy live at `tezznirmaan.in/privacy`
- [ ] Refund Policy live at `tezznirmaan.in/refund-policy`
- [ ] Shop onboarding page live at `tezznirmaan.in/join`
- [ ] GST registration completed (if revenue > Rs.40L/year)
- [ ] Business registration (proprietorship/LLP) in place

---

## 13. Post-Launch Monitoring (First Week)

Check daily:
- [ ] Error rate in Sentry < 1%
- [ ] Order success rate > 95% (orders placed / orders delivered)
- [ ] Zero-result searches in Search Analytics → stock popular items
- [ ] WhatsApp delivery rate > 90% in WATI dashboard
- [ ] Server response time < 500ms (check Railway metrics)

---

## Quick Fix Reference

| Problem | Fix |
|---------|-----|
| OTP not receiving | Check Twilio DLT registration, check TWILIO_FROM format |
| Payment failing | Check Razorpay webhook URL is correct and live |
| Socket.IO not connecting | Check CORS_ORIGINS includes frontend domain |
| WhatsApp not sending | Check WATI template approval status |
| Maps not loading | Check API key restrictions — allow `tezznirmaan.in` |
| Orders not visible to shop | Check Supabase RLS policies on `orders` and `sub_orders` |

---

## Launch Announcement Channels

- [ ] WhatsApp broadcast to first 100 potential customers
- [ ] Instagram post with demo video
- [ ] Local hardware shop WhatsApp groups in Patna
- [ ] Construction contractor networks (key B2B segment)
- [ ] Launch offer: 20% off first order with code `LAUNCH20`

---

*Generated by TezzNirmaan Phase 13 — Launch Readiness System*
*Last updated: August 2026*
