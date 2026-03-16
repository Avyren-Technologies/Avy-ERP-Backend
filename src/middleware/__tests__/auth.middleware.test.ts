/**
 * Unit tests for auth middleware
 *
 * Source file: src/middleware/auth.middleware.ts
 *
 * External dependencies mocked:
 *   - config/database  (platformPrisma)
 *   - config/redis     (cacheRedis)
 *   - config/logger    (suppress output)
 *
 * jsonwebtoken is NOT mocked so we can exercise real token verification paths.
 */

jest.mock('../../config/database', () => ({
  platformPrisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('../../config/redis', () => ({
  cacheRedis: {
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authMiddleware, requirePermissions, requireRole } from '../auth.middleware';
import { platformPrisma } from '../../config/database';
import { cacheRedis } from '../../config/redis';
import { createUserCacheKey } from '../../shared/utils';

const mockPrismaUser = platformPrisma.user as any;
const mockRedis = cacheRedis as jest.Mocked<typeof cacheRedis>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const JWT_SECRET = process.env['JWT_SECRET']!;
const JWT_COOKIE_NAME = process.env['JWT_COOKIE_NAME'] ?? 'avy_erp_token';

function makeAccessToken(payload: object = {}): string {
  return jwt.sign(
    {
      userId: 'user-uuid-1',
      email: 'alice@acme.com',
      roleId: 'COMPANY_ADMIN',
      permissions: ['hr:view'],
      ...payload,
    },
    JWT_SECRET,
    { expiresIn: '15m', algorithm: 'HS256' }
  );
}

/** Build a minimal Express-like request object. */
function makeRequest(overrides: Partial<Request & { cookies: any }> = {}): Request {
  return {
    headers: {},
    cookies: {},
    user: undefined,
    tenant: undefined,
    ...overrides,
  } as unknown as Request;
}

const cachedUser = JSON.stringify({
  id: 'user-uuid-1',
  email: 'alice@acme.com',
  firstName: 'Alice',
  lastName: 'Smith',
  tenantId: 'tenant-uuid-1',
  companyId: 'company-uuid-1',
  roleId: 'COMPANY_ADMIN',
  permissions: ['hr:view', 'hr:create'],
  isActive: true,
});

// ---------------------------------------------------------------------------
// authMiddleware
// ---------------------------------------------------------------------------

describe('authMiddleware', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    res = {} as Response;
    next = jest.fn();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK');
  });

  it('should extract token from Authorization header and attach user to request', async () => {
    const token = makeAccessToken();
    req = makeRequest({ headers: { authorization: `Bearer ${token}` } });
    mockRedis.get
      .mockResolvedValueOnce(null) // blacklist check → not blacklisted
      .mockResolvedValueOnce(cachedUser); // user cache hit

    await authMiddleware()(req as any, res, next);

    expect(next).toHaveBeenCalledWith(); // called with no args = success
    expect((req as any).user.id).toBe('user-uuid-1');
  });

  it('should extract token from cookie when Authorization header is absent', async () => {
    const token = makeAccessToken();
    req = makeRequest({ cookies: { [JWT_COOKIE_NAME]: token } });
    mockRedis.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(cachedUser);

    await authMiddleware()(req as any, res, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as any).user.email).toBe('alice@acme.com');
  });

  it('should call next with MISSING_TOKEN error when no token is provided', async () => {
    req = makeRequest();

    await authMiddleware()(req as any, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'MISSING_TOKEN' })
    );
  });

  it('should pass without error in optional mode when no token is present', async () => {
    req = makeRequest();

    await authMiddleware({ optional: true })(req as any, res, next);

    expect(next).toHaveBeenCalledWith(); // success — no user attached but no error
    expect((req as any).user).toBeUndefined();
  });

  it('should call next with TOKEN_EXPIRED error for an expired token', async () => {
    const expiredToken = jwt.sign(
      { userId: 'user-uuid-1', email: 'alice@acme.com', roleId: 'COMPANY_ADMIN', permissions: [] },
      JWT_SECRET,
      { expiresIn: -1, algorithm: 'HS256' }
    );
    req = makeRequest({ headers: { authorization: `Bearer ${expiredToken}` } });

    await authMiddleware()(req as any, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'TOKEN_EXPIRED' })
    );
  });

  it('should call next with INVALID_TOKEN error for a blacklisted token', async () => {
    const token = makeAccessToken();
    req = makeRequest({ headers: { authorization: `Bearer ${token}` } });
    // First Redis get = blacklist check → returns 'true' (blacklisted)
    mockRedis.get.mockResolvedValueOnce('true');

    await authMiddleware()(req as any, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_TOKEN' })
    );
  });

  it('should call next with INVALID_TOKEN error when token is signed with wrong secret', async () => {
    const badToken = jwt.sign(
      { userId: 'u', email: 'x@x.com', roleId: 'R', permissions: [] },
      'wrong-secret',
      { algorithm: 'HS256' }
    );
    req = makeRequest({ headers: { authorization: `Bearer ${badToken}` } });

    await authMiddleware()(req as any, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_TOKEN' })
    );
  });

  it('should fetch user from database on cache miss and cache the result', async () => {
    const token = makeAccessToken();
    req = makeRequest({ headers: { authorization: `Bearer ${token}` } });
    const dbUser = {
      id: 'user-uuid-1',
      email: 'alice@acme.com',
      firstName: 'Alice',
      lastName: 'Smith',
      isActive: true,
      companyId: 'company-uuid-1',
      role: 'COMPANY_ADMIN',
      company: { tenant: { id: 'tenant-uuid-1' } },
    };
    mockRedis.get
      .mockResolvedValueOnce(null) // blacklist miss
      .mockResolvedValueOnce(null); // user cache miss → falls to DB
    mockPrismaUser.findUnique.mockResolvedValueOnce(dbUser as any);

    await authMiddleware()(req as any, res, next);

    expect(mockPrismaUser.findUnique).toHaveBeenCalled();
    expect(mockRedis.setex).toHaveBeenCalledWith(
      createUserCacheKey('user-uuid-1', 'auth'),
      1800,
      expect.any(String)
    );
    expect(next).toHaveBeenCalledWith();
  });

  it('should call next with INVALID_TOKEN error when user no longer exists in the database', async () => {
    const token = makeAccessToken();
    req = makeRequest({ headers: { authorization: `Bearer ${token}` } });
    mockRedis.get
      .mockResolvedValueOnce(null) // blacklist miss
      .mockResolvedValueOnce(null); // cache miss
    mockPrismaUser.findUnique.mockResolvedValueOnce(null); // user deleted from DB

    await authMiddleware()(req as any, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_TOKEN' })
    );
  });

  it('should call next with ACCOUNT_INACTIVE error when cached user is inactive', async () => {
    const token = makeAccessToken();
    req = makeRequest({ headers: { authorization: `Bearer ${token}` } });
    const inactiveCachedUser = JSON.stringify({ ...JSON.parse(cachedUser), isActive: false });
    mockRedis.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(inactiveCachedUser);

    await authMiddleware()(req as any, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ACCOUNT_INACTIVE' })
    );
  });
});

