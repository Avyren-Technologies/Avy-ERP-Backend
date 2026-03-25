import { Router } from 'express';
import { requirePermissions } from '../../middleware/auth.middleware';
import { featureToggleController } from './feature-toggle.controller';

const router = Router();

// Get the feature toggle catalogue (all available features)
router.get('/catalogue', requirePermissions(['user:read']), featureToggleController.getCatalogue);

// Get feature toggles (for self or another user)
router.get('/', requirePermissions(['user:read']), featureToggleController.getToggles);

// Set feature toggles for a specific user
router.put('/user/:userId', requirePermissions(['user:update']), featureToggleController.setToggles);

export { router as featureToggleRoutes };
