import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

function createPrismaClient() {
  const globalEnv = (globalThis as { env?: Record<string, string | undefined>; process?: { env?: Record<string, string | undefined> } });
  const connectionString = globalEnv.env?.DATABASE_URL || globalEnv.process?.env?.DATABASE_URL;

  if (!connectionString) {
    console.warn('DATABASE_URL not found in environment');
    return new PrismaClient();
  }

  const sslDisabled = /[?&]sslmode=disable/.test(connectionString ?? '');
  const cleanUrl = connectionString?.replace(/[?&](sslmode|uselibpqcompat)=[^&]*/g, '').replace(/\?$/, '').replace(/&$/, '');
  const pool = new Pool({ connectionString: cleanUrl, ssl: sslDisabled ? false : { rejectUnauthorized: false } });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Lazy initialization — PrismaClient is created on first property access,
// not at module import time. This is critical for Cloudflare Workers where
// DATABASE_URL (from Hyperdrive) is only available inside the fetch() handler.
const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createPrismaClient();
    }
    return Reflect.get(globalForPrisma.prisma, prop);
  },
});

export default prisma;
