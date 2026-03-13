-- Bootstrap first admin email login
-- Usage:
-- 1) Generate bcrypt hash with script:
--    npm run admin:hash -- "YourStrongPassword123!"
-- 2) Replace placeholders below and run this SQL in Supabase SQL Editor

-- Required placeholders:
--   __EMP_ID__         e.g. L2207014
--   __ADMIN_EMAIL__    e.g. manager@company.com
--   __BCRYPT_HASH__    output from npm run admin:hash

UPDATE login_users
SET
  admin_email = LOWER('iammonth1997@gmail.com'),
  admin_password_hash = '__BCRYPT_HASH__'
WHERE emp_id = UPPER('L2506110');

-- Verify bootstrap result
SELECT emp_id, role, admin_email
FROM login_users
WHERE emp_id = UPPER('L2506110');
