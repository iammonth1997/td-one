type CloudflareEnv = Record<string, unknown>;

const requestCloudflareEnv = new WeakMap<Request, CloudflareEnv>();

export function bindRequestCloudflareEnv(request: Request, context?: unknown) {
  const env = (context as { cloudflare?: { env?: CloudflareEnv } } | undefined)?.cloudflare?.env;
  if (env) {
    requestCloudflareEnv.set(request, env);
  }
  return request;
}

export function getRequestCloudflareEnv(request: Request) {
  return requestCloudflareEnv.get(request) || null;
}
