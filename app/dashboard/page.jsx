"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "../components/sidebar";
import Header from "../components/Header";
import { useLanguage } from "@/app/context/LanguageContext";
import { useSession } from "@/app/hooks/useSession";

export default function Dashboard() {
  const router = useRouter();
  const { session, loading } = useSession({ loginPath: "/login", requiredPortal: "employee_portal" });
  const { t } = useLanguage();
  const L = t.dashboard;

  useEffect(() => {
    if (!loading && session?.login_context === "admin_portal") {
      router.replace("/admin");
      return;
    }

    if (!loading && session?.must_change_pin) {
      router.replace("/change-pin");
    }
  }, [loading, session, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-[#111111]">
        <div className="animate-pulse">
          <div className="mb-2 h-6 w-48 rounded bg-[#FEF2F2]"></div>
          <div className="h-4 w-64 rounded bg-[#FEF2F2]"></div>
        </div>
      </div>
    );
  }

  if (session?.must_change_pin) return null;

  if (!session) return null;

  const empId = session.emp_id || session.user?.emp_id || "User";
  const role = session.role || "—";
  const isEmployee = role === "employee";

  const services = [
    {
      key: "scanInOut",
      title: L.scanInOut,
      desc: L.scanInOutDesc,
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
      key: "dayWork",
      title: L.checkDayWork,
      desc: L.checkDayWorkDesc,
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
      key: "ot",
      title: L.checkOT,
      desc: L.checkOTDesc,
      href: "/request",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
      iconBg: "bg-[#F59E0B]",
    },
    {
      key: "salary",
      title: L.slipSalary,
      desc: L.slipSalaryDesc,
      href: "/slip/salary",
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
      key: "otSlip",
      title: L.requestMenu,
      desc: L.requestMenuDesc,
      href: "/request",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
      iconBg: "bg-[#991B1B]",
    },
  ];

  return (
    <div className="flex min-h-screen bg-white text-[#111111]">
      {!isEmployee && <Sidebar />}

      <div className="flex-1 flex flex-col">
        <Header />

        <div className="flex-1 p-4 sm:p-6 lg:p-8">
          {/* Hero Welcome Banner */}
          <div className="relative overflow-hidden rounded-[1rem] border border-[#FECACA] bg-gradient-to-br from-[#450A0A] via-[#991B1B] to-[#DC2626] p-6 text-white shadow-[0_12px_32px_rgba(220,38,38,0.16)] sm:p-8">
            {/* Decorative circles */}
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/5"></div>
            <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/5"></div>
            <div className="absolute top-1/2 right-1/4 w-20 h-20 rounded-full bg-white/5"></div>

            <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
              {/* Avatar */}
              <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full border-2 border-white/30 bg-white/15 backdrop-blur-sm sm:h-20 sm:w-20">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/70 font-medium">{L.greeting}</p>
                <h1 className="text-2xl sm:text-3xl font-bold mt-0.5 truncate">{L.welcome}, {empId}</h1>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-white/80">
                  <span>{L.empId}: <span className="font-semibold text-white">{empId}</span></span>
                  <span>{L.role}: <span className="font-semibold text-white">{role}</span></span>
                </div>
                <p className="text-xs text-white/50 mt-2">{L.subtitle}</p>
              </div>
            </div>
          </div>

          {/* Services Section */}
          <div className="mt-8">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-6 w-1 rounded-full bg-[#DC2626]"></div>
              <h2 className="text-xl font-bold text-[#111111]">{L.servicesTitle}</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              {services.map((svc) => {
                const isClickable = !!svc.href;
                const Card = isClickable ? "button" : "div";
                return (
                  <Card
                    key={svc.key}
                    type={isClickable ? "button" : undefined}
                    onClick={isClickable ? () => router.push(svc.href) : undefined}
                    className={`group relative rounded-[1rem] border border-[#FECACA] bg-white p-5 text-left shadow-[0_10px_28px_rgba(220,38,38,0.10)] transition-all duration-200 sm:p-6 ${
                      isClickable
                        ? "cursor-pointer hover:-translate-y-0.5 hover:border-[#DC2626]/50 hover:shadow-[0_16px_36px_rgba(220,38,38,0.18)] focus:outline-none focus:ring-2 focus:ring-[#DC2626] focus:ring-offset-2 focus:ring-offset-white"
                        : "opacity-60"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${svc.iconBg} text-white shadow-[0_10px_20px_rgba(0,0,0,0.18)] sm:h-14 sm:w-14`}>
                        {svc.icon}
                      </div>

                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-[#111111] transition-colors group-hover:text-[#DC2626] sm:text-lg">
                          {svc.title}
                        </h3>
                        <p className="mt-1 text-sm leading-relaxed text-[#555555]">{svc.desc}</p>
                      </div>

                      {/* Arrow */}
                      {isClickable && (
                        <div className="mt-1 flex-shrink-0 text-[#777777] transition-all group-hover:translate-x-0.5 group-hover:text-[#DC2626]">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
