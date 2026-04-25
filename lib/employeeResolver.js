export async function resolveEmployeeByCode(prisma, employeeCode) {
  const normalizedCode = String(employeeCode || "").trim().toUpperCase();
  if (!normalizedCode) {
    return { employee: null, error: null };
  }

  try {
    const rows = await prisma.$queryRaw`
      SELECT
        e.employee_id AS employee_code,
        e.first_name,
        e.last_name,
        e.full_name_en,
        e.full_name_lo,
        e.position,
        e.status,
        d.name AS department_name,
        wl.name AS work_location_name,
        COALESCE(m.employee_uuid, mapped.employee_uuid) AS employee_uuid
      FROM employees e
      LEFT JOIN employee_uuid_mappings m
        ON m.employee_code = e.employee_id
      LEFT JOIN departments d
        ON d.id = e.department_id
      LEFT JOIN work_locations wl
        ON wl.id = e.work_location_id
      LEFT JOIN LATERAL (
        SELECT employee_uuid
        FROM (
          SELECT ps.employee_id AS employee_uuid
          FROM payroll_settings ps
          WHERE UPPER(ps.emp_code) = UPPER(e.employee_id)

          UNION ALL

          SELECT eps.employee_id AS employee_uuid
          FROM employee_payroll_settings eps
          WHERE UPPER(eps.emp_code) = UPPER(e.employee_id)

          UNION ALL

          SELECT al.employee_id AS employee_uuid
          FROM attendance_logs al
          WHERE UPPER(al.emp_code) = UPPER(e.employee_id)
            AND al.employee_id IS NOT NULL

          UNION ALL

          SELECT ass.employee_id AS employee_uuid
          FROM attendance_suspicious_scans ass
          WHERE UPPER(ass.employee_code) = UPPER(e.employee_id)
            AND ass.employee_id IS NOT NULL
        ) mapped_candidates
        WHERE employee_uuid IS NOT NULL
        LIMIT 1
      ) mapped ON true
      WHERE UPPER(e.employee_id) = ${normalizedCode}
      LIMIT 1
    `;

    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row?.employee_uuid) {
      return { employee: null, error: null };
    }

    return {
      employee: {
        id: row.employee_uuid,
        employee_code: row.employee_code,
        first_name: row.first_name || null,
        last_name: row.last_name || null,
        full_name_en: row.full_name_en || null,
        full_name_lo: row.full_name_lo || null,
        name:
          row.full_name_lo
          || row.full_name_en
          || [row.first_name, row.last_name].filter(Boolean).join(" ")
          || row.employee_code,
        department: row.department_name || null,
        dept: row.department_name || null,
        position: row.position || null,
        status: row.status || null,
        work_location: row.work_location_name || null,
      },
      error: null,
    };
  } catch (error) {
    return { employee: null, error };
  }
}
