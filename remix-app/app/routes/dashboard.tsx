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
      key: "day-work",
      title: "Day Work",
      description: "View attendance summary by month",
      href: "/day-work",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
        </svg>
      ),
      iconBg: "bg-[#DC2626]",
    },
    {
      key: "change-pin",
      title: "Change PIN",
      description: "Update your current PIN",
      href: "/change-pin",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="10" rx="2" />
          <path d="M7 11V8a5 5 0 0 1 10 0v3" />
          <circle cx="12" cy="16" r="1" />
        </svg>
      ),
      iconBg: "bg-[#991B1B]",
    },
    {
      key: "scan",
      title: "Scan In/Out",
      description: "Scan attendance with GPS location verification",
      href: "/scan",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M8 10h8M8 14h5" />
          <path d="M13 2v4" />
        </svg>
      ),
      iconBg: "bg-[#0F8B6D]",
    },
    {
      key: "request",
      title: "Request Module",
      description: "Leave / OT / Time correction requests",
      href: "/request",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
      iconBg: "bg-[#F59E0B]",
    },
    {
      key: "slip",
      title: "Slip Module",
      description: "Salary and OT slip information",
      href: "/slip",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
          <path d="M7 15h4" />
        </svg>
      ),
      iconBg: "bg-[#DC2626]",
    },
    {
      key: "admin",
      title: "Admin",
      description: "Admin tools and settings",
      href: "/admin",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
      iconBg: "bg-[#111111]",
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
              <Link
                key={service.key}
                to={service.href}
                className="group relative rounded-2xl border border-[#FECACA] bg-white p-5 shadow-[0_10px_28px_rgba(220,38,38,0.10)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#DC2626]/50 hover:shadow-[0_16px_36px_rgba(220,38,38,0.18)]"
              >
                <div className="flex items-start gap-4">
                  <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${service.iconBg} text-white shadow-[0_10px_20px_rgba(0,0,0,0.18)]`}>
                    {service.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-[#111111] transition-colors group-hover:text-[#DC2626]">
                      {service.title}
                    </h3>
                    <p className="mt-1 text-sm text-[#555555]">{service.description}</p>
                  </div>

                  <div className="mt-1 flex-shrink-0 text-[#777777] transition-all group-hover:translate-x-0.5 group-hover:text-[#DC2626]">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </div>
              </Link>
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
