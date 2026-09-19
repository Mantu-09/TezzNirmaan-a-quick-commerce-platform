# Google Play Store Listing — TezzNirmaan

> **Status:** Draft — fill in screenshot paths once captured from device.
> **Last updated:** Phase 9 launch prep

---

## App Name *(max 30 chars — 12 used)*
```
TezzNirmaan
```

## Short Description *(max 80 chars — 67 used)*
```
Hardware & construction materials delivered in 60 minutes in Bihar
```

## Full Description *(max 4000 chars)*
```
TezzNirmaan brings the hardware store to your doorstep.

Order cement, paint, tiles, electrical fittings, plumbing materials, and construction tools from local shops in Patna, Muzaffarpur, Bhagalpur, and Gaya — delivered in 60-90 minutes for Quick items or same-day for Scheduled (heavy) items.

WHY TEZZNIRMAAN:
✓ Quick delivery: paints, fittings, hardware in 60-90 min
✓ Scheduled delivery: cement, bricks, tiles — same day
✓ Live tracking: watch your order move in real time
✓ Multiple payment options: UPI, Cards, Cash on Delivery
✓ Wallet: instant cashback on every order
✓ Easy returns: photo-based returns resolved within 24 hours

FOR SHOP OWNERS:
Partner with TezzNirmaan to reach customers across your city.
Automatic weekly payouts via Razorpay. Manage orders from your phone.
```

---

## Metadata

| Field | Value |
|-------|-------|
| **Category** | Shopping |
| **Content Rating** | Everyone |
| **Privacy Policy URL** | https://tezznirmaan.in/privacy |
| **Package Name** | in.tezznirmaan.app |
| **Default Language** | English (India) |

---

## Screenshots Required

All screenshots must be: **PNG or JPEG, 16:9 or 9:16, min 320px, max 3840px on any side.**
Minimum 2 required, max 8. Recommended: 5 portrait (1080×1920).

| # | Screen to capture | Filename |
|---|-------------------|----------|
| 1 | Home — category grid (Paints, Cement, Tiles…) | `01-home-categories.png` |
| 2 | Product listing — with price and shop name visible | `02-product-listing.png` |
| 3 | Cart → Checkout flow | `03-checkout.png` |
| 4 | Order tracking — live status card | `04-order-tracking.png` |
| 5 | Wallet screen — balance + cashback history | `05-wallet.png` |

Place screenshots in: `mobile/store-assets/screenshots/`

### How to capture
```bash
# Android (physical device, USB debugging on)
adb exec-out screencap -p > store-assets/screenshots/01-home-categories.png

# Or use Expo's built-in screenshot from Metro dev menu
# Or use Android Studio's device mirror (Pixel 6 emulator recommended for Play Store)
```

---

## Feature Graphic *(required — 1024×500 PNG/JPEG)*

Required for Play Store. Shows behind the app icon in search results.

Design guidance:
- Background: `#1A1A18` (dark brand)
- Logo: TezzNirmaan wordmark in white, centered
- Tagline: "Hardware. Delivered Fast." in `#E8521A`
- No screenshots embedded (policy violation)

Filename: `store-assets/feature-graphic.png`

---

## App Icon *(1024×1024 PNG, no transparency, no rounded corners)*

Play Store adds its own rounding. Submit square, opaque.

Source: `mobile/assets/icon.png` *(must be 1024×1024)*

---

## Release Notes (v1.0.0 — Initial Release)

```
Welcome to TezzNirmaan!

Order hardware and construction materials from local shops and get them delivered in 60-90 minutes. Available in Patna, Muzaffarpur, Bhagalpur, and Gaya.

- Quick delivery: paints, fittings, tools in 60-90 min
- Scheduled delivery: cement, bricks, tiles same-day
- Live order tracking
- UPI, Card, and COD payment options
- TezzNirmaan Wallet with cashback
```

---

## Promotion Track Checklist

Before promoting from Internal → Production:

- [ ] Installed on 3+ physical Android devices
- [ ] Completed full order flow end-to-end (place → pay → delivered)
- [ ] Push notifications received and tapped successfully
- [ ] Wallet credited correctly after delivery
- [ ] Return flow tested (photo upload → resolution)
- [ ] Cold start time < 3 seconds on a mid-range device
- [ ] No Sentry crashes in last 24 hours of testing
- [ ] Privacy policy URL live and accessible
- [ ] Content rating questionnaire completed in Play Console

---

## Google Play Console Navigation

```
play.google.com/console
  → All apps → TezzNirmaan
    → Testing → Internal Testing     ← submit here first
    → Testing → Closed Testing (alpha)
    → Production                     ← promote here when ready
    → Store presence → Main store listing ← paste copy above
    → Store presence → Graphics       ← upload screenshots + feature graphic
    → Policy → App content → Privacy policy ← paste URL
```
