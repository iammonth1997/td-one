import { Client } from "pg";

const RETRYABLE_DB_ERROR_CODES = new Set(["53300", "57P03"]);

type CloudflareContext = {
  cloudflare?: {
    env?: Record<string, unknown>;
  };
};

export function isRetryableDbError(error: unknown) {
  const code = String((error as { code?: string })?.code || "");
  const message = String((error as { message?: string })?.message || "").toLowerCase();
  if (RETRYABLE_DB_ERROR_CODES.has(code)) return true;
  return (
    message.includes("connection terminated unexpectedly") ||
    message.includes("too many connections") ||
    message.includes("remaining connection slots")
  );
}

export function getConnectionString(context?: unknown) {
  const env = (context as CloudflareContext | undefined)?.cloudflare?.env ?? {};
  const processEnv = typeof process !== "undefined" ? process.env : undefined;
  return (
    ((env.HYPERDRIVE as { connectionString?: string } | undefined)?.connectionString) ||
    (typeof env.DATABASE_URL === "string" ? env.DATABASE_URL : null) ||
    processEnv?.DATABASE_URL ||
    null
  );
}

export async function withPgClient<T>(
  connectionString: string,
  fn: (client: Client) => Promise<T>,
  retries = 1,
): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const client = new Client({ connectionString });
    try {
      await client.connect();
      const result = await fn(client);
      await client.end().catch(() => {});
      return result;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => {});
      if (!isRetryableDbError(error) || attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  throw lastError;
}
