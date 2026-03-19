/**
 * Integration tests for auth HTTP endpoints
 *
 * Source: src/core/auth/auth.routes.ts + src/app/app.ts
 *
 * Strategy: Spin up the real Express app via supertest.
 * Mock only external infrastructure so no real DB/Redis/SMTP is needed.
 *
 * Mocked:
 *   - config/database  (platformPrisma)
 *   - config/redis     (cacheRedis + queueRedis)
 *   - infrastructure/email/email.service
 *   - config/logger
 *
 * Rate-limiters are not bypassed — tests hit different IPs by default
 * because supertest uses 127.0.0.1 and trust-proxy is set.
 * We reset rate-limiter state by using jest.resetModules only when
 * needed; the default 5-req/15min window is sufficient for these tests.
 */

// Bypass rate limiting in integration tests so the in-memory store doesn't
// exhaust the per-hour cap across multiple test runs.
jest.mock('express-rate-limit', () => () => (_req: any, _res: any, next: any) => next());

// Mock infrastructure BEFORE the app module is imported.
jest.mock('../../../config/database', () => ({
  platformPrisma: {
    user: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    passwordResetToken: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    company: { create: jest.fn() },
    tenant: { create: jest.fn() },
    subscription: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../../config/redis', () => ({
  cacheRedis: { get: jest.fn(), set: jest.fn(), setex: jest.fn(), del: jest.fn(), scan: jest.fn() },
  queueRedis: { get: jest.fn(), setex: jest.fn(), del: jest.fn() },
}));

jest.mock('../../../infrastructure/email/email.service', () => ({
  sendPasswordResetCode: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// Also mock tenant.middleware so every request passes tenant checks without Redis
jest.mock('../../../middleware/tenant.middleware', () => ({
  tenantMiddleware: () => (_req: any, _res: any, next: any) => next(),
  requireTenant: () => (_req: any, _res: any, next: any) => next(),
  validateTenantAccess: (_req: any, _res: any, next: any) => next(),
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { app } from '../../../app/app';
import { platformPrisma } from '../../../config/database';
import { cacheRedis } from '../../../config/redis';

const mockUser = platformPrisma.user as any;
const mockToken = platformPrisma.passwordResetToken as any;
const mockRedis = cacheRedis as jest.Mocked<typeof cacheRedis>;
const mockTransaction = platformPrisma.$transaction as jest.MockedFunction<typeof platformPrisma.$transaction>;

const HASHED_PASSWORD = bcrypt.hashSync('Password1!', 1);
const JWT_SECRET = process.env['JWT_SECRET']!;
const JWT_REFRESH_SECRET = process.env['JWT_REFRESH_SECRET']!;

const dbUser = {
  id: 'user-uuid-1',
  email: 'alice@acme.com',
  firstName: 'Alice',
  lastName: 'Smith',
  password: HASHED_PASSWORD,
  role: 'COMPANY_ADMIN',
  isActive: true,
  companyId: 'company-uuid-1',
  phone: '+919876543210',
  lastLogin: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  company: {
    id: 'company-uuid-1',
    tenant: { id: 'tenant-uuid-1' },
  },
};

const cachedUserJSON = JSON.stringify({
  id: 'user-uuid-1',
  email: 'alice@acme.com',
  firstName: 'Alice',
  lastName: 'Smith',
  tenantId: 'tenant-uuid-1',
  companyId: 'company-uuid-1',
  roleId: 'COMPANY_ADMIN',
  permissions: ['hr:*'],
  isActive: true,
});

function makeAccessToken(): string {
  return jwt.sign(
    { userId: 'user-uuid-1', email: 'alice@acme.com', roleId: 'COMPANY_ADMIN', permissions: ['hr:*'] },
    JWT_SECRET,
    { expiresIn: '15m', algorithm: 'HS256' }
  );
}

function makeRefreshToken(): string {
  return jwt.sign(
    { userId: 'user-uuid-1', email: 'alice@acme.com', roleId: 'COMPANY_ADMIN', permissions: ['hr:*'] },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d', algorithm: 'HS256' }
  );
}

const BASE = '/api/v1/auth';

beforeEach(() => {
  mockRedis.get.mockResolvedValue(null);
  mockRedis.setex.mockResolvedValue('OK');
  mockRedis.del.mockResolvedValue(1);
  // deleteByPattern() should not throw during logout
  (mockRedis as any).scan.mockResolvedValue(['0', []]);
});

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/login', () => {
  it('should return 200 with tokens for valid credentials', async () => {
    mockUser.findUnique.mockResolvedValue(dbUser as any);
    mockUser.update.mockResolvedValue(dbUser as any);

    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ email: 'alice@acme.com', password: 'Password1!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens.accessToken).toBeDefined();
    expect(res.body.data.tokens.refreshToken).toBeDefined();
    expect(res.body.data.user.email).toBe('alice@acme.com');
  });

  it('should return 401 for invalid credentials (wrong password)', async () => {
    mockUser.findUnique.mockResolvedValue(dbUser as any);

    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ email: 'alice@acme.com', password: 'WrongPassword1!' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should return 401 when user does not exist', async () => {
    mockUser.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ email: 'nobody@acme.com', password: 'Password1!' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should return 422 for missing email field (validation error)', async () => {
    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ password: 'Password1!' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// POST /auth/register
// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/register', () => {
  const body = {
    email: 'bob@acme.com',
    password: 'Password1!',
    firstName: 'Bob',
    lastName: 'Jones',
    phone: '+919876543210',
    companyName: 'Acme Corp',
  };

  it('should return 201 with user and tokens for valid registration data', async () => {
    // No existing user
    mockUser.findUnique.mockResolvedValueOnce(null);
    mockTransaction.mockImplementationOnce(async (cb: any) =>
      cb({
        company: { create: jest.fn().mockResolvedValue({ id: 'co-1' }) },
        tenant: { create: jest.fn().mockResolvedValue({ id: 'te-1' }) },
        user: {
          create: jest.fn().mockResolvedValue({
            ...dbUser,
            id: 'new-u-1',
            email: 'bob@acme.com',
            firstName: 'Bob',
            lastName: 'Jones',
            role: 'COMPANY_ADMIN',
            isActive: true,
          }),
        },
        subscription: { create: jest.fn().mockResolvedValue({}) },
      })
    );
    // getUserPermissions call inside register
    mockUser.findUnique.mockResolvedValue({
      ...dbUser,
      id: 'new-u-1',
      role: 'COMPANY_ADMIN',
    } as any);

    const res = await request(app).post(`${BASE}/register`).send(body);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('bob@acme.com');
    expect(res.body.data.tokens.accessToken).toBeDefined();
  });

  it('should return 422 for a weak password that fails validation', async () => {
    const res = await request(app)
      .post(`${BASE}/register`)
      .send({ ...body, password: 'weak' });

    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// POST /auth/refresh-token
// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/refresh-token', () => {
  it('should return 200 with new token pair for a valid refresh token', async () => {
    const refreshToken = makeRefreshToken();
    mockRedis.get.mockResolvedValue(null); // not blacklisted
    mockRedis.setex.mockResolvedValue('OK');

    const res = await request(app)
      .post(`${BASE}/refresh-token`)
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data.tokens.accessToken).toBeDefined();
  });

  it('should return 401 for an expired refresh token', async () => {
    const expiredToken = jwt.sign(
      { userId: 'u', email: 'x@x.com', roleId: 'R', permissions: [] },
      JWT_REFRESH_SECRET,
      { expiresIn: -1, algorithm: 'HS256' }
    );

    const res = await request(app)
      .post(`${BASE}/refresh-token`)
      .send({ refreshToken: expiredToken });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /auth/forgot-password
// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/forgot-password', () => {
  it('should return 200 for any email (prevents enumeration)', async () => {
    // User exists
    mockUser.findUnique.mockResolvedValueOnce(dbUser as any);
    mockToken.deleteMany.mockResolvedValueOnce({ count: 0 } as any);
    mockToken.create.mockResolvedValueOnce({} as any);

    const res = await request(app)
      .post(`${BASE}/forgot-password`)
      .send({ email: 'alice@acme.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 200 even when email does not exist', async () => {
    mockUser.findUnique.mockResolvedValueOnce(null);

    const res = await request(app)
      .post(`${BASE}/forgot-password`)
      .send({ email: 'nobody@acme.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /auth/verify-reset-code
// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/verify-reset-code', () => {
  it('should return 200 when the reset code is valid', async () => {
    const CODE = '123456';
    const hashedCode = bcrypt.hashSync(CODE, 1);
    mockUser.findUnique.mockResolvedValueOnce(dbUser as any);
    mockToken.findFirst.mockResolvedValueOnce({
      id: 'tok-1',
      userId: 'user-uuid-1',
      code: hashedCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      usedAt: null,
    } as any);

    const res = await request(app)
      .post(`${BASE}/verify-reset-code`)
      .send({ email: 'alice@acme.com', code: CODE });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 401 when the reset code is wrong', async () => {
    const hashedCode = bcrypt.hashSync('654321', 1);
    mockUser.findUnique.mockResolvedValueOnce(dbUser as any);
    mockToken.findFirst.mockResolvedValueOnce({
      id: 'tok-1',
      userId: 'user-uuid-1',
      code: hashedCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      usedAt: null,
    } as any);

    const res = await request(app)
      .post(`${BASE}/verify-reset-code`)
      .send({ email: 'alice@acme.com', code: '999999' });

    expect(res.status).toBe(401);
  });

  it('should return 422 when code is not 6 digits', async () => {
    const res = await request(app)
      .post(`${BASE}/verify-reset-code`)
      .send({ email: 'alice@acme.com', code: '123' }); // too short

    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// POST /auth/reset-password
// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/reset-password', () => {
  it('should return 200 when code is valid and new password meets requirements', async () => {
    const CODE = '777888';
    const hashedCode = bcrypt.hashSync(CODE, 1);
    mockUser.findUnique.mockResolvedValueOnce(dbUser as any);
    mockToken.findFirst.mockResolvedValueOnce({
      id: 'tok-2',
      userId: 'user-uuid-1',
      code: hashedCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      usedAt: null,
    } as any);
    mockUser.update.mockResolvedValueOnce(dbUser as any);
    mockToken.update.mockResolvedValueOnce({} as any);

    const res = await request(app)
      .post(`${BASE}/reset-password`)
      .send({ email: 'alice@acme.com', code: CODE, newPassword: 'NewPass3#' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 401 when the code is invalid', async () => {
    mockUser.findUnique.mockResolvedValueOnce(dbUser as any);
    mockToken.findFirst.mockResolvedValueOnce(null); // expired / not found

    const res = await request(app)
      .post(`${BASE}/reset-password`)
      .send({ email: 'alice@acme.com', code: '000000', newPassword: 'NewPass3#' });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/logout', () => {
  it('should return 200 when a valid token is provided', async () => {
    const token = makeAccessToken();
    // Auth middleware cache hit so it doesn't try to reach DB
    mockRedis.get
      .mockResolvedValueOnce(null) // blacklist miss
      .mockResolvedValueOnce(cachedUserJSON); // user cache hit
    mockRedis.setex.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);

    const res = await request(app)
      .post(`${BASE}/logout`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /auth/profile
// ---------------------------------------------------------------------------

describe('GET /api/v1/auth/profile', () => {
  it('should return 401 when no token is provided', async () => {
    const res = await request(app).get(`${BASE}/profile`);
    expect(res.status).toBe(401);
  });

  it('should return 200 with user data when a valid token is provided', async () => {
    const token = makeAccessToken();
    mockRedis.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(cachedUserJSON);

    const res = await request(app)
      .get(`${BASE}/profile`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('alice@acme.com');
    expect(res.body.data.user.id).toBe('user-uuid-1');
  });
});
