-- ============================================================================
-- Migration 013: Seed Data
-- TezzNirmaan — Quick-commerce for construction materials
-- ============================================================================
-- Realistic seed data for the Patna, Bihar pilot:
--   - 1 hardware/construction shop (Sharma Hardware, Boring Road, Patna)
--   - 5 product categories
--   - 40 products (25 Quick tier + 15 Scheduled tier)
--   - Full inventory for the shop with realistic Patna market prices (in PAISE)
--
-- Patna coordinates: lat 25.5941, lng 85.1376
-- Boring Road area: lat 25.6052, lng 85.1154
--
-- ALL PRICES IN PAISE (1 INR = 100 paise)
-- ============================================================================

-- ── Shop Owner Profile (placeholder — real user created via Supabase Auth) ──
-- In production: run Supabase Auth OTP for the owner's phone, then
-- update the profile role and link to the shop.
-- This seed creates a placeholder profile UUID that you replace after auth setup.
DO $$
BEGIN
  INSERT INTO profiles (id, phone, full_name, role)
  VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    '+919876543210',
    'Ramesh Sharma',
    'shop_owner'
  )
  ON CONFLICT (id) DO NOTHING;
END $$;

-- ── Product Categories ────────────────────────────────────────────────────────
INSERT INTO categories (id, name, slug, description) VALUES
  ('cat-0001-0000-0000-0000-000000000001'::uuid, 'Cement & Concrete',    'cement-concrete',    'Cement, concrete mixes, and related products'),
  ('cat-0001-0000-0000-0000-000000000002'::uuid, 'Steel & Metal',        'steel-metal',        'TMT bars, steel rods, GI wire, and metal products'),
  ('cat-0001-0000-0000-0000-000000000003'::uuid, 'Paints & Finishes',    'paints-finishes',    'Interior, exterior, primer, putty and paint tools'),
  ('cat-0001-0000-0000-0000-000000000004'::uuid, 'Electrical',           'electrical',         'Wiring, switches, sockets, conduit and fittings'),
  ('cat-0001-0000-0000-0000-000000000005'::uuid, 'Plumbing',             'plumbing',           'Pipes, fittings, taps, valves and plumbing tools'),
  ('cat-0001-0000-0000-0000-000000000006'::uuid, 'Hardware & Fasteners', 'hardware-fasteners', 'Screws, nails, bolts, hinges, handles and locks'),
  ('cat-0001-0000-0000-0000-000000000007'::uuid, 'Tools & Safety',       'tools-safety',       'Hand tools, measuring tools, PPE and safety gear'),
  ('cat-0001-0000-0000-0000-000000000008'::uuid, 'Aggregates & Fill',    'aggregates-fill',    'Sand, stone aggregate, bricks and blocks'),
  ('cat-0001-0000-0000-0000-000000000009'::uuid, 'Adhesives & Sealants', 'adhesives-sealants', 'Construction adhesives, silicone sealants and putty')
ON CONFLICT (slug) DO NOTHING;

-- ── Shop: Sharma Hardware, Boring Road, Patna ─────────────────────────────────
INSERT INTO shops (
  id, owner_id, name, slug, description,
  phone, email, address_line1, city, state, pincode,
  location,
  quick_delivery_radius_km,
  scheduled_delivery_radius_km,
  operating_hours,
  is_active, is_accepting_orders
) VALUES (
  'shop-0001-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Sharma Hardware & Construction',
  'sharma-hardware-patna',
  'Your one-stop shop for all construction, hardware, and home improvement needs in Patna. Serving since 1987.',
  '+919876543210',
  'sharma.hardware@example.com',
  'Shop No. 12, Boring Road Market',
  'Patna',
  'Bihar',
  '800001',
  -- PostGIS point: ST_MakePoint(longitude, latitude)
  ST_SetSRID(ST_MakePoint(85.1154, 25.6052), 4326)::geography,
  6.0,    -- 6 km quick delivery radius
  20.0,   -- 20 km scheduled delivery radius
  '{
    "monday":    {"open": "09:00", "close": "20:00"},
    "tuesday":   {"open": "09:00", "close": "20:00"},
    "wednesday": {"open": "09:00", "close": "20:00"},
    "thursday":  {"open": "09:00", "close": "20:00"},
    "friday":    {"open": "09:00", "close": "20:00"},
    "saturday":  {"open": "09:00", "close": "20:00"},
    "sunday":    {"open": "10:00", "close": "17:00"}
  }'::jsonb,
  true,
  true
)
ON CONFLICT (slug) DO NOTHING;

