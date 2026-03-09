import { Router } from 'express';
import { requirePermissions } from '../../middleware/auth.middleware';

const router = Router();

// Company management routes
router.get('/', requirePermissions(['company:read']), (req, res) => {
  res.json({ message: 'Company list - TODO: Implement' });
});

router.get('/:id', requirePermissions(['company:read']), (req, res) => {
  res.json({ message: 'Get company - TODO: Implement' });
});

router.put('/:id', requirePermissions(['company:update']), (req, res) => {
  res.json({ message: 'Update company - TODO: Implement' });
});

export { router as companyRoutes };