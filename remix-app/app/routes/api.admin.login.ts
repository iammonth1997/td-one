import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
// @ts-ignore legacy JS module imported from server runtime
import * as legacy from "../../../server/api/admin/login/route.js";
import { proxyLegacyApi } from "~/lib/legacy-api-bridge.server";
import { sessionTokenCookie } from "~/lib/session-cookie.server";
import { deviceIdCookie, getDeviceIdFromRequest } from "~/lib/device-cookie.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  return proxyLegacyApi(request, legacy, context);
}

export async function action({ request, context }: ActionFunctionArgs) {
  // Clone body so we can read device_id, then let legacy handler process
  const response = await proxyLegacyApi(request, legacy, context);

  // Only set cookies on successful login
  if (response.status !== 200) return response;

  const body = await response.clone().json() as { session_token?: string; success?: boolean };
  if (!body.success || !body.session_token) return response;

  const isHttps = new URL(request.url).protocol === "https:";
  const resolvedDeviceId = await getDeviceIdFromRequest(request);

  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    await sessionTokenCookie.serialize(body.session_token, { secure: isHttps })
  );
  if (resolvedDeviceId) {
    headers.append(
      "Set-Cookie",
      await deviceIdCookie.serialize(resolvedDeviceId, { secure: isHttps })
    );
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
