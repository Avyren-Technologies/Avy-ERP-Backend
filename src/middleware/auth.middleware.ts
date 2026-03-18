import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { platformPrisma } from '../config/database';
import { cacheRedis } from '../config/redis';
import { AuthError } from '../shared/errors';
import {
  createAccessTokenBlacklistKey,
  createUserCacheKey,
} from '../shared/utils';
import { logger } from '../config/logger';
import { RequestWithUser } from '../shared/types';
import { hasPermission } from '../shared/constants/permissions';

export interface AuthMiddlewareOptions {
  optional?: boolean;
  requireTenant?: boolean;
}

const JWT_ALGORITHM: jwt.Algorithm = 'HS256';
const USER_CACHE_TTL_SECONDS = 1800;

export function authMiddleware(options: AuthMiddlewareOptions = {}) {
  return async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = extractTokenFromRequest(req);

      if (!token) {
        if (options.optional) {
          return next();
        }
        throw AuthError.missingToken();
      }

      // Verify JWT token
      const decoded = jwt.verify(token, env.JWT_SECRET, {
        algorithms: [JWT_ALGORITHM],
      }) as {
        userId: string;
        email: string;
        tenantId?: string;
        companyId?: string;
        roleId: string;
        permissions?: string[];
      };

      // Check if token is blacklisted (logout)
      const isBlacklisted = await cacheRedis.get(createAccessTokenBlacklistKey(token));
      if (isBlacklisted) {
        throw AuthError.invalidToken();
      }

      // Get user details from cache or database
      const userKey = createUserCacheKey(decoded.userId, 'auth');
      let userData = await cacheRedis.get(userKey);

      if (!userData) {
        const dbUser = await platformPrisma.user.findUnique({
          where: { id: decoded.userId },
          include: {
            company: {
              include: {
                tenant: true,
              },
            },
          },
        });

        if (!dbUser) {
          throw AuthError.invalidToken();
        }

        userData = JSON.stringify({
          id: dbUser.id,
          email: dbUser.email,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          tenantId: dbUser.company?.tenant?.id,
          companyId: dbUser.companyId,
          roleId: dbUser.role,
          permissions: getRolePermissions(dbUser.role),
          isActive: dbUser.isActive,
        });

        // Cache for 30 minutes
        await cacheRedis.setex(userKey, USER_CACHE_TTL_SECONDS, userData);
      }

      const user = JSON.parse(userData);

      // Check if user is active
      if (!user.isActive) {
        throw AuthError.accountInactive();
      }

      // Attach user to request
      req.user = user;

      // Check tenant requirement
      if (options.requireTenant && !req.tenant) {
        throw AuthError.tenantNotFound();
      }

      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        next(AuthError.tokenExpired());
      } else if (error instanceof jwt.JsonWebTokenError) {
        next(AuthError.invalidToken());
      } else {
        next(error);
      }
    }
  };
}

export function requirePermissions(permissions: string | string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw AuthError.missingToken();
    }

    const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];
    const userPermissions = req.user.permissions || [];

    // Uses hasPermission which supports wildcards: '*' and 'module:*'
    const granted = requiredPermissions.some(perm =>
      hasPermission(userPermissions, perm)
    );

    if (!granted) {
      throw AuthError.insufficientPermissions();
    }

    next();
  };
}

export function requireRole(roles: string | string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw AuthError.missingToken();
    }

    const requiredRoles = Array.isArray(roles) ? roles : [roles];

    if (!requiredRoles.includes(req.user.roleId)) {
      throw AuthError.insufficientPermissions();
    }

    next();
  };
}

function extractTokenFromRequest(req: RequestWithUser): string | null {
  const expressReq = req as any;

  // Check Authorization header
  const authHeader = expressReq.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check cookies
  const tokenCookie = expressReq.cookies?.[env.JWT_COOKIE_NAME];
  if (tokenCookie) {
    return tokenCookie;
  }

  return null;
}

function getRolePermissions(role: string): string[] {
  const rolePermissions: Record<string, string[]> = {
    SUPER_ADMIN: ['*'],
    COMPANY_ADMIN: [
      'user:*',
      'role:*',
      'company:*',
      'hr:*',
      'production:*',
      'inventory:*',
      'sales:*',
      'finance:*',
      'maintenance:*',
      'reports:*',
    ],
  };

  return rolePermissions[role] || [];
}

export async function blacklistToken(token: string, expirySeconds?: number): Promise<void> {
  const ttl = expirySeconds ?? parseJwtExpiryToSeconds(env.JWT_EXPIRES_IN);
  await cacheRedis.setex(createAccessTokenBlacklistKey(token), ttl, 'true');
  logger.info(`Token blacklisted for ${ttl} seconds`);
}

/** Parse a JWT expiry string (e.g. '15m', '7d', '3600') to seconds. */
function parseJwtExpiryToSeconds(expiresIn: string): number {
  const numeric = Number(expiresIn);
  if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric);
  const match = /^(\d+)\s*([smhdw])$/i.exec(expiresIn.trim());
  if (!match) return 900; // safe fallback: 15 minutes
  const value = Number(match[1] || 0);
  const unit = (match[2] || '').toLowerCase();
  const units: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  return value * (units[unit] ?? 1);
}
