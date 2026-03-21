-- Suspicious attendance scan records for HR review workflow

CREATE TABLE IF NOT EXISTS attendance_suspicious_scans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id),
  employee_code VARCHAR(20),
  attendance_id UUID REFERENCES attendance(id),
  scan_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  gps_position JSONB NOT NULL,
  suspicion_score INT NOT NULL DEFAULT 0,
  suspicion_flags TEXT[] DEFAULT ARRAY[]::TEXT[],
  face_match_score DECIMAL(5, 2),
  device_id VARCHAR(100),
  scan_status VARCHAR(20) NOT NULL CHECK (scan_status IN ('normal', 'flagged', 'blocked')),
  review_action VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (review_action IN ('pending', 'approved', 'rejected')),
  review_note TEXT,
  reviewed_by_emp_id VARCHAR(20),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_suspicious_scans_status
  ON attendance_suspicious_scans (scan_status, review_action);

CREATE INDEX IF NOT EXISTS idx_attendance_suspicious_scans_employee
  ON attendance_suspicious_scans (employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_suspicious_scans_created_at
  ON attendance_suspicious_scans (created_at DESC);

ALTER TABLE attendance_suspicious_scans ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'attendance_suspicious_scans_service_role_all'
      AND tablename = 'attendance_suspicious_scans'
  ) THEN
    CREATE POLICY attendance_suspicious_scans_service_role_all
      ON attendance_suspicious_scans
      FOR ALL
      USING (true);
  END IF;
END $$;
