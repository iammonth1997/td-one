import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { getConnectionString, withPgClient } from "~/lib/pg.server";
import { sessionTokenCookie } from "~/lib/session-cookie.server";
import { validateSession } from "~/lib/session-validation.server";

export async function action({ request, context }: ActionFunctionArgs) {
  const { session } = await validateSession(request, context);
  const connectionString = getConnectionString(context);

  if (session && connectionString) {
    try {
      await withPgClient(
        connectionString,
        async (client) => {
          await client.query(`UPDATE auth_sessions SET is_active = false WHERE id = $1`, [session.id]);
        },
        0,
      );
    } catch (error) {
      console.error("admin logout session revoke failed:", error);
    }
  }

  return redirect("/admin-login", {
    headers: {
      "Set-Cookie": await sessionTokenCookie.serialize("", {
        maxAge: 0,
        secure: new URL(request.url).protocol === "https:",
      }),
    },
  });
}

