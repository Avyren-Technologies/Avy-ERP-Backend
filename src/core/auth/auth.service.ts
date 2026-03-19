import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { platformPrisma } from '../../config/database';
import { cacheRedis } from '../../config/redis';
import { AuthError } from '../../shared/errors';
import {
  hashPassword,
  comparePassword,
  createAccessTokenBlacklistKey,
  createRefreshTokenBlacklistKey,
  createUserCacheKey,
  createRedisPattern,
} from '../../shared/utils';
import { logger } from '../../config/logger';
import {
  LoginRequest,
  RegisterRequest,
  RefreshTokenRequest,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  VerifyResetCodeRequest,
  ResetPasswordRequest,
  AuthResponse,
  JWTPayload,
  TokenPair
} from './auth.types';
import { sendPasswordResetCode } from '../../infrastructure/email/email.service';

const JWT_ALGORITHM: jwt.Algorithm = 'HS256';

export class AuthService {
  // Login user
  async login(loginData: LoginRequest): Promise<AuthResponse> {
    const { email, password } = loginData;

    // Find user
    const user = await platformPrisma.user.findUnique({
      where: { email },
      include: {
        company: {
          include: {
            tenant: true,
          },
        },
      },
    });

    if (!user) {
      throw AuthError.invalidCredentials();
    }

    // Check if user is active
    if (!user.isActive) {
      throw AuthError.accountInactive();
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      throw AuthError.invalidCredentials();
    }

    // Update last login
    await platformPrisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // Fetch permissions once to avoid duplicate DB queries
    const permissions = await this.getUserPermissions(user.id);

    // Generate tokens
    const tokens = await this.generateTokens({
      userId: user.id,
      email: user.email,
      tenantId: user.company?.tenant?.id ?? undefined,
      companyId: user.companyId ?? undefined,
      roleId: user.role,
      permissions,
    });

    // Cache user data
    await this.cacheUserData(user.id, {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      tenantId: user.company?.tenant?.id,
      companyId: user.companyId,
      roleId: user.role,
      permissions,
      isActive: user.isActive,
    });

    logger.info(`User logged in: ${user.email}`);

    const responseUser: AuthResponse['user'] = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      ...(user.companyId ? { companyId: user.companyId } : {}),
      ...(user.company?.tenant?.id ? { tenantId: user.company.tenant.id } : {}),
    };

