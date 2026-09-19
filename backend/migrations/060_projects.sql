-- ─────────────────────────────────────────────────────────────
-- 060_projects.sql — P12-7
--
-- Contractor project management: named projects with multiple
-- orders tagged to them. Allows contractors to track spend,
-- reorder lists, and get project-wise GST invoices.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contractor_projects (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID        NOT NULL REFERENCES contractor_profiles(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,           -- e.g. "Anand Nagar Building Site"
  description   TEXT,
  site_address  TEXT,                           -- Delivery address for project
  status        TEXT        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','completed','paused')),
  budget_paise  BIGINT,                         -- Optional budget tracker
  spent_paise   BIGINT      NOT NULL DEFAULT 0, -- Auto-updated by trigger
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tag orders to a project
ALTER TABLE b2b_orders
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES contractor_projects(id) ON DELETE SET NULL;

-- ── Trigger: update project.spent_paise when b2b_order paid ──
CREATE OR REPLACE FUNCTION sync_project_spend()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    UPDATE contractor_projects
    SET spent_paise = (
      SELECT COALESCE(SUM(o.total_amount), 0)
      FROM b2b_orders bo
      JOIN orders o ON o.id = bo.order_id
      WHERE bo.project_id = NEW.project_id
    )
    WHERE id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_project_spend ON b2b_orders;
CREATE TRIGGER trg_sync_project_spend
  AFTER INSERT OR UPDATE OF project_id ON b2b_orders
  FOR EACH ROW EXECUTE FUNCTION sync_project_spend();

-- ── updated_at trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_contractor_projects_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_contractor_projects_updated_at ON contractor_projects;
CREATE TRIGGER trg_contractor_projects_updated_at
  BEFORE UPDATE ON contractor_projects
  FOR EACH ROW EXECUTE FUNCTION update_contractor_projects_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE contractor_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Contractors manage own projects" ON contractor_projects;
CREATE POLICY "Contractors manage own projects"
  ON contractor_projects FOR ALL
  USING (
    contractor_id IN (
      SELECT id FROM contractor_profiles WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    contractor_id IN (
      SELECT id FROM contractor_profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins manage all projects" ON contractor_projects;
CREATE POLICY "Admins manage all projects"
  ON contractor_projects FOR ALL
  USING ((auth.jwt() ->> 'role') = 'platform_admin');

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_contractor_projects_contractor ON contractor_projects (contractor_id, status);
CREATE INDEX IF NOT EXISTS idx_b2b_orders_project            ON b2b_orders (project_id) WHERE project_id IS NOT NULL;

-- ── Product reminders: recurring order templates ─────────────
-- Add "template" flag to product_reminders (050_product_reminders.sql)
-- so contractors can save recurring order lists per project.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_reminders')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_reminders' AND column_name = 'project_id') THEN
    ALTER TABLE product_reminders
      ADD COLUMN project_id UUID REFERENCES contractor_projects(id) ON DELETE SET NULL,
      ADD COLUMN is_recurring BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN recurrence_days INTEGER;
  END IF;
END $$;
