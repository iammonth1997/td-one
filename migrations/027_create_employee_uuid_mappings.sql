-- =============================================================================
-- Migration 027: Employee UUID mappings
-- Date: 2026-04-21
-- Purpose:
--   - Bridge employee code (employees.employee_id) to UUID used by attendance,
--     leave, OT, payroll, device binding, and salary slip tables.
--   - Seed mappings for existing employees.
--   - Auto-create mappings for future employees.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS employee_uuid_mappings (
  employee_code VARCHAR(50) PRIMARY KEY
    REFERENCES employees(employee_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  employee_uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  source VARCHAR(30) NOT NULL DEFAULT 'generated',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_uuid_mappings_uuid
  ON employee_uuid_mappings(employee_uuid);

INSERT INTO employee_uuid_mappings (employee_code, source)
SELECT e.employee_id, 'generated'
FROM employees e
WHERE e.employee_id IS NOT NULL
ON CONFLICT (employee_code) DO NOTHING;

CREATE OR REPLACE FUNCTION sync_employee_uuid_mappings()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO employee_uuid_mappings (employee_code)
    VALUES (NEW.employee_id)
    ON CONFLICT (employee_code) DO NOTHING;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
    UPDATE employee_uuid_mappings
    SET employee_code = NEW.employee_id,
        updated_at = now()
    WHERE employee_code = OLD.employee_id;

    IF NOT FOUND THEN
      INSERT INTO employee_uuid_mappings (employee_code)
      VALUES (NEW.employee_id)
      ON CONFLICT (employee_code) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_employee_uuid_mappings ON employees;

CREATE TRIGGER trg_sync_employee_uuid_mappings
AFTER INSERT OR UPDATE OF employee_id
ON employees
FOR EACH ROW
EXECUTE FUNCTION sync_employee_uuid_mappings();
