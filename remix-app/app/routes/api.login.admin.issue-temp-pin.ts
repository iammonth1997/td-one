import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
// @ts-ignore legacy JS module imported from Next app
import * as legacy from "../../../app/api/login/admin/issue-temp-pin/route.js";
import { proxyLegacyApi } from "~/lib/legacy-api-bridge.server";

export async function loader({ request }: LoaderFunctionArgs) {
  return proxyLegacyApi(request, legacy);
}

export async function action({ request }: ActionFunctionArgs) {
  return proxyLegacyApi(request, legacy);
}



