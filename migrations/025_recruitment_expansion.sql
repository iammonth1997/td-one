-- TD One ERP
-- Migration 025: Recruitment Module Expansion
-- Adds: Manpower Planning, Headcount Requests, Medical Checks,
--       Blacklist, Recruitment Costs, Talent Pool columns
-- NO changes to Payroll, Auth, or Attendance tables.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Manpower Plans
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS manpower_plans (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_year     INTEGER NOT NULL CHECK (plan_year >= 2024),
  plan_name     VARCHAR(200) NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'approved', 'active', 'closed')),
  approved_by   VARCHAR(100),
  approved_at   TIMESTAMPTZ,
  notes         TEXT,
  created_by    VARCHAR(100),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_manpower_plan_year_name UNIQUE (plan_year, plan_name)
);

CREATE TABLE IF NOT EXISTS manpower_plan_items (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id               UUID NOT NULL REFERENCES manpower_plans(id) ON DELETE CASCADE,
  department            VARCHAR(120),
  work_site_id          UUID REFERENCES work_locations(id) ON DELETE SET NULL,
  position_title        VARCHAR(150) NOT NULL,
  position_level        VARCHAR(80),
  planned_headcount     INTEGER NOT NULL DEFAULT 1 CHECK (planned_headcount > 0),
  current_headcount     INTEGER NOT NULL DEFAULT 0 CHECK (current_headcount >= 0),
  priority              VARCHAR(20) NOT NULL DEFAULT 'medium'
                          CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  expected_hire_quarter VARCHAR(2) CHECK (expected_hire_quarter IN ('Q1', 'Q2', 'Q3', 'Q4')),
  estimated_salary_min  DECIMAL(15,2),
  estimated_salary_max  DECIMAL(15,2),
  justification         TEXT,
  status                VARCHAR(20) NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'partially_filled', 'filled', 'cancelled')),
  created_at            TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chk_manpower_salary_range CHECK (
    estimated_salary_min IS NULL OR estimated_salary_max IS NULL
    OR estimated_salary_min <= estimated_salary_max
  )
);