-- ── Master Products ───────────────────────────────────────────────────────────
-- QUICK TIER (25 products — 60-90 min scooter/bike delivery)
INSERT INTO products (id, name, slug, description, category_id, delivery_tier, unit, weight_kg, is_bulk, hsn_code, gst_percent, is_active) VALUES

-- Paints & Finishes (Quick)
('prod-0001-0000-0000-0000-000000000001'::uuid, 'Asian Paints Tractor Emulsion 4L - White', 'asian-paints-tractor-emulsion-4l-white', 'Interior emulsion paint. Smooth finish, washable. Coverage: 90-110 sq ft per litre.', 'cat-0001-0000-0000-0000-000000000003'::uuid, 'quick', 'litre', 4.8, false, '32091010', 18.0, true),
('prod-0001-0000-0000-0000-000000000002'::uuid, 'Berger WeatherCoat All Guard 4L', 'berger-weathercoat-all-guard-4l', 'Premium exterior waterproof paint. 7-year warranty. Suitable for Bihar monsoon conditions.', 'cat-0001-0000-0000-0000-000000000003'::uuid, 'quick', 'litre', 5.2, false, '32091010', 18.0, true),
('prod-0001-0000-0000-0000-000000000003'::uuid, 'Asian Paints Primer 4L', 'asian-paints-primer-4l', 'Wall primer for interior surfaces. Improves paint adhesion and coverage.', 'cat-0001-0000-0000-0000-000000000003'::uuid, 'quick', 'litre', 4.6, false, '32091090', 18.0, true),
('prod-0001-0000-0000-0000-000000000004'::uuid, 'Paint Brush Set (2", 3", 4")', 'paint-brush-set-234-inch', 'Set of 3 synthetic bristle paint brushes. Suitable for all types of paints.', 'cat-0001-0000-0000-0000-000000000003'::uuid, 'quick', 'set', 0.3, false, '96032000', 12.0, true),
('prod-0001-0000-0000-0000-000000000005'::uuid, 'Paint Roller 9" with Tray', 'paint-roller-9inch-with-tray', 'Professional foam roller with deep-tray. Ideal for walls and ceilings.', 'cat-0001-0000-0000-0000-000000000003'::uuid, 'quick', 'set', 0.5, false, '96032000', 12.0, true),

-- Electrical (Quick)
('prod-0001-0000-0000-0000-000000000006'::uuid, 'Anchor Roma 6A Switch (White)', 'anchor-roma-6a-switch-white', 'Modular 6A one-way switch. Compatible with standard modular plates. ISI marked.', 'cat-0001-0000-0000-0000-000000000004'::uuid, 'quick', 'piece', 0.05, false, '85361090', 18.0, true),
('prod-0001-0000-0000-0000-000000000007'::uuid, 'Anchor Roma 6A Socket 3-Pin', 'anchor-roma-6a-socket-3pin', '6A 3-pin socket for modular installation. 240V AC. ISI certified.', 'cat-0001-0000-0000-0000-000000000004'::uuid, 'quick', 'piece', 0.08, false, '85361090', 18.0, true),
('prod-0001-0000-0000-0000-000000000008'::uuid, 'Havells HRFR 1.5 sq mm Wire (90m)', 'havells-hrfr-1-5sqmm-wire-90m', 'HRFR PVC insulated copper wire, 1.5 sq mm. Flame retardant. ISI certified. For light circuits.', 'cat-0001-0000-0000-0000-000000000004'::uuid, 'quick', 'bundle', 1.5, false, '85444919', 18.0, true),
('prod-0001-0000-0000-0000-000000000009'::uuid, 'PVC Conduit Pipe 25mm (3m)', 'pvc-conduit-pipe-25mm-3m', 'Rigid PVC electrical conduit. 25mm diameter. UV stabilized. ISI marked.', 'cat-0001-0000-0000-0000-000000000004'::uuid, 'quick', 'piece', 0.8, false, '39172900', 18.0, true),
('prod-0001-0000-0000-0000-000000000010'::uuid, 'MCB 32A Single Pole (Schneider)', 'mcb-32a-single-pole-schneider', 'Miniature circuit breaker 32A. Thermal-magnetic trip. C-curve. ISI certified.', 'cat-0001-0000-0000-0000-000000000004'::uuid, 'quick', 'piece', 0.1, false, '85362000', 18.0, true),

