import { deviceIdCookie } from "~/lib/device-cookie.server";
import { sessionTokenCookie } from "~/lib/session-cookie.server";

type LegacyHandler = (request: Request, context?: unknown) => Promise<Response> | Response;

type LegacyModule = {
  GET?: LegacyHandler;
  POST?: LegacyHandler;
  PUT?: LegacyHandler;
  PATCH?: LegacyHandler;
  DELETE?: LegacyHandler;
};

type ContextWithCloudflare = {
  cloudflare?: {
    env?: Record<string, unknown>;
  };
};

async function getParsedDeviceId(request: Request) {
  const existingDeviceId = request.headers.get("x-device-id")?.trim();
  if (existingDeviceId) {
    return existingDeviceId;
  }

  const cookieHeader = request.headers.get("cookie");

  try {
    const parsed = await deviceIdCookie.parse(cookieHeader);
    if (typeof parsed === "string" && parsed.trim()) {
      return parsed.trim();
    }
  } catch {
    // Fall back to plain cookie parsing for older/plain-string cookies.
  }

  if (!cookieHeader) {
    return null;
  }

  const match = /(?:^|;\s*)tdone_device_id=([^;]+)/.exec(cookieHeader);
  if (!match?.[1]) {
    return null;
  }

  const raw = decodeURIComponent(match[1]).trim();
  return raw || null;
}

async function withSessionHeadersFromCookie(request: Request) {
  const existingAuth = request.headers.get("authorization");
  const token = existingAuth?.startsWith("Bearer ")
    ? existingAuth.slice(7).trim()
    : await sessionTokenCookie.parse(request.headers.get("cookie"));
  const deviceId = await getParsedDeviceId(request);

  if (!token && !deviceId) {
    return request;
  }

  const headers = new Headers(request.headers);
  if (token && !existingAuth) {
    headers.set("authorization", `Bearer ${token}`);
  }
  if (deviceId && !headers.get("x-device-id")) {
    headers.set("x-device-id", deviceId);
  }

  if (["GET", "DELETE", "HEAD"].includes(request.method)) {
    return new Request(request.url, { method: request.method, headers, redirect: request.redirect });
  }

  const bodyBuffer = await request.clone().arrayBuffer();

  return new Request(request.url, {
    method: request.method,
    headers,
    body: bodyBuffer,
    redirect: request.redirect,
  });
}

function hydrateProcessEnvFromContext(context: unknown) {
  const cfContext = context as ContextWithCloudflare | undefined;
  const env = cfContext?.cloudflare?.env;
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const processEnv = proc?.env;

  if (!env || !processEnv) {
    return () => {};
  }

  const keys = Object.keys(env);
  const previous = new Map<string, string | undefined>();

  for (const key of keys) {
    const value = env[key];
    if (typeof value !== "string") continue;
    previous.set(key, processEnv[key]);
    processEnv[key] = value;
  }

  return () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete processEnv[key];
      } else {
        processEnv[key] = value;
      }
    }
  };
}

export async function proxyLegacyApi(request: Request, mod: LegacyModule, context?: unknown) {
  const method = request.method.toUpperCase() as keyof LegacyModule;
  const handler = mod[method];

  if (!handler) {
    return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const adaptedRequest = await withSessionHeadersFromCookie(request);
  const restoreEnv = hydrateProcessEnvFromContext(context);
  try {
    return await handler(adaptedRequest, context);
  } catch (error) {
    console.error("[legacy-api-bridge] handler error:", error instanceof Error ? error.message : String(error));
    return new Response(
      JSON.stringify({ 
        error: "LEGACY_API_ERROR", 
        message: error instanceof Error ? error.message : "Unknown error" 
      }),
      {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      }
    );
  } finally {
    restoreEnv();
  }
}
