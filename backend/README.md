# TezzNirmaan — Backend API

Quick-commerce platform for construction, hardware & home decor materials.  
Pilot: single shop in Patna, Bihar. Architecture: multi-tenant from day one.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ (ES Modules) |
| Framework | Express 4.x |
| Database | Supabase (Postgres 15 + PostGIS) |
| Auth | Supabase Auth (Phone OTP + JWT) |
| Payments | Razorpay (UPI + COD) |
| Validation | Zod |

---

## Project Structure

```
backend/
├── migrations/              # Supabase SQL migrations (run in order)
│   ├── 001_extensions_and_enums.sql
│   ├── 002_profiles.sql
│   ├── 003_shops_and_categories.sql
│   ├── 004_products_and_inventory.sql
│   ├── 005_addresses_and_cart.sql
│   ├── 006_orders.sql           ← parent + sub-orders (tier-split design)
│   ├── 007_riders_and_delivery.sql
│   ├── 008_payments.sql
│   ├── 009_status_history_and_staff.sql
│   └── 010_rls_policies.sql     ← ~70 RLS policies across 17 tables
│
├── src/
│   ├── app.js               # Express app (middleware, routes)
│   ├── server.js            # HTTP server entry point
│   ├── config/
│   │   ├── constants.js     # All domain enums as frozen objects
│   │   ├── supabase.js      # Supabase client (anon + service role)
│   │   └── razorpay.js      # Razorpay instance
│   ├── middleware/
│   │   ├── auth.js          # JWT verification → req.user
│   │   ├── authorize.js     # requireRole() + requireShopAccess()
│   │   ├── errorHandler.js  # Global error handler
│   │   └── validate.js      # Zod schema validation factory
│   ├── routes/
│   │   ├── index.js         # Aggregates all routers at /api/v1
│   │   ├── customer.routes.js
│   │   ├── shop.routes.js
│   │   ├── rider.routes.js
│   │   ├── admin.routes.js
│   │   └── payment.routes.js
│   ├── controllers/         # Thin layer — extract req data, call service, respond
│   │   ├── customer.controller.js
│   │   ├── shop.controller.js
│   │   ├── rider.controller.js
│   │   ├── admin.controller.js
│   │   └── payment.controller.js
│   ├── services/            # Business logic
│   │   ├── order.service.js     ← tier-splitting checkout logic (see TODOs)
│   │   ├── inventory.service.js
│   │   ├── delivery.service.js  ← OTP validation, state machine enforcement
│   │   └── geo.service.js       ← PostGIS shop discovery
│   ├── utils/
│   │   ├── stateMachine.js  # Order state machine (validateTransition, assertTransition)
│   │   ├── errors.js        # Custom error classes
│   │   ├── orderNumber.js   # TN-YYMMDD-NNNN generator
│   │   └── geo.js           # PostGIS SQL helper fragments
│   └── validators/          # Zod schemas per route group
│       ├── customer.validators.js
│       ├── shop.validators.js
│       ├── rider.validators.js
│       ├── admin.validators.js
│       └── payment.validators.js
│
├── .env.example
├── .gitignore
└── package.json
```

---

## Getting Started

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in your Supabase and Razorpay credentials
```

### 3. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Enable the **PostGIS** extension: Database → Extensions → `postgis`
3. Run the migrations **in order** via the Supabase SQL Editor:
   ```
   migrations/001_extensions_and_enums.sql
   migrations/002_profiles.sql
   migrations/003_shops_and_categories.sql
   migrations/004_products_and_inventory.sql
   migrations/005_addresses_and_cart.sql
   migrations/006_orders.sql
   migrations/007_riders_and_delivery.sql
   migrations/008_payments.sql
   migrations/009_status_history_and_staff.sql
   migrations/010_rls_policies.sql
   ```
4. Create the required PostGIS RPC functions (see `src/services/geo.service.js` for the SQL):
   - `find_nearby_shops(customer_lat, customer_lng)`
   - `check_shop_delivery_range(p_shop_id, customer_lat, customer_lng, radius_km)`

### 4. Run the development server

```bash
npm run dev
```

Server starts at `http://localhost:3000`  
Health check: `http://localhost:3000/health`  
API base: `http://localhost:3000/api/v1`

---

## API Overview

| Role | Base Path | Auth |
|------|-----------|------|
| Customer | `/api/v1/shops`, `/api/v1/cart`, `/api/v1/orders` | Phone OTP → JWT |
| Shop Owner/Staff | `/api/v1/shop/*` | JWT + role claim |
| Rider | `/api/v1/rider/*` | JWT + role claim |
| Platform Admin | `/api/v1/admin/*` | JWT + role claim |
| Payments | `/api/v1/payments/*` | JWT (webhook: signature-verified) |

All authenticated requests require: `Authorization: Bearer <supabase_jwt>`

---

## Key Design Decisions

### Tier-Split Orders
A cart with both quick (paint, fittings) and scheduled (cement, bricks) items results in:
- **1 parent `orders` row** — what the customer sees (one order number, one payment)
- **1–2 `sub_orders` rows** — one per delivery tier (each goes through the state machine independently)

