import { useEffect, useState } from "react";
import {
  clearStoredSalaryAccessToken,
  getStoredSalaryAccessToken,
  isSalaryAccessError,
  verifySalaryAccess,
} from "~/lib/salary-access.client";

export type SlipData = {
  employee: { employee_code: string; name: string } | null;
  slip: Record<string, number | string | null> | null;
};

export type SalaryAccessMessages = {
  passwordRequired: string;
  locked: string;
  invalid: string;
  verifyFailed: string;
};

type FetchSlipResult =
  | { ok: true; data: SlipData }
  | { ok: false; error: string };

async function fetchProtectedSlip(endpoint: string, year: number, month: number, token: string): Promise<FetchSlipResult> {
  const res = await fetch(`${endpoint}?year=${year}&month=${month}`, {
    headers: { "x-salary-token": `SalaryToken ${token}` },
  });

  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    employee?: SlipData["employee"];
    slip?: SlipData["slip"];
  };

  if (!res.ok) {
    return { ok: false, error: String(json.error || "LOAD_FAILED") };
  }

  return {
    ok: true,
    data: {
      employee: json.employee || null,
      slip: json.slip || null,
    },
  };
}

export function useSalaryProtectedSlip(
  endpoint: string,
  year: number,
  month: number,
  messages: SalaryAccessMessages,
) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<SlipData | null>(null);
  const [salaryAccessRequired, setSalaryAccessRequired] = useState(false);
  const [salaryPassword, setSalaryPassword] = useState("");
  const [salaryAccessError, setSalaryAccessError] = useState("");
  const [salaryVerifying, setSalaryVerifying] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      setData(null);

      const token = getStoredSalaryAccessToken();
      if (!token) {
        if (!cancelled) {
          setSalaryAccessRequired(true);
          setLoading(false);
        }
        return;
      }

      try {
        const result = await fetchProtectedSlip(endpoint, year, month, token);
        if (cancelled) return;

        if (!result.ok) {
          if (isSalaryAccessError(result.error)) {
            clearStoredSalaryAccessToken();
            setSalaryAccessRequired(true);
            setSalaryAccessError(messages.invalid);
          } else {
            setError(result.error);
          }
          return;
        }

        setSalaryAccessRequired(false);
        setData(result.data);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [endpoint, year, month]);

  async function submitSalaryPassword() {
    if (salaryVerifying) return;

    setSalaryAccessError("");
    setError("");

    if (!salaryPassword.trim()) {
      setSalaryAccessError(messages.passwordRequired);
      return;
    }

    setSalaryVerifying(true);
    setLoading(true);
    setData(null);

    try {
      const verifyResult = await verifySalaryAccess(salaryPassword.trim());
      if (!verifyResult.ok) {
        if (verifyResult.error === "SALARY_ACCESS_LOCKED") {
          setSalaryAccessError(messages.locked);
        } else if (verifyResult.error === "INVALID_CREDENTIALS") {
          setSalaryAccessError(messages.invalid);
        } else {
          setSalaryAccessError(messages.verifyFailed);
        }
        return;
      }

      const token = getStoredSalaryAccessToken();
      if (!token) {
        setSalaryAccessRequired(true);
        setSalaryAccessError(messages.verifyFailed);
        return;
      }

      const slipResult = await fetchProtectedSlip(endpoint, year, month, token);
      if (!slipResult.ok) {
        if (isSalaryAccessError(slipResult.error)) {
          clearStoredSalaryAccessToken();
          setSalaryAccessRequired(true);
          setSalaryAccessError(messages.invalid);
        } else {
          setError(slipResult.error);
        }
        return;
      }

      setSalaryPassword("");
      setSalaryAccessRequired(false);
      setData(slipResult.data);
    } finally {
      setSalaryVerifying(false);
      setLoading(false);
    }
  }

  return {
    data,
    error,
    loading,
    salaryAccessError,
    salaryAccessRequired,
    salaryPassword,
    salaryVerifying,
    setSalaryPassword,
    submitSalaryPassword,
  };
}