-- Computed column: gap = planned - current (computed in application layer)
CREATE INDEX IF NOT EXISTS idx_manpower_plans_year_status ON manpower_plans(plan_year, status);
CREATE INDEX IF NOT EXISTS idx_manpower_plan_items_plan ON manpower_plan_items(plan_id, status);
CREATE INDEX IF NOT EXISTS idx_manpower_plan_items_site ON manpower_plan_items(work_site_id, priority);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Headcount Requests + 3-Tier Approval
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS headcount_requests (
  id                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_number         VARCHAR(20) NOT NULL UNIQUE,    -- HC-2026-0001
  requested_by           UUID REFERENCES employees(id) ON DELETE SET NULL,
  requested_by_emp_code  VARCHAR(20),                   -- denormalized
  department             VARCHAR(120),
  work_site_id           UUID REFERENCES work_locations(id) ON DELETE SET NULL,
  position_title         VARCHAR(150) NOT NULL,
  number_of_positions    INTEGER NOT NULL DEFAULT 1 CHECK (number_of_positions > 0),
  employment_type        VARCHAR(20) NOT NULL DEFAULT 'full_time'
                           CHECK (employment_type IN ('full_time', 'contract', 'daily')),
  urgency                VARCHAR(20) NOT NULL DEFAULT 'normal'
                           CHECK (urgency IN ('normal', 'urgent', 'critical')),
  reason_type            VARCHAR(20) NOT NULL
                           CHECK (reason_type IN (
                             'new_position', 'replacement', 'expansion',
                             'resignation', 'termination', 'promotion', 'transfer'
                           )),
  replacing_employee_id  UUID REFERENCES employees(id) ON DELETE SET NULL,
  justification          TEXT,
  expected_start_date    DATE,
  budget_salary_min      DECIMAL(15,2),
  budget_salary_max      DECIMAL(15,2),
  job_requirements       TEXT,
  manpower_plan_item_id  UUID REFERENCES manpower_plan_items(id) ON DELETE SET NULL,
  status                 VARCHAR(20) NOT NULL DEFAULT 'pending_manager'
                           CHECK (status IN (
                             'pending_manager', 'pending_hr', 'approved',
                             'rejected', 'job_posted', 'filled', 'cancelled'
                           )),
  current_approval_step  INTEGER NOT NULL DEFAULT 1 CHECK (current_approval_step BETWEEN 1 AND 3),
  approved_at            TIMESTAMPTZ,
  requisition_id         UUID REFERENCES recruitment_requisitions(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS headcount_approval_actions (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id      UUID NOT NULL REFERENCES headcount_requests(id) ON DELETE CASCADE,
  step_order      INTEGER NOT NULL CHECK (step_order IN (1, 2)),
  approver_role   VARCHAR(20) NOT NULL CHECK (approver_role IN ('manager', 'hr')),
  approver_emp_id VARCHAR(100) NOT NULL,
  action          VARCHAR(20) NOT NULL CHECK (action IN ('approved', 'rejected')),
  comment         TEXT,
  acted_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_headcount_requests_status ON headcount_requests(status, urgency);
CREATE INDEX IF NOT EXISTS idx_headcount_requests_requester ON headcount_requests(requested_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_headcount_approval_actions_request ON headcount_approval_actions(request_id, step_order);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Medical Check Tracking
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medical_check_types (
  id                           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  check_name                   VARCHAR(150) NOT NULL UNIQUE,
  is_mandatory_pre_employment  BOOLEAN NOT NULL DEFAULT true,
  is_mandatory_periodic        BOOLEAN NOT NULL DEFAULT false,
  recurrence_months            INTEGER CHECK (recurrence_months > 0),
  applies_to_sites             JSONB,    -- null = all sites
  applies_to_positions         JSONB,    -- null = all positions
  is_active                    BOOLEAN NOT NULL DEFAULT true,
  created_at                   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS medical_checks (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  person_type    VARCHAR(20) NOT NULL CHECK (person_type IN ('candidate', 'employee')),
  candidate_id   UUID REFERENCES recruitment_candidates(id) ON DELETE SET NULL,
  employee_id    UUID REFERENCES employees(id) ON DELETE SET NULL,
  check_type_id  UUID REFERENCES medical_check_types(id) ON DELETE SET NULL,
  check_date     DATE NOT NULL,
  hospital_name  VARCHAR(150) NOT NULL,
  doctor_name    VARCHAR(120),
  result         VARCHAR(30) NOT NULL
                   CHECK (result IN ('fit', 'fit_with_conditions', 'temporarily_unfit', 'permanently_unfit')),
  conditions     TEXT,
  findings       TEXT,
  restrictions   TEXT,
  next_check_date DATE,
  certificate_url VARCHAR(500),
  cost           DECIMAL(15,2),
  paid_by        VARCHAR(20) DEFAULT 'company' CHECK (paid_by IN ('company', 'employee')),
  created_by     VARCHAR(100),
  created_at     TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chk_medical_person CHECK (
    (person_type = 'candidate' AND candidate_id IS NOT NULL)
    OR (person_type = 'employee' AND employee_id IS NOT NULL)
  )
);

-- Seed default medical check types
INSERT INTO medical_check_types (check_name, is_mandatory_pre_employment, is_mandatory_periodic, recurrence_months)
VALUES
  ('ตรวจสุขภาพทั่วไป', true, true, 12),
  ('ตรวจปอด (X-Ray)', true, true, 12),
  ('ตรวจการได้ยิน', true, true, 12),
  ('ตรวจสารเสพติด', true, false, null),
  ('ตรวจสายตา', true, true, 24)
ON CONFLICT (check_name) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_medical_checks_candidate ON medical_checks(candidate_id, check_date DESC);
CREATE INDEX IF NOT EXISTS idx_medical_checks_employee ON medical_checks(employee_id, check_date DESC);
CREATE INDEX IF NOT EXISTS idx_medical_checks_next_date ON medical_checks(next_check_date) WHERE next_check_date IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Blacklist
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blacklist (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name               VARCHAR(150) NOT NULL,
  id_card_number          VARCHAR(30),    -- store with care; restrict via RLS
  phone                   VARCHAR(40),
  previous_employee_id    UUID REFERENCES employees(id) ON DELETE SET NULL,
  previous_candidate_id   UUID REFERENCES recruitment_candidates(id) ON DELETE SET NULL,
  reason_category         VARCHAR(30) NOT NULL
                            CHECK (reason_category IN (
                              'theft', 'fraud', 'violence', 'drugs',
                              'safety_violation', 'false_documents',
                              'no_show', 'gross_misconduct', 'other'
                            )),
  reason_detail           TEXT NOT NULL,
  blacklisted_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  blacklisted_by          VARCHAR(100) NOT NULL,
  severity                VARCHAR(20) NOT NULL DEFAULT 'permanent'
                            CHECK (severity IN ('permanent', 'temporary')),
  expiry_date             DATE,
  can_reapply             BOOLEAN NOT NULL DEFAULT false,
  evidence_files          JSONB,
  status                  VARCHAR(20) NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'expired', 'removed')),
  removed_by              VARCHAR(100),
  removed_reason          TEXT,
  removed_at              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chk_blacklist_temporary_expiry CHECK (
    severity = 'permanent' OR expiry_date IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_blacklist_status ON blacklist(status, severity);
CREATE INDEX IF NOT EXISTS idx_blacklist_id_card ON blacklist(id_card_number) WHERE id_card_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blacklist_phone ON blacklist(phone) WHERE phone IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Recruitment Costs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recruitment_costs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requisition_id  UUID REFERENCES recruitment_requisitions(id) ON DELETE SET NULL,
  candidate_id    UUID REFERENCES recruitment_candidates(id) ON DELETE SET NULL,
  cost_category   VARCHAR(30) NOT NULL
                    CHECK (cost_category IN (
                      'advertising', 'candidate_travel', 'agency_fee',
                      'medical_check', 'training', 'uniform_ppe', 'relocation', 'other'
                    )),
  description     VARCHAR(200) NOT NULL,
  amount          DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  currency        VARCHAR(10) NOT NULL DEFAULT 'LAK',
  vendor_name     VARCHAR(150),
  receipt_url     VARCHAR(500),
  cost_date       DATE NOT NULL,
  budget_year     INTEGER NOT NULL,
  department      VARCHAR(120),
  work_site_id    UUID REFERENCES work_locations(id) ON DELETE SET NULL,
  created_by      VARCHAR(100) NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recruitment_costs_requisition ON recruitment_costs(requisition_id, cost_category);
CREATE INDEX IF NOT EXISTS idx_recruitment_costs_year ON recruitment_costs(budget_year, cost_category);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Talent Pool columns on recruitment_candidates
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE recruitment_candidates
  ADD COLUMN IF NOT EXISTS in_talent_pool      BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS talent_pool_added_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS talent_pool_tags     JSONB,
  ADD COLUMN IF NOT EXISTS talent_pool_rating   INTEGER CHECK (talent_pool_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS talent_pool_notes    TEXT,
  ADD COLUMN IF NOT EXISTS last_contacted_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS willing_to_reapply   BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_talent_pool
  ON recruitment_candidates(in_talent_pool, talent_pool_rating DESC)
  WHERE in_talent_pool = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE manpower_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE manpower_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE headcount_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE headcount_approval_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_check_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruitment_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY manpower_plans_all ON manpower_plans FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY manpower_plan_items_all ON manpower_plan_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY headcount_requests_all ON headcount_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY headcount_approval_actions_all ON headcount_approval_actions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY medical_check_types_all ON medical_check_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY medical_checks_all ON medical_checks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY blacklist_all ON blacklist FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY recruitment_costs_all ON recruitment_costs FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE manpower_plans IS 'Annual headcount planning — header records';
COMMENT ON TABLE manpower_plan_items IS 'Line-item positions within a manpower plan';
COMMENT ON TABLE headcount_requests IS 'Employee/supervisor requests to add headcount (3-tier approval)';
COMMENT ON TABLE headcount_approval_actions IS 'Approval step history for headcount requests';
COMMENT ON TABLE medical_check_types IS 'Configurable medical check types (mandatory / periodic)';
COMMENT ON TABLE medical_checks IS 'Medical check results for candidates and employees';
COMMENT ON TABLE blacklist IS 'Blacklisted individuals — auto-checked against new candidates';
COMMENT ON TABLE recruitment_costs IS 'Cost tracking per posting / candidate for Cost-per-Hire reporting';
