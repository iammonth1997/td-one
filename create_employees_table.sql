-- ============================================================
--  ThaiDrill ERP — Aiven PostgreSQL
--  Normalized Schema: Reference Tables + Employees
--  Updated: 2026-03-25
-- ============================================================


-- ============================================================
--  HELPER: Auto-update updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
--  1. companies
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  id          SERIAL        PRIMARY KEY,
  name        VARCHAR(100)  NOT NULL UNIQUE,
  description TEXT,
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

INSERT INTO companies (name) VALUES
  ('THAIDRILL LAO SOLE'),
  ('Sunny Machinery Sole'),
  ('The First Company Car For Rent'),
  ('Subcontract-C'),
  ('Subcontract-V')
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE companies IS 'บริษัท / นายจ้าง';


-- ============================================================
--  2. work_locations
-- ============================================================
CREATE TABLE IF NOT EXISTS work_locations (
  id          SERIAL        PRIMARY KEY,
  name        VARCHAR(50)   NOT NULL UNIQUE,
  description TEXT,
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_work_locations_updated_at
  BEFORE UPDATE ON work_locations
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

INSERT INTO work_locations (name) VALUES
  ('เชโปน'), ('เซกอง'), ('หงสา'),
  ('เวียงจันทน์'), ('สาละวัน'), ('ปากเช'), ('แม่เมาะ')
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE work_locations IS 'สถานที่ทำงาน / Site';


-- ============================================================
--  3. departments
-- ============================================================
CREATE TABLE IF NOT EXISTS departments (
  id          SERIAL        PRIMARY KEY,
  name        VARCHAR(100)  NOT NULL UNIQUE,
  description TEXT,
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_departments_updated_at
  BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

INSERT INTO departments (name) VALUES
  ('Operation'), ('SHE'), ('Civil & Central Service'), ('Mechanical'),
  ('HR'), ('Accounting'), ('Administration'), ('Audit'),
  ('Camp'), ('Canteen'), ('IT'), ('Project  Coordination'),
  ('Purchasing'), ('Warehouse')
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE departments IS 'หน่วยงาน / แผนก';


-- ============================================================
--  4. mine_sites
-- ============================================================
CREATE TABLE IF NOT EXISTS mine_sites (
  id          SERIAL        PRIMARY KEY,
  name        VARCHAR(20)   NOT NULL UNIQUE,
  description TEXT,
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_mine_sites_updated_at
  BEFORE UPDATE ON mine_sites
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

INSERT INTO mine_sites (name) VALUES
  ('Center'), ('ปากไช'), ('ปากไซ')
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE mine_sites IS 'เหมือง / Mine Site';


-- ============================================================
--  5. levels
-- ============================================================
CREATE TABLE IF NOT EXISTS levels (
  id          SERIAL        PRIMARY KEY,
  name        VARCHAR(10)   NOT NULL UNIQUE,
  description TEXT,
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_levels_updated_at
  BEFORE UPDATE ON levels
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

INSERT INTO levels (name) VALUES
  ('O1'), ('O2'), ('O3'), ('O4'),
  ('S1'), ('S2'), ('S3'), ('S4'),
  ('STD')
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE levels IS 'ระดับพนักงาน O1–O4 / S1–S4';


-- ============================================================
--  6. cost_centers
-- ============================================================
CREATE TABLE IF NOT EXISTS cost_centers (
  id          SERIAL        PRIMARY KEY,
  code        VARCHAR(20)   NOT NULL UNIQUE,
  description TEXT,
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_cost_centers_updated_at
  BEFORE UPDATE ON cost_centers
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

INSERT INTO cost_centers (code) VALUES
  ('AF-930'),('AF-931'),('AF-932'),
  ('HR-922'),('HR-923'),('HR-924'),('HR-926'),
  ('HS-110'),('HS-130'),('HS-150'),('HS-210'),('HS-520'),('HS-620'),
  ('HS-651'),('HS-652'),('HS-654'),('HS-657'),('HS-659'),
  ('HS-821'),('HS-930'),
  ('MD-930'),('MP-210'),
  ('PC-941'),('PJ-960'),
  ('PX-110'),('PX-120'),('PX-130'),('PX-140'),('PX-150'),('PX-170'),
  ('PX-210'),('PX-520'),('PX-540'),('PX-542'),('PX-620'),('PX-630'),
  ('PX-650'),('PX-651'),('PX-652'),('PX-653'),('PX-654'),('PX-655'),
  ('PX-657'),('PX-658'),('PX-659'),('PX-675'),('PX-821'),('PX-824'),
  ('PX-830'),('PX-831'),('PX-840'),('PX-951'),
  ('ST-951'),
  ('TN-110'),('TN-120'),('TN-130'),('TN-140'),('TN-150'),('TN-170'),
  ('TN-210'),('TN-510'),('TN-520'),('TN-530'),('TN-540'),('TN-541'),
  ('TN-542'),('TN-610'),('TN-620'),('TN-630'),('TN-650'),('TN-651'),
  ('TN-652'),('TN-653'),('TN-654'),('TN-655'),('TN-657'),('TN-658'),
  ('TN-659'),('TN-821'),('TN-824'),('TN-831'),('TN-840'),('TN-921'),
  ('TN-931'),('TN-941'),('TN-950'),('TN-951'),('TN-990'),
  ('XAF-931'),
  ('XHR-921'),('XHR-922'),('XHR-923'),('XHR-926'),
  ('XMD-906'),('XPC-941'),('XST-951')
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE cost_centers IS 'Cost Center รหัสศูนย์ต้นทุน (96 รหัส)';


-- ============================================================
--  7. employees  (main table)
-- ============================================================
CREATE TABLE IF NOT EXISTS employees (

  -- ข้อมูลตัวตน
  employee_id           VARCHAR(20)     NOT NULL,   -- A  รหัสพนักงาน
  prefix                VARCHAR(20),                -- B  คำนำหน้า
  first_name            VARCHAR(100),               -- C  ชื่อ
  last_name             VARCHAR(100),               -- D  นามสกุล
  full_name_en          VARCHAR(150),               -- E  ชื่อ-สกุล ภาษาอังกฤษ
  full_name_lo          VARCHAR(150),               -- AS ชื่อ-สกุล ภาษาลาว
  date_of_birth         DATE,                       -- M  วันเดือนปีเกิด
  phone                 VARCHAR(30),                -- P  เบอร์โทร
  social_security_no    VARCHAR(30),                -- AT เลขบัตร ปกส.

  -- ข้อมูลการทำงาน
  company_id            INT,                        -- J  → companies.id
  department_id         INT,                        -- F  → departments.id
  position              VARCHAR(150),               -- G  ตำแหน่ง
  work_location_id      INT,                        -- H  → work_locations.id
  cost_center_id        INT,                        -- I  → cost_centers.id
  mine_site_id          INT,                        -- AF → mine_sites.id
  level_id              INT,                        -- AU → levels.id
  payslip_code          VARCHAR(30),                -- L  รหัสเข้า Pay Slip
  shift_type            VARCHAR(10),                -- Z  8h / 10h / 10h30mn / 12h
  employee_type         VARCHAR(20),                -- AN รายเดือน / รายวัน
  status                VARCHAR(20),                -- AO พนักงาน / ลาออก / โยกย้าย
  group_name            VARCHAR(50),                -- AP กลุ่ม
  start_date            DATE,                       -- AG วันที่เริ่มงาน
  last_work_date        DATE,                       -- AH ทำงานวันสุดท้าย

  -- เงินเดือนและค่าตอบแทน
  base_salary           NUMERIC(15,2),              -- BW 8h→AV / 10h→AW / 10h30mn+12h→AX
  skill_allowance       NUMERIC(15,2),              -- AZ ค่าทักษะ
  phone_allowance       NUMERIC(15,2),              -- BB ค่าโทรศัพท์
  upcountry_allowance   NUMERIC(15,2),              -- BC ค่า Upcountry
  total_salary          NUMERIC(15,2),              -- BE รวมรับ (LAK)
  bank_account_name     VARCHAR(150),               -- AQ ชื่อบัญชี (ภาษาอังกฤษ)
  bank_account_no       VARCHAR(50),                -- AR เลขบัญชี

  -- การศึกษา
  education_level       VARCHAR(30),                -- AA วุฒิการศึกษา
  field_of_study        VARCHAR(100),               -- AB สาขา
  institution           VARCHAR(150),               -- AD สถาบัน
  experience            TEXT,                       -- AE ประสบการณ์

  -- ที่อยู่
  address_full          TEXT,                       -- O  ที่อยู่เต็ม
  address_village       VARCHAR(100),               -- W  บ้าน
  address_district      VARCHAR(50),                -- X  เมือง
  address_province      VARCHAR(50),                -- Y  แขวง

  -- การประเมิน
  eval_30d              DATE,                       -- AJ ประเมิน 30 วัน
  eval_60d              DATE,                       -- AK ประเมิน 60 วัน
  eval_119d             DATE,                       -- AL ประเมิน 119 วัน

  -- เอกสาร
  license_expiry        TEXT,                       -- AM ใบขับขี่หมดอายุ
  blood_group           VARCHAR(5),                 -- BQ กรุ๊ปเลือด

  -- Metadata
  created_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT employees_pkey PRIMARY KEY (employee_id),

  CONSTRAINT fk_employees_company
    FOREIGN KEY (company_id)        REFERENCES companies(id),
  CONSTRAINT fk_employees_department
    FOREIGN KEY (department_id)     REFERENCES departments(id),
  CONSTRAINT fk_employees_work_location
    FOREIGN KEY (work_location_id)  REFERENCES work_locations(id),
  CONSTRAINT fk_employees_cost_center
    FOREIGN KEY (cost_center_id)    REFERENCES cost_centers(id),
  CONSTRAINT fk_employees_mine_site
    FOREIGN KEY (mine_site_id)      REFERENCES mine_sites(id),
  CONSTRAINT fk_employees_level
    FOREIGN KEY (level_id)          REFERENCES levels(id),

  CONSTRAINT chk_employees_status
    CHECK (status        IN ('พนักงาน', 'ลาออก', 'โยกย้าย')),
  CONSTRAINT chk_employees_shift_type
    CHECK (shift_type    IN ('8h', '10h', '10h30mn', '12h')),
  CONSTRAINT chk_employees_employee_type
    CHECK (employee_type IN ('รายเดือน', 'รายวัน'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_employees_company_id       ON employees (company_id);
CREATE INDEX IF NOT EXISTS idx_employees_department_id    ON employees (department_id);
CREATE INDEX IF NOT EXISTS idx_employees_work_location_id ON employees (work_location_id);
CREATE INDEX IF NOT EXISTS idx_employees_cost_center_id   ON employees (cost_center_id);
CREATE INDEX IF NOT EXISTS idx_employees_status           ON employees (status);
CREATE INDEX IF NOT EXISTS idx_employees_start_date       ON employees (start_date);

-- Trigger
CREATE OR REPLACE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Comments
COMMENT ON TABLE  employees                   IS 'ข้อมูลพนักงาน ThaiDrill LAO — source: Google Sheet Real_EmpID';
COMMENT ON COLUMN employees.employee_id       IS 'รหัสพนักงาน (Sheet col A) — Primary Key';
COMMENT ON COLUMN employees.payslip_code      IS 'รหัสเข้า Pay Slip (Sheet col L) — ห้ามลบ';
COMMENT ON COLUMN employees.base_salary       IS 'ฐานเงินเดือน: 8h→AV, 10h→AW, 10h30mn/12h→AX (รวมเป็น BW)';
COMMENT ON COLUMN employees.total_salary      IS 'รวมรับทั้งหมด สกุลเงินกีบ (LAK)';
COMMENT ON COLUMN employees.company_id        IS 'FK → companies.id';
COMMENT ON COLUMN employees.department_id     IS 'FK → departments.id';
COMMENT ON COLUMN employees.work_location_id  IS 'FK → work_locations.id';
COMMENT ON COLUMN employees.cost_center_id    IS 'FK → cost_centers.id';
COMMENT ON COLUMN employees.mine_site_id      IS 'FK → mine_sites.id';
COMMENT ON COLUMN employees.level_id          IS 'FK → levels.id';
