import { Link } from "react-router";
import type { Route } from "./+types/scan";
import { requireSession } from "~/lib/require-session.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireSession(request, context);
  return { empId: session.emp_id };
}

export default function ScanPage({ loaderData }: Route.ComponentProps) {
  return (
    <main className="min-h-screen bg-white px-4 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto w-full max-w-xl rounded-2xl border border-[#FECACA] bg-white p-6 shadow-[0_10px_28px_rgba(220,38,38,0.10)]">
        <h1 className="text-2xl font-bold text-[#111111]">Scan In/Out</h1>
        <p className="mt-2 text-sm text-[#555555]">Employee: {loaderData.empId}</p>
        <p className="mt-3 text-sm text-[#555555]">
          API is ready at <span className="font-semibold">/api/attendance/scan</span>, <span className="font-semibold">/api/attendance/today</span>,
          and <span className="font-semibold">/api/attendance/verify-location</span>.
        </p>
        <p className="mt-4 rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3 text-sm text-[#991B1B]">
          Camera/GPS interactive UI from Next version will be migrated in a focused UI pass.
        </p>
        <Link to="/dashboard" className="mt-5 inline-block rounded-lg bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white hover:bg-[#991B1B]">
          Back to dashboard
        </Link>
      </section>
    </main>
  );
}
