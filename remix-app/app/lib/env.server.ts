type EnvMap = Record<string, string | undefined>;

type ContextWithCloudflare = {
  cloudflare?: {
    env?: Record<string, unknown>;
  };
};

function fromContext(context: unknown, key: string): string | undefined {
  const ctx = context as ContextWithCloudflare | undefined;
  const value = ctx?.cloudflare?.env?.[key];
  return typeof value === "string" ? value : undefined;
}

export function getEnvValue(context: unknown, key: string): string | undefined {
  return fromContext(context, key);
}

export function getServerEnv(context: unknown): EnvMap {
  return {
    RESET_PIN_SECRET: getEnvValue(context, "RESET_PIN_SECRET"),
  };
}
