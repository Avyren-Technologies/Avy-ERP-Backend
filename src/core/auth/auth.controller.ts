import { Request, Response } from 'express';
import { env } from '../../config/env';
import { authService } from './auth.service';
import { AuthError, ApiError } from '../../shared/errors';
import { validateLogin, validateRegister, validateRefreshToken, validateChangePassword, validateForgotPassword, validateVerifyResetCode, validateResetPassword } from '../../shared/validators';
import { createSuccessResponse } from '../../shared/utils';
import type { LoginRequest, RegisterRequest, RefreshTokenRequest, ChangePasswordRequest, ForgotPasswordRequest, VerifyResetCodeRequest, ResetPasswordRequest } from './auth.types';
import { asyncHandler } from '../../middleware/error.middleware';
import { platformPrisma } from '../../config/database';
import { TenantStatus } from '@prisma/client';
import jwt from 'jsonwebtoken';

/** Subdomain login branding only for tenants that may use the app (aligned with tenant middleware). */
const TENANT_BRANDING_ALLOWED = new Set<TenantStatus>([TenantStatus.ACTIVE, TenantStatus.TRIAL]);

export class AuthController {
  /** Extract userId from an MFA token (setup or challenge), returns null if invalid. */
  private async resolveUserIdFromMfaToken(mfaToken: string | undefined, expectedPurpose: string): Promise<string | null> {
    if (!mfaToken) return null;
    try {
      const decoded = jwt.verify(mfaToken, env.JWT_SECRET) as { userId: string; purpose: string };
      if (decoded.purpose !== expectedPurpose) return null;
      return decoded.userId;
    } catch {
      return null;
    }
  }

  // Login
  login = asyncHandler(async (req: Request, res: Response) => {
    const loginData = validateLogin(req.body) as LoginRequest;
    (loginData as any).deviceInfo = req.headers['x-device-info'] || 'web';
    (loginData as any).ipAddress = req.ip || req.socket.remoteAddress;
    const result = await authService.login(loginData);

    const message = result && 'mfaRequired' in result ? 'MFA verification required' : 'Login successful';
    res.json(createSuccessResponse(result, message));
  });

  // Register
  register = asyncHandler(async (req: Request, res: Response) => {
    const registerData = validateRegister(req.body) as RegisterRequest;
    const result = await authService.register(registerData);

    res.status(201).json(createSuccessResponse(result, 'Registration successful'));
  });

  // Refresh token
  refreshToken = asyncHandler(async (req: Request, res: Response) => {
    const refreshData = validateRefreshToken(req.body) as RefreshTokenRequest;
    const tokens = await authService.refreshToken(refreshData);

    res.json(createSuccessResponse({ tokens }, 'Token refreshed successfully'));
  });

  // Change password
  changePassword = asyncHandler(async (req: Request, res: Response) => {
    const passwordData = validateChangePassword(req.body) as ChangePasswordRequest;
    await authService.changePassword(req.user!.id, passwordData);

    res.json(createSuccessResponse(null, 'Password changed successfully'));
  });

  // Logout
  logout = asyncHandler(async (req: Request, res: Response) => {
    const headerToken = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.substring(7)
      : null;
    const cookieToken = req.cookies?.[env.JWT_COOKIE_NAME] as string | undefined;
    const token = headerToken || cookieToken;

    if (!token) {
      throw AuthError.missingToken();
    }

    // Accept optional refreshToken in body for proper session cleanup
    const refreshToken = req.body?.refreshToken as string | undefined;
    await authService.logout(req.user!.id, token, refreshToken);

    res.json(createSuccessResponse(null, 'Logout successful'));
  });

  // Forgot password
  forgotPassword = asyncHandler(async (req: Request, res: Response) => {
    const data = validateForgotPassword(req.body) as ForgotPasswordRequest;
    await authService.forgotPassword(data);

    // Always return success to prevent email enumeration
    res.json(createSuccessResponse(null, 'If an account exists with this email, a reset code has been sent'));
  });

  // Verify reset code
  verifyResetCode = asyncHandler(async (req: Request, res: Response) => {
    const data = validateVerifyResetCode(req.body) as VerifyResetCodeRequest;
    await authService.verifyResetCode(data);

    res.json(createSuccessResponse(null, 'Reset code verified successfully'));
  });

  // Reset password
  resetPassword = asyncHandler(async (req: Request, res: Response) => {
    const data = validateResetPassword(req.body) as ResetPasswordRequest;
    await authService.resetPassword(data);

    res.json(createSuccessResponse(null, 'Password reset successful'));
  });

