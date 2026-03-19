import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
// @ts-ignore legacy JS module imported from server runtime
import * as legacy from '../../../server/api/admin/medical-check/[id]/route.js';
import { proxyLegacyApi } from '~/lib/legacy-api-bridge.server';

export async function loader({ request }: LoaderFunctionArgs) {
  return proxyLegacyApi(request, legacy);
}

export async function action({ request }: ActionFunctionArgs) {
  return proxyLegacyApi(request, legacy);
}
