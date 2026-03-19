import type { Route } from "./+types/admin.settings.admins";
import AdminShell from "~/components/admin-shell";
import { requireAdminSession } from "~/lib/require-admin-session.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireAdminSession(request, context);

  const url = new URL(request.url);
  url.pathname = "/api/admin/account";

  const res = await fetch(url.toString(), {
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });

  const account = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { session, account };
}

export default function AdminAccountsPage({ loaderData }: Route.ComponentProps) {
  const account = loaderData.account;

  return (
    <AdminShell title="Admin Accs" session={loaderData.session}>
      <section className="rounded-xl border border-[#d8dee8] bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-[#1b2738]">Admin Account</h2>
        <dl className="mt-3 space-y-2 text-sm text-[#33465f]">
          <div className="flex gap-2"><dt className="w-28 text-[#7c8ba1]">EMP ID</dt><dd>{String(account.emp_id ?? loaderData.session.emp_id)}</dd></div>
          <div className="flex gap-2"><dt className="w-28 text-[#7c8ba1]">ROLE</dt><dd>{String(account.role ?? loaderData.session.role)}</dd></div>
          <div className="flex gap-2"><dt className="w-28 text-[#7c8ba1]">EMAIL</dt><dd>{String(account.email ?? "-")}</dd></div>
        </dl>
      </section>
    </AdminShell>
  );
}
