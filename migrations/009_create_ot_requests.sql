-- OT Request module

CREATE TABLE IF NOT EXISTS ot_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name_lo VARCHAR(50) NOT NULL,
  name_th VARCHAR(50) NOT NULL,
  name_en VARCHAR(50) NOT NULL,
  rate_multiplier DECIMAL(3, 2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO ot_types (code, name_lo, name_th, name_en, rate_multiplier)
VALUES
  ('normal', 'OT ປົກກະຕິ', 'OT ปกติ', 'Normal OT', 1.50),
  ('holiday', 'OT ວັນພັກ', 'OT วันหยุด', 'Holiday OT', 2.00),
  ('special', 'OT ພິເສດ', 'OT พิเศษ', 'Special OT', 3.00)
ON CONFLICT (code) DO UPDATE
SET
  name_lo = EXCLUDED.name_lo,
  name_th = EXCLUDED.name_th,
  name_en = EXCLUDED.name_en,
  rate_multiplier = EXCLUDED.rate_multiplier,
  is_active = true;

CREATE TABLE IF NOT EXISTS ot_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id),
  ot_type_code VARCHAR(20) REFERENCES ot_types(code),
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  total_hours DECIMAL(4, 2) NOT NULL,
  rate_multiplier DECIMAL(3, 2) NOT NULL,
  reason TEXT NOT NULL,
  project_ref VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending',
  approved_by UUID REFERENCES employees(id),
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  cross_midnight BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ot_requests_employee_date ON ot_requests(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_ot_requests_status ON ot_requests(status);

CREATE OR REPLACE FUNCTION update_ot_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ot_requests_updated_at ON ot_requests;
CREATE TRIGGER trg_ot_requests_updated_at
BEFORE UPDATE ON ot_requests
FOR EACH ROW
EXECUTE FUNCTION update_ot_requests_updated_at();

CREATE OR REPLACE VIEW ot_monthly_summary AS
SELECT
  employee_id,
  DATE_TRUNC('month', date)::date AS month,
  SUM(total_hours) AS total_ot_hours,
  SUM(CASE WHEN ot_type_code = 'normal' THEN total_hours ELSE 0 END) AS normal_ot_hours,
  SUM(CASE WHEN ot_type_code = 'holiday' THEN total_hours ELSE 0 END) AS holiday_ot_hours,
  SUM(CASE WHEN ot_type_code = 'special' THEN total_hours ELSE 0 END) AS special_ot_hours
FROM ot_requests
WHERE status = 'approved'
GROUP BY employee_id, DATE_TRUNC('month', date);

ALTER TABLE ot_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE ot_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'ot_types_service_role_all' AND tablename = 'ot_types'
  ) THEN
    CREATE POLICY ot_types_service_role_all ON ot_types FOR ALL USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'ot_requests_service_role_all' AND tablename = 'ot_requests'
  ) THEN
    CREATE POLICY ot_requests_service_role_all ON ot_requests FOR ALL USING (true);
  END IF;
END $$;
