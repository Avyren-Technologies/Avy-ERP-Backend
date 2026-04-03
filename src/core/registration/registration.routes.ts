import { Router } from 'express';
import { registrationController as controller } from './registration.controller';

// ── Public Routes (mounted under /auth) ─────────────────────────────
const registrationPublicRoutes = Router();
registrationPublicRoutes.post('/register-company', controller.submitRegistration);

// ── Platform / Super Admin Routes (mounted under /platform/registrations) ──
const registrationPlatformRoutes = Router();
registrationPlatformRoutes.get('/', controller.listRegistrations);
registrationPlatformRoutes.get('/:id', controller.getRegistration);
registrationPlatformRoutes.patch('/:id', controller.updateRegistration);

export { registrationPublicRoutes, registrationPlatformRoutes };
