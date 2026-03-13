"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LinkAccountPage from "@/app/components/LinkAccountPage";
import { useLiff } from "@/app/hooks/useLiff";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

function hasValidSession() {
  try {
    const raw = localStorage.getItem("tdone_session");
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const loginTime = new Date(parsed.login_time).getTime();
    if (isNaN(loginTime) || Date.now() > loginTime + SESSION_DURATION_MS) {
      localStorage.removeItem("tdone_session");
      return null;
    }

    if (!parsed.session_token) {
      return null;
    }

    return parsed;
  } catch {
    localStorage.removeItem("tdone_session");
    return null;
  }
}

export default function Home() {
  const router = useRouter();
  const { loading, error, profile, idToken } = useLiff();
  const [checkingLink, setCheckingLink] = useState(false);
  const [linkChecked, setLinkChecked] = useState(false);
  const [linkError, setLinkError] = useState("");

  useEffect(() => {
    const session = hasValidSession();
    if (!session) return;

    const isAdminPortal = session.login_context === "admin_portal";
    const target = session.must_change_pin
      ? "/change-pin"
      : (isAdminPortal ? "/admin" : "/dashboard");
    router.replace(target);
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function checkLinkedAccount() {
      if (!profile?.userId || !idToken || loading) return;

      setCheckingLink(true);
      setLinkError("");

      try {
        const res = await fetch("/api/liff-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            line_user_id: profile.userId,
            id_token: idToken,
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          if (!cancelled) {
            setLinkError(data.error || "LIFF login failed");
            setLinkChecked(true);
          }
          return;
        }

        if (data.linked) {
          localStorage.setItem(
            "tdone_session",
            JSON.stringify({
              emp_id: data.emp_id,
              role: data.role,
              status: data.status,
              login_context: data.login_context || "employee_portal",
              login_time: new Date().toISOString(),
              session_token: data.session_token,
              must_change_pin: Boolean(data.must_change_pin),
            })
          );

          if (!cancelled) {
            if (data.must_change_pin) router.replace("/change-pin");
            else router.replace("/dashboard");
          }
          return;
        }

        if (!cancelled) {
          setLinkChecked(true);
        }
      } catch {
        if (!cancelled) {
          setLinkError("Unable to verify linked LINE account");
          setLinkChecked(true);
        }
      } finally {
        if (!cancelled) {
          setCheckingLink(false);
        }
      }
    }

    checkLinkedAccount();

    return () => {
      cancelled = true;
    };
  }, [profile, idToken, loading, router]);

  if (loading || checkingLink || (!linkChecked && profile)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA] text-[#1A2B4A]">
        <p className="text-sm">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA] p-6">
        <div className="w-full max-w-md rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
          <p className="font-semibold">LIFF initialization failed</p>
          <p className="mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (linkError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA] p-6">
        <div className="w-full max-w-md rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm">
          <p className="font-semibold">LINE Login Issue</p>
          <p className="mt-1">{linkError}</p>
        </div>
      </div>
    );
  }

  if (profile && linkChecked) {
    return <LinkAccountPage profile={profile} idToken={idToken} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA] text-[#1A2B4A]">
      <p className="text-sm">Unable to continue LIFF login. Please try again.</p>
    </div>
  );
}