// ---------------------------------------------------------------------------
// requirePermissions
// ---------------------------------------------------------------------------

describe('requirePermissions', () => {
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    res = {} as Response;
    next = jest.fn();
  });

  function makeReqWithPerms(permissions: string[], roleId = 'COMPANY_ADMIN'): Request {
    return { user: { id: 'u1', email: 'x@x.com', roleId, permissions, tenantId: 't1', companyId: 'c1' } } as unknown as Request;
  }

  it('should call next() when user has the exact required permission', () => {
    const req = makeReqWithPerms(['hr:view', 'hr:create']);
    requirePermissions('hr:view')(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('should call next() when user has wildcard "*" (super admin)', () => {
    const req = makeReqWithPerms(['*']);
    requirePermissions('hr:delete')(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('should call next() when user has module wildcard "hr:*"', () => {
    const req = makeReqWithPerms(['hr:*']);
    requirePermissions('hr:view')(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('should throw INSUFFICIENT_PERMISSIONS when required permission is missing', () => {
    const req = makeReqWithPerms(['hr:view']);
    expect(() => requirePermissions('finance:approve')(req, res, next))
      .toThrow(expect.objectContaining({ code: 'INSUFFICIENT_PERMISSIONS' }));
  });

  it('should call next() when any permission in an array matches', () => {
    const req = makeReqWithPerms(['sales:view']);
    requirePermissions(['hr:view', 'sales:view'])(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('should throw MISSING_TOKEN when user is not attached to request', () => {
    const req = { user: undefined } as unknown as Request;
    expect(() => requirePermissions('hr:view')(req, res, next))
      .toThrow(expect.objectContaining({ code: 'MISSING_TOKEN' }));
  });
});

// ---------------------------------------------------------------------------
// requireRole
// ---------------------------------------------------------------------------

describe('requireRole', () => {
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    res = {} as Response;
    next = jest.fn();
  });

  function makeReqWithRole(roleId: string): Request {
    return {
      user: { id: 'u1', email: 'x@x.com', roleId, permissions: [], tenantId: 't1', companyId: 'c1' },
    } as unknown as Request;
  }

  it('should call next() when user role matches the required role string', () => {
    const req = makeReqWithRole('SUPER_ADMIN');
    requireRole('SUPER_ADMIN')(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('should call next() when user role is included in the required roles array', () => {
    const req = makeReqWithRole('COMPANY_ADMIN');
    requireRole(['SUPER_ADMIN', 'COMPANY_ADMIN'])(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('should throw INSUFFICIENT_PERMISSIONS when role does not match', () => {
    const req = makeReqWithRole('COMPANY_ADMIN');
    expect(() => requireRole('SUPER_ADMIN')(req, res, next))
      .toThrow(expect.objectContaining({ code: 'INSUFFICIENT_PERMISSIONS' }));
  });

  it('should throw MISSING_TOKEN when user is not attached to request', () => {
    const req = { user: undefined } as unknown as Request;
    expect(() => requireRole('SUPER_ADMIN')(req, res, next))
      .toThrow(expect.objectContaining({ code: 'MISSING_TOKEN' }));
  });
});
