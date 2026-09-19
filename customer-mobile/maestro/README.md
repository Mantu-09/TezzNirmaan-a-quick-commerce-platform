# TezzNirmaan — Maestro E2E Test Suite

## Why Maestro

| Requirement | Solution |
|---|---|
| No EAS build per test run | Maestro runs against an already-installed app |
| Solo developer | YAML flows are readable and diff-able without test-framework expertise |
| Works with Expo Go | Maestro's UI driver works on Expo Go and dev-client |
| CI-ready | Ships a GitHub Actions job in `mobile-build.yml` |

---

## Local setup (Mac/Linux)

```bash
# 1. Install Maestro CLI
curl -Ls "https://get.maestro.mobile.dev" | bash

# Verify
maestro --version   # should print 1.x.x

# 2. Start an iOS simulator or connect an Android device
# iOS: open Simulator.app or run: open -a Simulator
# Android: run: adb devices

# 3. Install the app
# Option A: Expo Go  → run `npm run start` in /mobile, scan QR
# Option B: dev-client → run `eas build --profile development --platform ios`

# 4. Run all flows
cd mobile
npm run e2e
# or directly:
maestro test maestro/flows/

# 5. Run a single flow
npm run e2e:single maestro/flows/01_onboarding.yaml
```

---

## Flows

| File | What it tests | Key assertions |
|---|---|---|
| [`01_onboarding.yaml`](flows/01_onboarding.yaml) | Phone entry + OTP auth | `"Enter your mobile number"`, `"Verify OTP"`, `"TezzNirmaan"` |
| [`02_browse_and_cart.yaml`](flows/02_browse_and_cart.yaml) | Category browse + add to cart | `"Shop by Category"`, `"Cement & Blocks"`, `"My Cart"` |
| [`03_checkout_flow.yaml`](flows/03_checkout_flow.yaml) | Full COD checkout | `"📍 Delivery Address"`, `"Place Order"`, `"Order Placed!"` |
| [`04_order_tracking.yaml`](flows/04_order_tracking.yaml) | Orders tab + tracking screen | `"My Orders"`, `"Track Order"`, `"Placed"` |
| [`05_pass_and_wallet.yaml`](flows/05_pass_and_wallet.yaml) | Pass plan picker + wallet | `"🎫 TezzNirmaan Pass"`, `"Choose your pass"`, `"My Wallet"` |

---

## Pre-conditions per flow

### All flows
- App installed and running on device/simulator
- Backend accessible (local dev or staging)

### Flow 01 (Onboarding)
Set `TEST_OTP=123456` in your backend `.env` so the server accepts
`123456` without sending a real SMS. The test phone `9876543210` can be
any valid 10-digit number — the backend creates the user on first OTP.

```env
# backend/.env (dev / test)
TEST_OTP=123456
```

### Flow 02 (Browse & Cart)
Requires at least one shop seeded near Patna with Cement & Blocks products.
Run the DB seed scripts or use the admin panel to add test data.

### Flow 03 (Checkout)
Requires a saved delivery address in the test account. Add one manually
via the app after running flow 01, or seed it via Supabase dashboard.

### Flow 04 (Tracking)
Requires at least one order to exist. Run flow 03 first. The "Live" badge
(`assertVisible: "Live"`) is **commented out** because it only appears when
order status = `out_for_delivery`. Uncomment after manually advancing the
order status in the admin panel.

### Flow 05 (Pass & Wallet)
Works with an account that has no active pass (plan picker renders).
If the test account already has an active pass, flow 05 will fail on
`assertVisible: "Choose your pass"`. Deactivate the pass first.

---

## Adding a `testID` to a component

Maestro can target elements by `testID` (more reliable than text matching
across platform rendering differences). When adding new interactive elements,
add a `testID` prop:

```jsx
// React Native component
<Button testID="place-order-btn" onPress={handlePlaceOrder}>
  Place Order
</Button>

// Maestro flow
- tapOn:
    id: place-order-btn
```

---

## CI notes

The `e2e` job in `.github/workflows/mobile-build.yml`:
- Runs only on `push` to `main` (not `workflow_dispatch`)
- Is `continue-on-error: true` — a Maestro failure is a warning, not a build blocker
- Uploads JUnit XML results as a GitHub Actions artifact (`maestro-e2e-results`)
- Requires the app to be pre-installed on the GitHub Actions macOS runner simulator,
  which requires a provisioning step via EAS or Fastlane (not yet automated)

Until CI provisioning is set up, the CI job validates YAML syntax and Maestro
connectivity. Run flows locally before merging screen-touching PRs.
