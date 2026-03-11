-- Leave + Time Correction module

CREATE TABLE IF NOT EXISTS leave_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name_lo VARCHAR(50) NOT NULL,
  name_th VARCHAR(50) NOT NULL,
  name_en VARCHAR(50) NOT NULL,
  max_days_per_year INT,
  is_paid BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO leave_types (code, name_lo, name_th, name_en, max_days_per_year, is_paid)
VALUES
  ('sick', 'ລາປ່ວຍ', 'ลาป่วย', 'Sick Leave', 30, true),
  ('personal', 'ລາກິດ', 'ลากิจ', 'Personal Leave', 6, true),
  ('annual', 'ລາພັກຮ້ອນ', 'ลาพักร้อน', 'Annual Leave', 6, true),
  ('unpaid', 'ລາບໍ່ໄດ້ຮັບຄ່າຈ້າງ', 'ลาไม่ได้รับค่าจ้าง', 'Unpaid Leave', NULL, false),
  ('maternity', 'ລາເກີດລູກ', 'ลาคลอด', 'Maternity Leave', 98, true),
  ('other', 'ລາອື່ນໆ', 'ลาอื่นๆ', 'Other Leave', NULL, false)
ON CONFLICT (code) DO UPDATE
SET
  name_lo = EXCLUDED.name_lo,
  name_th = EXCLUDED.name_th,
  name_en = EXCLUDED.name_en,
  max_days_per_year = EXCLUDED.max_days_per_year,
  is_paid = EXCLUDED.is_paid,
  is_active = true;

CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id),
  leave_type_code VARCHAR(20) REFERENCES leave_types(code),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days DECIMAL(3, 1) NOT NULL,
  reason TEXT,
  attachment_url TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  approved_by UUID REFERENCES employees(id),
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS time_correction_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id),
  date DATE NOT NULL,
  correction_type VARCHAR(20) NOT NULL,
  requested_scan_in TIME,
  requested_scan_out TIME,
  reason TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  approved_by UUID REFERENCES employees(id),
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leave_balances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id),
  leave_type_code VARCHAR(20) REFERENCES leave_types(code),
  year INT NOT NULL,
  total_days INT NOT NULL,
  used_days INT DEFAULT 0,
  UNIQUE(employee_id, leave_type_code, year)
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_date ON leave_requests(employee_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_time_correction_employee_date ON time_correction_requests(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_time_correction_status ON time_correction_requests(status);

CREATE OR REPLACE FUNCTION update_leave_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leave_requests_updated_at ON leave_requests;
CREATE TRIGGER trg_leave_requests_updated_at
BEFORE UPDATE ON leave_requests
FOR EACH ROW
EXECUTE FUNCTION update_leave_requests_updated_at();

CREATE OR REPLACE FUNCTION update_time_correction_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_time_correction_requests_updated_at ON time_correction_requests;
CREATE TRIGGER trg_time_correction_requests_updated_at
BEFORE UPDATE ON time_correction_requests
FOR EACH ROW
EXECUTE FUNCTION update_time_correction_requests_updated_at();

ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_correction_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'leave_types_service_role_all' AND tablename = 'leave_types'
  ) THEN
    CREATE POLICY leave_types_service_role_all ON leave_types FOR ALL USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'leave_requests_service_role_all' AND tablename = 'leave_requests'
  ) THEN
    CREATE POLICY leave_requests_service_role_all ON leave_requests FOR ALL USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'time_correction_requests_service_role_all' AND tablename = 'time_correction_requests'
  ) THEN
    CREATE POLICY time_correction_requests_service_role_all ON time_correction_requests FOR ALL USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'leave_balances_service_role_all' AND tablename = 'leave_balances'
  ) THEN
    CREATE POLICY leave_balances_service_role_all ON leave_balances FOR ALL USING (true);
  END IF;
END $$;
