import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

type CloudflareEnv = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
};

function normalizeConnectionString(connectionString: string) {
  try {
    const url = new URL(connectionString);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '3');
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', '10');
    }
    url.searchParams.delete('sslmode');
    url.searchParams.delete('uselibpqcompat');
    return url.toString();
  } catch {
    return connectionString
      .replace(/[?&]sslmode=[^&]*/g, '')
      .replace(/[?&]uselibpqcompat=[^&]*/g, '')
      .replace(/\?$/, '')
      .replace(/&$/, '');
  }
}

export function getPrisma(env: CloudflareEnv): PrismaClient {
  const hyperdriveUrl = env.HYPERDRIVE?.connectionString;
  const connectionString = hyperdriveUrl ?? env.DATABASE_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('[prisma] No database connection string found in env');
  }

  const sslDisabled = /[?&]sslmode=disable/.test(connectionString);
  const normalizedConnectionString = normalizeConnectionString(connectionString);

  // No singleton - CF Workers kills idle TCP connections between requests.
  // In production Hyperdrive owns the pool, so creating a new Pool per request
  // is cheap. In local dev it connects directly to Aiven.
  const pool = new Pool({
    connectionString: normalizedConnectionString,
    ssl: sslDisabled ? false : { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 0,
    connectionTimeoutMillis: 10_000,
  });

  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Backward compatibility for legacy routes that still import default prisma.
const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = getPrisma({});
    }
    return Reflect.get(globalForPrisma.prisma, prop);
  },
});

export default prisma;
