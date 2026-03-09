import { Router } from 'express';
import { requirePermissions } from '../../middleware/auth.middleware';

const router = Router();

// Feature toggle routes
router.get('/', requirePermissions(['user:read']), (req, res) => {
  res.json({ message: 'Feature toggles - TODO: Implement' });
});

router.put('/user/:userId', requirePermissions(['user:update']), (req, res) => {
  res.json({ message: 'Update user feature toggles - TODO: Implement' });
});

export { router as featureToggleRoutes };