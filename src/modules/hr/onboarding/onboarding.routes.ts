import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { onboardingController as controller } from './onboarding.controller';

const router = Router();

// ── Onboarding Templates ──────────────────────────────────────────────
router.get('/onboarding/templates', requirePermissions(['hr:read']), controller.listTemplates);
router.post('/onboarding/templates', requirePermissions(['hr:create']), controller.createTemplate);
router.get('/onboarding/templates/:id', requirePermissions(['hr:read']), controller.getTemplate);
router.patch('/onboarding/templates/:id', requirePermissions(['hr:update']), controller.updateTemplate);
router.delete('/onboarding/templates/:id', requirePermissions(['hr:delete']), controller.deleteTemplate);

// ── Onboarding Tasks ──────────────────────────────────────────────────
router.post('/onboarding/tasks/generate', requirePermissions(['hr:create']), controller.generateTasks);
router.get('/onboarding/tasks', requirePermissions(['hr:read']), controller.listTasks);
router.patch('/onboarding/tasks/:id', requirePermissions(['hr:update']), controller.updateTask);

// ── Onboarding Progress ───────────────────────────────────────────────
router.get('/onboarding/progress/:employeeId', requirePermissions(['hr:read']), controller.getProgress);

export { router as onboardingRoutes };
