-- TD One ERP
-- Migration 024: Recruitment + HR-ER modules
-- IMPORTANT: Welfare/Safety deductions must reuse existing employee_deductions table.

-- ─────────────────────────────────────────────────────────────────────────────
-- Recruitment
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recruitment_requisitions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_code VARCHAR(30) NOT NULL,
  title VARCHAR(150) NOT NULL,
  department VARCHAR(120),
  headcount INTEGER NOT NULL DEFAULT 1 CHECK (headcount > 0),
  employment_type VARCHAR(20) NOT NULL DEFAULT 'full_time'
    CHECK (employment_type IN ('full_time', 'contract', 'intern', 'temporary')),
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'on_hold', 'closed', 'cancelled')),
  description TEXT,
  target_start_date DATE,
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_recruitment_requisition_job_code UNIQUE (job_code)
);

CREATE TABLE IF NOT EXISTS recruitment_candidates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requisition_id UUID NOT NULL REFERENCES recruitment_requisitions(id) ON DELETE CASCADE,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150),
  phone VARCHAR(40),
  source VARCHAR(80),
  current_stage VARCHAR(20) NOT NULL DEFAULT 'applied'
    CHECK (current_stage IN ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn')),
  expected_salary DECIMAL(15,2),
  applied_at TIMESTAMPTZ DEFAULT now(),
  hired_at TIMESTAMPTZ,
  rejected_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recruitment_stage_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID NOT NULL REFERENCES recruitment_candidates(id) ON DELETE CASCADE,
  from_stage VARCHAR(20),
  to_stage VARCHAR(20) NOT NULL,
  score DECIMAL(5,2),
  interviewer VARCHAR(120),
  note TEXT,
  scheduled_at TIMESTAMPTZ,
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recruitment_requisitions_status ON recruitment_requisitions(status, department);
CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_requisition ON recruitment_candidates(requisition_id, current_stage);
CREATE INDEX IF NOT EXISTS idx_recruitment_stage_logs_candidate ON recruitment_stage_logs(candidate_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- HR-ER
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_er_cases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  case_type VARCHAR(30) NOT NULL
    CHECK (case_type IN ('disciplinary', 'grievance', 'safety', 'welfare', 'investigation', 'other')),
  title VARCHAR(160) NOT NULL,
  detail TEXT,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_review', 'resolved', 'closed')),
  occurred_on DATE,
  assigned_to VARCHAR(120),
  opened_by VARCHAR(100),
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hr_er_case_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES hr_er_cases(id) ON DELETE CASCADE,
  visibility VARCHAR(20) NOT NULL DEFAULT 'internal'
    CHECK (visibility IN ('internal', 'employee')),
  note TEXT NOT NULL,
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_er_cases_employee_status ON hr_er_cases(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_hr_er_cases_type_status ON hr_er_cases(case_type, status);
CREATE INDEX IF NOT EXISTS idx_hr_er_case_notes_case ON hr_er_case_notes(case_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS (aligned with existing admin APIs in this codebase)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE recruitment_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruitment_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruitment_stage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_er_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_er_case_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY recruitment_requisitions_all ON recruitment_requisitions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY recruitment_candidates_all ON recruitment_candidates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY recruitment_stage_logs_all ON recruitment_stage_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY hr_er_cases_all ON hr_er_cases FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY hr_er_case_notes_all ON hr_er_case_notes FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE recruitment_requisitions IS 'Recruitment requisition head records';
COMMENT ON TABLE recruitment_candidates IS 'Candidates linked to requisitions';
COMMENT ON TABLE recruitment_stage_logs IS 'Stage transition history and interview notes';
COMMENT ON TABLE hr_er_cases IS 'Employee relation and disciplinary/grievance cases';
COMMENT ON TABLE hr_er_case_notes IS 'Timeline notes for HR-ER cases';
COMMENT ON TABLE employee_deductions IS 'Existing payroll deduction table reused by HR-ER welfare/safety actions';
