-- 075_first_order_discount.sql - P19-4
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_order_discount_used BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_orders_count INTEGER DEFAULT 0;
COMMENT ON COLUMN profiles.first_order_discount_used IS 'True after first-order 10% welcome discount is claimed';
COMMENT ON COLUMN profiles.total_orders_count IS 'Denormalized count updated on each delivered order for fast lookup';