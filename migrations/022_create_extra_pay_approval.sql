-- =============================================================================
-- Migration 022: Extra Pay Requests & 3-Tier Approval Workflow
-- Date: 2026-03-19
-- Purpose: Create tables for OT/PieceWork requests and approval chains
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. employee_supervisors: who approves for whom (step 1 & 2)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_supervisors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  supervisor_id UUID REFERENCES employees(id),     -- step 1 approver
  manager_id UUID REFERENCES employees(id),        -- step 2 approver
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, effective_from)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. approval_chains: configurable approval chain definitions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_chains (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chain_name VARCHAR(100) NOT NULL,
  work_site_id UUID REFERENCES work_locations(id),
  department_id VARCHAR(50),
  request_type VARCHAR(20) DEFAULT 'all'
    CHECK (request_type IN ('ot', 'piece_work', 'lunch_ot', 'leave', 'all')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approval_chain_steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chain_id UUID REFERENCES approval_chains(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL CHECK (step_order BETWEEN 1 AND 5),
  approver_role VARCHAR(30) NOT NULL CHECK (approver_role IN ('supervisor', 'manager', 'hr', 'payroll_admin')),
  can_skip BOOLEAN DEFAULT false,
  auto_approve_after_hours INTEGER,               -- auto-approve if no action after N hours
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(chain_id, step_order)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. extra_pay_requests: employee request for OT/Piece Work/Lunch OT
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS extra_pay_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  request_type VARCHAR(20) NOT NULL CHECK (request_type IN ('ot', 'piece_work', 'lunch_ot')),
  work_date DATE NOT NULL,
  planned_start_time TIME NOT NULL,
  planned_end_time TIME NOT NULL,
  planned_hours DECIMAL(5,2),
  estimated_pay_type VARCHAR(30) CHECK (estimated_pay_type IN (
    'OT_NORMAL_DAY', 'OT_NORMAL_NIGHT',
    'PIECE_WORK_DAY', 'PIECE_WORK_NIGHT',
    'HOLIDAY_DAY', 'HOLIDAY_NIGHT',
    'LUNCH_OT', 'NIGHT_ALLOWANCE'
  )),
  reason TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending_supervisor' CHECK (status IN (
    'pending_supervisor', 'pending_manager', 'pending_hr',
    'approved', 'rejected', 'cancelled'
  )),
  current_step INTEGER DEFAULT 1,
  chain_id UUID REFERENCES approval_chains(id),
  rejection_reason TEXT,
  cancelled_reason TEXT,
  final_approved_at TIMESTAMPTZ,
  final_rejected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Prevent duplicate requests for same date+type
  CONSTRAINT no_duplicate_extra_requests
    UNIQUE NULLS NOT DISTINCT (employee_id, work_date, request_type, status)
    DEFERRABLE INITIALLY DEFERRED
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. approval_actions: audit trail of each approval/rejection
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID REFERENCES extra_pay_requests(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  approver_role VARCHAR(30) NOT NULL,
  approver_id UUID REFERENCES employees(id),
  approver_emp_code VARCHAR(20),                   -- denormalized for history
  action VARCHAR(20) NOT NULL CHECK (action IN ('approved', 'rejected', 'cancelled', 'auto_approved')),
  comment TEXT,
  acted_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. extra_pay_records: computed & approved extra pay entries
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS extra_pay_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  pay_type VARCHAR(30) NOT NULL CHECK (pay_type IN (
    'OT_NORMAL_DAY', 'OT_NORMAL_NIGHT',
    'PIECE_WORK_DAY', 'PIECE_WORK_NIGHT',
    'HOLIDAY_DAY', 'HOLIDAY_NIGHT',
    'LUNCH_OT', 'NIGHT_ALLOWANCE'
  )),
  hours DECIMAL(6,2) DEFAULT 0,                    -- hours worked (0 for fixed)
  hourly_rate DECIMAL(15,2),
  multiplier DECIMAL(5,3),
  fixed_amount DECIMAL(15,2),
  amount DECIMAL(15,2) NOT NULL,                   -- final computed amount (LAK)
  policy_id UUID REFERENCES site_pay_policies(id),
  request_id UUID REFERENCES extra_pay_requests(id),
  source VARCHAR(20) NOT NULL DEFAULT 'approved_request'
    CHECK (source IN ('approved_request', 'manual_entry', 'auto_calculated')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
  payroll_run_id UUID,                             -- FK to payroll_runs (set when paid)
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_extra_pay_requests_employee ON extra_pay_requests(employee_id, work_date);
CREATE INDEX IF NOT EXISTS idx_extra_pay_requests_status ON extra_pay_requests(status);
CREATE INDEX IF NOT EXISTS idx_extra_pay_requests_date ON extra_pay_requests(work_date);
CREATE INDEX IF NOT EXISTS idx_approval_actions_request ON approval_actions(request_id);
CREATE INDEX IF NOT EXISTS idx_extra_pay_records_employee ON extra_pay_records(employee_id, work_date);
CREATE INDEX IF NOT EXISTS idx_extra_pay_records_status ON extra_pay_records(status);
CREATE INDEX IF NOT EXISTS idx_employee_supervisors_employee ON employee_supervisors(employee_id, is_active);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE employee_supervisors ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_chain_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE extra_pay_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE extra_pay_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY employee_supervisors_all ON employee_supervisors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY approval_chains_all ON approval_chains FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY approval_chain_steps_all ON approval_chain_steps FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY extra_pay_requests_all ON extra_pay_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY approval_actions_all ON approval_actions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY extra_pay_records_all ON extra_pay_records FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: default 3-step approval chain
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO approval_chains (chain_name, request_type)
VALUES ('เหมือง — OT/PieceWork Standard 3 Steps', 'all')
ON CONFLICT DO NOTHING;

INSERT INTO approval_chain_steps (chain_id, step_order, approver_role, can_skip, auto_approve_after_hours)
SELECT id, 1, 'supervisor', false, 24
FROM approval_chains WHERE chain_name = 'เหมือง — OT/PieceWork Standard 3 Steps'
ON CONFLICT DO NOTHING;

INSERT INTO approval_chain_steps (chain_id, step_order, approver_role, can_skip, auto_approve_after_hours)
SELECT id, 2, 'manager', false, 48
FROM approval_chains WHERE chain_name = 'เหมือง — OT/PieceWork Standard 3 Steps'
ON CONFLICT DO NOTHING;

INSERT INTO approval_chain_steps (chain_id, step_order, approver_role, can_skip, auto_approve_after_hours)
SELECT id, 3, 'hr', false, NULL
FROM approval_chains WHERE chain_name = 'เหมือง — OT/PieceWork Standard 3 Steps'
ON CONFLICT DO NOTHING;

COMMENT ON TABLE extra_pay_requests IS 'Employee requests for OT/Piece Work/Lunch OT with 3-tier approval';
COMMENT ON TABLE extra_pay_records IS 'Computed extra pay entries — source of truth for payroll calculation';
COMMENT ON TABLE approval_actions IS 'Append-only audit trail of all approval/rejection actions';
