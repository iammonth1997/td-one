-- ============================================================================
-- Data Migration: 018_migrate_pin_to_password_system.sql
-- Date: 2026-03-19
-- Purpose: Safely migrate existing PIN hashes from old system to new NIST-compliant password system
--
-- Strategy:
--   1. Mark all existing users with force_pin_change = true (must change on next login)
--   2. Set must_change_password = true (new flag)
--   3. Initialize empty password_history for all
--   4. Initialize password_changed_at = now (for audit)
--   5. No PIN/password is modified — only metadata updated
--   6. Users will be prompted at next login to set a new 12+ char password
--
-- Rollback: All flags can be reverted if rollout is aborted
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Ensure all new password columns have safe defaults
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE login_users
  SET
    password_history = COALESCE(password_history, '[]'::JSONB),
    password_changed_at = COALESCE(password_changed_at, NOW()),
    force_pin_change = true,
    must_change_password = true
  WHERE is_registered = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: Initialize new device tracking for existing active sessions
-- (optional: link old sessions to a "legacy" placeholder device for audit)
-- ─────────────────────────────────────────────────────────────────────────────

-- For each user with active sessions, create a placeholder "legacy-web" device
-- if no device is registered yet
INSERT INTO employee_devices (employee_id, device_id, device_name, platform, registered_at, is_active)
  SELECT DISTINCT
    e.id,
    'legacy-' || e.employee_code,    -- synthetic device_id for existing users
    'Legacy Account (Pre-Migration)',
    'web',
    NOW(),
    true
  FROM employees e
  LEFT JOIN employee_devices ed ON e.id = ed.employee_id
  WHERE ed.id IS NULL
    AND e.status = 'active'
  ON CONFLICT (employee_id, device_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: Audit log for migration start
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO security_audit_logs (event_type, severity, metadata)
  VALUES (
    'SYSTEM_MIGRATION_PIN_TO_PASSWORD_START',
    'critical',
    jsonb_object(
      'timestamp', to_jsonb(NOW()),
      'migration_version', '018',
      'total_users_affected', (SELECT COUNT(*) FROM login_users WHERE is_registered = true)::text
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 4: Verify migration completed
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  COUNT(*) as total_registered_users,
  SUM(CASE WHEN must_change_password = true THEN 1 ELSE 0 END) as marked_for_password_change,
  SUM(CASE WHEN force_pin_change = true THEN 1 ELSE 0 END) as marked_for_pin_change
FROM login_users
WHERE is_registered = true;

COMMIT;
