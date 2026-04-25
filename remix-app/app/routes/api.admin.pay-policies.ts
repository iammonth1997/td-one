import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
// @ts-ignore legacy JS module imported from server runtime
import * as legacy from "../../../server/api/admin/pay-policies/route.js";
import { proxyLegacyApi } from "~/lib/legacy-api-bridge.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  return proxyLegacyApi(request, legacy, context);
}

export async function action({ request, context }: ActionFunctionArgs) {
  return proxyLegacyApi(request, legacy, context);
}

