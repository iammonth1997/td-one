import { useState } from "react";
import { Link, redirect, useNavigate } from "react-router";
import type { Route } from "./+types/forgot-pin";
import { canManagePinReset } from "~/lib/role-access.server";
import { validateSession } from "~/lib/session-validation.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { session, error } = await validateSession(request, context);
  if (error || !session) {
    throw redirect("/login");
  }

  if (!canManagePinReset(session.role)) {
    throw redirect("/dashboard");
  }

  return { role: session.role };
}

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [empId, setEmpId] = useState("");
  const [startMonth, setStartMonth] = useState("");
  const [startYear, setStartYear] = useState("");
  const [dobDay, setDobDay] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const currentYear = new Date().getFullYear();
  const years = [] as number[];
  for (let year = currentYear; year >= currentYear - 30; year -= 1) {
    years.push(year);
  }
  const birthYears = [] as number[];
  for (let year = currentYear - 14; year >= currentYear - 90; year -= 1) {
    birthYears.push(year);
  }
  const daysInBirthMonth = dobMonth && dobYear ? new Date(Number(dobYear), Number(dobMonth), 0).getDate() : 31;
  const birthDays = [] as number[];
  for (let day = 1; day <= daysInBirthMonth; day += 1) {
    birthDays.push(day);
  }
  const dob = dobDay && dobMonth && dobYear
    ? `${dobYear}-${dobMonth.padStart(2, "0")}-${dobDay.padStart(2, "0")}`
    : "";

  async function handleVerify() {
    if (loading) return;
    setError("");

    if (!empId.trim() || !startMonth || !startYear || !dob) {
      setError("Please complete all fields.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/login/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emp_id: empId,
          start_month: Number(startMonth),
          start_year: Number(startYear),
          date_of_birth: dob,
        }),
      });

      const data = (await res.json()) as { error?: string; token?: string };
      if (!res.ok) {
        if (data.error === "EMPLOYEE_NOT_FOUND") setError("Employee not found.");
        else if (data.error === "INVALID_DOB") setError("Date of birth is incorrect.");
        else if (data.error === "INVALID_START_DATE") setError("Start date is incorrect.");
        else if (data.error === "ACCOUNT_BLOCKED") setError("Employee account is blocked.");
        else if (data.error === "USER_NOT_REGISTERED") setError("Employee has not registered password yet.");
        else if (data.error === "FORBIDDEN") setError("You don't have permission to reset password.");
        else if (data.error === "SERVER_CONFIG_MISSING") setError("Reset password service is not configured.");
        else setError("Unable to verify information. Please try again.");
        return;
      }

      if (!data.token) {
        setError("Unable to generate reset token.");
        return;
      }

      navigate(`/reset-password?token=${encodeURIComponent(data.token)}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm rounded-[1rem] border border-[#FECACA] bg-white p-8 shadow-[0_4px_24px_rgba(220,38,38,0.10)]">
        <h1 className="mb-1 text-center text-2xl font-bold text-[#111111]">Forgot Password</h1>
        <p className="mb-6 text-center text-sm text-[#777777]">Verify employee info before issuing password reset.</p>

        <label className="text-sm font-medium text-[#555555]">Employee ID</label>
        <input
          type="text"
          value={empId}
          onChange={(event) => setEmpId(event.target.value)}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          placeholder="EMP001"
          disabled={loading}
        />

        <label className="text-sm font-medium text-[#555555]">Start Month</label>
        <select
          value={startMonth}
          onChange={(event) => setStartMonth(event.target.value)}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          disabled={loading}
        >
          <option value="">Select month</option>
          <option value="1">January</option>
          <option value="2">February</option>
          <option value="3">March</option>
          <option value="4">April</option>
          <option value="5">May</option>
          <option value="6">June</option>
          <option value="7">July</option>
          <option value="8">August</option>
          <option value="9">September</option>
          <option value="10">October</option>
          <option value="11">November</option>
          <option value="12">December</option>
        </select>

        <label className="text-sm font-medium text-[#555555]">Start Year</label>
        <select
          value={startYear}
          onChange={(event) => setStartYear(event.target.value)}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          disabled={loading}
        >
          <option value="">Select year</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>

        <label className="text-sm font-medium text-[#555555]">Date of Birth</label>
        <div className="mb-4 mt-1 grid grid-cols-[0.8fr_1fr_1fr] gap-2">
          <select
            aria-label="Birth day"
            value={dobDay}
            onChange={(event) => setDobDay(event.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-red-400"
            disabled={loading}
          >
            <option value="">Day</option>
            {birthDays.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
          <select
            aria-label="Birth month"
            value={dobMonth}
            onChange={(event) => setDobMonth(event.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-red-400"
            disabled={loading}
          >
            <option value="">Month</option>
            <option value="1">Jan</option>
            <option value="2">Feb</option>
            <option value="3">Mar</option>
            <option value="4">Apr</option>
            <option value="5">May</option>
            <option value="6">Jun</option>
            <option value="7">Jul</option>
            <option value="8">Aug</option>
            <option value="9">Sep</option>
            <option value="10">Oct</option>
            <option value="11">Nov</option>
            <option value="12">Dec</option>
          </select>
          <select
            aria-label="Birth year"
            value={dobYear}
            onChange={(event) => setDobYear(event.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-red-400"
            disabled={loading}
          >
            <option value="">Year</option>
            {birthYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="mb-3 text-center text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={() => {
            void handleVerify();
          }}
          disabled={loading}
          className="mt-2 w-full rounded-xl bg-[#DC2626] py-2.5 font-semibold text-white shadow-[0_10px_24px_rgba(220,38,38,0.25)] transition hover:bg-[#991B1B] disabled:opacity-50"
        >
          {loading ? "Verifying..." : "Verify"}
        </button>

        <p className="mt-4 text-center text-xs text-[#555555]">
          <Link to="/dashboard" className="font-medium text-[#DC2626] hover:text-[#991B1B]">
            Back to dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
