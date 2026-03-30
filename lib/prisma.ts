import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

type CloudflareEnv = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
};

export function getPrisma(env: CloudflareEnv): PrismaClient {
  const hyperdriveUrl = env.HYPERDRIVE?.connectionString;
  // Prefer Hyperdrive in Workers, but fall back when local dev exposes a
  // .hyperdrive.local proxy that the Node pg driver cannot reach.
  const isLocalProxy = hyperdriveUrl?.includes('.hyperdrive.local') ?? false;
  const connectionString = isLocalProxy
    ? (env.DATABASE_URL ?? process.env.DATABASE_URL)
    : (hyperdriveUrl ?? env.DATABASE_URL ?? process.env.DATABASE_URL);

  if (!connectionString) {
    throw new Error('[prisma] No database connection string found in env');
  }

  // No singleton - CF Workers kills idle TCP connections between requests.
  // In production Hyperdrive owns the pool, so creating a new Pool per request
  // is cheap. In local dev it connects directly to Aiven.
  const pool = new Pool({
    connectionString,
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
