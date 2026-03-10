-- Migration 006: Temporary PIN controls and forced PIN change flags

ALTER TABLE login_users
  ADD COLUMN IF NOT EXISTS force_pin_change BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS temp_pin_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS temp_pin_issued_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS temp_pin_issued_by VARCHAR(20) NULL;

CREATE INDEX IF NOT EXISTS idx_login_users_force_pin_change
  ON login_users (force_pin_change);
