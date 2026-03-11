-- Attendance + Work Location + Device Binding for Scan In/Out

CREATE TABLE IF NOT EXISTS work_locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  radius_meters INT DEFAULT 200,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id),
  date DATE NOT NULL,
  scan_in_time TIMESTAMPTZ,
  scan_in_latitude DECIMAL(10, 8),
  scan_in_longitude DECIMAL(11, 8),
  scan_in_location_id UUID REFERENCES work_locations(id),
  scan_in_photo_url TEXT,
  scan_in_device_id VARCHAR(100),
  scan_out_time TIMESTAMPTZ,
  scan_out_latitude DECIMAL(10, 8),
  scan_out_longitude DECIMAL(11, 8),
  scan_out_location_id UUID REFERENCES work_locations(id),
  scan_out_photo_url TEXT,
  scan_out_device_id VARCHAR(100),
  status VARCHAR(20) DEFAULT 'present',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, date)
);

CREATE TABLE IF NOT EXISTS employee_devices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id) UNIQUE,
  device_id VARCHAR(100) NOT NULL,
  device_name VARCHAR(100),
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS attendance_scan_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id),
  emp_code VARCHAR(20),
  date DATE NOT NULL,
  action_type VARCHAR(20) NOT NULL,
  success BOOLEAN DEFAULT false,
  reason TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  accuracy_meters DECIMAL(10, 2),
  location_id UUID REFERENCES work_locations(id),
  distance_meters INT,
  device_id VARCHAR(100),
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_locations_active ON work_locations(is_active);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_scan_logs_employee_date ON attendance_scan_logs(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_scan_logs_created_at ON attendance_scan_logs(created_at DESC);

ALTER TABLE work_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_scan_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'work_locations_service_role_all' AND tablename = 'work_locations'
  ) THEN
    CREATE POLICY work_locations_service_role_all ON work_locations FOR ALL USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'attendance_service_role_all' AND tablename = 'attendance'
  ) THEN
    CREATE POLICY attendance_service_role_all ON attendance FOR ALL USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'employee_devices_service_role_all' AND tablename = 'employee_devices'
  ) THEN
    CREATE POLICY employee_devices_service_role_all ON employee_devices FOR ALL USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'attendance_scan_logs_service_role_all' AND tablename = 'attendance_scan_logs'
  ) THEN
    CREATE POLICY attendance_scan_logs_service_role_all ON attendance_scan_logs FOR ALL USING (true);
  END IF;
END $$;
