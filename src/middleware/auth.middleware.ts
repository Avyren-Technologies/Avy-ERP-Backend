import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { cacheRedis } from '../config/redis';
import { AuthError } from '../shared/errors';
import { createUserCacheKey } from '../shared/utils';
import { logger } from '../config/logger';
import { RequestWithUser } from '../shared/types';

export interface AuthMiddlewareOptions {
  optional?: boolean;
  requireTenant?: boolean;
}

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
      const decoded = jwt.verify(token, env.JWT_SECRET) as any;

      // Check if token is blacklisted (logout)
      const isBlacklisted = await cacheRedis.get(`blacklist:${token}`);
      if (isBlacklisted) {
        throw AuthError.invalidToken();
      }

      // Get user details from cache or database
      const userKey = createUserCacheKey(decoded.userId, 'auth');
      let userData = await cacheRedis.get(userKey);

      if (!userData) {
        // TODO: Fetch user from database
        // For now, create mock user data
        userData = JSON.stringify({
          id: decoded.userId,
          email: decoded.email,
          tenantId: decoded.tenantId,
          companyId: decoded.companyId,
          roleId: decoded.roleId,
          permissions: decoded.permissions || [],
          isActive: true,
        });

        // Cache for 30 minutes
        await cacheRedis.setex(userKey, 1800, userData);
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

    const hasPermission = requiredPermissions.some(permission =>
      userPermissions.includes(permission) || userPermissions.includes('*')
    );

    if (!hasPermission) {
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

  // Check query parameter (for API testing)
  const tokenQuery = expressReq.query.token as string;
  if (tokenQuery) {
    return tokenQuery;
  }

  return null;
}

export async function blacklistToken(token: string, expirySeconds?: number): Promise<void> {
  const ttl = expirySeconds || (env.JWT_EXPIRES_IN === '15m' ? 900 : 3600); // Default to 15 minutes or 1 hour
  await cacheRedis.setex(`blacklist:${token}`, ttl, 'true');
  logger.info(`Token blacklisted for ${ttl} seconds`);
}