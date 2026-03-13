import { supabaseServer } from "@/lib/supabaseServer";
import { validateSession } from "@/lib/validateSession";
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";

export async function GET(req) {
  // Session validation
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  const accessProfile = buildSessionAccessProfile(session);

  try {
    const { searchParams } = new URL(req.url);

    const emp_id = searchParams.get("emp_id");
    const month = searchParams.get("month");
    const year = searchParams.get("year");

    if (!emp_id || !month || !year) {
      return Response.json({ error: "Missing parameters" }, { status: 400 });
    }

    // Enforce: employees can only query their own data
    const canReadOwn = hasAnyPermission(accessProfile, ["daywork.read.self", "daywork.read.all", "rbac.manage"]);
    const canReadAll = hasAnyPermission(accessProfile, ["daywork.read.all", "rbac.manage"]);

    if (!canReadOwn) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    if (emp_id !== session.emp_id && !canReadAll) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const { data: work, error: workError } = await supabaseServer
      .from("monthly_daywork_summary")
      .select("*")
      .eq("emp_id", emp_id)
      .eq("month", Number(month))
      .eq("year", Number(year))
      .single();

    if (workError) {
      return Response.json(
        { error: "DAYWORK_NOT_FOUND", detail: workError.message },
        { status: 404 }
      );
    }

    // Query employee basic fields — no JOIN syntax to avoid FK dependency
    const { data: emp, error: empError } = await supabaseServer
      .from("employees")
      .select("employee_code, first_name_th, last_name_th, position_id, department_id, work_site_id")
      .eq("employee_code", emp_id)
      .maybeSingle();

    if (empError) {
      console.error("employees query failed:", empError.message);
    }

    let positionName = null;
    let departmentName = null;
    let workSiteName = null;

    if (emp) {
      const [posRes, deptRes, siteRes] = await Promise.all([
        emp.position_id
          ? supabaseServer.from("positions").select("title_th").eq("id", emp.position_id).maybeSingle()
          : Promise.resolve({ data: null }),
        emp.department_id
          ? supabaseServer.from("departments").select("name_th").eq("id", emp.department_id).maybeSingle()
          : Promise.resolve({ data: null }),
        emp.work_site_id
          ? supabaseServer.from("work_sites").select("name_th").eq("id", emp.work_site_id).maybeSingle()
          : Promise.resolve({ data: null }),
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

    return Response.json({ employee, daywork: work }, { status: 200 });
  } catch (err) {
    console.error("API_ERROR:", err);
    return Response.json({ error: "SERVER_ERROR", detail: err.message }, { status: 500 });
  }
}
