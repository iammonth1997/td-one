-- =============================================================================
-- Migration 028: Create salary access logs table
-- Date: 2026-04-26
-- Purpose:
--   - Repair environments where migration 017 was run without salary_access_logs.
-- =============================================================================

CREATE TABLE IF NOT EXISTS salary_access_logs (
  id SERIAL PRIMARY KEY,
  emp_id INTEGER NOT NULL,
  action VARCHAR(50) NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_salary_access_logs_emp_id
  ON salary_access_logs(emp_id);
