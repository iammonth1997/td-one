-- =============================================================================
-- Migration 020: Rotation Shift System
-- Date: 2026-03-19
-- Purpose: Create tables for rotation shift patterns and employee schedule
-- =============================================================================

-- Required for UUID + daterange EXCLUDE USING gist
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. shift_patterns: defines rotation cycle (e.g., 30 work / 10 rest)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shift_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_name VARCHAR(100) NOT NULL,              -- "เหมืองทอง 30/10", "ถ่านหิน 28/14"
  work_hours_per_day DECIMAL(5,2) NOT NULL DEFAULT 12.0,
  work_days INTEGER NOT NULL,                      -- days working per cycle
  rest_days INTEGER NOT NULL,                      -- days resting per cycle
  cycle_total_days INTEGER GENERATED ALWAYS AS (work_days + rest_days) STORED,
  department_id VARCHAR(50),                       -- optional department filter
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. shift_types: day/night shift configuration
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shift_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type_name VARCHAR(50) NOT NULL,                  -- "กะกลางวัน", "กะกลางคืน"
  start_time TIME NOT NULL,                        -- "06:00", "18:00"
  end_time TIME NOT NULL,                          -- "18:00", "06:00"
  crosses_midnight BOOLEAN DEFAULT false,
  break_minutes INTEGER DEFAULT 60,
  lunch_break_start TIME,                          -- "12:00" for day, "00:00" for night
  lunch_break_end TIME,                            -- "13:00" for day, "01:00" for night
  is_night_shift BOOLEAN DEFAULT false,
  night_hours_in_shift DECIMAL(5,2) DEFAULT 0,     -- hours overlapping 22:00-06:00
  grace_minutes INTEGER DEFAULT 15,               -- allowed late scan-in
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. employee_shift_assignments: links employees to shift patterns
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_shift_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  shift_pattern_id UUID REFERENCES shift_patterns(id),
  shift_type_id UUID REFERENCES shift_types(id),
  cycle_start_date DATE NOT NULL,                  -- วันเริ่ม cycle แรก
  effective_from DATE NOT NULL,
  effective_to DATE,                               -- null = current assignment
  is_active BOOLEAN DEFAULT true,
  assigned_by VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT no_overlapping_assignments
    EXCLUDE USING gist (
      employee_id WITH =,
      daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[)') WITH &&
    ) WHERE (is_active = true)
);

-- In case table already existed from a partial run (without the constraint), add it safely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'no_overlapping_assignments'
      AND conrelid = 'employee_shift_assignments'::regclass
  ) THEN
    ALTER TABLE employee_shift_assignments
      ADD CONSTRAINT no_overlapping_assignments
      EXCLUDE USING gist (
        employee_id WITH =,
        daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[)') WITH &&
      )
      WHERE (is_active = true);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_shift_assignments_employee ON employee_shift_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_active ON employee_shift_assignments(employee_id, is_active);
CREATE INDEX IF NOT EXISTS idx_shift_patterns_active ON shift_patterns(is_active);
CREATE INDEX IF NOT EXISTS idx_shift_types_active ON shift_types(is_active);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS Policies
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE shift_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_shift_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY shift_patterns_all ON shift_patterns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY shift_types_all ON shift_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY employee_shift_assignments_all ON employee_shift_assignments FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed default shift types
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO shift_types (type_name, start_time, end_time, crosses_midnight, break_minutes,
  lunch_break_start, lunch_break_end, is_night_shift, night_hours_in_shift, grace_minutes)
VALUES
  ('กะกลางวัน', '06:00', '18:00', false, 60, '12:00', '13:00', false, 0, 15),
  ('กะกลางคืน', '18:00', '06:00', true, 30, '00:00', '01:00', true, 8.0, 15)
ON CONFLICT DO NOTHING;

-- Seed default shift patterns
INSERT INTO shift_patterns (pattern_name, work_hours_per_day, work_days, rest_days)
VALUES
  ('เหมืองทอง 30/10 กะ12ชม', 12.0, 30, 10),
  ('ถ่านหิน 28/14 กะ12ชม', 12.0, 28, 14),
  ('เหมืองทอง 30/10 กะ10.5ชม', 10.5, 30, 10),
  ('สำนักงาน 5/2 กะ8ชม', 8.0, 5, 2)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE shift_patterns IS 'Rotation shift cycle definitions (e.g., 30 work + 10 rest)';
COMMENT ON TABLE shift_types IS 'Day/night shift configurations with break times';
COMMENT ON TABLE employee_shift_assignments IS 'Links employees to shift patterns with effective date ranges';
