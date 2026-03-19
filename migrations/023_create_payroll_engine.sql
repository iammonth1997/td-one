-- =============================================================================
-- Migration 023: Payroll Engine Tables
-- Date: 2026-03-19
-- Purpose: Full payroll system — salary runs, OT runs, tax, deductions
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. employee_payroll_settings: per-employee salary & site config
--    (extends existing employees table without modifying it)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_payroll_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE UNIQUE,
  emp_code VARCHAR(20),                            -- denormalized for quick lookup
  pay_type VARCHAR(10) NOT NULL DEFAULT 'monthly'
    CHECK (pay_type IN ('monthly', 'daily')),
  base_salary DECIMAL(15,2),                       -- for monthly employees (LAK)
  daily_rate DECIMAL(15,2),                        -- for daily employees (LAK)
  work_site_id UUID REFERENCES work_locations(id),
  bank_account_no VARCHAR(50),
  bank_name VARCHAR(100),
  social_security_no VARCHAR(30),
  social_security_enrolled BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. tax_brackets: configurable progressive tax rates (Lao PIT)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_brackets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code CHAR(2) DEFAULT 'LA',
  effective_from DATE NOT NULL,
  effective_to DATE,
  min_amount DECIMAL(15,2) NOT NULL,
  max_amount DECIMAL(15,2),                        -- null = no upper limit
  rate_percent DECIMAL(5,2) NOT NULL,
  description VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. deduction_templates: standard deduction definitions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deduction_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  name_th VARCHAR(100),
  deduction_type VARCHAR(20) NOT NULL CHECK (deduction_type IN ('fixed', 'percentage', 'per_day')),
  default_amount DECIMAL(15,2),
  default_percentage DECIMAL(5,2),
  applies_to_run_type VARCHAR(20) DEFAULT 'salary'
    CHECK (applies_to_run_type IN ('salary', 'ot_incentive', 'both')),
  auto_apply BOOLEAN DEFAULT false,                -- auto-add to all employees
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. employee_deductions: per-employee recurring deductions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_deductions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  deduction_template_id UUID REFERENCES deduction_templates(id),
  custom_name VARCHAR(100),                        -- override template name
  amount DECIMAL(15,2),                            -- override template amount
  start_month VARCHAR(7) NOT NULL,                 -- "2026-03"
  end_month VARCHAR(7),                            -- null = ongoing
  remaining_amount DECIMAL(15,2),                  -- for loans
  created_by VARCHAR(100),
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. payroll_runs: payroll run batches
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_type VARCHAR(20) NOT NULL CHECK (run_type IN ('salary', 'ot_incentive')),
  period_month VARCHAR(7) NOT NULL,                -- "2026-03"
  pay_date DATE,                                   -- actual payment date
  work_site_id UUID REFERENCES work_locations(id), -- null = all sites
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'calculating', 'review', 'approved', 'paid', 'cancelled'
  )),
  total_gross DECIMAL(15,2) DEFAULT 0,
  total_deductions DECIMAL(15,2) DEFAULT 0,
  total_net DECIMAL(15,2) DEFAULT 0,
  total_employer_cost DECIMAL(15,2) DEFAULT 0,
  employee_count INTEGER DEFAULT 0,
  notes TEXT,
  created_by VARCHAR(100) NOT NULL,
  approved_by VARCHAR(100),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Prevent duplicate runs for same month + type (only for non-cancelled)
  CONSTRAINT unique_active_payroll_run UNIQUE NULLS NOT DISTINCT
    (period_month, run_type, work_site_id)
    DEFERRABLE INITIALLY DEFERRED
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. payroll_items: per-employee payroll line items within a run
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id),
  emp_code VARCHAR(20),                            -- denormalized
  pay_type VARCHAR(10) NOT NULL CHECK (pay_type IN ('monthly', 'daily')),

  -- Salary run fields
  base_amount DECIMAL(15,2) DEFAULT 0,
  work_days INTEGER DEFAULT 0,
  work_hours DECIMAL(7,2) DEFAULT 0,
  absent_days DECIMAL(5,2) DEFAULT 0,
  absent_hours DECIMAL(7,2) DEFAULT 0,
  absent_deduction DECIMAL(15,2) DEFAULT 0,

  -- OT run fields (JSON summary of each pay type)
  extra_pay_summary JSONB,                         -- {OT_NORMAL_DAY:{hours,amount}, ...}
  incentive_total DECIMAL(15,2) DEFAULT 0,

  -- Common fields
  gross_pay DECIMAL(15,2) DEFAULT 0,

  -- Deductions (salary run)
  social_security_employee DECIMAL(15,2) DEFAULT 0,
  social_security_employer DECIMAL(15,2) DEFAULT 0,
  income_tax DECIMAL(15,2) DEFAULT 0,
  deductions JSONB DEFAULT '[]'::jsonb,            -- [{name, amount}]
  total_deductions DECIMAL(15,2) DEFAULT 0,
  net_pay DECIMAL(15,2) DEFAULT 0,

  -- Warnings
  warnings JSONB DEFAULT '[]'::jsonb,              -- ["net_pay_negative", "ot_over_45h"]

  status VARCHAR(20) DEFAULT 'calculated' CHECK (status IN ('calculated', 'adjusted', 'approved', 'paid')),
  adjusted_by VARCHAR(100),
  adjustment_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(payroll_run_id, employee_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. incentive_records: bonus/incentive entries per employee per run
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incentive_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id),
  payroll_run_id UUID REFERENCES payroll_runs(id),
  period_month VARCHAR(7) NOT NULL,
  incentive_type VARCHAR(100) NOT NULL,            -- "ค่าขยัน", "โบนัสผลงาน"
  amount DECIMAL(15,2) NOT NULL,
  reason TEXT,
  created_by VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_employee_payroll_settings_emp ON employee_payroll_settings(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_payroll_settings_site ON employee_payroll_settings(work_site_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_period ON payroll_runs(period_month, run_type, status);
CREATE INDEX IF NOT EXISTS idx_payroll_items_run ON payroll_items(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_employee ON payroll_items(employee_id, payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_employee_deductions_employee ON employee_deductions(employee_id, is_active);
CREATE INDEX IF NOT EXISTS idx_incentive_records_employee ON incentive_records(employee_id, period_month);
CREATE INDEX IF NOT EXISTS idx_tax_brackets_active ON tax_brackets(country_code, is_active, min_amount);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE employee_payroll_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE deduction_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE incentive_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY employee_payroll_settings_all ON employee_payroll_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY tax_brackets_all ON tax_brackets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY deduction_templates_all ON deduction_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY employee_deductions_all ON employee_deductions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY payroll_runs_all ON payroll_runs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY payroll_items_all ON payroll_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY incentive_records_all ON incentive_records FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: Lao PIT tax brackets (effective 2024+)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO tax_brackets (country_code, effective_from, min_amount, max_amount, rate_percent, description)
VALUES
  ('LA', '2024-01-01', 0,          1300000,   0,   '0% (0 - 1.3M LAK/เดือน)'),
  ('LA', '2024-01-01', 1300001,    5000000,   5,   '5% (1.3M - 5M LAK/เดือน)'),
  ('LA', '2024-01-01', 5000001,    10000000,  10,  '10% (5M - 10M LAK/เดือน)'),
  ('LA', '2024-01-01', 10000001,   15000000,  15,  '15% (10M - 15M LAK/เดือน)'),
  ('LA', '2024-01-01', 15000001,   25000000,  20,  '20% (15M - 25M LAK/เดือน)'),
  ('LA', '2024-01-01', 25000001,   NULL,      25,  '25% (25M+ LAK/เดือน)')
ON CONFLICT DO NOTHING;

-- Seed: default deduction templates
INSERT INTO deduction_templates (name, name_th, deduction_type, applies_to_run_type, auto_apply)
VALUES
  ('Social Security (Employee)', 'ประกันสังคม (พนักงาน)', 'percentage', 'salary', true),
  ('Meal Allowance Deduction', 'หักค่าอาหาร', 'fixed', 'salary', false),
  ('Accommodation Deduction', 'หักค่าที่พัก', 'fixed', 'salary', false),
  ('Loan Installment', 'หักเงินกู้', 'fixed', 'salary', false),
  ('Work Uniform', 'ค่าเสื้อผ้า', 'fixed', 'ot_incentive', false),
  ('Equipment Deduction', 'ค่าอุปกรณ์', 'fixed', 'ot_incentive', false),
  ('Accident Deduction', 'หักค่าอุบัติเหตุ', 'fixed', 'salary', false),
  ('Advance Payment', 'หักเงินล่วงหน้า', 'fixed', 'salary', false)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE employee_payroll_settings IS 'Per-employee payroll config: salary, pay type, site assignment';
COMMENT ON TABLE payroll_runs IS 'Payroll batch runs — draft→calculating→review→approved→paid lifecycle';
COMMENT ON TABLE payroll_items IS 'Per-employee calculated payroll line items within a run';
COMMENT ON TABLE tax_brackets IS 'Configurable progressive tax rate table (Lao PIT default seeded)';
