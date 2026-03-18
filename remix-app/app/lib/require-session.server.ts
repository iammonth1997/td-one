import { redirect } from "react-router";
import { validateSession } from "~/lib/session-validation.server";

export async function requireSession(request: Request, context: unknown) {
  const { session, error } = await validateSession(request, context);
  if (error || !session) {
    throw redirect("/login");
  }
  return session;
}