  // Get current user profile
  getProfile = asyncHandler(async (req: Request, res: Response) => {
    const user = req.user!;
    let roleName: string | null = null;

    const [tenantUserRow, mfaRow] = await Promise.all([
      user.tenantId
        ? platformPrisma.tenantUser.findUnique({
            where: {
              userId_tenantId: {
                userId: user.id,
                tenantId: user.tenantId,
              },
            },
            select: {
              role: {
                select: { name: true },
              },
            },
          })
        : Promise.resolve(null),
      platformPrisma.user.findUnique({
        where: { id: user.id },
        select: { mfaEnabled: true },
      }),
    ]);

    if (tenantUserRow) {
      roleName = tenantUserRow.role?.name ?? null;
    }

    res.json(createSuccessResponse({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.roleId,
        roleName,
        permissions: user.permissions,
        tenantId: user.tenantId,
        companyId: user.companyId,
        mfaEnabled: mfaRow?.mfaEnabled ?? false,
      },
    }));
  });

  // Security settings — returns session timeout and biometric settings for ANY authenticated user
  // No permission check needed (used by session timeout hook and biometric login)
  getSecuritySettings = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      // Super admin — return defaults
      res.json(createSuccessResponse({
        sessionTimeoutMinutes: 30,
        biometricLoginEnabled: false,
        mfaRequired: false,
      }));
      return;
    }

    const { getCachedSystemControls } = await import('../../shared/utils/config-cache');
    const controls = await getCachedSystemControls(companyId);
    res.json(createSuccessResponse({
      sessionTimeoutMinutes: controls.sessionTimeoutMinutes,
      biometricLoginEnabled: controls.biometricLoginEnabled,
      mfaRequired: controls.mfaRequired,
    }));
  });

  // Verify MFA
  verifyMfa = asyncHandler(async (req: Request, res: Response) => {
    const { mfaToken, code } = req.body;
    if (!mfaToken || !code) throw ApiError.badRequest('MFA token and code are required');

    const deviceInfo = req.headers['x-device-info'] as string | undefined;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const result = await authService.verifyMfa({ mfaToken, code }, deviceInfo, ipAddress);
    res.json(createSuccessResponse(result, 'MFA verified'));
  });

  // Setup MFA — accepts either auth token OR mfaToken (for forced setup flow)
  setupMfa = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id ?? await this.resolveUserIdFromMfaToken(req.body?.mfaToken, 'mfa-setup');
    if (!userId) throw ApiError.badRequest('Authentication or MFA setup token required');
    const result = await authService.setupMfa(userId);
    res.json(createSuccessResponse(result, 'MFA setup initiated'));
  });

  // Confirm MFA — accepts either auth token OR mfaToken (for forced setup flow)
  // When using mfaToken: also returns full auth tokens (completes login)
  confirmMfa = asyncHandler(async (req: Request, res: Response) => {
    const { code, mfaToken } = req.body;
    if (!code) throw ApiError.badRequest('TOTP code is required');

    // If mfaToken is provided, this is the forced-setup flow — confirm + complete login
    if (mfaToken) {
      const deviceInfo = req.headers['x-device-info'] as string | undefined;
      const ipAddress = req.ip || req.socket.remoteAddress;
      const result = await authService.confirmMfaAndLogin(mfaToken, code, deviceInfo, ipAddress);
      res.json(createSuccessResponse(result, 'MFA enabled and login complete'));
      return;
    }

    // Normal flow — authenticated user enabling MFA from settings
    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('Authentication required');
    await authService.confirmMfa(userId, code);
    res.json(createSuccessResponse(null, 'MFA enabled successfully'));
  });

  /** GET /auth/tenant-branding?slug=<slug> — Public endpoint for subdomain login branding */
  tenantBranding = asyncHandler(async (req: Request, res: Response) => {
    const slug = req.query.slug as string;
    if (!slug) {
      return res.json(createSuccessResponse({ exists: false }));
    }

    const tenant = await platformPrisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        status: true,
        company: {
          select: {
            displayName: true,
            name: true,
            logoUrl: true,
          },
        },
      },
    });

    // Generic response for invalid slug or non-operational tenant (prevents enumeration + no branding leak)
    if (!tenant || !TENANT_BRANDING_ALLOWED.has(tenant.status)) {
      return res.json(createSuccessResponse({ exists: false }));
    }

    return res.json(createSuccessResponse({
      exists: true,
      companyName: tenant.company.displayName || tenant.company.name,
      logoUrl: tenant.company.logoUrl,
    }));
  });

  // Disable MFA
  disableMfa = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('Authentication required');
    const { password } = req.body;
    if (!password) throw ApiError.badRequest('Password is required to disable MFA');
    await authService.disableMfa(userId, password);
    res.json(createSuccessResponse(null, 'MFA disabled successfully'));
  });
}

export const authController = new AuthController();