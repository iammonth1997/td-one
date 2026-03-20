import { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_STORAGE_KEY = "tdone_pwa_install_dismiss_until";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function isEmployeeRoute(pathname: string) {
  return !pathname.startsWith("/admin") && !pathname.startsWith("/api/");
}

function isDismissedTemporarily() {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(DISMISS_STORAGE_KEY);
  if (!raw) return false;

  const dismissUntil = Number(raw);
  if (!Number.isFinite(dismissUntil)) {
    window.localStorage.removeItem(DISMISS_STORAGE_KEY);
    return false;
  }

  if (Date.now() < dismissUntil) {
    return true;
  }

  window.localStorage.removeItem(DISMISS_STORAGE_KEY);
  return false;
}

function rememberDismissForSevenDays() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now() + DISMISS_DURATION_MS));
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const isEmployeeUi = useMemo(() => {
    if (typeof window === "undefined") return false;
    return isEmployeeRoute(window.location.pathname);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isDismissedTemporarily()) {
      setDismissed(true);
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (!isEmployeeUi || installed || dismissed || isStandaloneMode() || !deferredPrompt) {
    return null;
  }

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === "accepted") {
      setInstalled(true);
    }
    setDeferredPrompt(null);
  };

  return (
    <div className="fixed inset-x-0 bottom-3 z-50 mx-auto w-[calc(100%-1rem)] max-w-lg rounded-xl border border-[#FECACA] bg-white p-3 shadow-[0_10px_24px_rgba(220,38,38,0.15)]">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#111111]">ติดตั้งแอป TD One</p>
          <p className="text-xs text-[#555555]">ใช้งานได้เร็วขึ้นและเข้าจอหลักได้ทันที</p>
        </div>
        <button
          type="button"
          onClick={() => {
            rememberDismissForSevenDays();
            setDismissed(true);
          }}
          className="rounded-lg border border-[#E5E7EB] px-2 py-1 text-xs font-medium text-[#555555]"
        >
          ปิด
        </button>
        <button
          type="button"
          onClick={() => void handleInstall()}
          className="rounded-lg bg-[#DC2626] px-3 py-1.5 text-xs font-semibold text-white"
        >
          ติดตั้ง
        </button>
      </div>
    </div>
  );
}
