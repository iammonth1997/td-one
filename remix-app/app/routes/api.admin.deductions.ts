import type { LoaderFunctionArgs } from "react-router";
// @ts-ignore legacy JS module imported from server runtime
import * as legacy from "../../../server/api/admin/deductions/route.js";
import { proxyLegacyApi } from "~/lib/legacy-api-bridge.server";

export async function loader({ request }: LoaderFunctionArgs) {
  return proxyLegacyApi(request, legacy);
}

