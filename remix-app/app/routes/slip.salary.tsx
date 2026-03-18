import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { Route } from "./+types/slip.salary";
import { requireSession } from "~/lib/require-session.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireSession(request, context);
  return null;
}

export default function SalarySlipPage() {
  const [params] = useSearchParams();
  const [result, setResult] = useState("");

  useEffect(() => {
    const year = params.get("year") || "";
    const month = params.get("month") || "";
    if (!year || !month) return;
    fetch(`/api/salary-slip?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`)
      .then(async (res) => ({ status: res.status, data: await res.json().catch(() => ({})) }))
      .then((payload) => setResult(JSON.stringify(payload, null, 2)))
      .catch(() => setResult("{\n  \"error\": \"REQUEST_FAILED\"\n}"));
  }, [params]);

  return (
    <main className="min-h-screen bg-white px-4 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto max-w-3xl rounded-2xl border border-[#FECACA] bg-white p-6 shadow-[0_10px_28px_rgba(220,38,38,0.10)]">
        <h1 className="text-2xl font-bold text-[#111111]">Salary Slip</h1>
        {result ? <pre className="mt-4 overflow-x-auto rounded-xl bg-[#111111] p-3 text-xs text-white">{result}</pre> : <p className="mt-3 text-sm text-[#555555]">Select year/month first.</p>}
        <Link to="/slip" className="mt-4 inline-block text-sm font-semibold text-[#991B1B]">Back</Link>
      </section>
    </main>
  );
}
