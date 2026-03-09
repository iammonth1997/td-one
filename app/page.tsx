"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

function hasValidSession() {
  try {
    const raw = localStorage.getItem("tdone_session");
    if (!raw) return false;

    const parsed = JSON.parse(raw);
    const loginTime = new Date(parsed.login_time).getTime();
    if (isNaN(loginTime) || Date.now() > loginTime + SESSION_DURATION_MS) {
      localStorage.removeItem("tdone_session");
      return false;
    }

    return Boolean(parsed.session_token);
  } catch {
    localStorage.removeItem("tdone_session");
    return false;
  }
}

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const target = hasValidSession() ? "/dashboard" : "/login";
    router.replace(target);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA] text-[#1A2B4A]">
      <p className="text-sm">Loading...</p>
    </div>
  );
}
