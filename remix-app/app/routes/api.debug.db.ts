import type { LoaderFunctionArgs } from "react-router";
import { getPrisma } from "@/lib/prisma";
import { getConnectionString, normalizeConnectionString, withPgClient } from "~/lib/pg.server";

type ProbeResult = {
  ok: boolean;
  duration_ms: number;
  result?: unknown;
  error?: {
    name: string;
    constructor: string;
    message: string;
    code: string | null;
    stack_top: string | null;
  };
};

function isLocalProbeRequest(request: Request, env: Record<string, unknown>) {
  const url = new URL(request.url);
  const host = url.hostname.trim().toLowerCase();
  const hostHeader = (request.headers.get("host") || "").trim().toLowerCase();
  const probeHeader = request.headers.get("x-debug-probe");
  const hyperdriveUrl = typeof env.HYPERDRIVE === "object" && env.HYPERDRIVE !== null
    ? (env.HYPERDRIVE as { connectionString?: string }).connectionString
    : null;
  const localHyperdrive = typeof hyperdriveUrl === "string" && hyperdriveUrl.includes(".hyperdrive.local");

  return probeHeader === "1" && (
    host === "127.0.0.1" ||
    host === "localhost" ||
    hostHeader.startsWith("127.0.0.1:") ||
    hostHeader.startsWith("localhost:") ||
    localHyperdrive
  );
}

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init?.headers || {}),
    },
  });
}

function detectSource(connectionString: string | null, env: Record<string, unknown>) {
  const hyperdriveUrl = typeof env.HYPERDRIVE === "object" && env.HYPERDRIVE !== null
    ? (env.HYPERDRIVE as { connectionString?: string }).connectionString
    : null;
  const databaseUrl = typeof env.DATABASE_URL === "string" ? env.DATABASE_URL : null;
  const processDatabaseUrl = typeof process !== "undefined" ? process.env.DATABASE_URL : null;

  if (!connectionString) return "missing";
  if (connectionString === hyperdriveUrl) return "hyperdrive";
  if (connectionString === databaseUrl) return "context_database_url";
  if (connectionString === processDatabaseUrl) return "process_env_database_url";
  return "unknown";
}

function describeConnection(connectionString: string | null, env: Record<string, unknown>) {
  if (!connectionString) {
    return {
      selected_source: "missing",
      hostname: null,
      local_proxy: false,
      sslmode_disable: false,
      normalized_hostname: null,
    };
  }

  const normalized = normalizeConnectionString(connectionString);

  try {
    const url = new URL(connectionString);
    const normalizedUrl = new URL(normalized);
    return {
      selected_source: detectSource(connectionString, env),
      hostname: url.hostname,
      local_proxy: url.hostname.includes(".hyperdrive.local"),
      sslmode_disable: url.searchParams.get("sslmode") === "disable",
      normalized_hostname: normalizedUrl.hostname,
    };
  } catch {
    return {
      selected_source: detectSource(connectionString, env),
      hostname: null,
      local_proxy: connectionString.includes(".hyperdrive.local"),
      sslmode_disable: /[?&]sslmode=disable/.test(connectionString),
      normalized_hostname: null,
    };
  }
}

function formatError(error: unknown) {
  const err = error as { name?: string; message?: string; code?: string; stack?: string; constructor?: { name?: string } };
  return {
    name: String(err?.name || "Error"),
    constructor: String(err?.constructor?.name || "Unknown"),
    message: String(err?.message || error),
    code: typeof err?.code === "string" ? err.code : null,
    stack_top: typeof err?.stack === "string" ? err.stack.split("\n").slice(0, 4).join("\n") : null,
  };
}

async function runPgProbe(context: unknown): Promise<ProbeResult> {
  const startedAt = Date.now();
  const connectionString = getConnectionString(context);

  if (!connectionString) {
    return {
      ok: false,
      duration_ms: Date.now() - startedAt,
      error: {
        name: "Error",
        constructor: "Error",
        message: "No connection string resolved for pg probe",
        code: null,
        stack_top: null,
      },
    };
  }

  try {
    const result = await withPgClient(
      connectionString,
      async (client) => {
        const queryResult = await client.query<{ ok: number }>("SELECT 1 AS ok");
        return queryResult.rows[0] || null;
      },
      0,
    );

    return {
      ok: true,
      duration_ms: Date.now() - startedAt,
      result,
    };
  } catch (error) {
    return {
      ok: false,
      duration_ms: Date.now() - startedAt,
      error: formatError(error),
    };
  }
}

async function runPrismaProbe(env: Record<string, unknown>): Promise<ProbeResult> {
  const startedAt = Date.now();
  let prisma: ReturnType<typeof getPrisma> | null = null;

  try {
    prisma = getPrisma(env);
    const result = await prisma.$queryRaw`SELECT 1 AS ok`;
    return {
      ok: true,
      duration_ms: Date.now() - startedAt,
      result: Array.isArray(result) ? result[0] ?? null : result,
    };
  } catch (error) {
    return {
      ok: false,
      duration_ms: Date.now() - startedAt,
      error: formatError(error),
    };
  } finally {
    if (prisma) {
      await prisma.$disconnect().catch(() => {});
    }
  }
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = (context.cloudflare?.env ?? {}) as Record<string, unknown>;
  if (!isLocalProbeRequest(request, env)) {
    throw new Response("Not Found", { status: 404 });
  }
  const pgConnectionString = getConnectionString(context);
  const prismaConnectionString =
    (typeof env.HYPERDRIVE === "object" && env.HYPERDRIVE !== null
      ? (env.HYPERDRIVE as { connectionString?: string }).connectionString
      : null) ||
    (typeof env.DATABASE_URL === "string" ? env.DATABASE_URL : null) ||
    (typeof process !== "undefined" ? process.env.DATABASE_URL ?? null : null);

  const [pgProbe, prismaProbe] = await Promise.all([
    runPgProbe(context),
    runPrismaProbe(env),
  ]);

  return json({
    ok: pgProbe.ok && prismaProbe.ok,
    runtime: {
      has_context_cloudflare_env: Boolean(context.cloudflare?.env),
      has_hyperdrive_binding: Boolean(env.HYPERDRIVE),
      has_context_database_url: typeof env.DATABASE_URL === "string",
      has_process_database_url: typeof process !== "undefined" && typeof process.env.DATABASE_URL === "string",
    },
    selected_paths: {
      pg: describeConnection(pgConnectionString, env),
      prisma: describeConnection(prismaConnectionString, env),
    },
    probes: {
      pg: pgProbe,
      prisma: prismaProbe,
    },
  });
}
