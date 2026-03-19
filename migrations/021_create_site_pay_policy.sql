-- =============================================================================
-- Migration 021: Site Pay Policy & Extra Pay Types
-- Date: 2026-03-19
-- Purpose: Create tables for site-specific pay policies, rates, and public holidays
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Ensure work_sites table has required columns (extend existing table)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE work_locations
  ADD COLUMN IF NOT EXISTS site_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS site_type VARCHAR(20) DEFAULT 'gold_mine'
    CHECK (site_type IN ('gold_mine', 'coal_mine', 'office', 'warehouse', 'other')),
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Asia/Bangkok';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. public_holidays: configurable holiday calendar
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public_holidays (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  holiday_date DATE NOT NULL,
  holiday_name VARCHAR(200) NOT NULL,
  holiday_name_th VARCHAR(200),
  year INTEGER GENERATED ALWAYS AS (EXTRACT(YEAR FROM holiday_date)::INTEGER) STORED,
  country_code CHAR(2) DEFAULT 'LA',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(holiday_date, country_code)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. site_pay_policies: per-site pay policy with effective dates
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_pay_policies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  work_site_id UUID REFERENCES work_locations(id),
  policy_name VARCHAR(200) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,                               -- null = current policy
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. site_pay_rates: specific rates per pay type within a policy
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_pay_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  policy_id UUID REFERENCES site_pay_policies(id) ON DELETE CASCADE,
  pay_type VARCHAR(30) NOT NULL CHECK (pay_type IN (
    'OT_NORMAL_DAY',
    'OT_NORMAL_NIGHT',
    'PIECE_WORK_DAY',
    'PIECE_WORK_NIGHT',
    'HOLIDAY_DAY',
    'HOLIDAY_NIGHT',
    'LUNCH_OT',
    'NIGHT_ALLOWANCE'
  )),
  multiplier DECIMAL(5,3),                         -- e.g., 1.5, 2.0, 3.5
  fixed_amount DECIMAL(15,2),                      -- e.g., 40000 LAK
  calculation_method VARCHAR(20) NOT NULL CHECK (calculation_method IN ('multiplier', 'fixed')),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(policy_id, pay_type)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_public_holidays_date ON public_holidays(holiday_date);
CREATE INDEX IF NOT EXISTS idx_public_holidays_year ON public_holidays(year, country_code);
CREATE INDEX IF NOT EXISTS idx_site_pay_policies_site ON site_pay_policies(work_site_id, is_active);
CREATE INDEX IF NOT EXISTS idx_site_pay_rates_policy ON site_pay_rates(policy_id, pay_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_pay_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_pay_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_holidays_all ON public_holidays FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY site_pay_policies_all ON site_pay_policies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY site_pay_rates_all ON site_pay_rates FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: Lao public holidays 2026
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public_holidays (holiday_date, holiday_name, holiday_name_th, country_code)
VALUES
  ('2026-01-01', 'New Year Day', 'วันขึ้นปีใหม่', 'LA'),
  ('2026-01-02', 'New Year (extra)', 'วันหยุดพิเศษ', 'LA'),
  ('2026-01-20', 'Lao Army Day', 'วันกองทัพลาว', 'LA'),
  ('2026-03-08', 'Women''s Day', 'วันสตรีสากล', 'LA'),
  ('2026-04-14', 'Lao New Year Day 1', 'วันปีใหม่ลาว 1', 'LA'),
  ('2026-04-15', 'Lao New Year Day 2', 'วันปีใหม่ลาว 2', 'LA'),
  ('2026-04-16', 'Lao New Year Day 3', 'วันปีใหม่ลาว 3', 'LA'),
  ('2026-05-01', 'Labour Day', 'วันแรงงานสากล', 'LA'),
  ('2026-06-01', 'Children''s Day', 'วันเด็กสากล', 'LA'),
  ('2026-07-20', 'Pathet Lao Day', 'วันก่อตั้งประเทศลาว', 'LA'),
  ('2026-08-13', 'Lao Women''s Day', 'วันสตรีลาว', 'LA'),
  ('2026-10-12', 'Freedom from France Day', 'วันชาติลาว', 'LA'),
  ('2026-12-01', 'Lao Foundation Day', 'วันสถาปนา สปป.ลาว', 'LA'),
  ('2026-12-02', 'National Day (extra)', 'วันชาติ (พิเศษ)', 'LA')
ON CONFLICT (holiday_date, country_code) DO NOTHING;

COMMENT ON TABLE public_holidays IS 'Configurable public holiday calendar (Laos default)';
COMMENT ON TABLE site_pay_policies IS 'Per-site effective-date pay policies';
COMMENT ON TABLE site_pay_rates IS 'Pay type rates within a policy (multiplier or fixed amount)';
