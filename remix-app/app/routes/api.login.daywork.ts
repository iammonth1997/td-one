import type { LoaderFunctionArgs } from "react-router";
import { validateSession } from "~/lib/session-validation.server";
import { getSupabaseServerClient } from "~/lib/supabase.server";

const READ_ALL_ROLES = new Set(["admin", "super_admin", "hr_payroll", "hr-payroll", "hr payroll", "hrpayroll"]);

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers || {}),
    },
  });
}

function canReadAll(role: string | null | undefined) {
  const normalized = String(role || "").trim().toLowerCase();
  return READ_ALL_ROLES.has(normalized);
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { session, error: authError, status: authStatus } = await validateSession(request, context);
  if (authError || !session) {
    return json({ error: authError || "UNAUTHORIZED" }, { status: authStatus || 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const empId = String(searchParams.get("emp_id") || "").trim().toUpperCase();
    const month = Number(searchParams.get("month"));
    const year = Number(searchParams.get("year"));

    if (!empId || !Number.isInteger(month) || !Number.isInteger(year)) {
      return json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    if (empId !== session.emp_id && !canReadAll(session.role)) {
      return json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const { supabaseServer } = getSupabaseServerClient(context);

    const { data: work, error: workError } = await supabaseServer
      .from("attendance_monthly")
      .select("*")
      .eq("emp_id", empId)
      .eq("month", month)
      .eq("year", year)
      .single();

    if (workError) {
      return json({ error: "DAYWORK_NOT_FOUND", detail: workError.message }, { status: 404 });
    }

    const { data: emp, error: empError } = await supabaseServer
      .from("employees")
      .select("employee_code, first_name_th, last_name_th, position_id, department_id, work_site_id")
      .eq("employee_code", empId)
      .maybeSingle();

    if (empError) {
      console.error("employees query failed:", empError.message);
    }

    let positionName: string | null = null;
    let departmentName: string | null = null;
    let workSiteName: string | null = null;

    if (emp) {
      const [posRes, deptRes, siteRes] = await Promise.all([
        emp.position_id
          ? supabaseServer.from("positions").select("title_th").eq("id", emp.position_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        emp.department_id
          ? supabaseServer.from("departments").select("name_th").eq("id", emp.department_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        emp.work_site_id
          ? supabaseServer.from("work_sites").select("name_th").eq("id", emp.work_site_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      positionName = posRes.data?.title_th || null;
      departmentName = deptRes.data?.name_th || null;
      workSiteName = siteRes.data?.name_th || null;
    }

    const employee = emp
      ? {
          employee_code: emp.employee_code,
          first_name_th: emp.first_name_th,
          last_name_th: emp.last_name_th,
          position: positionName ? { name: positionName } : null,
          department: departmentName ? { name: departmentName } : null,
          work_site: workSiteName ? { name: workSiteName } : null,
        }
      : null;

    return json({ employee, daywork: work }, { status: 200 });
  } catch (error) {
    console.error("API_ERROR:", error);
    return json({ error: "SERVER_ERROR", detail: String((error as Error)?.message || error) }, { status: 500 });
  }
}