-- Plumbing (Quick)
('prod-0001-0000-0000-0000-000000000011'::uuid, 'CPVC Pipe 1/2" (3m) - Astral', 'cpvc-pipe-half-inch-3m-astral', 'CPVC hot & cold water pipe. 1/2 inch (15mm). Pressure rating: 25 kgf/cm². 3m length.', 'cat-0001-0000-0000-0000-000000000005'::uuid, 'quick', 'piece', 0.6, false, '39172900', 18.0, true),
('prod-0001-0000-0000-0000-000000000012'::uuid, 'Ball Valve 1/2" Brass (ISI)', 'ball-valve-half-inch-brass-isi', 'Full-bore brass ball valve. 1/2 inch. 10 kgf/cm² pressure rating. ISI marked.', 'cat-0001-0000-0000-0000-000000000005'::uuid, 'quick', 'piece', 0.15, false, '84818099', 18.0, true),
('prod-0001-0000-0000-0000-000000000013'::uuid, 'CPVC Elbow 1/2" (Pack of 5)', 'cpvc-elbow-half-inch-pack-5', 'CPVC 90° elbow fitting. 1/2 inch. Pack of 5 pieces.', 'cat-0001-0000-0000-0000-000000000005'::uuid, 'quick', 'pack', 0.1, false, '39174000', 18.0, true),
('prod-0001-0000-0000-0000-000000000014'::uuid, 'Cera Pillar Cock (Chrome)', 'cera-pillar-cock-chrome', 'Quarter-turn pillar tap. Chrome finish. For washbasin and sink installations.', 'cat-0001-0000-0000-0000-000000000005'::uuid, 'quick', 'piece', 0.3, false, '84818011', 18.0, true),

-- Hardware & Fasteners (Quick)
('prod-0001-0000-0000-0000-000000000015'::uuid, 'GI Wood Screw 2" (Box of 100)', 'gi-wood-screw-2inch-box-100', 'Galvanized iron countersunk wood screws. 2 inch / 5cm. Box of 100 pieces.', 'cat-0001-0000-0000-0000-000000000006'::uuid, 'quick', 'box', 0.3, false, '73181100', 18.0, true),
('prod-0001-0000-0000-0000-000000000016'::uuid, 'SS Butt Hinge 4" (Pair)', 'ss-butt-hinge-4inch-pair', 'Stainless steel butt hinge. 4 inch (100mm). 2mm thickness. For heavy doors.', 'cat-0001-0000-0000-0000-000000000006'::uuid, 'quick', 'pair', 0.2, false, '83020000', 18.0, true),
('prod-0001-0000-0000-0000-000000000017'::uuid, 'Mortise Door Handle Set SS', 'mortise-door-handle-set-ss', 'Complete mortise lock handle set. Stainless steel. With latch and key. For wooden doors.', 'cat-0001-0000-0000-0000-000000000006'::uuid, 'quick', 'set', 0.6, false, '83020000', 18.0, true),
('prod-0001-0000-0000-0000-000000000018'::uuid, 'Hasp & Staple 6" Heavy Duty', 'hasp-staple-6inch-heavy-duty', 'Heavy-duty iron hasp and staple for padlocking. 6 inch. Zinc plated.', 'cat-0001-0000-0000-0000-000000000006'::uuid, 'quick', 'piece', 0.2, false, '83020000', 18.0, true),
('prod-0001-0000-0000-0000-000000000019'::uuid, 'GI Wire 14 Gauge (1 kg)', 'gi-wire-14-gauge-1kg', 'Galvanized iron binding wire. 14 gauge. 1 kg spool. For masonry and reinforcement.', 'cat-0001-0000-0000-0000-000000000002'::uuid, 'quick', 'kg', 1.0, false, '73130000', 18.0, true),

