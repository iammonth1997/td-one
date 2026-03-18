import { Form, Link } from "react-router";
import type { Route } from "./+types/slip";
import { requireSession } from "~/lib/require-session.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireSession(request, context);
  return null;
}

export default function SlipPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto max-w-xl rounded-2xl border border-[#FECACA] bg-white p-6 shadow-[0_10px_28px_rgba(220,38,38,0.10)]">
        <h1 className="text-2xl font-bold text-[#111111]">Slips</h1>
        <Form method="get" action="/slip/salary" className="mt-5 space-y-3">
          <input type="number" name="year" placeholder="Year" className="w-full rounded-xl border border-[#FECACA] p-2" />
          <input type="number" name="month" placeholder="Month" className="w-full rounded-xl border border-[#FECACA] p-2" />
          <button className="rounded-lg bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white">View Salary Slip</button>
        </Form>
        <Form method="get" action="/slip/ot" className="mt-4 space-y-3">
          <input type="number" name="year" placeholder="Year" className="w-full rounded-xl border border-[#FECACA] p-2" />
          <input type="number" name="month" placeholder="Month" className="w-full rounded-xl border border-[#FECACA] p-2" />
          <button className="rounded-lg bg-[#991B1B] px-4 py-2 text-sm font-semibold text-white">View OT Slip</button>
        </Form>
        <Link to="/dashboard" className="mt-4 inline-block text-sm font-semibold text-[#991B1B]">Back to dashboard</Link>
      </section>
    </main>
  );
}
