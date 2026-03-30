-- ============================================================
--  ThaiDrill ERP — Auth Tables for Admin Login
--  Run this in Aiven Console (Query Editor)
--  Created: 2026-03-26
-- ============================================================

-- 1. login_users — เก็บ PIN/password สำหรับ login
CREATE TABLE IF NOT EXISTS login_users (
  id                   UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  emp_id               VARCHAR     NOT NULL UNIQUE,
  pin_hash             TEXT,
  role                 VARCHAR     NOT NULL DEFAULT 'employee',
  admin                BOOLEAN     NOT NULL DEFAULT FALSE,
  line_user_id         VARCHAR,
  force_pin_change     BOOLEAN     NOT NULL DEFAULT FALSE,
  must_change_password BOOLEAN     NOT NULL DEFAULT FALSE,
  temp_pin_expires_at  TIMESTAMPTZ,
  admin_email          VARCHAR     UNIQUE,
  admin_password_hash  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. auth_sessions — เก็บ session token หลัง login สำเร็จ
CREATE TABLE IF NOT EXISTS auth_sessions (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_token VARCHAR     NOT NULL UNIQUE,
  emp_id        VARCHAR     NOT NULL,
  role          VARCHAR     NOT NULL DEFAULT 'employee',
  device_id     VARCHAR,
  expires_at    TIMESTAMPTZ NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  login_context VARCHAR,
  ip_address    VARCHAR,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ตรวจสอบว่าสร้างสำเร็จ
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('login_users', 'auth_sessions');
