import { useMemo, useState } from "react";

type EmployeeOption = {
  employeeId: string;
  fullName: string;
  position: string | null;
};

type EmployeeSelectorProps = {
  employees: EmployeeOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  searchPlaceholder: string;
  title: string;
  selectAllLabel: string;
  deselectAllLabel: string;
  selectedCountLabel: string;
  selectedSectionLabel: string;
  searchResultsLabel: string;
  allEmployeesLabel: string;
  noResultsLabel: string;
};

export function EmployeeSelector({
  employees,
  selected,
  onChange,
  searchPlaceholder,
  title,
  selectAllLabel,
  deselectAllLabel,
  selectedCountLabel,
  selectedSectionLabel,
  searchResultsLabel,
  allEmployeesLabel,
  noResultsLabel,
}: EmployeeSelectorProps) {
  const [query, setQuery] = useState("");
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const employeeMap = useMemo(() => new Map(employees.map((employee) => [employee.employeeId, employee])), [employees]);

  const selectedEmployees = useMemo(
    () => selected.map((employeeId) => employeeMap.get(employeeId)).filter((employee): employee is EmployeeOption => Boolean(employee)),
    [employeeMap, selected],
  );

  const filteredUnselectedEmployees = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const unselectedEmployees = employees.filter((employee) => !selectedSet.has(employee.employeeId));
    if (!normalized) return unselectedEmployees;

    return unselectedEmployees.filter((employee) => {
      return (
        employee.employeeId.toLowerCase().includes(normalized) ||
        employee.fullName.toLowerCase().includes(normalized) ||
        String(employee.position || "")
          .toLowerCase()
          .includes(normalized)
      );
    });
  }, [employees, query, selectedSet]);

  function toggleEmployee(employeeId: string) {
    if (selectedSet.has(employeeId)) {
      onChange(selected.filter((value) => value !== employeeId));
      return;
    }

    onChange([...selected, employeeId]);
  }

  function selectAllVisible() {
    const merged = new Set(selected);
    for (const employee of filteredUnselectedEmployees) {
      merged.add(employee.employeeId);
    }
    onChange([...merged]);
  }

  return (
    <section className="rounded-2xl border border-[#d8dee8] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[#1b2738]">{title}</h2>
          <p className="mt-1 text-xs text-[#7c8ba1]">{selectedCountLabel}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={selectAllVisible}
            disabled={filteredUnselectedEmployees.length === 0}
            className="rounded-lg border border-[#d8dee8] px-3 py-1.5 text-xs font-semibold text-[#1d2b40] hover:bg-[#f7f9fc]"
          >
            {selectAllLabel}
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={selected.length === 0}
            className="rounded-lg border border-[#d8dee8] px-3 py-1.5 text-xs font-semibold text-[#5b6d85] hover:bg-[#f7f9fc]"
          >
            {deselectAllLabel}
          </button>
        </div>
      </div>

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder={searchPlaceholder}
        className="mt-3 w-full rounded-xl border border-[#d8dee8] px-3 py-2 text-sm text-[#1b2738] placeholder:text-[#98a4b7]"
      />

      <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-[#edf1f7]">
        <div className="divide-y divide-[#edf1f7]">
          {selectedEmployees.length > 0 ? (
            <section>
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#64748b]">{selectedSectionLabel}</span>
                <span className="h-px flex-1 bg-[#e2e8f0]" />
              </div>
              <ul className="divide-y divide-[#edf1f7]">
                {selectedEmployees.map((employee) => (
                  <li key={employee.employeeId}>
                    <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-[#f7f9fc]">
                      <input
                        type="checkbox"
                        checked
                        onChange={() => toggleEmployee(employee.employeeId)}
                        className="mt-1 h-4 w-4 rounded border-[#b8c3d4] text-[#1d4ed8]"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-[#1b2738]">
                          {employee.employeeId} {employee.fullName}
                        </span>
                        <span className="block text-xs text-[#7c8ba1]">{employee.position || "-"}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#64748b]">
                {query.trim() ? searchResultsLabel : allEmployeesLabel}
              </span>
              <span className="h-px flex-1 bg-[#e2e8f0]" />
            </div>
            {filteredUnselectedEmployees.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-[#8a97ac]">{noResultsLabel}</div>
            ) : (
              <ul className="divide-y divide-[#edf1f7]">
                {filteredUnselectedEmployees.map((employee) => (
                  <li key={employee.employeeId}>
                    <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-[#f7f9fc]">
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => toggleEmployee(employee.employeeId)}
                        className="mt-1 h-4 w-4 rounded border-[#b8c3d4] text-[#1d4ed8]"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-[#1b2738]">
                          {employee.employeeId} {employee.fullName}
                        </span>
                        <span className="block text-xs text-[#7c8ba1]">{employee.position || "-"}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
