import { Request, Response, NextFunction } from 'express';
import { cacheRedis } from '../config/redis';
import { createTenantCacheKey } from '../shared/utils';
import { AuthError } from '../shared/errors';
import { ApiError } from '../shared/errors/api-error';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { tenantConnectionManager } from '../config/tenant-connection-manager';
import { platformPrisma } from '../config/database';

const RESERVED_SLUGS = new Set([
  'admin', 'www', 'api', 'app', 'staging', 'dev', 'test', 'demo',
  'mail', 'ftp', 'cdn', 'static', 'assets', 'docs', 'help',
  'support', 'status', 'blog',
]);

export function tenantMiddleware() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = extractTenantFromRequest(req);

      if (!tenantId) {
        return next();
      }

      // Try cache first
      const tenantKey = createTenantCacheKey(tenantId);
      let tenantDataStr = await cacheRedis.get(tenantKey);

      if (!tenantDataStr) {
        // Fetch from database — try by slug first, then by ID
        const selectFields = {
          id: true,
          schemaName: true,
          slug: true,
          companyId: true,
          status: true,
          dbStrategy: true,
          databaseUrl: true,
        } as const;

        let dbTenant = await platformPrisma.tenant.findUnique({
          where: { slug: tenantId },
          select: selectFields,
        });

        if (!dbTenant) {
          dbTenant = await platformPrisma.tenant.findUnique({
            where: { id: tenantId },
            select: selectFields,
          });
        }

        if (!dbTenant) {
          throw AuthError.tenantNotFound();
        }

        tenantDataStr = JSON.stringify({
          id: dbTenant.id,
          schemaName: dbTenant.schemaName,
          slug: dbTenant.slug,
          companyId: dbTenant.companyId,
          databaseUrl: dbTenant.databaseUrl || env.DATABASE_URL_TEMPLATE.replace('{schema}', dbTenant.schemaName),
          status: dbTenant.status.toLowerCase(),
          dbStrategy: dbTenant.dbStrategy,
        });

        // Cache for 24 hours
        await cacheRedis.setex(tenantKey, 86400, tenantDataStr);
      }

      const tenant = JSON.parse(tenantDataStr);

      // Tenant status blocking
      if (tenant.status === 'suspended') {
        throw ApiError.forbidden('This company account has been suspended. Contact support.');
      }
      if (tenant.status === 'cancelled' || tenant.status === 'expired') {
        throw ApiError.forbidden('This company account is inactive.');
      }

      // Attach tenant context to request
      req.tenant = tenant;

      // Attach tenant-scoped Prisma client from LRU cache
      req.prisma = tenantConnectionManager.getClient({
        schemaName: tenant.schemaName,
        dbStrategy: tenant.dbStrategy,
        databaseUrl: tenant.databaseUrl,
      });

      // Audit log for tenant resolution
      logger.debug('Tenant resolved', {
        hostname: req.hostname,
        tenantId: tenant.id,
        slug: tenant.slug,
        method: req.headers['x-tenant-id'] ? 'header' : 'auto',
      });

      next();
    } catch (error) {
      next(error);
    }
  };
}

function extractTenantFromRequest(req: Request): string | null {
  // Priority 1: Custom header (X-Tenant-ID)
  const tenantHeader = req.headers['x-tenant-id'] as string;
  if (tenantHeader) return tenantHeader;

  // Priority 2: Subdomain
  const host = req.headers.host?.split(':')[0]; // strip port
  if (host) {
    const isIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host === 'localhost';
    if (!isIP) {
      const mainDomain = env.MAIN_DOMAIN;
      // Check if host is a subdomain of the main domain
      if (host !== mainDomain && host.endsWith(`.${mainDomain}`)) {
        const slug = host.replace(`.${mainDomain}`, '');
        if (slug && !RESERVED_SLUGS.has(slug)) {
          return slug;
        }
      }
    }
  }

  // Priority 3: Query parameter
  const tenantQuery = req.query.tenantId as string;
  if (tenantQuery) return tenantQuery;

  // Priority 4: Path parameter
  const tenantPath = req.params.tenantId;
  if (tenantPath) return tenantPath;

  // Priority 5: User context from JWT
  if (req.user?.tenantId) return req.user.tenantId;

  return null;
}

export function requireTenant() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.tenant) {
      throw AuthError.tenantNotFound();
    }
    next();
  };
}

export function validateTenantAccess() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Cross-tenant security: JWT tenantId must match resolved tenant
    if (req.user && req.tenant && req.user.tenantId !== req.tenant.id) {
      throw ApiError.forbidden('Access denied: tenant mismatch');
    }
    next();
  };
}

export { RESERVED_SLUGS };