    return {
      user: responseUser,
      tokens,
    };
  }

  // Register new user and company
  async register(registerData: RegisterRequest): Promise<AuthResponse> {
    const { email, password, firstName, lastName, phone, companyName } = registerData;

    // Check if user already exists
    const existingUser = await platformPrisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw AuthError.badRequest('User already exists with this email');
    }

    // Start transaction
    const result = await platformPrisma.$transaction(async (tx: any) => {
      // Create company
      const company = await tx.company.create({
        data: {
          name: companyName,
          industry: 'Manufacturing', // Default
          size: 'SMALL', // Default
          contactPerson: {
            name: `${firstName} ${lastName}`,
            email,
            phone,
          },
        },
      });

      // Create tenant
      const tenant = await tx.tenant.create({
        data: {
          companyId: company.id,
          schemaName: `tenant_${company.id.replace(/-/g, '_')}`,
        },
      });

      // Create user
      const hashedPassword = await hashPassword(password);
      const user = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          firstName,
          lastName,
          phone,
          role: 'COMPANY_ADMIN',
          companyId: company.id,
        },
      });

      // Create default subscription (trial)
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: 'trial',
          userTier: 'STARTER',
          billingType: 'MONTHLY',
          modules: {
            hr: true,
            production: true,
            inventory: true,
            sales: true,
          },
          status: 'TRIAL',
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
        },
      });

      return { user, tenant, company };
    });

    // Fetch permissions once to avoid duplicate DB queries
    const permissions = await this.getUserPermissions(result.user.id);

    // Generate tokens
    const tokens = await this.generateTokens({
      userId: result.user.id,
      email: result.user.email,
      tenantId: result.tenant.id,
      companyId: result.company.id,
      roleId: result.user.role,
      permissions,
    });

    // Cache user data
    await this.cacheUserData(result.user.id, {
      id: result.user.id,
      email: result.user.email,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      tenantId: result.tenant.id,
      companyId: result.company.id,
      roleId: result.user.role,
      permissions,
      isActive: result.user.isActive,
    });

    logger.info(`New user registered: ${result.user.email}`);

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        role: result.user.role,
        companyId: result.company.id,
        tenantId: result.tenant.id,
      },
      tokens,
    };
  }

  // Refresh access token
  async refreshToken(refreshData: RefreshTokenRequest): Promise<TokenPair> {
    const { refreshToken } = refreshData;

    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET, {
        algorithms: [JWT_ALGORITHM],
      }) as JWTPayload;

      // Check if refresh token is blacklisted
      const isBlacklisted = await cacheRedis.get(createRefreshTokenBlacklistKey(refreshToken));
      if (isBlacklisted) {
        throw AuthError.invalidToken();
      }

      // Generate new tokens
      const tokens = await this.generateTokens({
        userId: decoded.userId,
        email: decoded.email,
        tenantId: decoded.tenantId || undefined,
        companyId: decoded.companyId || undefined,
        roleId: decoded.roleId,
        permissions: decoded.permissions,
      });

      // Blacklist old refresh token for its full 7-day lifespan
      await cacheRedis.setex(createRefreshTokenBlacklistKey(refreshToken), 604800, 'true'); // 7 days

      return tokens;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw AuthError.tokenExpired();
      }
      throw AuthError.invalidToken();
    }
  }

  // Change password
  async changePassword(userId: string, passwordData: ChangePasswordRequest): Promise<void> {
    const { currentPassword, newPassword } = passwordData;

    // Find user
    const user = await platformPrisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw AuthError.invalidCredentials();
    }

    // Verify current password
    const isCurrentPasswordValid = await comparePassword(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw AuthError.invalidCredentials();
    }

    // Hash new password
    const hashedNewPassword = await hashPassword(newPassword);

    // Update password
    await platformPrisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    // Clear user cache
    await cacheRedis.del(createUserCacheKey(userId, 'auth'));

    logger.info(`Password changed for user: ${user.email}`);
  }

  // Forgot password — generate and email a 6-digit code
  async forgotPassword(data: ForgotPasswordRequest): Promise<void> {
    const { email } = data;

    // Always return success to prevent email enumeration
    const user = await platformPrisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      logger.info(`Forgot password requested for non-existent/inactive email: ${email}`);
      return;
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedCode = await hashPassword(code);

    // Delete any existing tokens for this user
    await platformPrisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

    // Create new token with 15-minute expiry
    await platformPrisma.passwordResetToken.create({
      data: {
        userId: user.id,
        code: hashedCode,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    // Send email
    try {
      await sendPasswordResetCode(user.email, code, user.firstName);
      logger.info(`Password reset code sent to: ${user.email}`);
    } catch (error) {
      logger.error(`Failed to send password reset email to ${user.email}:`, error);
    }
  }

  // Verify reset code without consuming it
  async verifyResetCode(data: VerifyResetCodeRequest): Promise<boolean> {
    const { email, code } = data;

    const user = await platformPrisma.user.findUnique({ where: { email } });
    if (!user) {
      throw AuthError.invalidResetCode();
    }

    const token = await platformPrisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!token) {
      throw AuthError.resetCodeExpired();
    }

    const isCodeValid = await comparePassword(code, token.code);
    if (!isCodeValid) {
      throw AuthError.invalidResetCode();
    }

    return true;
  }

  // Reset password using verified code
  async resetPassword(data: ResetPasswordRequest): Promise<void> {
    const { email, code, newPassword } = data;

    const user = await platformPrisma.user.findUnique({ where: { email } });
    if (!user) {
      throw AuthError.invalidResetCode();
    }

    const token = await platformPrisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!token) {
      throw AuthError.resetCodeExpired();
    }

    const isCodeValid = await comparePassword(code, token.code);
    if (!isCodeValid) {
      throw AuthError.invalidResetCode();
    }

    // Hash new password and update user
    const hashedPassword = await hashPassword(newPassword);
    await platformPrisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    // Mark token as used
    await platformPrisma.passwordResetToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    });

    // Clear user cache
    await cacheRedis.del(createUserCacheKey(user.id, 'auth'));

    logger.info(`Password reset completed for user: ${user.email}`);
  }

  // Logout user
  async logout(userId: string, accessToken: string): Promise<void> {
    // Blacklist access token for its full 15-minute lifespan
    await cacheRedis.setex(createAccessTokenBlacklistKey(accessToken), 900, 'true'); // 15 minutes

    // Clear user auth cache
    await cacheRedis.del(createUserCacheKey(userId, 'auth'));

    // Clear all tenant-scoped permissions caches for this user using a pattern scan
    // Pattern: avy:erp-backend:rbac:user:{userId}:tenant:*:permissions
    const permissionsPattern = createRedisPattern('rbac', `user:${userId}:tenant:*:permissions`);
    await this.deleteByPattern(permissionsPattern);

    logger.info(`User logged out: ${userId}`);
  }

  /** Delete all Redis keys matching a glob pattern using non-blocking SCAN. */
  private async deleteByPattern(pattern: string): Promise<void> {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await cacheRedis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await cacheRedis.del(...keys);
      }
    } while (cursor !== '0');
  }

  // Generate JWT tokens
  private async generateTokens(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<TokenPair> {
    const accessToken = jwt.sign(payload as object, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
      algorithm: JWT_ALGORITHM,
    } as any);

    const refreshToken = jwt.sign(payload as object, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
      algorithm: JWT_ALGORITHM,
    } as any);

    // Calculate expiry time
    const expiresIn = this.parseExpiresInToSeconds(env.JWT_EXPIRES_IN);

    return {
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  // Get user permissions
  private async getUserPermissions(userId: string): Promise<string[]> {
    // For now, return default permissions based on role
    // TODO: Implement proper RBAC system
    const user = await platformPrisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return [];

    // Default permissions for different roles
    const rolePermissions: Record<string, string[]> = {
      SUPER_ADMIN: ['*'], // All permissions
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

    return rolePermissions[user.role] || [];
  }

  // Cache user data
  private async cacheUserData(userId: string, userData: any): Promise<void> {
    const cacheKey = createUserCacheKey(userId, 'auth');
    await cacheRedis.setex(cacheKey, 1800, JSON.stringify(userData)); // 30 minutes
  }

  private parseExpiresInToSeconds(expiresIn: string): number {
    const numericValue = Number(expiresIn);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      return Math.floor(numericValue);
    }

    const match = /^(\d+)\s*([smhdw])$/i.exec(expiresIn.trim());
    if (!match) {
      return 900;
    }

    const value = Number(match[1] || 0);
    const unit = (match[2] || '').toLowerCase();
    const unitMap: Record<string, number> = {
      s: 1,
      m: 60,
      h: 60 * 60,
      d: 60 * 60 * 24,
      w: 60 * 60 * 24 * 7,
    };

    const multiplier = unitMap[unit];
    if (!multiplier) {
      return 900;
    }

    return value * multiplier;
  }
}

export const authService = new AuthService();
