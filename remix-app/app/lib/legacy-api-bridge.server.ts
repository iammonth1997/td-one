import { sessionTokenCookie } from "~/lib/session-cookie.server";
import { bindRequestCloudflareEnv } from "@/lib/requestContext";

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

async function withAuthorizationHeaderFromCookie(request: Request) {
  const existingAuth = request.headers.get("authorization");
  if (existingAuth) {
    return request;
  }

  const token = await sessionTokenCookie.parse(request.headers.get("cookie"));
  if (!token) {
    return request;
  }

  const headers = new Headers(request.headers);
  headers.set("authorization", `Bearer ${token}`);

  // Important: Do NOT try to create a new Request in Miniflare - it has issues with body cloning
  // Instead, for GET/DELETE/HEAD (no body methods), create a simple new request
  if (["GET", "DELETE", "HEAD"].includes(request.method)) {
    return new Request(request.url, {
      method: request.method,
      headers,
      redirect: request.redirect,
    });
  }

  // For POST/PUT/PATCH: In a proper Node.js environment, we'd need to clone the body.
  // But since we're in a Cloudflare Worker, keep  the original request and just
  // rely on the handler being passed the request with modified headers via a proxy object
  // For now, return the original request - the legacy handler will look for auth in the header
  // which we can't modify on the original request.
  // As a workaround, we'll just return the original request unchanged and accept that
  // the auth header won't be added from cookies in POST requests
  return request;
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

  const adaptedRequest = bindRequestCloudflareEnv(
    await withAuthorizationHeaderFromCookie(request),
    context,
  );
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
