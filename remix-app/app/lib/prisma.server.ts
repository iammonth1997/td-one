import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

type GlobalEnv = {
  env?: Record<string, string | undefined>;
  process?: { env?: Record<string, string | undefined> };
};

type PrismaGlobal = {
  prisma?: PrismaClient;
  prismaCleanupRegistered?: boolean;
  prismaPool?: Pool;
};

type CreatePrismaClientOptions = {
  useGlobalPoolCache?: boolean;
};

function readEnv(name: string) {
  const globalEnv = globalThis as GlobalEnv;
  return globalEnv.env?.[name] || globalEnv.process?.env?.[name];
}

function readPositiveInt(name: string, fallback: number) {
  const rawValue = readEnv(name);
  const parsed = Number(rawValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getPoolOptions() {
  const nodeEnv = String(readEnv('NODE_ENV') || '').trim().toLowerCase();
  const isProduction = nodeEnv === 'production';

  return {
    allowExitOnIdle: true,
    connectionTimeoutMillis: readPositiveInt('PRISMA_PG_CONNECT_TIMEOUT_MS', 5000),
    idleTimeoutMillis: readPositiveInt('PRISMA_PG_IDLE_TIMEOUT_MS', isProduction ? 30000 : 5000),
    max: readPositiveInt('PRISMA_PG_POOL_MAX', isProduction ? 5 : 1),
  };
}

function normalizeConnectionString(connectionString: string) {
  try {
    const url = new URL(connectionString);

    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', String(readPositiveInt('PRISMA_CONNECTION_LIMIT', 3)));
    }

    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', String(readPositiveInt('PRISMA_POOL_TIMEOUT', 10)));
    }

    return url.toString();
  } catch {
    return connectionString;
  }
}

function shouldUseEphemeralPrismaClient() {
  return String(readEnv('NODE_ENV') || '').trim().toLowerCase() === 'production';
}

async function disposePrismaResources(prismaGlobal: PrismaGlobal) {
  const prismaClient = prismaGlobal.prisma;
  prismaGlobal.prisma = undefined;
  if (prismaClient) {
    await prismaClient.$disconnect().catch(() => {});
  }

  const pool = prismaGlobal.prismaPool;
  prismaGlobal.prismaPool = undefined;
  if (pool) {
    await pool.end().catch(() => {});
  }
}

function createPrismaClient(options: CreatePrismaClientOptions = {}) {
  const prismaGlobal = globalThis as unknown as PrismaGlobal;
  const connectionString = readEnv('DATABASE_URL');
  const useGlobalPoolCache = options.useGlobalPoolCache ?? true;

  if (!connectionString) {
    console.warn('DATABASE_URL not found in environment');
    return new PrismaClient();
  }

  const normalizedUrl = normalizeConnectionString(connectionString);
  const sslDisabled = /[?&]sslmode=disable/.test(normalizedUrl);
  const cleanUrl = normalizedUrl.replace(/[?&](sslmode|uselibpqcompat)=[^&]*/g, '').replace(/\?$/, '').replace(/&$/, '');
  const pool =
    (useGlobalPoolCache ? prismaGlobal.prismaPool : undefined) ||
    new Pool({
      connectionString: cleanUrl,
      ssl: sslDisabled ? false : { rejectUnauthorized: false },
      ...getPoolOptions(),
    });

  if (useGlobalPoolCache) {
    prismaGlobal.prismaPool = pool;
  }

  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

  if (useGlobalPoolCache && !prismaGlobal.prismaCleanupRegistered && typeof process !== 'undefined') {
    prismaGlobal.prismaCleanupRegistered = true;
    for (const signal of ['SIGINT', 'SIGTERM', 'beforeExit'] as const) {
      process.once(signal, () => {
        void disposePrismaResources(prismaGlobal);
      });
    }
  }

  return client;
}

const globalForPrisma = globalThis as unknown as PrismaGlobal;
const prisma =
  shouldUseEphemeralPrismaClient()
    ? createPrismaClient({ useGlobalPoolCache: false })
    : globalForPrisma.prisma ?? createPrismaClient();

if (!shouldUseEphemeralPrismaClient()) {
  globalForPrisma.prisma = prisma;
}

export { prisma };
export default prisma;
