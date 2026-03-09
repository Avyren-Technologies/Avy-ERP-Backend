import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { platformPrisma } from '../../config/database';
import { cacheRedis } from '../../config/redis';
import { AuthError } from '../../shared/errors';
import { hashPassword, comparePassword, generateId, createUserCacheKey } from '../../shared/utils';
import { logger } from '../../config/logger';
import {
  LoginRequest,
  RegisterRequest,
  RefreshTokenRequest,
  ChangePasswordRequest,
  AuthResponse,
  JWTPayload,
  TokenPair
} from './auth.types';

export class AuthService {
  // Login user
  async login(loginData: LoginRequest): Promise<AuthResponse> {
    const { email, password } = loginData;

    // Find user
    const user = await platformPrisma.user.findUnique({
      where: { email },
      include: { company: true },
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

    // Generate tokens
    const tokens = await this.generateTokens({
      userId: user.id,
      email: user.email,
      tenantId: user.company?.tenant?.id,
      companyId: user.companyId,
      roleId: user.role,
      permissions: await this.getUserPermissions(user.id),
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
      permissions: await this.getUserPermissions(user.id),
      isActive: user.isActive,
    });

    logger.info(`User logged in: ${user.email}`);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        companyId: user.companyId,
        tenantId: user.company?.tenant?.id,
      },
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
            phone: phone || '',
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
          billingCycle: 'MONTHLY',
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

    // Generate tokens
    const tokens = await this.generateTokens({
      userId: result.user.id,
      email: result.user.email,
      tenantId: result.tenant.id,
      companyId: result.company.id,
      roleId: result.user.role,
      permissions: await this.getUserPermissions(result.user.id),
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
      permissions: await this.getUserPermissions(result.user.id),
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
      const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as JWTPayload;

      // Check if refresh token is blacklisted
      const isBlacklisted = await cacheRedis.get(`refresh_blacklist:${refreshToken}`);
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

      // Blacklist old refresh token
      await cacheRedis.setex(`refresh_blacklist:${refreshToken}`, 86400, 'true'); // 24 hours

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

  // Logout user
  async logout(userId: string, accessToken: string): Promise<void> {
    // Blacklist access token
    await cacheRedis.setex(`blacklist:${accessToken}`, 900, 'true'); // 15 minutes

    // Clear user cache
    await cacheRedis.del(createUserCacheKey(userId, 'auth'));

    logger.info(`User logged out: ${userId}`);
  }

  // Generate JWT tokens
  private async generateTokens(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<TokenPair> {
    const accessToken = jwt.sign(payload as object, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
    } as any);

    const refreshToken = jwt.sign(payload as object, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    } as any);

    // Calculate expiry time
    const expiresIn = env.JWT_EXPIRES_IN === '15m' ? 900 : 3600; // Default to 15 minutes or 1 hour

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
}

export const authService = new AuthService();