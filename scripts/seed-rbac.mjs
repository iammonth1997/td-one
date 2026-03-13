import { createClient } from "@supabase/supabase-js";

const APP_ROLES = [
  "SUPER_ADMIN",
  "DIRECTOR",
  "DEPT_MANAGER",
  "SECTION_MANAGER",
  "ASST_MANAGER",
  "DEPT_ADMIN",
  "SUPERINTENDENT",
  "HEAD_SUPERVISOR",
  "FOREMAN",
  "ENGINEER",
  "TRAINER",
  "EMPLOYEE",
  "HR_MANAGER",
  "HR_RECRUITMENT",
  "HR_TIME_ATTENDANCE",
  "HR_PAYROLL",
  "HR_WELFARE",
  "HR_TRAINING",
  "HR_HRBP",
  "ACCOUNTING_HEAD",
  "ACCOUNTING_STAFF",
  "WAREHOUSE_HEAD",
  "AUDITOR",
  "SHE_MANAGER",
  "SHE_OFFICER",
];

const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ["rbac.manage", "settings.manage.system", "audit.read.all", "attendance.read.all", "attendance.edit.all", "employee.manage.all", "leave.approve.company", "reports.read.executive"],
  DIRECTOR: ["dashboard.read.company", "reports.read.executive", "audit.read.all", "leave.approve.company"],
  DEPT_MANAGER: ["dashboard.read.department", "attendance.read.department", "employee.read.department", "leave.approve.department"],
  SECTION_MANAGER: ["dashboard.read.team", "attendance.read.team", "employee.read.department", "leave.approve.section"],
  ASST_MANAGER: ["dashboard.read.team", "attendance.read.team", "employee.read.department"],
  DEPT_ADMIN: ["attendance.read.department", "attendance.edit.department", "employee.read.department", "employee.manage.department"],
  SUPERINTENDENT: ["dashboard.read.department", "attendance.read.department", "leave.approve.department"],
  HEAD_SUPERVISOR: ["dashboard.read.team", "attendance.read.team", "leave.approve.section"],
  FOREMAN: ["dashboard.read.team", "attendance.read.team"],
  ENGINEER: ["attendance.read.self", "attendance.read.team", "employee.read.department"],
  TRAINER: ["training.read.department", "training.manage.department"],
  EMPLOYEE: ["attendance.read.self", "leave.request.self", "payroll.read.self"],
  HR_MANAGER: ["attendance.read.all", "attendance.edit.all", "recruitment.manage", "welfare.manage.department", "training.manage.department", "payroll.read.full", "leave.approve.company"],
  HR_RECRUITMENT: ["recruitment.read", "recruitment.manage"],
  HR_TIME_ATTENDANCE: ["attendance.read.all", "attendance.edit.all"],
  HR_PAYROLL: ["payroll.read.full", "attendance.read.all"],
  HR_WELFARE: ["welfare.read.department", "welfare.manage.department"],
  HR_TRAINING: ["training.read.department", "training.manage.department"],
  HR_HRBP: ["attendance.read.department", "employee.read.department", "welfare.read.department"],
  ACCOUNTING_HEAD: ["accounting.read", "accounting.manage", "payroll.read.summary"],
  ACCOUNTING_STAFF: ["accounting.read", "accounting.manage"],
  WAREHOUSE_HEAD: ["inventory.read", "inventory.manage"],
  AUDITOR: ["audit.read.all", "reports.read.executive", "attendance.read.all"],
  SHE_MANAGER: ["she.read.all", "she.manage.area"],
  SHE_OFFICER: ["she.read.area", "she.manage.area"],
};

const READ_ONLY_ROLES = new Set(["AUDITOR"]);

function assertValidMatrix() {
  for (const role of APP_ROLES) {
    if (!ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS[role].length === 0) {
      throw new Error(`RBAC misconfigured: role ${role} has no permissions`);
    }
  }

  for (const role of READ_ONLY_ROLES) {
    const hasWrite = (ROLE_PERMISSIONS[role] || []).some(
      (permission) => permission.endsWith(".manage") || permission.endsWith(".edit")
    );
    if (hasWrite) {
      throw new Error(`RBAC misconfigured: read-only role ${role} has write permission`);
    }
  }
}

function buildRows() {
  const rows = [];
  for (const role of APP_ROLES) {
    for (const permission of ROLE_PERMISSIONS[role] || []) {
      rows.push({ role, permission });
    }
  }
  return rows;
}

async function main() {
  assertValidMatrix();

  const rows = buildRows();
  const apply = process.argv.includes("--apply");

  if (!apply) {
    console.log(`[seed-rbac] Dry run mode. Generated ${rows.length} role-permission rows.`);
    console.log("[seed-rbac] Run: npm run seed:rbac:apply to upsert into Supabase table rbac_role_permissions.");
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: clearError } = await supabase
    .from("rbac_role_permissions")
    .delete()
    .not("role", "is", null);

  if (clearError) {
    throw new Error(`[seed-rbac] Failed clearing table: ${clearError.message}`);
  }

  const { error: insertError } = await supabase.from("rbac_role_permissions").insert(rows);

  if (insertError) {
    throw new Error(`[seed-rbac] Failed inserting rows: ${insertError.message}`);
  }

  console.log(`[seed-rbac] Seed completed. Inserted ${rows.length} rows.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
