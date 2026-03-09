import { Request, Response } from 'express';
import { authService } from './auth.service';
import { validateLogin, validateRegister, validateRefreshToken, validateChangePassword } from '../../shared/validators';
import { createSuccessResponse } from '../../shared/utils';
import { asyncHandler } from '../../middleware/error.middleware';
import { blacklistToken } from '../../middleware/auth.middleware';

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
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      await authService.logout(req.user!.id, token);
    }

    res.json(createSuccessResponse(null, 'Logout successful'));
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