import { PrismaClient } from '@prisma/client';
import { LRUCache } from 'lru-cache';
import { createHash } from 'crypto';
import { env } from './env';
import { logger } from './logger';

interface TenantConnectionInfo {
  schemaName: string;
  dbStrategy?: string;
  databaseUrl?: string | null;
}

function withDefaultConnectionParams(connectionString: string): string {
  const url = new URL(connectionString);

  if (!url.searchParams.has('pgbouncer')) {
    url.searchParams.set('pgbouncer', 'true');
  }

  if (!url.searchParams.has('connection_limit')) {
    url.searchParams.set('connection_limit', '5');
  }

  return url.toString();
}

function buildConnectionString(tenant: TenantConnectionInfo): string {
  if (tenant.dbStrategy === 'database' && tenant.databaseUrl) {
    // Future: dedicated database per tenant
    return withDefaultConnectionParams(tenant.databaseUrl);
  }

  const base = env.DATABASE_URL_TEMPLATE.replace('{schema}', tenant.schemaName);
  return withDefaultConnectionParams(base);
}

function hashKey(connectionString: string): string {
  return createHash('sha256').update(connectionString).digest('hex').slice(0, 16);
}

class TenantConnectionManager {
  private cache: LRUCache<string, PrismaClient>;

  constructor(maxSize: number) {
    this.cache = new LRUCache<string, PrismaClient>({
      max: maxSize,
      dispose: (client: PrismaClient, key: string) => {
        logger.debug(`Evicting tenant PrismaClient from cache: ${key}`);
        client.$disconnect().catch((err: unknown) => {
          logger.error(`Error disconnecting evicted tenant client: ${err}`);
        });
      },
    });
  }

  getClient(tenant: TenantConnectionInfo): PrismaClient {
    const connString = buildConnectionString(tenant);
    const key = hashKey(connString);

    const cached = this.cache.get(key);
    if (cached) return cached;

    const client = new PrismaClient({
      datasources: { db: { url: connString } },
      log: ['error', 'warn'],
    });

    this.cache.set(key, client);
    logger.debug(`Created new tenant PrismaClient for schema: ${tenant.schemaName}`);
    return client;
  }

  async disconnectAll(): Promise<void> {
    const entries = [...this.cache.entries()];
    for (const [key, client] of entries) {
      try {
        await client.$disconnect();
      } catch (err) {
        logger.error(`Error disconnecting tenant client ${key}: ${err}`);
      }
    }
    this.cache.clear();
    logger.info(`Disconnected all ${entries.length} cached tenant clients`);
  }

  get size(): number {
    return this.cache.size;
  }
}

export const tenantConnectionManager = new TenantConnectionManager(
  env.TENANT_CLIENT_CACHE_SIZE
);
