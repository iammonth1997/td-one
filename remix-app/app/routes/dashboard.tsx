import { Link, redirect } from "react-router";
import type { Route } from "./+types/dashboard";
import { canManagePinReset } from "~/lib/role-access.server";
import { getSupabaseServerClient } from "~/lib/supabase.server";
import { sessionTokenCookie } from "~/lib/session-cookie.server";
import { validateSession } from "~/lib/session-validation.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { session, error } = await validateSession(request, context);
  if (error || !session) {
    throw redirect("/login");
  }

  const { supabaseServer } = getSupabaseServerClient(context);
  const { data: user } = await supabaseServer
    .from("login_users")
    .select("force_pin_change")
    .eq("emp_id", session.emp_id)
    .maybeSingle();

  if (user?.force_pin_change) {
    throw redirect("/change-pin");
  }

  const { data: emp } = await supabaseServer
    .from("employees")
    .select("employee_code, first_name_th, last_name_th")
    .eq("employee_code", session.emp_id)
    .maybeSingle();

  return {
    emp_id: session.emp_id,
    role: session.role,
    login_context: session.login_context,
    first_name: emp?.first_name_th || "",
    last_name: emp?.last_name_th || "",
    can_reset_pin: canManagePinReset(session.role),
  };
}

export async function action() {
  return redirect("/login", {
    headers: {
      "Set-Cookie": await sessionTokenCookie.serialize("", { maxAge: 0 }),
    },
  });
}

export default function DashboardPage({ loaderData }: Route.ComponentProps) {
  const displayName = `${loaderData.first_name || ""} ${loaderData.last_name || ""}`.trim() || loaderData.emp_id;

  const services = [
    {
      title: "Day Work",
      description: "View attendance summary by month",
      href: "/day-work",
      enabled: true,
    },
    {
      title: "Change PIN",
      description: "Update your current PIN",
      href: "/change-pin",
      enabled: true,
    },
    {
      title: "Scan In/Out",
      description: "Scan module route ready (UI migration in progress)",
      href: "/scan",
      enabled: true,
    },
    {
      title: "Request Module",
      description: "Leave / OT / Time correction routes and APIs ready",
      href: "/request",
      enabled: true,
    },
    {
      title: "Slip Module",
      description: "Salary and OT slip routes connected to APIs",
      href: "/slip",
      enabled: true,
    },
    {
      title: "Admin",
      description: "Admin route and core APIs bridged",
      href: "/admin",
      enabled: true,
    },
  ];

  return (
    <div className="min-h-screen bg-white px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="relative overflow-hidden rounded-2xl border border-[#FECACA] bg-gradient-to-br from-[#450A0A] via-[#991B1B] to-[#DC2626] p-6 text-white shadow-[0_12px_32px_rgba(220,38,38,0.16)] sm:p-8">
          <h1 className="text-2xl font-bold sm:text-3xl">Welcome, {displayName}</h1>
          <div className="mt-3 grid gap-1 text-sm text-white/90">
            <p>
              Employee ID: <span className="font-semibold text-white">{loaderData.emp_id}</span>
            </p>
            <p>
              Role: <span className="font-semibold text-white">{loaderData.role}</span>
            </p>
            <p>
              Context: <span className="font-semibold text-white">{loaderData.login_context}</span>
            </p>
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-xl font-bold text-[#111111]">Services</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {services.map((service) => (
              <div
                key={service.title}
                className={`rounded-2xl border p-5 shadow-[0_10px_28px_rgba(220,38,38,0.10)] ${
                  service.enabled
                    ? "border-[#FECACA] bg-white"
                    : "border-[#FEE2E2] bg-[#FFF5F5] opacity-75"
                }`}
              >
                <h3 className="text-lg font-semibold text-[#111111]">{service.title}</h3>
                <p className="mt-1 text-sm text-[#555555]">{service.description}</p>
                {service.enabled ? (
                  <Link
                    to={service.href}
                    className="mt-4 inline-block rounded-lg bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white hover:bg-[#991B1B]"
                  >
                    Open
                  </Link>
                ) : (
                  <span className="mt-4 inline-block rounded-lg border border-[#FECACA] bg-white px-4 py-2 text-sm font-semibold text-[#991B1B]">
                    Coming soon
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {loaderData.can_reset_pin && (
            <Link
              to="/forgot-pin"
              className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-2 text-sm font-medium text-[#991B1B] hover:bg-[#FEE2E2]"
            >
              Forgot PIN (HR)
            </Link>
          )}
          <Link
            to="/change-pin"
            className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-2 text-sm font-medium text-[#991B1B] hover:bg-[#FEE2E2]"
          >
            Change PIN
          </Link>
          <form method="post">
            <button type="submit" className="rounded-lg bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white hover:bg-[#991B1B]">
              Logout
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
