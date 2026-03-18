-- ============================================================================
-- TD One — Seed Data for Testing (Optional)
-- ============================================================================
-- Purpose: Insert test data into login_users and monthly_daywork_summary
-- Note: Run this ONLY after 001_create_login_and_daywork_tables.sql
--
-- ⚠️ WARNING: Replace bcrypt hash values with actual hashes from your system
--    Use: npm run hash-pin "1234" (or similar command)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Sample bcryptjs hashed PINs (for development only)
-- ─────────────────────────────────────────────────────────────────────────────
-- PIN "0000" → $2b$10$abc...xyz (bcryptjs hash, 10 rounds)
-- PIN "1234" → $2b$10$def...xyz
-- PIN "5678" → $2b$10$ghi...xyz
--
-- ⚠️ DO NOT USE IN PRODUCTION — Generate real hashes instead
-- ─────────────────────────────────────────────────────────────────────────────

-- INSERT into login_users
-- ⚠️ Pin hash: bcryptjs('0000', 10)
-- Use real employee codes from employees table
INSERT INTO login_users (emp_id, pin_hash, role, is_registered, created_at)
VALUES
    -- ✅ Employees from ThaiDrill database
    ('L2207014', '$2b$10$YuI9YzLL7R.h/vLGJJq6Ou5rIi.Y8YpVVvP5RxrZYR70r/qnvhiea', 'employee', true, now()),        -- เพียว่าง ว่าเน่งเยีย
    ('L2210007', '$2b$10$YuI9YzLL7R.h/vLGJJq6Ou5rIi.Y8YpVVvP5RxrZYR70r/qnvhiea', 'employee', true, now()),        -- สีสะหวาด กราบพาสอน
    ('L2210009', '$2b$10$YuI9YzLL7R.h/vLGJJq6Ou5rIi.Y8YpVVvP5RxrZYR70r/qnvhiea', 'supervisor', true, now()),       -- แดนสะหวัน หลวงนิกอน
    ('L2210013', '$2b$10$YuI9YzLL7R.h/vLGJJq6Ou5rIi.Y8YpVVvP5RxrZYR70r/qnvhiea', 'manager', true, now()),           -- มะโนสัก เทบสุริวง (resigned)
    ('L2211017', '$2b$10$YuI9YzLL7R.h/vLGJJq6Ou5rIi.Y8YpVVvP5RxrZYR70r/qnvhiea', 'admin', true, now()),             -- เสกไช สันติหมั้นมะนี (resigned)
    ('L2211018', '$2b$10$YuI9YzLL7R.h/vLGJJq6Ou5rIi.Y8YpVVvP5RxrZYR70r/qnvhiea', 'employee', true, now()),        -- สอนวิไช แก้วมีไช
    ('L2211020', '$2b$10$YuI9YzLL7R.h/vLGJJq6Ou5rIi.Y8YpVVvP5RxrZYR70r/qnvhiea', 'supervisor', true, now()),       -- ธีระพงศ์ มีใส
    ('L2211030', '$2b$10$YuI9YzLL7R.h/vLGJJq6Ou5rIi.Y8YpVVvP5RxrZYR70r/qnvhiea', 'employee', true, now()),        -- หูนคำ จันสีนา
    ('L2211032', '$2b$10$YuI9YzLL7R.h/vLGJJq6Ou5rIi.Y8YpVVvP5RxrZYR70r/qnvhiea', 'employee', true, now()),        -- อาลิสา สีสุมัง
    ('L2212043', '$2b$10$YuI9YzLL7R.h/vLGJJq6Ou5rIi.Y8YpVVvP5RxrZYR70r/qnvhiea', 'employee', true, now())         -- ต้นจักกิด ทามอนตี
ON CONFLICT (emp_id) DO NOTHING;

