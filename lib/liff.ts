export type LiffProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
};

type LiffInstance = {
  init: (args: { liffId: string }) => Promise<void>;
  isLoggedIn: () => boolean;
  login: (args?: { redirectUri?: string }) => void;
  getProfile: () => Promise<LiffProfile>;
  getIDToken: () => string | null;
  openWindow: (args: { url: string; external?: boolean }) => void;
};

declare global {
  interface Window {
    liff?: LiffInstance;
  }
}

const DEFAULT_LIFF_ID = "2009413188-4647l7eA";

function getLiffId() {
  return process.env.NEXT_PUBLIC_LIFF_ID || DEFAULT_LIFF_ID;
}

function getSafeRedirectUri() {
  const current = window.location;
  const isLocalhost = current.hostname === "localhost" || current.hostname === "127.0.0.1";
  const isSecure = current.protocol === "https:";

  if (!isLocalhost && isSecure) {
    return current.href;
  }

  const base = (process.env.NEXT_PUBLIC_APP_BASE_URL || "").trim().replace(/\/$/, "");
  if (base) {
    return `${base}${current.pathname}${current.search}`;
  }

  // LINE Login does not accept localhost redirect_uri.
  throw new Error("Invalid redirect URI for LINE Login. Set NEXT_PUBLIC_APP_BASE_URL to your https domain.");
}

function loadLiffSdk() {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("LIFF SDK can only run in browser"));
      return;
    }

    if (window.liff) {
      resolve();
      return;
    }

    const existing = document.querySelector('script[data-sdk="line-liff"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load LIFF SDK")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    script.async = true;
    script.dataset.sdk = "line-liff";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load LIFF SDK"));
    document.head.appendChild(script);
  });
}

export async function initLiff() {
  const liffId = getLiffId();
  if (!liffId) {
    throw new Error("Missing LIFF ID");
  }

  await loadLiffSdk();

  const liff = window.liff;
  if (!liff) {
    throw new Error("LIFF SDK not available");
  }

  await liff.init({ liffId });
  return liff;
}

export async function getLiffProfile() {
  const liff = await initLiff();

  if (!liff.isLoggedIn()) {
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (isLocalhost) {
      // Allow local testing without forcing LINE Login redirect.
      return null;
    }

    liff.login({ redirectUri: getSafeRedirectUri() });
    return null;
  }

  const profile = await liff.getProfile();
  const idToken = liff.getIDToken();

  if (!idToken) {
    throw new Error("Missing LIFF ID token");
  }

  return { profile, idToken };
}
