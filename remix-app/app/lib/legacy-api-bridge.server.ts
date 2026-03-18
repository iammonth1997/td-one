import { sessionTokenCookie } from "~/lib/session-cookie.server";

type LegacyHandler = (request: Request) => Promise<Response> | Response;

type LegacyModule = {
  GET?: LegacyHandler;
  POST?: LegacyHandler;
  PUT?: LegacyHandler;
  PATCH?: LegacyHandler;
  DELETE?: LegacyHandler;
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

export async function proxyLegacyApi(request: Request, mod: LegacyModule) {
  const method = request.method.toUpperCase() as keyof LegacyModule;
  const handler = mod[method];

  if (!handler) {
    return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const adaptedRequest = await withAuthorizationHeaderFromCookie(request);
  return handler(adaptedRequest);
}
