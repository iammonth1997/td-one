import { useState } from "react";
import { Link, useNavigate } from "react-router";

export default function SetPinPage() {
  const navigate = useNavigate();
  const [empId, setEmpId] = useState("");
  const [dob, setDob] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSetPin() {
    if (loading) return;
    setError("");
    setSuccess("");

    if (!/^\d{6}$/.test(pin)) {
      setError("PIN must be exactly 6 digits.");
      return;
    }

    if (pin !== confirmPin) {
      setError("PIN does not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/login/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emp_id: empId, date_of_birth: dob, pin }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        if (data.error === "EMPLOYEE_NOT_FOUND") setError("Employee not found.");
        else if (data.error === "INVALID_DOB") setError("Date of birth is incorrect.");
        else if (data.error === "INVALID_PIN_FORMAT") setError("Password must be 12-128 characters.");
        else if (data.error === "ACCOUNT_BLOCKED") setError("Account is blocked.");
        else setError(data.error || "Unable to set password.");
        return;
      }

      setSuccess("Password set successfully. Redirecting to login...");
      setTimeout(() => navigate("/login"), 1000);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm rounded-[1rem] border border-[#FECACA] bg-white p-8 shadow-[0_4px_24px_rgba(220,38,38,0.10)]">
        <h1 className="mb-6 text-center text-2xl font-bold text-[#111111]">Set Password</h1>

        <label className="text-sm font-medium text-[#555555]">Employee ID</label>
        <input
          type="text"
          value={empId}
          onChange={(e) => setEmpId(e.target.value)}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          placeholder="EMP001"
          disabled={loading}
        />

        <label className="text-sm font-medium text-[#555555]">Date of Birth</label>
        <input
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          disabled={loading}
        />

        <label className="text-sm font-medium text-[#555555]">Password</label>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          placeholder="12+ characters"
          disabled={loading}
        />
        <p className="mb-3 text-xs text-[#666666]">Min 12 characters. Use mix of letters, numbers, symbols.</p>

        <label className="text-sm font-medium text-[#555555]">Confirm Password</label>
        <input
          type="password"
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          placeholder="Confirm password"
          disabled={loading}
        />

        {error && <p className="mb-3 text-center text-sm text-red-600">{error}</p>}
        {success && <p className="mb-3 text-center text-sm text-green-600">{success}</p>}

        <button
          type="button"
          onClick={() => {
            void handleSetPin();
          }}
          disabled={loading}
          className="mt-2 w-full rounded-xl bg-[#DC2626] py-2.5 font-semibold text-white shadow-[0_10px_24px_rgba(220,38,38,0.25)] transition hover:bg-[#991B1B] disabled:opacity-50"
        >
          {loading ? "Saving..." : "Set Password"}
        </button>

        <p className="mt-4 text-center text-xs text-[#555555]">
          <Link to="/login" className="font-medium text-[#DC2626] hover:text-[#991B1B]">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
