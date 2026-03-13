ALTER TABLE work_locations
  ADD COLUMN IF NOT EXISTS boundary_type VARCHAR(20) NOT NULL DEFAULT 'circle',
  ADD COLUMN IF NOT EXISTS boundary_json JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'work_locations_boundary_type_check'
  ) THEN
    ALTER TABLE work_locations
      ADD CONSTRAINT work_locations_boundary_type_check
      CHECK (boundary_type IN ('circle', 'rectangle'));
  END IF;
END
$$;

UPDATE work_locations
SET boundary_type = 'circle'
WHERE boundary_type IS NULL;
