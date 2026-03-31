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

  const sslDisabled = /[?&]sslmode=disable/.test(connectionString);
  const cleanUrl = connectionString.replace(/[?&](sslmode|uselibpqcompat)=[^&]*/g, '').replace(/\?$/, '').replace(/&$/, '');
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

function withAutoDisconnect<T extends object>(client: PrismaClient, target: T): T {
  return new Proxy(target, {
    get(currentTarget, currentProp, receiver) {
      const value = Reflect.get(currentTarget, currentProp, receiver);
      if (typeof value !== 'function') {
        return value;
      }

      return (...args: unknown[]) => {
        const result = Reflect.apply(value, currentTarget, args);
        if (result && typeof (result as Promise<unknown>).finally === 'function') {
          return (result as Promise<unknown>).finally(async () => {
            await client.$disconnect().catch(() => {});
          });
        }

        void client.$disconnect().catch(() => {});
        return result;
      };
    },
  }) as T;
}

// Lazy initialization keeps Prisma from connecting during module import.
const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (shouldUseEphemeralPrismaClient()) {
      const ephemeralClient = createPrismaClient({ useGlobalPoolCache: false });
      const value = Reflect.get(ephemeralClient, prop);

      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          const result = Reflect.apply(value, ephemeralClient, args);
          if (result && typeof (result as Promise<unknown>).finally === 'function') {
            return (result as Promise<unknown>).finally(async () => {
              await ephemeralClient.$disconnect().catch(() => {});
            });
          }

          void ephemeralClient.$disconnect().catch(() => {});
          return result;
        };
      }

      if (value && typeof value === 'object') {
        return withAutoDisconnect(ephemeralClient, value as object);
      }

      return value;
    }

    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createPrismaClient();
    }
    return Reflect.get(globalForPrisma.prisma, prop);
  },
});

export default prisma;