-- Adhesives & Sealants (Quick)
('prod-0001-0000-0000-0000-000000000020'::uuid, 'Fevicol SH Adhesive 500g', 'fevicol-sh-adhesive-500g', 'Water-based white wood adhesive. 500g pack. Strong bond for carpentry and woodwork.', 'cat-0001-0000-0000-0000-000000000009'::uuid, 'quick', 'piece', 0.55, false, '35069100', 18.0, true),
('prod-0001-0000-0000-0000-000000000021'::uuid, 'Silicone Sealant White 280ml', 'silicone-sealant-white-280ml', 'Neutral cure silicone sealant. White. Waterproof. For bathroom fittings and glass.', 'cat-0001-0000-0000-0000-000000000009'::uuid, 'quick', 'piece', 0.35, false, '35069900', 18.0, true),
('prod-0001-0000-0000-0000-000000000022'::uuid, 'Birla White Putty 5 kg', 'birla-white-putty-5kg', 'White cement-based wall putty. For smooth, crack-free painting base. 5 kg bag.', 'cat-0001-0000-0000-0000-000000000009'::uuid, 'quick', 'bag', 5.2, false, '25211000', 12.0, true),

-- Tools (Quick)
('prod-0001-0000-0000-0000-000000000023'::uuid, 'Measuring Tape 5m Stanley', 'measuring-tape-5m-stanley', 'Stanley FatMax 5m measuring tape. 25mm blade width. Auto-lock. Shock resistant.', 'cat-0001-0000-0000-0000-000000000007'::uuid, 'quick', 'piece', 0.2, false, '90261000', 18.0, true),
('prod-0001-0000-0000-0000-000000000024'::uuid, 'Spirit Level 24" Aluminium', 'spirit-level-24inch-aluminium', 'Aluminium spirit level. 24 inch (600mm). 3 vials. Accuracy: 0.5mm/m.', 'cat-0001-0000-0000-0000-000000000007'::uuid, 'quick', 'piece', 0.4, false, '90259000', 18.0, true),
('prod-0001-0000-0000-0000-000000000025'::uuid, 'Ball Peen Hammer 500g', 'ball-peen-hammer-500g', 'Drop-forged steel hammer. 500g head weight. Fibreglass handle. For general masonry work.', 'cat-0001-0000-0000-0000-000000000007'::uuid, 'quick', 'piece', 0.7, false, '82050000', 18.0, true),

