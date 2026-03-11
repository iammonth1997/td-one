-- Add LINE user mapping for LIFF employee login
ALTER TABLE login_users
ADD COLUMN IF NOT EXISTS line_user_id VARCHAR(100);

-- Ensure one LINE account maps to one employee account
CREATE UNIQUE INDEX IF NOT EXISTS idx_login_users_line_user_id_unique
ON login_users(line_user_id)
WHERE line_user_id IS NOT NULL;
