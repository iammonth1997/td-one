ALTER TABLE login_users
  ADD COLUMN IF NOT EXISTS admin_email TEXT,
  ADD COLUMN IF NOT EXISTS admin_password_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_login_users_admin_email_unique
  ON login_users (LOWER(admin_email))
  WHERE admin_email IS NOT NULL;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS login_context VARCHAR(30) NOT NULL DEFAULT 'employee_portal';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sessions_login_context_check'
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_login_context_check
      CHECK (login_context IN ('employee_portal', 'admin_portal'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_sessions_login_context
  ON sessions(login_context);
