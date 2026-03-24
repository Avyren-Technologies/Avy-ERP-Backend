import { Request, Response, NextFunction } from 'express';
import { cacheRedis } from '../config/redis';
import { createTenantCacheKey } from '../shared/utils';
import { AuthError } from '../shared/errors';
import { logger } from '../config/logger';
import { env } from '../config/env';

export function tenantMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = extractTenantFromRequest(req);

      if (!tenantId) {
        // If no tenant specified, continue without tenant context
        // Some endpoints might be tenant-agnostic
        return next();
      }

      // Get tenant details from cache or database
      const tenantKey = createTenantCacheKey(tenantId);
      let tenantData = await cacheRedis.get(tenantKey);

      if (!tenantData) {
        // TODO: Fetch tenant from database
        // For now, create mock tenant data
        tenantData = JSON.stringify({
          id: tenantId,
          schemaName: `tenant_${tenantId.replace(/-/g, '_')}`,
          companyId: tenantId, // For simplicity, tenantId = companyId
          databaseUrl: env.DATABASE_URL_TEMPLATE.replace('{schema}', `tenant_${tenantId.replace(/-/g, '_')}`),
          status: 'active',
        });

        // Cache for 24 hours
        await cacheRedis.setex(tenantKey, 86400, tenantData);
      }

      const tenant = JSON.parse(tenantData);

      // Check if tenant is active
      if (tenant.status !== 'active') {
        if (tenant.status === 'suspended') {
          throw AuthError.tenantSuspended();
        }
        throw AuthError.tenantNotFound();
      }

      // Attach tenant to request
      req.tenant = tenant;

      next();
    } catch (error) {
      next(error);
    }
  };
}

function extractTenantFromRequest(req: Request): string | null {
  // Priority order for tenant identification:
  // 1. Custom header (X-Tenant-ID)
  // 2. Subdomain
  // 3. Query parameter
  // 4. Path parameter

  // Check custom header
  const tenantHeader = req.headers['x-tenant-id'] as string;
  if (tenantHeader) {
    return tenantHeader;
  }

  // Check subdomain (e.g., company1.avyerp.com)
  const host = req.headers.host?.split(':')[0]; // strip port
  if (host) {
    // Skip IP addresses (e.g., 100.121.191.43, 192.168.1.1, localhost)
    const isIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host === 'localhost';
    if (!isIP) {
      const subdomain = host.split('.')[0];
      // Skip service subdomains (www, api, app, and compound names like avy-erp-api)
      const SERVICE_SUBDOMAINS = ['www', 'api', 'app', 'admin', 'staging', 'dev'];
      const isServiceSubdomain = subdomain && SERVICE_SUBDOMAINS.some(
        svc => subdomain === svc || subdomain.endsWith(`-${svc}`)
      );
      if (subdomain && !isServiceSubdomain) {
        return subdomain;
      }
    }
  }

  // Check query parameter
  const tenantQuery = req.query.tenantId as string;
  if (tenantQuery) {
    return tenantQuery;
  }

  // Check path parameter (for specific routes)
  const tenantPath = req.params.tenantId;
  if (tenantPath) {
    return tenantPath;
  }

  // For authenticated requests, use tenant from user context
  if (req.user?.tenantId) {
    return req.user.tenantId;
  }

  return null;
}

export function requireTenant() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.tenant) {
      throw AuthError.tenantNotFound();
    }
    next();
  };
}

export function validateTenantAccess() {
  return (req: Request, res: Response, next: NextFunction): void => {
    // If user is authenticated and tenant context exists,
    // ensure user belongs to the correct tenant
    if (req.user && req.tenant && req.user.tenantId !== req.tenant!.id) {
      throw AuthError.insufficientPermissions();
    }
    next();
  };
}