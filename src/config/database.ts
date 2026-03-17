import { PrismaClient } from '@prisma/client';
import { env } from './env';
import { logger } from './logger';

// Global Prisma client for platform operations
let prisma: PrismaClient;

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

if (env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    log: ['error', 'warn'],
  });
} else {
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      log: ['error', 'warn'],
    });
  }
  prisma = global.__prisma;
}

// Tenant-specific Prisma client factory
export function createTenantPrisma(schemaName: string): PrismaClient {
  const databaseUrl = env.DATABASE_URL_TEMPLATE.replace('{schema}', schemaName);

  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    log: ['error', 'warn'],
  });
}

// Platform database connection (for tenant registry, etc.)
export { prisma as platformPrisma };

// Database connection health check
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('✅ Platform database connection established');
    return true;
  } catch (error) {
    logger.error('❌ Platform database connection failed:', error);
    return false;
  }
}

// Graceful shutdown
export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info('✅ Database disconnected successfully');
  } catch (error) {
    logger.error('❌ Error disconnecting database:', error);
  }
}