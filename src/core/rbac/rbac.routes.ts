import { Router } from 'express';
import { requirePermissions } from '../../middleware/auth.middleware';

const router = Router();

// RBAC module routes
router.get('/roles', requirePermissions(['role:read']), (req, res) => {
  res.json({ message: 'Roles list - TODO: Implement' });
});

router.post('/roles', requirePermissions(['role:create']), (req, res) => {
  res.json({ message: 'Create role - TODO: Implement' });
});

router.get('/permissions', requirePermissions(['role:read']), (req, res) => {
  res.json({ message: 'Permissions list - TODO: Implement' });
});

export { router as rbacRoutes };