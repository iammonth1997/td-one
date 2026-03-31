CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "request_type" VARCHAR(50) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "start_date" DATE,
  "end_date" DATE,
  "half_day" VARCHAR(2),
  "total_days" DOUBLE PRECISION,
  "work_dates" JSONB,
  "work_hours" DOUBLE PRECISION,
  "last_working_day" DATE,
  "reason" TEXT,
  "is_twins" BOOLEAN NOT NULL DEFAULT false,
  "created_by_id" VARCHAR(50) NOT NULL,
  "department_id" INTEGER NOT NULL,
  "approved_by_id" VARCHAR(50),
  "approved_at" TIMESTAMP(3),
  "rejection_reason" TEXT,
  "requires_approval" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "requests_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "employees"("employee_id")
    ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "requests_approved_by_id_fkey"
    FOREIGN KEY ("approved_by_id") REFERENCES "employees"("employee_id")
    ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "requests_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS "request_employees" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "request_id" UUID NOT NULL,
  "employee_id" VARCHAR(50) NOT NULL,

  CONSTRAINT "request_employees_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "request_employees_request_id_fkey"
    FOREIGN KEY ("request_id") REFERENCES "requests"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "request_employees_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("employee_id")
    ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS "request_attachments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "request_id" UUID NOT NULL,
  "file_name" TEXT NOT NULL,
  "file_url" TEXT NOT NULL,
  "file_size" INTEGER NOT NULL,
  "mime_type" TEXT NOT NULL,
  "file_public_id" TEXT,
  "file_resource_type" TEXT,
  "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "request_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "request_attachments_request_id_fkey"
    FOREIGN KEY ("request_id") REFERENCES "requests"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "idx_requests_approved_by_id" ON "requests"("approved_by_id");
CREATE INDEX IF NOT EXISTS "idx_requests_created_by_id" ON "requests"("created_by_id");
CREATE INDEX IF NOT EXISTS "idx_requests_department_id" ON "requests"("department_id");
CREATE INDEX IF NOT EXISTS "idx_requests_request_type" ON "requests"("request_type");
CREATE INDEX IF NOT EXISTS "idx_requests_status" ON "requests"("status");

CREATE INDEX IF NOT EXISTS "idx_request_employees_employee_id" ON "request_employees"("employee_id");
CREATE UNIQUE INDEX IF NOT EXISTS "request_employees_request_id_employee_id_key"
  ON "request_employees"("request_id", "employee_id");

CREATE INDEX IF NOT EXISTS "idx_request_attachments_request_id" ON "request_attachments"("request_id");
