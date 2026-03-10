-- Migration 005: PIN reset audit trail
-- Purpose: record who reset PIN for which employee and when

CREATE TABLE IF NOT EXISTS pin_reset_audit (
  id BIGSERIAL PRIMARY KEY,
  target_emp_id VARCHAR(20) NOT NULL,
  reset_by_emp_id VARCHAR(20) NOT NULL,
  reset_by_role VARCHAR(50) NOT NULL,
  ip_address TEXT NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pin_reset_audit_target_time
  ON pin_reset_audit (target_emp_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pin_reset_audit_actor_time
  ON pin_reset_audit (reset_by_emp_id, created_at DESC);
