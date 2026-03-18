import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/request.ot";
import { requireSession } from "~/lib/require-session.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireSession(request, context);
  return null;
}

export default function RequestOtPage() {
  const [payload, setPayload] = useState('{"date":"2026-03-18","start_time":"18:00","end_time":"20:00","ot_type_code":"NORMAL","reason":"Project support"}');
  const [result, setResult] = useState("");

  async function submit() {
    const res = await fetch("/api/ot-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    const data = await res.json().catch(() => ({}));
    setResult(JSON.stringify({ status: res.status, data }, null, 2));
  }

  return (
    <main className="min-h-screen bg-white px-4 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto max-w-3xl rounded-2xl border border-[#FECACA] bg-white p-6 shadow-[0_10px_28px_rgba(220,38,38,0.10)]">
        <h1 className="text-2xl font-bold text-[#111111]">OT Request</h1>
        <textarea value={payload} onChange={(e) => setPayload(e.target.value)} className="mt-4 h-40 w-full rounded-xl border border-[#FECACA] p-3 font-mono text-sm" />
        <div className="mt-4 flex gap-3">
          <button onClick={() => void submit()} className="rounded-lg bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white">Submit</button>
          <Link to="/request" className="rounded-lg border border-[#FECACA] px-4 py-2 text-sm font-semibold text-[#991B1B]">Back</Link>
        </div>
        {result && <pre className="mt-4 overflow-x-auto rounded-xl bg-[#111111] p-3 text-xs text-white">{result}</pre>}
      </section>
    </main>
  );
}
