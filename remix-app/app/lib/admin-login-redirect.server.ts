import { redirect } from "react-router";

function resolvePublicOrigin(request: Request) {
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // Ignore malformed referer values and keep falling back.
    }
  }

  const origin = request.headers.get("origin");
  if (origin) {
    return origin;
  }

  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (forwardedHost) {
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const protocol = forwardedProto || new URL(request.url).protocol.replace(/:$/, "");
    return `${protocol}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

export function redirectToAdminLogin(request: Request) {
  return redirect(new URL("/admin-login", resolvePublicOrigin(request)).toString());
}
