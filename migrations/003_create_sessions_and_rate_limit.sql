-- Migration 003: Create sessions and login_attempts tables
-- Run this in Supabase SQL Editor

-- ============================================================
-- Sessions table (server-side session management)
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token VARCHAR(64) NOT NULL UNIQUE,
    emp_id VARCHAR(20) NOT NULL,
    role VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT true,
    ip_address VARCHAR(45),
    user_agent TEXT
);

CREATE INDEX idx_sessions_token ON sessions(session_token) WHERE is_active = true;
CREATE INDEX idx_sessions_emp_id ON sessions(emp_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessions_service_role_all" ON sessions
    FOR ALL USING (true);

-- ============================================================
-- Login attempts table (rate limiting)
-- ============================================================
CREATE TABLE IF NOT EXISTS login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    emp_id VARCHAR(20) NOT NULL,
    attempted_at TIMESTAMPTZ DEFAULT now(),
    success BOOLEAN DEFAULT false,
    ip_address VARCHAR(45)
);

CREATE INDEX idx_login_attempts_emp_time ON login_attempts(emp_id, attempted_at DESC);

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "login_attempts_service_role_all" ON login_attempts
    FOR ALL USING (true);