See `src/services/order.service.js` → `placeOrder()` for the full TODO specification.

### Order State Machine
All sub-order status transitions are validated by `src/utils/stateMachine.js`.  
`assertTransition(currentStatus, newStatus, userRole)` throws a `StateTransitionError` on invalid transitions — enforced in the service layer before any DB write.

### PostGIS Geo-Matching
Each shop has two delivery radii: `quick_delivery_radius_km` and `scheduled_delivery_radius_km`.  
The `find_nearby_shops` Postgres function uses `ST_DWithin` on the `geography(Point, 4326)` column with a GIST spatial index.

### RLS Security Model
Three helper functions (`current_user_role`, `is_shop_owner`, `is_shop_staff`) are `SECURITY DEFINER` so they can query associated tables even when RLS is active.  
The Express API uses `supabaseAdmin` (service role) only during checkout — all other queries use the user's JWT-scoped client.

---

## Deploy to Render

1. Push the `backend/` folder to a GitHub repository
2. Go to [render.com](https://render.com) → New → Blueprint
3. Connect your GitHub repo — Render auto-detects `render.yaml`
4. In the Render dashboard, set the secret environment variables:
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
   - `CORS_ORIGIN` (your frontend domains)
5. Deploy

Service URL will be: `https://tezznirmaan-api.onrender.com`  
Health check: `https://tezznirmaan-api.onrender.com/health`

> **Note**: Render Singapore (`singapore`) is the closest region to Patna, Bihar for lowest latency.

---

## What's Implemented

| Layer | Status |
|-------|--------|
| SQL schema (17 tables, PostGIS, RLS) | ✅ Complete |
| Prices in **paise (bigint)** — no floats | ✅ Complete |
| PostGIS geo-matching RPCs | ✅ `find_nearby_shops`, `check_shop_delivery_range` |
| `place_order_atomic` — race-safe checkout | ✅ Postgres stored procedure |
| Seed data — 1 shop + 40 products + inventory | ✅ Realistic Patna market prices |
| Notification system (Supabase Realtime) | ✅ Table + typed helpers |
| Auth middleware (Supabase JWT) | ✅ Complete |
| Role-based authorization | ✅ Complete |
| State machine (all transitions) | ✅ Complete |
| Structured logging (JSON in prod) | ✅ `src/utils/logger.js` |
| Money utilities (paise helpers) | ✅ `src/utils/money.js` |
| `previewOrder` (server-side prices + geo) | ✅ Real implementation |
| `placeOrder` (tier-split + Razorpay) | ✅ Real implementation |
| Customer browsing (shops, products, search) | ✅ Real Supabase queries |
| Cart CRUD (server-side stock validation) | ✅ Real implementation |
| Address management | ✅ Real implementation |
| Delivery service (assign, pickup, deliver) | ✅ Real implementation |
| Inventory service (CRUD + bulk update) | ✅ Real implementation |
| Payment controller (Razorpay verify + webhook) | ✅ Real implementation |
| Admin controller (products, shops, riders) | ✅ Real implementation |
| Stock restore on order cancellation | ✅ In `cancelOrder` |
| Customer notifications on state changes | ✅ In `updateSubOrderStatus` |
| Render deployment config | ✅ `render.yaml` |

## Still TODO (Phase 3)

- `src/controllers/shop.controller.js` — wire real `orderService.updateSubOrderStatus` calls
- SMS fallback (Twilio/Msg91) for offline customers who don't have the app open
- Analytics queries in `admin.controller.js`
- Rider stock-restore compensation on delivery cancel
- Full integration tests

| Layer | Status |
|-------|--------|
| SQL schema (all 17 tables) | ✅ Complete |
| RLS policies (~70 policies) | ✅ Complete |
| State machine (all transitions) | ✅ Complete |
| Auth & authorization middleware | ✅ Complete |
| Zod validators (all endpoints) | ✅ Complete |
| Route wiring (all 50+ endpoints) | ✅ Complete |
| Delivery service (pickup, deliver, cancel) | ✅ Complete |
| Inventory service (CRUD + bulk update) | ✅ Complete |
| Payment controller (Razorpay verify + webhook) | ✅ Complete |
| Admin controller (products, shops, riders) | ✅ Complete |
| `placeOrder` checkout (tier-split transaction) | 🔧 Detailed TODO in order.service.js |
| `previewOrder` (geo-check + totals preview) | 🔧 TODO |
| `findNearbyShops` (PostGIS RPC call) | 🔧 Requires DB function creation |
| Customer browsing controllers | 🔧 TODO stubs |

---

## Environment Variables

See [.env.example](.env.example) for all required variables.

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key (RLS-enforced) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (bypasses RLS) |
| `RAZORPAY_KEY_ID` | Razorpay API key ID |
| `RAZORPAY_KEY_SECRET` | Razorpay API key secret |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook signing secret |
| `CORS_ORIGIN` | Comma-separated allowed origins |
| `NODE_ENV` | `development` or `production` |
