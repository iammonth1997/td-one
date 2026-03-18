import { createCookie } from "react-router";

const SESSION_COOKIE_MAX_AGE = 60 * 60 * 8;

export const sessionTokenCookie = createCookie("tdone_session_token", {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: false,
  maxAge: SESSION_COOKIE_MAX_AGE,
});

export async function getSessionTokenFromRequest(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  const cookieHeader = request.headers.get("Cookie");
  const cookieToken = await sessionTokenCookie.parse(cookieHeader);
  if (typeof cookieToken === "string" && cookieToken.trim()) {
    return cookieToken.trim();
  }

  return null;
}
