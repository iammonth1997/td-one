-- Create salary_slips and ot_slips tables for slip display

CREATE TABLE IF NOT EXISTS salary_slips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES employees(id),
  year INT NOT NULL,
  month INT NOT NULL,
  basic_salary DECIMAL(12, 2),
  allowance DECIMAL(12, 2),
  bonus DECIMAL(12, 2),
  deduction DECIMAL(12, 2),
  tax DECIMAL(12, 2),
  net_salary DECIMAL(12, 2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, year, month)
);

CREATE TABLE IF NOT EXISTS ot_slips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES employees(id),
  year INT NOT NULL,
  month INT NOT NULL,
  ot_normal_hours DECIMAL(8, 2),
  ot_normal_rate DECIMAL(8, 2),
  ot_normal_amount DECIMAL(12, 2),
  ot_holiday_hours DECIMAL(8, 2),
  ot_holiday_rate DECIMAL(8, 2),
  ot_holiday_amount DECIMAL(12, 2),
  incentive_amount DECIMAL(12, 2),
  total_ot_incentive DECIMAL(12, 2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_salary_slips_employee_period ON salary_slips(employee_id, year, month);
CREATE INDEX IF NOT EXISTS idx_ot_slips_employee_period ON ot_slips(employee_id, year, month);

CREATE OR REPLACE FUNCTION update_salary_slips_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_salary_slips_updated_at ON salary_slips;
CREATE TRIGGER trg_salary_slips_updated_at
BEFORE UPDATE ON salary_slips
FOR EACH ROW
EXECUTE FUNCTION update_salary_slips_updated_at();

CREATE OR REPLACE FUNCTION update_ot_slips_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ot_slips_updated_at ON ot_slips;
CREATE TRIGGER trg_ot_slips_updated_at
BEFORE UPDATE ON ot_slips
FOR EACH ROW
EXECUTE FUNCTION update_ot_slips_updated_at();

ALTER TABLE salary_slips ENABLE ROW LEVEL SECURITY;
ALTER TABLE ot_slips ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'salary_slips_service_role_all' AND tablename = 'salary_slips'
  ) THEN
    CREATE POLICY salary_slips_service_role_all ON salary_slips FOR ALL USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'ot_slips_service_role_all' AND tablename = 'ot_slips'
  ) THEN
    CREATE POLICY ot_slips_service_role_all ON ot_slips FOR ALL USING (true);
  END IF;
END $$;
