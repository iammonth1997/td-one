-- Migration 004: Additional indexes for login latency optimization
-- Purpose: speed up rate-limit and employee status lookup paths used by /api/login

-- 1) Rate-limit query optimization
-- Query shape:
--   WHERE emp_id = ? AND success = false AND attempted_at >= ?
--   ORDER BY attempted_at DESC LIMIT 5
CREATE INDEX IF NOT EXISTS idx_login_attempts_emp_success_time
ON login_attempts (emp_id, success, attempted_at DESC);

-- 2) Employee status lookup optimization
-- Query shape:
--   WHERE employee_code = ?
CREATE INDEX IF NOT EXISTS idx_employees_employee_code
ON employees (employee_code);