-- SCHEDULED TIER (15 products — same day/next day, tempo delivery)
('prod-0001-0000-0000-0000-000000000026'::uuid, 'UltraTech PPC Cement 50 kg', 'ultratech-ppc-cement-50kg', 'UltraTech Portland Pozzolana Cement. 50 kg bag. Grade: PPC IS:1489. High durability.', 'cat-0001-0000-0000-0000-000000000001'::uuid, 'scheduled', 'bag', 50.0, true, '25232900', 28.0, true),
('prod-0001-0000-0000-0000-000000000027'::uuid, 'ACC Gold Cement 50 kg', 'acc-gold-cement-50kg', 'ACC Gold OPC 53 Grade Portland cement. 50 kg bag. IS:12269. High early strength.', 'cat-0001-0000-0000-0000-000000000001'::uuid, 'scheduled', 'bag', 50.0, true, '25232900', 28.0, true),
('prod-0001-0000-0000-0000-000000000028'::uuid, 'River Sand - Fine (1 Brass)', 'river-sand-fine-1-brass', 'Washed river sand (fine). 1 brass (100 cubic feet). Zone II grading. For masonry and plaster.', 'cat-0001-0000-0000-0000-000000000008'::uuid, 'scheduled', 'brass', 4500.0, true, '26209990', 5.0, true),
('prod-0001-0000-0000-0000-000000000029'::uuid, 'Stone Aggregate 20mm (1 Brass)', 'stone-aggregate-20mm-1-brass', 'Crushed stone aggregate. 20mm size. 1 brass (100 cu ft). For RCC and concrete work.', 'cat-0001-0000-0000-0000-000000000008'::uuid, 'scheduled', 'brass', 3800.0, true, '25171000', 5.0, true),
('prod-0001-0000-0000-0000-000000000030'::uuid, 'Red Fly Ash Brick (per 500)', 'red-fly-ash-brick-per-500', 'Machine-made fly ash bricks. 230×110×70mm. Compressive strength: ≥75 kg/cm². Pack of 500.', 'cat-0001-0000-0000-0000-000000000008'::uuid, 'scheduled', 'bundle', 2000.0, true, '68159900', 5.0, true),
('prod-0001-0000-0000-0000-000000000031'::uuid, 'TMT Steel Bar 8mm (per piece 12m)', 'tmt-steel-bar-8mm-12m-piece', 'Fe 500D TMT reinforcement bar. 8mm diameter. 12m length. IS:1786 certified. For RCC slabs.', 'cat-0001-0000-0000-0000-000000000002'::uuid, 'scheduled', 'piece', 6.0, true, '72139190', 18.0, true),
('prod-0001-0000-0000-0000-000000000032'::uuid, 'TMT Steel Bar 10mm (per piece 12m)', 'tmt-steel-bar-10mm-12m-piece', 'Fe 500D TMT reinforcement bar. 10mm diameter. 12m length. IS:1786 certified. For columns.', 'cat-0001-0000-0000-0000-000000000002'::uuid, 'scheduled', 'piece', 9.4, true, '72139190', 18.0, true),
('prod-0001-0000-0000-0000-000000000033'::uuid, 'TMT Steel Bar 12mm (per piece 12m)', 'tmt-steel-bar-12mm-12m-piece', 'Fe 500D TMT reinforcement bar. 12mm diameter. 12m length. IS:1786 certified. For beams.', 'cat-0001-0000-0000-0000-000000000002'::uuid, 'scheduled', 'piece', 13.4, true, '72139190', 18.0, true),
('prod-0001-0000-0000-0000-000000000034'::uuid, 'AAC Block 4" (Aerocon, per piece)', 'aac-block-4inch-aerocon-per-piece', 'Autoclaved aerated concrete block. 4 inch (100mm) thick. 625×250mm face. Lightweight, thermal insulating.', 'cat-0001-0000-0000-0000-000000000008'::uuid, 'scheduled', 'piece', 3.2, true, '68159900', 12.0, true),
('prod-0001-0000-0000-0000-000000000035'::uuid, 'Hollow Concrete Block 8" (per piece)', 'hollow-concrete-block-8inch-per-piece', 'Hollow load-bearing concrete block. 8 inch (200mm). 400×200mm face. IS:2185 grade.', 'cat-0001-0000-0000-0000-000000000008'::uuid, 'scheduled', 'piece', 12.0, true, '68159900', 5.0, true),
('prod-0001-0000-0000-0000-000000000036'::uuid, 'Corrugated GI Sheet 8ft (26 gauge)', 'corrugated-gi-sheet-8ft-26-gauge', 'Galvanized corrugated roofing sheet. 8 feet (2.44m) length. 26 gauge. Anti-rust coated.', 'cat-0001-0000-0000-0000-000000000002'::uuid, 'scheduled', 'piece', 5.5, true, '72102900', 18.0, true),
('prod-0001-0000-0000-0000-000000000037'::uuid, 'UltraTech White Cement 25 kg', 'ultratech-white-cement-25kg', 'UltraTech White Portland Cement. 25 kg bag. For decorative plaster, tile grouting and pointing.', 'cat-0001-0000-0000-0000-000000000001'::uuid, 'scheduled', 'bag', 25.0, true, '25232100', 28.0, true),
('prod-0001-0000-0000-0000-000000000038'::uuid, 'Kota Stone Flooring 600×600mm (per sqft)', 'kota-stone-600x600mm-per-sqft', 'Natural Kota limestone flooring stone. 600×600mm. Polished finish. Price per square foot.', 'cat-0001-0000-0000-0000-000000000008'::uuid, 'scheduled', 'sq_ft', 5.0, false, '25151200', 5.0, true),
('prod-0001-0000-0000-0000-000000000039'::uuid, 'Vitrified Floor Tile 600×600mm (per sqft)', 'vitrified-floor-tile-600x600mm-per-sqft', 'Double charged vitrified tile. 600×600mm. 8-9mm thickness. Price per square foot. Random design.', 'cat-0001-0000-0000-0000-000000000008'::uuid, 'scheduled', 'sq_ft', 3.5, false, '69072100', 18.0, true),
('prod-0001-0000-0000-0000-000000000040'::uuid, 'Sal Wood Plank 3"×1" (12ft)', 'sal-wood-plank-3x1inch-12ft', 'Seasoned Sal (Shorea robusta) wood plank. 3 inch × 1 inch × 12 feet. For shuttering and centering.', 'cat-0001-0000-0000-0000-000000000008'::uuid, 'scheduled', 'piece', 4.5, false, '44079990', 12.0, true)

