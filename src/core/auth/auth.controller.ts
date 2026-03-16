import { Request, Response } from 'express';
import { env } from '../../config/env';
import { authService } from './auth.service';
import { AuthError } from '../../shared/errors';
import { validateLogin, validateRegister, validateRefreshToken, validateChangePassword, validateForgotPassword, validateVerifyResetCode, validateResetPassword } from '../../shared/validators';
import { createSuccessResponse } from '../../shared/utils';
import { asyncHandler } from '../../middleware/error.middleware';

export class AuthController {
  // Login
  login = asyncHandler(async (req: Request, res: Response) => {
    const loginData = validateLogin(req.body);
    const result = await authService.login(loginData);

    res.json(createSuccessResponse(result, 'Login successful'));
  });

  // Register
  register = asyncHandler(async (req: Request, res: Response) => {
    const registerData = validateRegister(req.body);
    const result = await authService.register(registerData);

    res.status(201).json(createSuccessResponse(result, 'Registration successful'));
  });

  // Refresh token
  refreshToken = asyncHandler(async (req: Request, res: Response) => {
    const refreshData = validateRefreshToken(req.body);
    const tokens = await authService.refreshToken(refreshData);

    res.json(createSuccessResponse({ tokens }, 'Token refreshed successfully'));
  });

  // Change password
  changePassword = asyncHandler(async (req: Request, res: Response) => {
    const passwordData = validateChangePassword(req.body);
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

    await authService.logout(req.user!.id, token);

    res.json(createSuccessResponse(null, 'Logout successful'));
  });

  // Forgot password
  forgotPassword = asyncHandler(async (req: Request, res: Response) => {
    const data = validateForgotPassword(req.body);
    await authService.forgotPassword(data);

    // Always return success to prevent email enumeration
    res.json(createSuccessResponse(null, 'If an account exists with this email, a reset code has been sent'));
  });

  // Verify reset code
  verifyResetCode = asyncHandler(async (req: Request, res: Response) => {
    const data = validateVerifyResetCode(req.body);
    await authService.verifyResetCode(data);

    res.json(createSuccessResponse(null, 'Reset code verified successfully'));
  });

  // Reset password
  resetPassword = asyncHandler(async (req: Request, res: Response) => {
    const data = validateResetPassword(req.body);
    await authService.resetPassword(data);

    res.json(createSuccessResponse(null, 'Password reset successful'));
  });

  // Get current user profile
  getProfile = asyncHandler(async (req: Request, res: Response) => {
    const user = req.user!;

    res.json(createSuccessResponse({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.roleId,
        permissions: user.permissions,
        tenantId: user.tenantId,
        companyId: user.companyId,
      },
    }));
  });
}

export const authController = new AuthController();