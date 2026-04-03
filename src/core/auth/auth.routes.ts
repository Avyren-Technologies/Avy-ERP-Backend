import { Router } from 'express';
import { authController } from './auth.controller';
import { authMiddleware } from '../../middleware/auth.middleware';

const router = Router();

// Public routes
router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/refresh-token', authController.refreshToken);
router.post('/forgot-password', authController.forgotPassword);
router.post('/verify-reset-code', authController.verifyResetCode);
router.post('/reset-password', authController.resetPassword);

// MFA public routes (user hasn't completed auth yet — uses mfaToken for auth)
router.post('/mfa/verify', authController.verifyMfa);

// MFA setup/confirm — work with EITHER Bearer token OR mfaToken (forced setup flow)
// Optional auth: if Bearer token is present, req.user is populated; otherwise req.user is null
// and the controller falls back to mfaToken-based auth.
router.post('/mfa/setup', authMiddleware({ optional: true }), authController.setupMfa);
router.post('/mfa/confirm', authMiddleware({ optional: true }), authController.confirmMfa);

// Public tenant branding (for subdomain login pages)
router.get('/tenant-branding', authController.tenantBranding);

// Protected routes
router.use(authMiddleware());

// MFA management (authenticated only)
router.post('/mfa/disable', authController.disableMfa);

router.post('/change-password', authController.changePassword);
router.post('/logout', authController.logout);
router.get('/profile', authController.getProfile);
router.get('/security-settings', authController.getSecuritySettings);

export { router as authRoutes };