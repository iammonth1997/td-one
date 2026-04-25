import { Client } from "pg";

const RETRYABLE_DB_ERROR_CODES = new Set(["53300", "57P03"]);

type CloudflareContext = {
  cloudflare?: {
    env?: Record<string, unknown>;
  };
};

export function normalizeConnectionString(connectionString: string) {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");
    url.searchParams.delete("uselibpqcompat");
    return url.toString();
  } catch {
    return connectionString
      .replace(/[?&]sslmode=[^&]*/g, "")
      .replace(/[?&]uselibpqcompat=[^&]*/g, "")
      .replace(/\?$/, "")
      .replace(/&$/, "");
  }
}

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
  const hyperdriveConnectionString = (env.HYPERDRIVE as { connectionString?: string } | undefined)?.connectionString;
  const directDatabaseUrl = typeof env.DATABASE_URL === "string" ? env.DATABASE_URL : null;

  return (
    hyperdriveConnectionString ||
    directDatabaseUrl ||
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
  const sslDisabled = /[?&]sslmode=disable/.test(connectionString);
  const normalizedConnectionString = normalizeConnectionString(connectionString);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const client = new Client({
      connectionString: normalizedConnectionString,
      ssl: sslDisabled ? false : { rejectUnauthorized: false },
    });
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
