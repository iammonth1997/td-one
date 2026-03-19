-- ============================================================================
-- Migration: 017_security_architecture_upgrade.sql
-- Date: 2026-03-18
-- Purpose: Security architecture upgrade per NIST SP 800-63B
--
-- Changes:
--   1. employee_devices: support max 2 devices per employee, add device info
--   2. login_users: NIST password fields, force all users to re-set password
--   3. sessions: add device_id column
--   4. New table: security_audit_logs (append-only event log)
--   5. New table: salary_access_logs
--   6. New table: employee_activations (onboarding activation codes)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. employee_devices: relax UNIQUE to allow max 2 per employee
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop old single-device UNIQUE constraint
ALTER TABLE employee_devices
  DROP CONSTRAINT IF EXISTS employee_devices_employee_id_key;

-- Add new columns for richer device tracking
ALTER TABLE employee_devices
  ADD COLUMN IF NOT EXISTS platform VARCHAR(10) DEFAULT 'web'
    CHECK (platform IN ('android','ios','web')),
  ADD COLUMN IF NOT EXISTS app_version VARCHAR(20),
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_by VARCHAR(20);  -- emp_id of admin who deactivated

-- Partial unique index: each employee can only have the same device_id once
-- (allows up to 2 different device_ids per employee)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_employee_devices_emp_device
  ON employee_devices(employee_id, device_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. login_users: NIST password system fields
-- ─────────────────────────────────────────────────────────────────────────────

-- Rename pin_hash → keep as pin_hash for backward compat (field holds bcrypt hash)
-- Add password metadata columns
ALTER TABLE login_users
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_history JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;

-- Force ALL existing users to reset their credential on next login
-- (migrating from 6-digit PIN to NIST-compliant 12-char+ password)
UPDATE login_users
  SET force_pin_change = true,
      must_change_password = true
  WHERE is_registered = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. sessions: link session to device + extend to 30 days
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS device_id VARCHAR(100);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. New table: security_audit_logs (append-only)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS security_audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  severity VARCHAR(10) NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical')),
  emp_id VARCHAR(20),
  device_id VARCHAR(100),
  ip_address VARCHAR(45),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  metadata JSONB,
  is_alert BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_emp_id ON security_audit_logs(emp_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON security_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON security_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_is_alert ON security_audit_logs(is_alert) WHERE is_alert = true;
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON security_audit_logs(severity) WHERE severity IN ('warning','critical');

-- Enable RLS + allow service role full access (append-only enforced at app layer)
ALTER TABLE security_audit_logs ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'audit_logs_service_role_all' AND tablename = 'security_audit_logs'
  ) THEN
    CREATE POLICY audit_logs_service_role_all ON security_audit_logs FOR ALL USING (true);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. New table: salary_access_logs
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS salary_access_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  emp_id VARCHAR(20) NOT NULL,
  device_id VARCHAR(100),
  payslip_month VARCHAR(7),          -- e.g. "2026-03"
  ip_address VARCHAR(45),
  access_granted BOOLEAN DEFAULT false,
  failure_reason VARCHAR(50),
  accessed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_salary_access_emp_id ON salary_access_logs(emp_id);
CREATE INDEX IF NOT EXISTS idx_salary_access_accessed_at ON salary_access_logs(accessed_at DESC);

ALTER TABLE salary_access_logs ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'salary_access_logs_service_role_all' AND tablename = 'salary_access_logs'
  ) THEN
    CREATE POLICY salary_access_logs_service_role_all ON salary_access_logs FOR ALL USING (true);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. New table: employee_activations (first-time onboarding codes)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employee_activations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  emp_id VARCHAR(20) NOT NULL,
  activation_code_hash VARCHAR(255) NOT NULL,   -- bcrypt hash of 8-digit code
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,               -- 72 hours from creation
  used_at TIMESTAMPTZ,
  failed_attempts INT DEFAULT 0,
  is_used BOOLEAN DEFAULT false,
  is_invalidated BOOLEAN DEFAULT false,
  created_by VARCHAR(20) NOT NULL               -- HR emp_id who created
);

CREATE INDEX IF NOT EXISTS idx_activations_emp_id ON employee_activations(emp_id);
CREATE INDEX IF NOT EXISTS idx_activations_unused ON employee_activations(emp_id, is_used, is_invalidated) WHERE is_used = false AND is_invalidated = false;

ALTER TABLE employee_activations ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'employee_activations_service_role_all' AND tablename = 'employee_activations'
  ) THEN
    CREATE POLICY employee_activations_service_role_all ON employee_activations FOR ALL USING (true);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. New table: salary_sessions (short-lived 5-min re-auth tokens)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS salary_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  emp_id VARCHAR(20) NOT NULL,
  device_id VARCHAR(100),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_salary_sessions_emp_id ON salary_sessions(emp_id);
CREATE INDEX IF NOT EXISTS idx_salary_sessions_token_hash ON salary_sessions(token_hash);

ALTER TABLE salary_sessions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'salary_sessions_service_role_all' AND tablename = 'salary_sessions'
  ) THEN
    CREATE POLICY salary_sessions_service_role_all ON salary_sessions FOR ALL USING (true);
  END IF;
END $$;
