-- ============================================================================
-- Migration 085: Supplemental RLS Policies
-- TezzNirmaan -- Session Q
-- ============================================================================
-- Adds RLS to tables created in migrations 012-084 that were missing it.
-- All backend Express calls use service_role key -> bypass RLS automatically.
-- ============================================================================

-- ============================================================================
-- 1. CUSTOMER WALLETS (028_wallet)
-- ============================================================================
ALTER TABLE customer_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_wallets_select_own ON customer_wallets;
CREATE POLICY customer_wallets_select_own ON customer_wallets
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS customer_wallets_select_admin ON customer_wallets;
CREATE POLICY customer_wallets_select_admin ON customer_wallets
  FOR SELECT USING (public.current_user_role() = 'platform_admin');


-- ============================================================================
-- 2. PROMO CODES (026_promos)
-- ============================================================================
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promo_codes_select_public ON promo_codes;
CREATE POLICY promo_codes_select_public ON promo_codes
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS promo_codes_select_admin ON promo_codes;
CREATE POLICY promo_codes_select_admin ON promo_codes
  FOR SELECT USING (public.current_user_role() = 'platform_admin');

DROP POLICY IF EXISTS promo_codes_insert_admin ON promo_codes;
CREATE POLICY promo_codes_insert_admin ON promo_codes
  FOR INSERT WITH CHECK (public.current_user_role() = 'platform_admin');

DROP POLICY IF EXISTS promo_codes_update_admin ON promo_codes;
CREATE POLICY promo_codes_update_admin ON promo_codes
  FOR UPDATE USING (public.current_user_role() = 'platform_admin');


-- ============================================================================
-- 3. DELIVERY SLOT BOOKINGS (020_delivery_slots)
-- ============================================================================
ALTER TABLE delivery_slot_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS slot_bookings_select_customer ON delivery_slot_bookings;
CREATE POLICY slot_bookings_select_customer ON delivery_slot_bookings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = delivery_slot_bookings.order_id
        AND o.customer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS slot_bookings_select_admin ON delivery_slot_bookings;
CREATE POLICY slot_bookings_select_admin ON delivery_slot_bookings
  FOR SELECT USING (public.current_user_role() = 'platform_admin');


-- ============================================================================
-- 4. EMI PLANS + EMI PAYMENTS (067_emi_plans)
-- ============================================================================
ALTER TABLE emi_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS emi_plans_select_own ON emi_plans;
CREATE POLICY emi_plans_select_own ON emi_plans
  FOR SELECT USING (customer_id = auth.uid());

DROP POLICY IF EXISTS emi_plans_select_admin ON emi_plans;
CREATE POLICY emi_plans_select_admin ON emi_plans
  FOR SELECT USING (public.current_user_role() = 'platform_admin');

ALTER TABLE emi_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS emi_payments_select_own ON emi_payments;
CREATE POLICY emi_payments_select_own ON emi_payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM emi_plans ep
      WHERE ep.id = emi_payments.plan_id
        AND ep.customer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS emi_payments_select_admin ON emi_payments;
CREATE POLICY emi_payments_select_admin ON emi_payments
  FOR SELECT USING (public.current_user_role() = 'platform_admin');


-- ============================================================================
-- 5. AI CHAT HISTORY (072_ai_chat_history)
-- ============================================================================
ALTER TABLE ai_chat_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_chat_select_own ON ai_chat_history;
CREATE POLICY ai_chat_select_own ON ai_chat_history
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS ai_chat_insert_own ON ai_chat_history;
CREATE POLICY ai_chat_insert_own ON ai_chat_history
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS ai_chat_select_admin ON ai_chat_history;
CREATE POLICY ai_chat_select_admin ON ai_chat_history
  FOR SELECT USING (public.current_user_role() = 'platform_admin');


-- ============================================================================
-- 6. BULK QUOTE REQUESTS (066_bulk_quotes)
-- ============================================================================
ALTER TABLE bulk_quote_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bulk_quotes_select_own ON bulk_quote_requests;
CREATE POLICY bulk_quotes_select_own ON bulk_quote_requests
  FOR SELECT USING (customer_id = auth.uid());

DROP POLICY IF EXISTS bulk_quotes_insert_own ON bulk_quote_requests;
CREATE POLICY bulk_quotes_insert_own ON bulk_quote_requests
  FOR INSERT WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS bulk_quotes_select_admin ON bulk_quote_requests;
CREATE POLICY bulk_quotes_select_admin ON bulk_quote_requests
  FOR SELECT USING (public.current_user_role() = 'platform_admin');

DROP POLICY IF EXISTS bulk_quotes_update_admin ON bulk_quote_requests;
CREATE POLICY bulk_quotes_update_admin ON bulk_quote_requests
  FOR UPDATE USING (public.current_user_role() = 'platform_admin');


-- ============================================================================
-- 7. REFERRAL CODES (031_referrals)
-- ============================================================================
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_codes_select_public ON referral_codes;
CREATE POLICY referral_codes_select_public ON referral_codes
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS referral_codes_select_own ON referral_codes;
CREATE POLICY referral_codes_select_own ON referral_codes
  FOR SELECT USING (owner_id = auth.uid());

DROP POLICY IF EXISTS referral_codes_select_admin ON referral_codes;
CREATE POLICY referral_codes_select_admin ON referral_codes
  FOR SELECT USING (public.current_user_role() = 'platform_admin');