ON CONFLICT (slug) DO NOTHING;

-- ── Shop Inventory (all 40 products, Sharma Hardware) ─────────────────────────
-- Prices are in PAISE. Standard Patna market rates (July 2024 approx).
INSERT INTO shop_inventory (shop_id, product_id, price, mrp, cost_price, stock_quantity, low_stock_threshold, is_listed)
SELECT
  'shop-0001-0000-0000-0000-000000000001'::uuid,
  id,
  price_paise,
  mrp_paise,
  cost_paise,
  stock_qty,
  low_threshold,
  true
FROM (VALUES
  -- Quick Tier
  ('prod-0001-0000-0000-0000-000000000001'::uuid,  68000::bigint,  75000::bigint,  58000::bigint,  80::numeric, 5::numeric),  -- Asian Paints Emulsion 4L
  ('prod-0001-0000-0000-0000-000000000002'::uuid,  72000,  80000,  62000,  50,  5),   -- Berger WeatherCoat 4L
  ('prod-0001-0000-0000-0000-000000000003'::uuid,  42000,  48000,  36000,  60,  5),   -- Asian Paints Primer 4L
  ('prod-0001-0000-0000-0000-000000000004'::uuid,  18000,  22000,  14000,  40, 10),   -- Paint Brush Set
  ('prod-0001-0000-0000-0000-000000000005'::uuid,  14500,  18000,  11000,  30, 10),   -- Paint Roller
  ('prod-0001-0000-0000-0000-000000000006'::uuid,   6500,   8000,   5000, 100, 20),   -- Anchor Switch
  ('prod-0001-0000-0000-0000-000000000007'::uuid,   7500,   9500,   6000, 100, 20),   -- Anchor Socket
  ('prod-0001-0000-0000-0000-000000000008'::uuid,  85000, 100000,  72000,  20,  5),   -- Havells Wire 90m
  ('prod-0001-0000-0000-0000-000000000009'::uuid,   9500,  12000,   7500,  50, 10),   -- PVC Conduit Pipe
  ('prod-0001-0000-0000-0000-000000000010'::uuid,  38000,  45000,  32000,  25,  5),   -- MCB 32A
  ('prod-0001-0000-0000-0000-000000000011'::uuid,  14500,  18000,  12000,  40,  8),   -- CPVC Pipe 1/2"
  ('prod-0001-0000-0000-0000-000000000012'::uuid,   8500,  11000,   7000,  50, 10),   -- Ball Valve 1/2"
  ('prod-0001-0000-0000-0000-000000000013'::uuid,   5500,   7000,   4200,  80, 20),   -- CPVC Elbow pack
  ('prod-0001-0000-0000-0000-000000000014'::uuid,  18500,  24000,  15000,  20,  5),   -- Cera Pillar Cock
  ('prod-0001-0000-0000-0000-000000000015'::uuid,   5500,   7000,   4200, 100, 20),   -- GI Wood Screw 2"
  ('prod-0001-0000-0000-0000-000000000016'::uuid,   9500,  12500,   7800,  60, 15),   -- SS Butt Hinge 4"
  ('prod-0001-0000-0000-0000-000000000017'::uuid,  18500,  24000,  15500,  25,  5),   -- Mortise Door Handle
  ('prod-0001-0000-0000-0000-000000000018'::uuid,  12000,  15500,   9500,  40, 10),   -- Hasp & Staple 6"
  ('prod-0001-0000-0000-0000-000000000019'::uuid,   9500,  12000,   8000,  50, 10),   -- GI Wire 14G 1kg
  ('prod-0001-0000-0000-0000-000000000020'::uuid,   4500,   5800,   3600,  60, 15),   -- Fevicol SH 500g
  ('prod-0001-0000-0000-0000-000000000021'::uuid,   9500,  12000,   8000,  40, 10),   -- Silicone Sealant
  ('prod-0001-0000-0000-0000-000000000022'::uuid,  19000,  23000,  16000,  30,  5),   -- Birla White Putty 5kg
  ('prod-0001-0000-0000-0000-000000000023'::uuid,  14500,  18000,  12000,  20,  5),   -- Measuring Tape 5m
  ('prod-0001-0000-0000-0000-000000000024'::uuid,  18500,  24000,  15500,  15,  3),   -- Spirit Level 24"
  ('prod-0001-0000-0000-0000-000000000025'::uuid,  14500,  18500,  12000,  20,  5),   -- Ball Peen Hammer
  -- Scheduled Tier
  ('prod-0001-0000-0000-0000-000000000026'::uuid,  39000,  42000,  35000, 200, 20),   -- UltraTech PPC 50kg
  ('prod-0001-0000-0000-0000-000000000027'::uuid,  38000,  41000,  34000, 150, 20),   -- ACC Gold 50kg
  ('prod-0001-0000-0000-0000-000000000028'::uuid, 320000, 380000, 280000,  50,  5),   -- River Sand 1 brass
  ('prod-0001-0000-0000-0000-000000000029'::uuid, 200000, 240000, 175000,  40,  5),   -- Stone Aggregate 1 brass
  ('prod-0001-0000-0000-0000-000000000030'::uuid, 340000, 390000, 300000,  10,  2),   -- Red Fly Ash Brick 500
  ('prod-0001-0000-0000-0000-000000000031'::uuid,  88000, 100000,  80000, 100, 20),   -- TMT 8mm 12m
  ('prod-0001-0000-0000-0000-000000000032'::uuid, 125000, 140000, 115000,  80, 15),   -- TMT 10mm 12m
  ('prod-0001-0000-0000-0000-000000000033'::uuid, 175000, 195000, 162000,  60, 10),   -- TMT 12mm 12m
  ('prod-0001-0000-0000-0000-000000000034'::uuid,   4200,   5200,   3500, 500, 50),   -- AAC Block 4"
  ('prod-0001-0000-0000-0000-000000000035'::uuid,   4800,   5800,   4000, 400, 50),   -- Hollow Block 8"
  ('prod-0001-0000-0000-0000-000000000036'::uuid,  82000,  96000,  72000,  50, 10),   -- GI Sheet 8ft
  ('prod-0001-0000-0000-0000-000000000037'::uuid,  32000,  38000,  28000, 100, 10),   -- White Cement 25kg
  ('prod-0001-0000-0000-0000-000000000038'::uuid,   5500,   6500,   4800, 1000, 100), -- Kota Stone sqft
  ('prod-0001-0000-0000-0000-000000000039'::uuid,   4200,   5000,   3600, 800, 100),  -- Vitrified Tile sqft
  ('prod-0001-0000-0000-0000-000000000040'::uuid,  14000,  16500,  12000,  80, 10)    -- Sal Wood Plank 12ft
) AS t(product_id, price_paise, mrp_paise, cost_paise, stock_qty, low_threshold)
ON CONFLICT (shop_id, product_id) DO NOTHING;
