import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
// @ts-ignore legacy JS module imported from server runtime
import * as legacy from "../../../server/api/payroll/runs/[id]/route.js";
import { proxyLegacyApi } from "~/lib/legacy-api-bridge.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const id = params.id || "";
  url.pathname = `/api/payroll/runs/${id}`;
  const rewritten = new Request(url.toString(), request);
  return proxyLegacyApi(rewritten, legacy);
}

export async function action({ request, params }: ActionFunctionArgs) {
  const url = new URL(request.url);
  const id = params.id || "";
  url.pathname = `/api/payroll/runs/${id}`;
  const rewritten = new Request(url.toString(), request);
  return proxyLegacyApi(rewritten, legacy);
}

