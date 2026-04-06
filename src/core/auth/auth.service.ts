import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import { env } from '../../config/env';
import { platformPrisma } from '../../config/database';
import { cacheRedis } from '../../config/redis';
import { AuthError, ApiError } from '../../shared/errors';
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
import type { MfaChallengeResponse, MfaSetupResponse, MfaVerifyRequest, LoginResult } from './auth.types';
import { sendPasswordResetCode } from '../../infrastructure/email/email.service';
import { rbacService } from '../rbac/rbac.service';

const JWT_ALGORITHM: jwt.Algorithm = 'HS256';

export class AuthService {
  // Login user
  async login(loginData: LoginRequest): Promise<LoginResult> {
    const { email: rawEmail, password } = loginData;
    const email = rawEmail.trim().toLowerCase();

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

    // ── Account Lock enforcement (via SystemControls) ──
    // Load security settings for the user's company (if any)
    let controls: { accountLockThreshold: number; accountLockDurationMinutes: number; mfaRequired: boolean } | null = null;
    if (user.companyId) {
      try {
        const { getCachedSystemControls } = await import('../../shared/utils/config-cache');
        controls = await getCachedSystemControls(user.companyId);
      } catch {
        // Non-fatal: if config is unavailable, skip lock enforcement
      }
    }

    // Check if account is currently locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMin = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new AuthError(
        `Account is locked due to too many failed attempts. Try again in ${remainingMin} minute(s).`,
        'ACCOUNT_LOCKED',
      );
    }

    // If lock expired, reset the lock fields
    if (user.lockedUntil && user.lockedUntil <= new Date()) {
      await platformPrisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      // Increment failed attempts and lock if threshold exceeded
      const newAttempts = (user.failedLoginAttempts ?? 0) + 1;
      const threshold = controls?.accountLockThreshold ?? 5;
      const lockDuration = controls?.accountLockDurationMinutes ?? 30;

      const updateData: any = { failedLoginAttempts: newAttempts };
      if (newAttempts >= threshold) {
        updateData.lockedUntil = new Date(Date.now() + lockDuration * 60 * 1000);
        logger.warn(`Account locked for ${email} after ${newAttempts} failed attempts (lock duration: ${lockDuration}m)`);
      }

      await platformPrisma.user.update({ where: { id: user.id }, data: updateData });
      throw AuthError.invalidCredentials();
    }

    // Login successful — reset failed attempts
    await platformPrisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date(), failedLoginAttempts: 0, lockedUntil: null },
    });

    // ── MFA enforcement ──
    // MFA is required if:
    //   (a) The user individually has MFA enabled (mfaEnabled + mfaSecret), OR
    //   (b) The company's SystemControls.mfaRequired is ON
    const companyMfaRequired = controls?.mfaRequired ?? false;
    const userMfaActive = user.mfaEnabled && !!user.mfaSecret;

    if (userMfaActive) {
      // User has MFA set up — challenge them with TOTP verification
      const mfaToken = jwt.sign(
        { userId: user.id, email: user.email, purpose: 'mfa-challenge' },
        env.JWT_SECRET,
        { expiresIn: '5m', algorithm: JWT_ALGORITHM } as any,
      );
      return { mfaRequired: true, mfaToken } as MfaChallengeResponse;
    }

    if (companyMfaRequired && !user.mfaEnabled) {
      // Company enforces MFA but user hasn't set it up yet.
      // Return a setup token — the frontend must redirect to MFA setup.
      // The user gets a temporary token that ONLY allows /auth/mfa/setup and /auth/mfa/confirm.
      const mfaSetupToken = jwt.sign(
        { userId: user.id, email: user.email, purpose: 'mfa-setup' },
        env.JWT_SECRET,
        { expiresIn: '10m', algorithm: JWT_ALGORITHM } as any,
      );
      logger.info(`User ${user.email} needs MFA setup (company policy enforced)`);
      return { mfaRequired: true, mfaSetupRequired: true, mfaToken: mfaSetupToken } as any;
    }

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

    // Track session + enforce max concurrent sessions
    const deviceInfo = (loginData as any).deviceInfo ?? 'web';
    const ipAddress = (loginData as any).ipAddress;
    await this.cleanExpiredSessions(user.id);
    await this.trackSession(user.id, tokens.refreshToken, user.companyId, deviceInfo, ipAddress);

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
            'company:*', 'hr:*', 'ess:*', 'production:*', 'inventory:*', 'sales:*',
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

    // Fetch permissions dynamically from the new TenantUser→Role, then expand + suppress
    const permissions = await this.getExpandedPermissions(result.user.id, result.tenant.id, result.company.id);

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

      // Validate session still exists (not revoked by concurrent session enforcement)
      const tokenHash = this.hashToken(refreshToken);
      const session = await platformPrisma.activeSession.findUnique({
        where: { refreshToken: tokenHash },
      });
      if (!session) {
        throw AuthError.invalidToken();
      }

      // Recompute permissions from DB (do not copy stale JWT claims — login used to cache empty perms)
      const user = await platformPrisma.user.findUnique({
        where: { id: decoded.userId },
        include: { company: { include: { tenant: true } } },
      });
      if (!user) {
        throw AuthError.invalidToken();
      }
      const tid = user.company?.tenant?.id;
      const permissions = await this.getExpandedPermissions(user.id, tid, user.companyId);

      const tokens = await this.generateTokens({
        userId: user.id,
        email: user.email,
        tenantId: tid ?? undefined,
        companyId: user.companyId ?? undefined,
        employeeId: user.employeeId ?? undefined,
        roleId: user.role,
        permissions,
      });

      await cacheRedis.del(createUserCacheKey(user.id, 'auth'));

      // Blacklist old refresh token for its full 7-day lifespan
      await cacheRedis.setex(createRefreshTokenBlacklistKey(refreshToken), 604800, 'true'); // 7 days

      // Rotate session to new refresh token
      const newTokenHash = this.hashToken(tokens.refreshToken);
      await platformPrisma.activeSession.update({
        where: { id: session.id },
        data: {
          refreshToken: newTokenHash,
          expiresAt: new Date(Date.now() + this.parseExpiresInToSeconds(env.JWT_REFRESH_EXPIRES_IN) * 1000),
          lastActiveAt: new Date(),
        },
      }).catch(() => {});

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

    // ── Enforce password policy from SystemControls ──
    if (user.companyId) {
      try {
        const { getCachedSystemControls } = await import('../../shared/utils/config-cache');
        const controls = await getCachedSystemControls(user.companyId);

        if (newPassword.length < controls.passwordMinLength) {
          throw ApiError.badRequest(`Password must be at least ${controls.passwordMinLength} characters`);
        }

        if (controls.passwordComplexity) {
          const hasUpper = /[A-Z]/.test(newPassword);
          const hasLower = /[a-z]/.test(newPassword);
          const hasDigit = /\d/.test(newPassword);
          const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);

          if (!hasUpper || !hasLower || !hasDigit || !hasSpecial) {
            throw ApiError.badRequest(
              'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
            );
          }
        }
      } catch (err) {
        // Re-throw ApiError (password validation), swallow config fetch errors
        if (err instanceof ApiError) throw err;
      }
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

    // ── Enforce password policy from SystemControls ──
    if (user.companyId) {
      try {
        const { getCachedSystemControls } = await import('../../shared/utils/config-cache');
        const controls = await getCachedSystemControls(user.companyId);

        if (newPassword.length < controls.passwordMinLength) {
          throw ApiError.badRequest(`Password must be at least ${controls.passwordMinLength} characters`);
        }

        if (controls.passwordComplexity) {
          const hasUpper = /[A-Z]/.test(newPassword);
          const hasLower = /[a-z]/.test(newPassword);
          const hasDigit = /\d/.test(newPassword);
          const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);

          if (!hasUpper || !hasLower || !hasDigit || !hasSpecial) {
            throw ApiError.badRequest(
              'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
            );
          }
        }
      } catch (err) {
        if (err instanceof ApiError) throw err;
      }
    }

    // Hash new password and update user
    const hashedPassword = await hashPassword(newPassword);
    await platformPrisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword, failedLoginAttempts: 0, lockedUntil: null },
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
  async logout(userId: string, accessToken: string, refreshToken?: string): Promise<void> {
    // Blacklist access token for its full 15-minute lifespan
    await cacheRedis.setex(createAccessTokenBlacklistKey(accessToken), 900, 'true'); // 15 minutes

    // Blacklist and remove session for the refresh token (if provided)
    if (refreshToken) {
      await cacheRedis.setex(createRefreshTokenBlacklistKey(refreshToken), 604800, 'true');
      await this.removeSessionByToken(refreshToken);
    }

    // Clear user auth cache
    await cacheRedis.del(createUserCacheKey(userId, 'auth'));

    // Clear all tenant-scoped permissions caches for this user using a pattern scan
    const permissionsPattern = createRedisPattern('rbac', `user:${userId}:tenant:*:permissions`);
    await this.deleteByPattern(permissionsPattern);

    // Clean expired sessions
    await this.cleanExpiredSessions(userId);

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

  /** SHA-256 hash of a token for safe DB storage. */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Create a session record and enforce maxConcurrentSessions.
   * When limit exceeded, oldest session is revoked.
   */
  private async trackSession(
    userId: string,
    refreshToken: string,
    companyId: string | null | undefined,
    deviceInfo?: string,
    ipAddress?: string,
  ): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + this.parseExpiresInToSeconds(env.JWT_REFRESH_EXPIRES_IN) * 1000);

    await platformPrisma.activeSession.create({
      data: {
        userId,
        refreshToken: tokenHash,
        expiresAt,
        ...(deviceInfo != null ? { deviceInfo } : {}),
        ...(ipAddress != null ? { ipAddress } : {}),
      },
    });

    if (!companyId) return; // super-admin has no company-level limits

    let maxSessions = 3;
    try {
      const { getCachedSystemControls } = await import('../../shared/utils/config-cache');
      const controls = await getCachedSystemControls(companyId);
      maxSessions = controls.maxConcurrentSessions;
    } catch {}

    const sessions = await platformPrisma.activeSession.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
    });

    if (sessions.length > maxSessions) {
      const toRevoke = sessions.slice(0, sessions.length - maxSessions);
      for (const s of toRevoke) {
        await platformPrisma.activeSession.delete({ where: { id: s.id } });
      }
      logger.info(`Revoked ${toRevoke.length} oldest session(s) for user ${userId} (limit: ${maxSessions})`);
    }
  }

  private async removeSessionByToken(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await platformPrisma.activeSession.deleteMany({ where: { refreshToken: tokenHash } }).catch(() => {});
  }

  private async cleanExpiredSessions(userId: string): Promise<void> {
    await platformPrisma.activeSession.deleteMany({
      where: { userId, expiresAt: { lte: new Date() } },
    }).catch(() => {});
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

    // Resolve tenantId
    const resolvedTenantId = tenantId || user.company?.tenant?.id;
    if (!resolvedTenantId) return [];

    // All company users (COMPANY_ADMIN and USER) get permissions from TenantUser→Role.
    // The "Company Admin" system role in the tenant has full permissions by default.
    // Regular users/employees get whatever permissions their assigned role has.
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
      let activeModuleIds: string[] = company?.selectedModuleIds
        ? (Array.isArray(company.selectedModuleIds)
          ? company.selectedModuleIds as string[]
          : JSON.parse(company.selectedModuleIds as string))
        : [];

      // Fallback: if company-level modules are empty, aggregate from locations
      if (activeModuleIds.length === 0) {
        const locations = await platformPrisma.location.findMany({
          where: { companyId },
          select: { moduleIds: true },
        });
        const locModules = locations.flatMap(l =>
          l.moduleIds
            ? (Array.isArray(l.moduleIds) ? l.moduleIds as string[] : JSON.parse(l.moduleIds as string))
            : [],
        );
        activeModuleIds = Array.from(new Set(locModules));
      }

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
  /** Verify TOTP code during MFA-challenged login. Returns full auth tokens. */
  async verifyMfa(data: MfaVerifyRequest, deviceInfo?: string, ipAddress?: string): Promise<AuthResponse> {
    let decoded: { userId: string; email: string; purpose: string };
    try {
      decoded = jwt.verify(data.mfaToken, env.JWT_SECRET, {
        algorithms: [JWT_ALGORITHM],
      }) as any;
    } catch {
      throw AuthError.invalidMfaCode();
    }

    if (decoded.purpose !== 'mfa-challenge') {
      throw AuthError.invalidMfaCode();
    }

    const user = await platformPrisma.user.findUnique({
      where: { id: decoded.userId },
      include: { company: { include: { tenant: true } } },
    });

    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      throw AuthError.invalidMfaCode();
    }

    const verifyResult = verifySync({ token: data.code, secret: user.mfaSecret });
    if (!verifyResult.valid) {
      throw AuthError.invalidMfaCode();
    }

    // MFA passed — generate tokens (same as normal login completion)
    const tenantId = user.company?.tenant?.id;
    let employeeId = user.employeeId ?? undefined;
    if (!employeeId && user.companyId) {
      const linked = await platformPrisma.employee.findFirst({
        where: { companyId: user.companyId, officialEmail: user.email },
        select: { id: true },
      });
      if (linked) {
        await platformPrisma.user.update({ where: { id: user.id }, data: { employeeId: linked.id } });
        employeeId = linked.id;
      }
    }

    const permissions = await this.getExpandedPermissions(user.id, tenantId, user.companyId);
    const tokens = await this.generateTokens({
      userId: user.id, email: user.email,
      tenantId: tenantId ?? undefined, companyId: user.companyId ?? undefined,
      employeeId, roleId: user.role, permissions,
    });

    await this.cacheUserData(user.id, {
      id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
      tenantId, companyId: user.companyId, employeeId, roleId: user.role, permissions, isActive: user.isActive,
    });

    await this.cleanExpiredSessions(user.id);
    await this.trackSession(user.id, tokens.refreshToken, user.companyId, deviceInfo, ipAddress);

    logger.info(`MFA verified for user: ${user.email}`);

    return {
      user: {
        id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
        role: user.role, permissions,
        ...(user.companyId ? { companyId: user.companyId } : {}),
        ...(tenantId ? { tenantId } : {}),
        ...(employeeId ? { employeeId } : {}),
      },
      tokens,
    };
  }

  async setupMfa(userId: string): Promise<MfaSetupResponse> {
    const user = await platformPrisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AuthError.invalidCredentials();
    if (user.mfaEnabled) throw AuthError.mfaAlreadyEnabled();

    const secret = generateSecret();
    const otpauthUrl = generateURI({ issuer: 'Avy ERP', label: user.email, secret });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    // Store secret temporarily (not confirmed yet — mfaEnabled stays false)
    await platformPrisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret },
    });

    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  async confirmMfa(userId: string, code: string): Promise<void> {
    const user = await platformPrisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfaSecret) throw AuthError.invalidMfaCode();
    if (user.mfaEnabled) throw AuthError.mfaAlreadyEnabled();

    const confirmResult = verifySync({ token: code, secret: user.mfaSecret });
    if (!confirmResult.valid) throw AuthError.invalidMfaCode();

    await platformPrisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });

    await cacheRedis.del(createUserCacheKey(userId, 'auth'));
    logger.info(`MFA enabled for user: ${user.email}`);
  }

  /**
   * Confirm MFA setup AND complete login — used during forced MFA setup flow.
   * The mfaToken is the setup token issued during login when company enforces MFA.
   */
  async confirmMfaAndLogin(mfaToken: string, code: string, deviceInfo?: string, ipAddress?: string): Promise<AuthResponse> {
    // Decode the setup token
    let decoded: { userId: string; email: string; purpose: string };
    try {
      decoded = jwt.verify(mfaToken, env.JWT_SECRET, {
        algorithms: [JWT_ALGORITHM],
      }) as any;
    } catch {
      throw AuthError.invalidMfaCode();
    }
    if (decoded.purpose !== 'mfa-setup') throw AuthError.invalidMfaCode();

    // Confirm MFA (enables it)
    await this.confirmMfa(decoded.userId, code);

    // Now complete login — same as verifyMfa flow
    const user = await platformPrisma.user.findUnique({
      where: { id: decoded.userId },
      include: { company: { include: { tenant: true } } },
    });
    if (!user) throw AuthError.invalidCredentials();

    const tenantId = user.company?.tenant?.id;
    let employeeId = user.employeeId ?? undefined;
    if (!employeeId && user.companyId) {
      const linked = await platformPrisma.employee.findFirst({
        where: { companyId: user.companyId, officialEmail: user.email },
        select: { id: true },
      });
      if (linked) {
        await platformPrisma.user.update({ where: { id: user.id }, data: { employeeId: linked.id } });
        employeeId = linked.id;
      }
    }

    const permissions = await this.getExpandedPermissions(user.id, tenantId, user.companyId);
    const tokens = await this.generateTokens({
      userId: user.id, email: user.email,
      tenantId: tenantId ?? undefined, companyId: user.companyId ?? undefined,
      employeeId, roleId: user.role, permissions,
    });

    await this.cacheUserData(user.id, {
      id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
      tenantId, companyId: user.companyId, employeeId, roleId: user.role, permissions, isActive: user.isActive,
    });

    await this.cleanExpiredSessions(user.id);
    await this.trackSession(user.id, tokens.refreshToken, user.companyId, deviceInfo, ipAddress);

    logger.info(`MFA setup confirmed and login completed for: ${user.email}`);

    return {
      user: {
        id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
        role: user.role, permissions,
        ...(user.companyId ? { companyId: user.companyId } : {}),
        ...(tenantId ? { tenantId } : {}),
        ...(employeeId ? { employeeId } : {}),
      },
      tokens,
    };
  }

  async disableMfa(userId: string, password: string): Promise<void> {
    const user = await platformPrisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AuthError.invalidCredentials();

    const isValid = await comparePassword(password, user.password);
    if (!isValid) throw AuthError.invalidCredentials();

    await platformPrisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null },
    });

    await cacheRedis.del(createUserCacheKey(userId, 'auth'));
    logger.info(`MFA disabled for user: ${user.email}`);
  }
}

export const authService = new AuthService();