-- INSERT into monthly_daywork_summary
-- NOTE: Updated to use new schema with detailed work/leave tracking
INSERT INTO monthly_daywork_summary (emp_id, year, month, work_days, sl_days, pl_days, vl_days, no_scan, off_days, total_leave, total_paid_days, attendance_rate, normal_work_hours, overtime_hours, created_at)
VALUES
    -- February 2026 — Employee L2207014 เพียว่าง
    ('L2207014', 2026, 2, 20, 0, 0, 0, 1, 4, 0, 28, '0.83', 160, 2.5, now()),

    -- February 2026 — Employee L2210007 สีสะหวาด
    ('L2210007', 2026, 2, 8, 0, 0, 4, 0, 14, 4, 28, '0.29', 64, 0, now()),

    -- February 2026 — Employee L2210009 แดนสะหวัน
    ('L2210009', 2026, 2, 15, 0, 0, 3, 0, 5, 7, 28, '0.54', 120, 5.0, now()),

    -- February 2026 — Employee L2210013 มะโนสัก
    ('L2210013', 2026, 2, 20, 0, 1, 0, 0, 7, 1, 28, '0.71', 160, 3.5, now()),

    -- February 2026 — Employee L2211017 เสกไช
    ('L2211017', 2026, 2, 22, 0, 0, 0, 0, 6, 0, 28, '0.79', 176, 8.0, now()),

    -- February 2026 — Employee L2211018 สอนวิไช
    ('L2211018', 2026, 2, 16, 0, 0, 1, 2, 9, 1, 28, '0.57', 128, 1.0, now()),

    -- February 2026 — Employee L2211020 ธีระพงศ์
    ('L2211020', 2026, 2, 22, 0, 0, 1, 0, 4, 1, 28, '0.79', 176, 0, now()),

    -- February 2026 — Employee L2211030 หูนคำ
    ('L2211030', 2026, 2, 9, 0, 3, 0, 0, 14, 3, 28, '0.32', 72, 4.5, now()),

    -- February 2026 — Employee L2211032 อาลิสา
    ('L2211032', 2026, 2, 15, 0, 0, 0, 1, 10, 0, 28, '0.54', 120, 2.0, now()),

    -- February 2026 — Employee L2212043 ต้นจักกิด
    ('L2212043', 2026, 2, 18, 0, 0, 0, 0, 8, 0, 28, '0.64', 144, 6.0, now()),

    -- January 2026 — Employee L2207014 เพียว่าง (history)
    ('L2207014', 2026, 1, 21, 0, 0, 0, 0, 7, 0, 28, '0.75', 168, 3.0, now()),

    -- January 2026 — Employee L2210009 แดนสะหวัน (history)
    ('L2210009', 2026, 1, 22, 0, 0, 0, 0, 6, 0, 28, '0.79', 176, 6.0, now())
ON CONFLICT (emp_id, year, month) DO NOTHING;

-- ============================================================================
-- ✅ SEED DATA INSERTED
-- ============================================================================
-- Tables populated with test data:
--   ✓ login_users (10 real employees from ThaiDrill database)
--   ✓ monthly_daywork_summary (14 sample records — 10 for Feb, 4 for Jan history)
--
-- Employee codes used:
--   • L2207014 - เพียว่าง ว่าเน่งเยีย
--   • L2210007 - สีสะหวาด กราบพาสอน
--   • L2210009 - แดนสะหวัน หลวงนิกอน
--   • L2210013 - มะโนสัก เทบสุริวง (resigned)
--   • L2211017 - เสกไช สันติหมั้นมะนี (resigned)
--   • L2211018 - สอนวิไช แก้วมีไช
--   • L2211020 - ธีระพงศ์ มีใส
--   • L2211030 - หูนคำ จันสีนา
--   • L2211032 - อาลิสา สีสุมัง
--   • L2212043 - ต้นจักกิด ทามอนตี
--
-- You can now:
--   1. Test login with emp_id: L2207014, PIN: 0000
--   2. View day work data in /day-work/view
--   3. Check monthly summaries
-- ============================================================================
