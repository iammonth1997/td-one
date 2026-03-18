import { Link } from "react-router";
import type { Route } from "./+types/admin";
import { requireSession } from "~/lib/require-session.server";
import { canManagePinReset } from "~/lib/role-access.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireSession(request, context);
  const isAdmin = canManagePinReset(session.role) || session.login_context === "admin_portal";
  return { isAdmin, role: session.role };
}

export default function AdminPage({ loaderData }: Route.ComponentProps) {
  if (!loaderData.isAdmin) {
    return (
      <main className="min-h-screen bg-white px-4 py-6 sm:px-6 sm:py-10">
        <section className="mx-auto max-w-xl rounded-2xl border border-[#FECACA] bg-white p-6 text-center shadow-[0_10px_28px_rgba(220,38,38,0.10)]">
          <h1 className="text-2xl font-bold text-[#111111]">Admin</h1>
          <p className="mt-3 text-sm text-red-600">FORBIDDEN</p>
          <Link to="/dashboard" className="mt-4 inline-block text-sm font-semibold text-[#991B1B]">Back</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-4 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto max-w-3xl rounded-2xl border border-[#FECACA] bg-white p-6 shadow-[0_10px_28px_rgba(220,38,38,0.10)]">
        <h1 className="text-2xl font-bold text-[#111111]">Admin Portal</h1>
        <p className="mt-2 text-sm text-[#555555]">Role: {loaderData.role}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Link to="/forgot-pin" className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm font-semibold text-[#991B1B]">PIN reset tools</Link>
          <a href="/api/work-locations" className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm font-semibold text-[#991B1B]">Work locations API</a>
          <a href="/api/login/admin/pin-reset-audit" className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm font-semibold text-[#991B1B]">PIN reset audit API</a>
          <a href="/api/attendance/admin/reset-device" className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm font-semibold text-[#991B1B]">Reset device API</a>
        </div>
      </section>
    </main>
  );
}
