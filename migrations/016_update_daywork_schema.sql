-- ============================================================================
-- Migration: 016_update_daywork_schema.sql
-- Date: 2026-03-17
-- Purpose: Expand monthly_daywork_summary table with detailed leave and work tracking
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ALTER TABLE: Add new columns to monthly_daywork_summary
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE monthly_daywork_summary
    -- Replace old columns with new detailed structure
    DROP COLUMN IF EXISTS total_work_days,
    DROP COLUMN IF EXISTS sick_leave,
    DROP COLUMN IF EXISTS personal_leave,
    DROP COLUMN IF EXISTS annual_leave,
    DROP COLUMN IF EXISTS absent_days,
    DROP COLUMN IF EXISTS forgot_scan;

-- Add new work day tracking columns
ALTER TABLE monthly_daywork_summary
    ADD COLUMN IF NOT EXISTS work_days INTEGER DEFAULT 0,        -- Working days
    ADD COLUMN IF NOT EXISTS rt_days INTEGER DEFAULT 0,           -- Rest/Rest day
    ADD COLUMN IF NOT EXISTS rt_f_days INTEGER DEFAULT 0,         -- Rest day full
    ADD COLUMN IF NOT EXISTS pw_days INTEGER DEFAULT 0,           -- Parental/work-related days
    ADD COLUMN IF NOT EXISTS sl_days INTEGER DEFAULT 0,           -- Sick leave days
    ADD COLUMN IF NOT EXISTS pl_days INTEGER DEFAULT 0,           -- Personal leave days
    ADD COLUMN IF NOT EXISTS vl_days INTEGER DEFAULT 0,           -- Vacation/annual leave days
    ADD COLUMN IF NOT EXISTS vf_days INTEGER DEFAULT 0,           -- Vacation full days
    ADD COLUMN IF NOT EXISTS off_days INTEGER DEFAULT 0,          -- Official holidays
    ADD COLUMN IF NOT EXISTS opl_days INTEGER DEFAULT 0,          -- Unplayed leave days
    ADD COLUMN IF NOT EXISTS x_days INTEGER DEFAULT 0,            -- Other days;

-- Add scanning/attendance tracking
ALTER TABLE monthly_daywork_summary
    ADD COLUMN IF NOT EXISTS no_scan INTEGER DEFAULT 0,           -- Days with no scan
    ADD COLUMN IF NOT EXISTS no_scan_in INTEGER DEFAULT 0,        -- Days with no scan in
    ADD COLUMN IF NOT EXISTS no_scan_out INTEGER DEFAULT 0,       -- Days with no scan out;

-- Add totals and metrics
ALTER TABLE monthly_daywork_summary
    ADD COLUMN IF NOT EXISTS total_unpaid INTEGER DEFAULT 0,      -- Total unpaid days
    ADD COLUMN IF NOT EXISTS total_leave INTEGER DEFAULT 0,       -- Total leave days
    ADD COLUMN IF NOT EXISTS total_paid_days INTEGER DEFAULT 28,  -- Total paid days (default 28)
    ADD COLUMN IF NOT EXISTS attendance_rate VARCHAR(10) DEFAULT '0', -- Attendance rate percentage;

-- Add date tracking columns (varchar storing comma-separated dates)
ALTER TABLE monthly_daywork_summary
    ADD COLUMN IF NOT EXISTS rt_date TEXT,                        -- Rest day dates
    ADD COLUMN IF NOT EXISTS rtf_date TEXT,                       -- Rest day full dates
    ADD COLUMN IF NOT EXISTS pw_date TEXT,                        -- Parental work dates
    ADD COLUMN IF NOT EXISTS sl_date TEXT,                        -- Sick leave dates
    ADD COLUMN IF NOT EXISTS pl_date TEXT,                        -- Personal leave dates
    ADD COLUMN IF NOT EXISTS vl_date TEXT,                        -- Vacation leave dates
    ADD COLUMN IF NOT EXISTS vf_date TEXT,                        -- Vacation full dates
    ADD COLUMN IF NOT EXISTS off_date TEXT,                       -- Official holiday dates
    ADD COLUMN IF NOT EXISTS opl_date TEXT,                       -- Unplayed leave dates
    ADD COLUMN IF NOT EXISTS x_date TEXT,                         -- Other type dates
    ADD COLUMN IF NOT EXISTS noscan_date TEXT,                    -- No scan dates
    ADD COLUMN IF NOT EXISTS noscanin_date TEXT,                  -- No scan in dates
    ADD COLUMN IF NOT EXISTS noscanout_date TEXT,                 -- No scan out dates
    ADD COLUMN IF NOT EXISTS work_date TEXT,                      -- Work dates;

-- Add night shift tracking
ALTER TABLE monthly_daywork_summary
    ADD COLUMN IF NOT EXISTS night_shift_dates TEXT,              -- Night shift dates
    ADD COLUMN IF NOT EXISTS night_shift_count INTEGER DEFAULT 0; -- Night shift count;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CREATE INDEXES for new columns
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_daywork_work_days ON monthly_daywork_summary(work_days);
CREATE INDEX IF NOT EXISTS idx_daywork_total_leave ON monthly_daywork_summary(total_leave);
CREATE INDEX IF NOT EXISTS idx_daywork_attendance_rate ON monthly_daywork_summary(attendance_rate);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. UPDATE COMMENTS
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN monthly_daywork_summary.work_days IS
'Number of working days';

COMMENT ON COLUMN monthly_daywork_summary.rt_days IS
'Rest/rest day count';

COMMENT ON COLUMN monthly_daywork_summary.rt_f_days IS
'Rest day full count';

COMMENT ON COLUMN monthly_daywork_summary.pw_days IS
'Parental/work-related days count';

COMMENT ON COLUMN monthly_daywork_summary.sl_days IS
'Sick leave days count';

COMMENT ON COLUMN monthly_daywork_summary.pl_days IS
'Personal leave days count';

COMMENT ON COLUMN monthly_daywork_summary.vl_days IS
'Vacation/annual leave days count';

COMMENT ON COLUMN monthly_daywork_summary.vf_days IS
'Vacation full days count';

COMMENT ON COLUMN monthly_daywork_summary.off_days IS
'Official holidays count';

COMMENT ON COLUMN monthly_daywork_summary.opl_days IS
'Unplayed leave days count';

COMMENT ON COLUMN monthly_daywork_summary.x_days IS
'Other type days count';

COMMENT ON COLUMN monthly_daywork_summary.total_unpaid IS
'Total unpaid or deducted days';

COMMENT ON COLUMN monthly_daywork_summary.total_leave IS
'Total leave days taken';

COMMENT ON COLUMN monthly_daywork_summary.total_paid_days IS
'Total paid days in the month';

COMMENT ON COLUMN monthly_daywork_summary.attendance_rate IS
'Attendance rate as percentage (0-100)';

COMMENT ON COLUMN monthly_daywork_summary.night_shift_count IS
'Total number of night shift days';

-- ============================================================================
-- ✅ MIGRATION COMPLETE
-- ============================================================================
