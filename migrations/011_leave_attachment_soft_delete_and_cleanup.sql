-- Soft delete + auto cleanup support for leave request attachments

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS attachment_public_id TEXT,
  ADD COLUMN IF NOT EXISTS attachment_resource_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS attachment_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS attachment_inactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attachment_delete_after TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attachment_deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

UPDATE leave_requests
SET attachment_active = CASE WHEN attachment_url IS NULL THEN false ELSE true END
WHERE attachment_active IS NULL;

CREATE INDEX IF NOT EXISTS idx_leave_requests_cleanup
ON leave_requests(status, attachment_active, attachment_delete_after)
WHERE attachment_url IS NOT NULL;

CREATE TABLE IF NOT EXISTS leave_request_file_deletion_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES leave_requests(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  leave_type_code VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  cloudinary_public_id TEXT,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(request_id)
);

ALTER TABLE leave_request_file_deletion_audit ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE policyname = 'leave_request_file_deletion_audit_service_role_all'
      AND tablename = 'leave_request_file_deletion_audit'
  ) THEN
    CREATE POLICY leave_request_file_deletion_audit_service_role_all
      ON leave_request_file_deletion_audit
      FOR ALL
      USING (true);
  END IF;
END $$;
