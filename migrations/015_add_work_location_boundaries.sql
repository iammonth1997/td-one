ALTER TABLE work_locations
  ADD COLUMN IF NOT EXISTS boundary_type VARCHAR(20) NOT NULL DEFAULT 'circle',
  ADD COLUMN IF NOT EXISTS boundary_json JSONB;

ALTER TABLE work_locations
  DROP CONSTRAINT IF EXISTS work_locations_boundary_type_check;

ALTER TABLE work_locations
  ADD CONSTRAINT work_locations_boundary_type_check
  CHECK (boundary_type IN ('circle', 'rectangle', 'polygon'));

UPDATE work_locations
SET boundary_type = 'circle'
WHERE boundary_type IS NULL;
