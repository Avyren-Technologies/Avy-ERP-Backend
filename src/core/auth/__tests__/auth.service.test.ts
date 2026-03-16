/**
 * Unit tests for AuthService
 *
 * Source file: src/core/auth/auth.service.ts
 *
 * External dependencies mocked:
 *   - src/config/database  (platformPrisma)
 *   - src/config/redis     (cacheRedis)
 *   - src/infrastructure/email/email.service (sendPasswordResetCode)
 *   - src/config/logger    (suppress output)
 *
 * bcryptjs and jsonwebtoken are NOT mocked — we let them run with the
 * cheap BCRYPT_ROUNDS=1 set in setup.ts so password operations are fast
 * without hiding real hashing/comparison bugs.
 */

// Mock the heavy infrastructure modules BEFORE any imports that pull them in.
jest.mock('../../../config/database', () => ({
  platformPrisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
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
  cacheRedis: {
    get: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('../../../infrastructure/email/email.service', () => ({
  sendPasswordResetCode: jest.fn(),
}));

jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { AuthService } from '../auth.service';
import { platformPrisma } from '../../../config/database';
import { cacheRedis } from '../../../config/redis';
import { sendPasswordResetCode } from '../../../infrastructure/email/email.service';
import { AuthError } from '../../../shared/errors';
import {
  createAccessTokenBlacklistKey,
  createRefreshTokenBlacklistKey,
  createUserCacheKey,
} from '../../../shared/utils';

// Typed shorthand for mock instances
const mockPrismaUser = platformPrisma.user as any;
const mockPrismaToken = platformPrisma.passwordResetToken as any;
const mockRedis = cacheRedis as jest.Mocked<typeof cacheRedis>;
const mockSendResetCode = sendPasswordResetCode as jest.MockedFunction<typeof sendPasswordResetCode>;
const mockTransaction = platformPrisma.$transaction as jest.Mock;

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const HASHED_PASSWORD = bcrypt.hashSync('Password1!', 1);

const baseUser = {
  id: 'user-uuid-1',
  email: 'admin@acme.com',
  firstName: 'Alice',
  lastName: 'Smith',
  password: HASHED_PASSWORD,
  role: 'COMPANY_ADMIN',
  isActive: true,
  companyId: 'company-uuid-1',
  lastLogin: null,
  phone: '+919876543210',
  createdAt: new Date(),
  updatedAt: new Date(),
  company: {
    id: 'company-uuid-1',
    tenant: {
      id: 'tenant-uuid-1',
    },
  },
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
    // Default: Redis get returns null (cache miss) so code falls through to DB
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
  });

  // =========================================================================
  // login
  // =========================================================================

  describe('login', () => {
    it('should return user and tokens for valid credentials', async () => {
      mockPrismaUser.findUnique.mockResolvedValueOnce(baseUser as any); // findUnique for login
      mockPrismaUser.findUnique.mockResolvedValueOnce(baseUser as any); // findUnique inside getUserPermissions (first call)
      mockPrismaUser.findUnique.mockResolvedValueOnce(baseUser as any); // getUserPermissions (second call for cacheUserData)
      mockPrismaUser.update.mockResolvedValueOnce(baseUser as any); // update lastLogin

      const result = await service.login({ email: 'admin@acme.com', password: 'Password1!' });

      expect(result.user.email).toBe('admin@acme.com');
      expect(result.user.id).toBe('user-uuid-1');
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
      expect(result.tokens.expiresIn).toBeGreaterThan(0);
      // Verify lastLogin was updated
      expect(mockPrismaUser.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-uuid-1' } })
      );
    });

    it('should throw invalidCredentials when email does not exist', async () => {
      mockPrismaUser.findUnique.mockResolvedValueOnce(null);

      await expect(service.login({ email: 'nobody@acme.com', password: 'Password1!' }))
        .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });

    it('should throw accountInactive when user isActive is false', async () => {
      mockPrismaUser.findUnique.mockResolvedValueOnce({ ...baseUser, isActive: false } as any);

      await expect(service.login({ email: 'admin@acme.com', password: 'Password1!' }))
        .rejects.toMatchObject({ code: 'ACCOUNT_INACTIVE' });
    });

    it('should throw invalidCredentials when password is wrong', async () => {
      mockPrismaUser.findUnique.mockResolvedValueOnce(baseUser as any);

      await expect(service.login({ email: 'admin@acme.com', password: 'WrongPass1!' }))
        .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });

    it('should cache user data after successful login', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(baseUser as any);
      mockPrismaUser.update.mockResolvedValueOnce(baseUser as any);

      await service.login({ email: 'admin@acme.com', password: 'Password1!' });

      expect(mockRedis.setex).toHaveBeenCalledWith(
        createUserCacheKey('user-uuid-1', 'auth'),
        1800,
        expect.any(String)
      );
    });

    it('should omit companyId and tenantId from response when user has no company', async () => {
      const noCompanyUser = { ...baseUser, companyId: null, company: null };
      mockPrismaUser.findUnique.mockResolvedValue(noCompanyUser as any);
      mockPrismaUser.update.mockResolvedValueOnce(noCompanyUser as any);

      const result = await service.login({ email: 'admin@acme.com', password: 'Password1!' });

      expect(result.user.companyId).toBeUndefined();
      expect(result.user.tenantId).toBeUndefined();
    });
  });

  // =========================================================================
  // register
  // =========================================================================

  describe('register', () => {
    const registerData = {
      email: 'new@acme.com',
      password: 'Password1!',
      firstName: 'Bob',
      lastName: 'Jones',
      phone: '+919876543210',
      companyName: 'Acme Corp',
    };

    const txResult = {
      user: { ...baseUser, id: 'new-user-id', email: 'new@acme.com', firstName: 'Bob', lastName: 'Jones', isActive: true },
      tenant: { id: 'new-tenant-id' },
      company: { id: 'new-company-id' },
    };

    it('should create company, tenant, user, and subscription in a transaction', async () => {
      mockPrismaUser.findUnique.mockResolvedValueOnce(null); // no existing user
      mockTransaction.mockImplementationOnce(async (cb: any) => cb({
        company: { create: jest.fn().mockResolvedValue(txResult.company) },
        tenant: { create: jest.fn().mockResolvedValue(txResult.tenant) },
        user: { create: jest.fn().mockResolvedValue(txResult.user) },
        subscription: { create: jest.fn().mockResolvedValue({}) },
      }));
      // getUserPermissions call inside register
      mockPrismaUser.findUnique.mockResolvedValue(txResult.user as any);

      const result = await service.register(registerData);

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(result.user.email).toBe('new@acme.com');
      expect(result.user.companyId).toBe('new-company-id');
      expect(result.user.tenantId).toBe('new-tenant-id');
      expect(result.tokens.accessToken).toBeDefined();
    });

    it('should throw badRequest when email already exists', async () => {
      mockPrismaUser.findUnique.mockResolvedValueOnce(baseUser as any);

      await expect(service.register(registerData))
        .rejects.toMatchObject({ statusCode: 400 });
    });
  });

  // =========================================================================
  // refreshToken
  // =========================================================================

  describe('refreshToken', () => {
    function makeRefreshToken(payload: object = {}): string {
      return jwt.sign(
        {
          userId: 'user-uuid-1',
          email: 'admin@acme.com',
          roleId: 'COMPANY_ADMIN',
          permissions: [],
          ...payload,
        },
        process.env['JWT_REFRESH_SECRET']!,
        { expiresIn: '7d', algorithm: 'HS256' }
      );
    }

    it('should return a new token pair for a valid, non-blacklisted refresh token', async () => {
      const token = makeRefreshToken();
      mockRedis.get.mockResolvedValueOnce(null); // not blacklisted
      mockRedis.setex.mockResolvedValue('OK');

      const result = await service.refreshToken({ refreshToken: token });

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      // Old token should be blacklisted
      expect(mockRedis.setex).toHaveBeenCalledWith(
        createRefreshTokenBlacklistKey(token),
        86400,
        'true'
      );
    });

    it('should throw invalidToken for a blacklisted refresh token', async () => {
      const token = makeRefreshToken();
      mockRedis.get.mockResolvedValueOnce('true'); // blacklisted

      await expect(service.refreshToken({ refreshToken: token }))
        .rejects.toMatchObject({ code: 'INVALID_TOKEN' });
    });

    it('should throw tokenExpired for an expired refresh token', async () => {
      // Sign with -1s to produce an already-expired token
      const expiredToken = jwt.sign(
        { userId: 'user-uuid-1', email: 'x@x.com', roleId: 'COMPANY_ADMIN', permissions: [] },
        process.env['JWT_REFRESH_SECRET']!,
        { expiresIn: -1, algorithm: 'HS256' }
      );

      await expect(service.refreshToken({ refreshToken: expiredToken }))
        .rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    });

    it('should throw invalidToken for a token signed with the wrong secret', async () => {
      const badToken = jwt.sign(
        { userId: 'user-uuid-1', email: 'x@x.com', roleId: 'COMPANY_ADMIN', permissions: [] },
        'totally-wrong-secret',
        { algorithm: 'HS256' }
      );

      await expect(service.refreshToken({ refreshToken: badToken }))
        .rejects.toMatchObject({ code: 'INVALID_TOKEN' });
    });
  });

  // =========================================================================
  // changePassword
  // =========================================================================

  describe('changePassword', () => {
    it('should update password when current password is correct', async () => {
      mockPrismaUser.findUnique.mockResolvedValueOnce(baseUser as any);
      mockPrismaUser.update.mockResolvedValueOnce(baseUser as any);

      await expect(
        service.changePassword('user-uuid-1', {
          currentPassword: 'Password1!',
          newPassword: 'NewPassword2@',
        })
      ).resolves.toBeUndefined();

      // New password must be hashed and saved
      expect(mockPrismaUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-uuid-1' },
          data: expect.objectContaining({ password: expect.any(String) }),
        })
      );
      // User cache must be cleared
      expect(mockRedis.del).toHaveBeenCalledWith(createUserCacheKey('user-uuid-1', 'auth'));
    });

    it('should throw invalidCredentials when current password is wrong', async () => {
      mockPrismaUser.findUnique.mockResolvedValueOnce(baseUser as any);

      await expect(
        service.changePassword('user-uuid-1', {
          currentPassword: 'WrongPass1!',
          newPassword: 'NewPassword2@',
        })
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });

    it('should throw invalidCredentials when userId does not exist', async () => {
      mockPrismaUser.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.changePassword('ghost-id', {
          currentPassword: 'Password1!',
          newPassword: 'NewPassword2@',
        })
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });
  });

  // =========================================================================
  // logout
  // =========================================================================

  describe('logout', () => {
    it('should blacklist the access token and clear user cache', async () => {
      await service.logout('user-uuid-1', 'some.jwt.token');

      // Token blacklisted for 15 minutes (900s)
      expect(mockRedis.setex).toHaveBeenCalledWith(createAccessTokenBlacklistKey('some.jwt.token'), 900, 'true');
      // Cache cleared
      expect(mockRedis.del).toHaveBeenCalledWith(createUserCacheKey('user-uuid-1', 'auth'));
    });
  });

  // =========================================================================
  // forgotPassword
  // =========================================================================

  describe('forgotPassword', () => {
    it('should send a reset code email for an active user', async () => {
      mockPrismaUser.findUnique.mockResolvedValueOnce(baseUser as any);
      mockPrismaToken.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockPrismaToken.create.mockResolvedValueOnce({} as any);
      mockSendResetCode.mockResolvedValueOnce(undefined);

      await expect(service.forgotPassword({ email: 'admin@acme.com' }))
        .resolves.toBeUndefined();

      expect(mockPrismaToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-uuid-1' } });
      expect(mockPrismaToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-uuid-1',
            code: expect.any(String),
            expiresAt: expect.any(Date),
          }),
        })
      );
      expect(mockSendResetCode).toHaveBeenCalledWith(
        'admin@acme.com',
        expect.stringMatching(/^\d{6}$/),
        'Alice'
      );
    });

    it('should return void without sending email for non-existent email (prevents enumeration)', async () => {
      mockPrismaUser.findUnique.mockResolvedValueOnce(null);

      await expect(service.forgotPassword({ email: 'ghost@acme.com' }))
        .resolves.toBeUndefined();

      expect(mockSendResetCode).not.toHaveBeenCalled();
      expect(mockPrismaToken.create).not.toHaveBeenCalled();
    });

    it('should return void without sending email for an inactive user', async () => {
      mockPrismaUser.findUnique.mockResolvedValueOnce({ ...baseUser, isActive: false } as any);

      await expect(service.forgotPassword({ email: 'admin@acme.com' }))
        .resolves.toBeUndefined();

      expect(mockSendResetCode).not.toHaveBeenCalled();
    });

    it('should create a PasswordResetToken record with 15-minute expiry', async () => {
      mockPrismaUser.findUnique.mockResolvedValueOnce(baseUser as any);
      mockPrismaToken.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockPrismaToken.create.mockResolvedValueOnce({} as any);
      mockSendResetCode.mockResolvedValueOnce(undefined);

      const before = Date.now();
      await service.forgotPassword({ email: 'admin@acme.com' });
      const after = Date.now();

      const createCall = mockPrismaToken.create.mock.calls[0];
      const expiresAt: Date = (createCall as any)[0].data.expiresAt;
      const expiryMs = expiresAt.getTime();
      // expiresAt should be roughly 15 minutes from now (±5s tolerance)
      expect(expiryMs).toBeGreaterThan(before + 15 * 60 * 1000 - 5000);
      expect(expiryMs).toBeLessThan(after + 15 * 60 * 1000 + 5000);
    });

    it('should silently swallow email send errors without re-throwing', async () => {
      mockPrismaUser.findUnique.mockResolvedValueOnce(baseUser as any);
      mockPrismaToken.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockPrismaToken.create.mockResolvedValueOnce({} as any);
      mockSendResetCode.mockRejectedValueOnce(new Error('SMTP timeout'));

      // Should NOT reject — email failures are swallowed
      await expect(service.forgotPassword({ email: 'admin@acme.com' }))
        .resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // verifyResetCode
  // =========================================================================

  describe('verifyResetCode', () => {
    const CODE = '123456';

    async function makeHashedCode(plain: string): Promise<string> {
      return bcrypt.hash(plain, 1);
    }

    it('should return true for a valid, unexpired, unused code', async () => {
      const hashedCode = await makeHashedCode(CODE);
      mockPrismaUser.findUnique.mockResolvedValueOnce(baseUser as any);
      mockPrismaToken.findFirst.mockResolvedValueOnce({
        id: 'token-uuid-1',
        userId: 'user-uuid-1',
        code: hashedCode,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        usedAt: null,
      } as any);

      const result = await service.verifyResetCode({ email: 'admin@acme.com', code: CODE });
      expect(result).toBe(true);
    });

    it('should throw invalidResetCode when user does not exist', async () => {
      mockPrismaUser.findUnique.mockResolvedValueOnce(null);

      await expect(service.verifyResetCode({ email: 'nobody@acme.com', code: CODE }))
        .rejects.toMatchObject({ code: 'INVALID_RESET_CODE' });
    });

    it('should throw resetCodeExpired when no valid token is found (e.g. expired/used)', async () => {
      mockPrismaUser.findUnique.mockResolvedValueOnce(baseUser as any);
      // findFirst returns null → token is expired or used
      mockPrismaToken.findFirst.mockResolvedValueOnce(null);

      await expect(service.verifyResetCode({ email: 'admin@acme.com', code: CODE }))
        .rejects.toMatchObject({ code: 'RESET_CODE_EXPIRED' });
    });

    it('should throw invalidResetCode when the code does not match the stored hash', async () => {
      const hashedCode = await makeHashedCode('654321'); // different code hashed
      mockPrismaUser.findUnique.mockResolvedValueOnce(baseUser as any);
      mockPrismaToken.findFirst.mockResolvedValueOnce({
        id: 'token-uuid-1',
        userId: 'user-uuid-1',
        code: hashedCode,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        usedAt: null,
      } as any);

      await expect(service.verifyResetCode({ email: 'admin@acme.com', code: CODE }))
        .rejects.toMatchObject({ code: 'INVALID_RESET_CODE' });
    });
  });

  // =========================================================================
  // resetPassword
  // =========================================================================

  describe('resetPassword', () => {
    const CODE = '999888';

    async function makeHashedCode(plain: string): Promise<string> {
      return bcrypt.hash(plain, 1);
    }

    it('should update the password, mark the token as used, and clear the cache', async () => {
      const hashedCode = await makeHashedCode(CODE);
      mockPrismaUser.findUnique.mockResolvedValueOnce(baseUser as any);
      mockPrismaToken.findFirst.mockResolvedValueOnce({
        id: 'token-uuid-1',
        userId: 'user-uuid-1',
        code: hashedCode,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        usedAt: null,
      } as any);
      mockPrismaUser.update.mockResolvedValueOnce(baseUser as any);
      mockPrismaToken.update.mockResolvedValueOnce({} as any);

      await expect(
        service.resetPassword({ email: 'admin@acme.com', code: CODE, newPassword: 'NewPass3#' })
      ).resolves.toBeUndefined();

      // Password updated
      expect(mockPrismaUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-uuid-1' },
          data: expect.objectContaining({ password: expect.any(String) }),
        })
      );
      // Token marked used
      expect(mockPrismaToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'token-uuid-1' },
          data: expect.objectContaining({ usedAt: expect.any(Date) }),
        })
      );
      // Cache cleared
      expect(mockRedis.del).toHaveBeenCalledWith(createUserCacheKey('user-uuid-1', 'auth'));
    });

    it('should throw invalidResetCode when user does not exist', async () => {
      mockPrismaUser.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.resetPassword({ email: 'nobody@acme.com', code: CODE, newPassword: 'NewPass3#' })
      ).rejects.toMatchObject({ code: 'INVALID_RESET_CODE' });
    });

    it('should throw resetCodeExpired when no valid token exists', async () => {
      mockPrismaUser.findUnique.mockResolvedValueOnce(baseUser as any);
      mockPrismaToken.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.resetPassword({ email: 'admin@acme.com', code: CODE, newPassword: 'NewPass3#' })
      ).rejects.toMatchObject({ code: 'RESET_CODE_EXPIRED' });
    });

    it('should throw invalidResetCode when submitted code is wrong', async () => {
      const hashedCode = await makeHashedCode('111111'); // different code
      mockPrismaUser.findUnique.mockResolvedValueOnce(baseUser as any);
      mockPrismaToken.findFirst.mockResolvedValueOnce({
        id: 'token-uuid-1',
        userId: 'user-uuid-1',
        code: hashedCode,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        usedAt: null,
      } as any);

      await expect(
        service.resetPassword({ email: 'admin@acme.com', code: CODE, newPassword: 'NewPass3#' })
      ).rejects.toMatchObject({ code: 'INVALID_RESET_CODE' });
    });
  });
});
