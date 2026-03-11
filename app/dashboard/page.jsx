"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "../components/sidebar";
import Header from "../components/Header";
import { useLanguage } from "@/app/context/LanguageContext";
import { useSession } from "@/app/hooks/useSession";

export default function Dashboard() {
  const router = useRouter();
  const { session, loading } = useSession();
  const { t } = useLanguage();
  const L = t.dashboard;

  useEffect(() => {
    if (!loading && session?.must_change_pin) {
      router.replace("/change-pin");
    }
  }, [loading, session, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F5F7FA] text-[#1A2B4A]">
        <div className="animate-pulse">
          <div className="h-6 w-48 bg-[#D0D8E4] rounded mb-2"></div>
          <div className="h-4 w-64 bg-[#D0D8E4] rounded"></div>
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
      iconBg: "bg-[#1352A3]",
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
      iconBg: "bg-[#F5A623]",
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
      iconBg: "bg-[#1E6CC8]",
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
      iconBg: "bg-[#0D3B7A]",
    },
  ];

  return (
    <div className="flex bg-[#F5F7FA] min-h-screen text-[#1A2B4A]">
      {!isEmployee && <Sidebar />}

      <div className="flex-1 flex flex-col">
        <Header />

        <div className="flex-1 p-4 sm:p-6 lg:p-8">
          {/* Hero Welcome Banner */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0D3B7A] via-[#1352A3] to-[#1E6CC8] p-6 sm:p-8 text-white shadow-[0_8px_32px_rgba(13,59,122,0.25)]">
            {/* Decorative circles */}
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/5"></div>
            <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/5"></div>
            <div className="absolute top-1/2 right-1/4 w-20 h-20 rounded-full bg-white/5"></div>

            <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
              {/* Avatar */}
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/15 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center flex-shrink-0">
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
              <div className="w-1 h-6 rounded-full bg-[#1352A3]"></div>
              <h2 className="text-xl font-bold text-[#1A2B4A]">{L.servicesTitle}</h2>
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
                    className={`group relative bg-white rounded-xl border border-[#D0D8E4] p-5 sm:p-6 shadow-[0_2px_12px_rgba(13,59,122,0.06)] transition-all duration-200 text-left ${
                      isClickable
                        ? "cursor-pointer hover:shadow-[0_8px_32px_rgba(13,59,122,0.14)] hover:border-[#1352A3]/30 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#1352A3] focus:ring-offset-2"
                        : "opacity-60"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl ${svc.iconBg} text-white flex items-center justify-center flex-shrink-0 shadow-sm`}>
                        {svc.icon}
                      </div>

                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base sm:text-lg font-bold text-[#1A2B4A] group-hover:text-[#1352A3] transition-colors">
                          {svc.title}
                        </h3>
                        <p className="text-sm text-[#6B7A99] mt-1 leading-relaxed">{svc.desc}</p>
                      </div>

                      {/* Arrow */}
                      {isClickable && (
                        <div className="flex-shrink-0 mt-1 text-[#D0D8E4] group-hover:text-[#1352A3] transition-all group-hover:translate-x-0.5">
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
