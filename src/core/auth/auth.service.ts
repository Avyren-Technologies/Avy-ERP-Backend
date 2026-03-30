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
import { expandPermissionsWithInheritance, suppressByModules } from '../../shared/constants/permissions';
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
import { rbacService } from '../rbac/rbac.service';

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

    // Resolve employeeId: use the User.employeeId FK if present,
    // otherwise try to find an Employee whose officialEmail matches this user's email.
    let employeeId = user.employeeId ?? undefined;
    if (!employeeId && user.companyId) {
      const linkedEmployee = await platformPrisma.employee.findFirst({
        where: { companyId: user.companyId, officialEmail: user.email },
        select: { id: true },
      });
      if (linkedEmployee) {
        // Persist the link for future logins
        await platformPrisma.user.update({
          where: { id: user.id },
          data: { employeeId: linkedEmployee.id },
        });
        employeeId = linkedEmployee.id;
      }
    }

    const tenantId = user.company?.tenant?.id;

    // Fetch permissions dynamically from RBAC system, then expand + suppress
    const permissions = await this.getExpandedPermissions(user.id, tenantId, user.companyId);

    // Generate tokens
    const tokens = await this.generateTokens({
      userId: user.id,
      email: user.email,
      tenantId: tenantId ?? undefined,
      companyId: user.companyId ?? undefined,
      employeeId,
      roleId: user.role,
      permissions,
    });

    // Cache user data
    await this.cacheUserData(user.id, {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      tenantId,
      companyId: user.companyId,
      employeeId,
      roleId: user.role,
      permissions,
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
        permissions,
        ...(user.companyId ? { companyId: user.companyId } : {}),
        ...(tenantId ? { tenantId } : {}),
        ...(employeeId ? { employeeId } : {}),
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

      // Seed default RBAC roles for the new tenant
      const defaultRoleNames = ['General Manager', 'HR Personnel', 'Finance Team', 'Production Manager', 'Security Personnel'];
      const { REFERENCE_ROLE_PERMISSIONS } = await import('../../shared/constants/permissions');
      for (const roleName of defaultRoleNames) {
        const ref = REFERENCE_ROLE_PERMISSIONS[roleName];
        if (!ref) continue;
        await tx.role.create({
          data: {
            tenantId: tenant.id,
            name: roleName,
            description: ref.description,
            permissions: ref.permissions,
            isSystem: true,
          },
        });
      }

      // Create "Company Admin" system role with full access
      const companyAdminRole = await tx.role.create({
        data: {
          tenantId: tenant.id,
          name: 'Company Admin',
          description: 'Full company access — all modules and actions',
          permissions: [
            'company:*', 'hr:*', 'production:*', 'inventory:*', 'sales:*',
            'finance:*', 'maintenance:*', 'vendor:*', 'security:*', 'visitors:*',
            'masters:*', 'user:*', 'role:*', 'reports:*', 'audit:*',
          ],
          isSystem: true,
        },
      });

      // Create TenantUser bridge record for the registering user
      await tx.tenantUser.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          roleId: companyAdminRole.id,
        },
      });

      return { user, tenant, company };
    });

    // Fetch permissions dynamically from the new TenantUser→Role
    const permissions = await this.getUserPermissions(result.user.id, result.tenant.id);

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
        permissions,
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
        employeeId: decoded.employeeId || undefined,
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

  // Get user permissions from dynamic RBAC system
  private async getUserPermissions(userId: string, tenantId?: string): Promise<string[]> {
    const user = await platformPrisma.user.findUnique({
      where: { id: userId },
      include: { company: { include: { tenant: true } } },
    });

    if (!user) return [];

    // SUPER_ADMIN always gets wildcard — platform-level, not tenant-scoped
    if (user.role === 'SUPER_ADMIN') return ['*'];

    // Resolve tenantId if not provided
    const resolvedTenantId = tenantId || user.company?.tenant?.id;
    if (!resolvedTenantId) return [];

    // Fetch permissions from TenantUser→Role (with Redis caching inside rbacService)
    return rbacService.getUserPermissions(userId, resolvedTenantId);
  }

  /**
   * Get permissions with full expansion (inheritance) and module suppression.
   * Used at login time so the frontend receives the SAME permissions
   * that the auth middleware would compute on subsequent requests.
   */
  private async getExpandedPermissions(userId: string, tenantId?: string, companyId?: string | null): Promise<string[]> {
    const raw = await this.getUserPermissions(userId, tenantId);
    if (raw.includes('*')) return ['*'];

    // 1. Expand by inheritance
    const expanded = expandPermissionsWithInheritance(raw);

    // 2. Suppress by active company modules
    if (companyId) {
      const company = await platformPrisma.company.findUnique({
        where: { id: companyId },
        select: { selectedModuleIds: true },
      });
      const activeModuleIds: string[] = company?.selectedModuleIds
        ? (Array.isArray(company.selectedModuleIds)
          ? company.selectedModuleIds as string[]
          : JSON.parse(company.selectedModuleIds as string))
        : [];
      return suppressByModules(expanded, activeModuleIds);
    }

    return expanded;
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
