import { getEnvValue } from "~/lib/env.server";

const TOKEN_EXPIRY_MS = 10 * 60 * 1000;

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacSha256Base64Url(secret: string, payloadStr: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadStr));
  return toBase64Url(new Uint8Array(signature));
}

function getSecret(context: unknown) {
  return getEnvValue(context, "RESET_PIN_SECRET") || "td-one-reset-pin-secret-2026";
}

export async function generateResetToken(context: unknown, empId: string, issuedByEmpId: string) {
  const payload = {
    emp_id: empId,
    issued_by: issuedByEmpId,
    exp: Date.now() + TOKEN_EXPIRY_MS,
  };
  const encoder = new TextEncoder();
  const payloadStr = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await hmacSha256Base64Url(getSecret(context), payloadStr);
  return `${payloadStr}.${signature}`;
}

export async function verifyResetToken(context: unknown, token: string) {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [payloadStr, signature] = parts;
    const expectedSig = await hmacSha256Base64Url(getSecret(context), payloadStr);
    if (signature !== expectedSig) return null;

    const decoder = new TextDecoder();
    const payloadJson = decoder.decode(fromBase64Url(payloadStr));
    const payload = JSON.parse(payloadJson) as { emp_id: string; issued_by?: string; exp: number };
    if (Date.now() > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}
