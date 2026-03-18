import { sessionTokenCookie } from "~/lib/session-cookie.server";

type LegacyHandler = (request: Request) => Promise<Response> | Response;

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

  return new Request(request.url, {
    method: request.method,
    headers,
    body: request.body,
    redirect: request.redirect,
    duplex: "half",
  } as RequestInit);
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

  const adaptedRequest = await withAuthorizationHeaderFromCookie(request);
  const restoreEnv = hydrateProcessEnvFromContext(context);
  try {
    return await handler(adaptedRequest);
  } finally {
    restoreEnv();
  }
}