-- ============================================================================
-- 8. PAYOUT REQUESTS (052) - shop owner + admin
-- ============================================================================
ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payout_requests_select_owner ON payout_requests;
CREATE POLICY payout_requests_select_owner ON payout_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM shops s
      WHERE s.id = payout_requests.shop_id
        AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS payout_requests_insert_owner ON payout_requests;
CREATE POLICY payout_requests_insert_owner ON payout_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM shops s
      WHERE s.id = payout_requests.shop_id
        AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS payout_requests_select_admin ON payout_requests;
CREATE POLICY payout_requests_select_admin ON payout_requests
  FOR SELECT USING (public.current_user_role() = 'platform_admin');

DROP POLICY IF EXISTS payout_requests_update_admin ON payout_requests;
CREATE POLICY payout_requests_update_admin ON payout_requests
  FOR UPDATE USING (public.current_user_role() = 'platform_admin');


-- ============================================================================
-- 9. RIDER EARNINGS (082)
-- ============================================================================
ALTER TABLE rider_earnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rider_earnings_select_own ON rider_earnings;
CREATE POLICY rider_earnings_select_own ON rider_earnings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM riders r
      WHERE r.id = rider_earnings.rider_id
        AND r.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS rider_earnings_select_admin ON rider_earnings;
CREATE POLICY rider_earnings_select_admin ON rider_earnings
  FOR SELECT USING (public.current_user_role() = 'platform_admin');


-- ============================================================================
-- 10. FLASH SALES (062) - public read active, admin write
-- ============================================================================
ALTER TABLE flash_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flash_sales_select_public ON flash_sales;
CREATE POLICY flash_sales_select_public ON flash_sales
  FOR SELECT USING (is_active = true AND start_time <= now() AND end_time >= now());

DROP POLICY IF EXISTS flash_sales_select_admin ON flash_sales;
CREATE POLICY flash_sales_select_admin ON flash_sales
  FOR SELECT USING (public.current_user_role() = 'platform_admin');

DROP POLICY IF EXISTS flash_sales_insert_admin ON flash_sales;
CREATE POLICY flash_sales_insert_admin ON flash_sales
  FOR INSERT WITH CHECK (public.current_user_role() = 'platform_admin');

DROP POLICY IF EXISTS flash_sales_update_admin ON flash_sales;
CREATE POLICY flash_sales_update_admin ON flash_sales
  FOR UPDATE USING (public.current_user_role() = 'platform_admin');


-- ============================================================================
-- 11. LOYALTY STAMPS (076)
-- ============================================================================
ALTER TABLE loyalty_stamps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loyalty_stamps_select_own ON loyalty_stamps;
CREATE POLICY loyalty_stamps_select_own ON loyalty_stamps
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS loyalty_stamps_select_admin ON loyalty_stamps;
CREATE POLICY loyalty_stamps_select_admin ON loyalty_stamps
  FOR SELECT USING (public.current_user_role() = 'platform_admin');


-- ============================================================================
-- 12. INTERNAL / ADMIN-ONLY TABLES
-- Enable RLS with no customer policies -> only service_role bypasses.
-- ============================================================================
ALTER TABLE settlement_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS settlement_items_select_admin ON settlement_items;
CREATE POLICY settlement_items_select_admin ON settlement_items
  FOR SELECT USING (public.current_user_role() = 'platform_admin');

ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS commission_rules_select_admin ON commission_rules;
CREATE POLICY commission_rules_select_admin ON commission_rules
  FOR SELECT USING (public.current_user_role() = 'platform_admin');

ALTER TABLE route_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS route_transfers_select_admin ON route_transfers;
CREATE POLICY route_transfers_select_admin ON route_transfers
  FOR SELECT USING (public.current_user_role() = 'platform_admin');

ALTER TABLE rider_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rider_payouts_select_own ON rider_payouts;
CREATE POLICY rider_payouts_select_own ON rider_payouts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM riders r
      WHERE r.id = rider_payouts.rider_id
        AND r.profile_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS rider_payouts_select_admin ON rider_payouts;
CREATE POLICY rider_payouts_select_admin ON rider_payouts
  FOR SELECT USING (public.current_user_role() = 'platform_admin');

ALTER TABLE search_queries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS search_queries_select_admin ON search_queries;
CREATE POLICY search_queries_select_admin ON search_queries
  FOR SELECT USING (public.current_user_role() = 'platform_admin');

ALTER TABLE search_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS search_logs_select_admin ON search_logs;
CREATE POLICY search_logs_select_admin ON search_logs
  FOR SELECT USING (public.current_user_role() = 'platform_admin');

ALTER TABLE low_stock_thresholds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS low_stock_select_owner ON low_stock_thresholds;
CREATE POLICY low_stock_select_owner ON low_stock_thresholds
  FOR SELECT USING (public.is_shop_owner(shop_id));
DROP POLICY IF EXISTS low_stock_select_admin ON low_stock_thresholds;
CREATE POLICY low_stock_select_admin ON low_stock_thresholds
  FOR SELECT USING (public.current_user_role() = 'platform_admin');

ALTER TABLE payout_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payout_batches_select_admin ON payout_batches;
CREATE POLICY payout_batches_select_admin ON payout_batches
  FOR SELECT USING (public.current_user_role() = 'platform_admin');

-- schema_migrations: internal only, no policies -> service_role access only
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
