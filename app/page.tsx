"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LinkAccountPage from "@/app/components/LinkAccountPage";
import { useLiff } from "@/app/hooks/useLiff";
import { readAnyStoredSession, writeStoredSession } from "@/lib/clientSession";

export default function Home() {
  const router = useRouter();
  const { loading, error, profile, idToken } = useLiff();
  const [checkingLink, setCheckingLink] = useState(false);
  const [linkChecked, setLinkChecked] = useState(false);
  const [linkError, setLinkError] = useState("");

  useEffect(() => {
    const session = readAnyStoredSession();
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
          writeStoredSession({
            emp_id: data.emp_id,
            role: data.role,
            status: data.status,
            login_context: data.login_context || "employee_portal",
            login_time: new Date().toISOString(),
            session_token: data.session_token,
            must_change_pin: Boolean(data.must_change_pin),
          });

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
      <div className="min-h-screen flex items-center justify-center bg-white text-[#111111]">
        <p className="text-sm">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-6">
        <div className="w-full max-w-md rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-5 text-sm text-[#B91C1C] shadow-[0_12px_36px_rgba(220,38,38,0.15)]">
          <p className="font-semibold">LIFF initialization failed</p>
          <p className="mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (linkError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-6">
        <div className="w-full max-w-md rounded-2xl border border-[#FCD34D] bg-[#FFF7ED] p-5 text-sm text-[#B45309] shadow-[0_12px_36px_rgba(220,38,38,0.15)]">
          <p className="font-semibold">LINE Login Issue</p>
          <p className="mt-1">{linkError}</p>
        </div>
      </div>
    );
  }

  if (profile && linkChecked) {
    return <LinkAccountPage profile={profile} idToken={idToken} />;
  }

  // Localhost: redirect to direct login page
  const isLocalhost = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  if (isLocalhost) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-6 text-[#111111]">
        <div className="rounded-2xl border border-[#FECACA] bg-white px-8 py-10 text-center shadow-[0_12px_36px_rgba(220,38,38,0.15)]">
          <p className="text-sm mb-4">🚀 Development Mode Detected</p>
          <a 
            href="/login" 
            className="inline-block rounded-xl bg-[#DC2626] px-6 py-2.5 font-semibold text-white transition hover:bg-[#991B1B] shadow-[0_10px_24px_rgba(220,38,38,0.25)]"
          >
            Go to Login →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white text-[#111111]">
      <p className="text-sm">Unable to continue LIFF login. Please try again.</p>
    </div>
  );
}
