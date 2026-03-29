import { Router } from 'express';
import { requirePermissions } from '../../middleware/auth.middleware';
import { rbacController } from './rbac.controller';

const router = Router();

// Role CRUD
router.get('/roles', requirePermissions(['role:read']), rbacController.listRoles);
router.get('/roles/:id', requirePermissions(['role:read']), rbacController.getRole);
router.post('/roles', requirePermissions(['role:create']), rbacController.createRole);
router.put('/roles/:id', requirePermissions(['role:update']), rbacController.updateRole);
router.patch('/roles/:id', requirePermissions(['role:update']), rbacController.updateRole);
router.delete('/roles/:id', requirePermissions(['role:delete']), rbacController.deleteRole);

// Role assignment
router.post('/roles/assign', requirePermissions(['role:update']), rbacController.assignRole);

// Permission catalogue & reference roles
router.get('/permissions', requirePermissions(['role:read']), rbacController.getPermissions);
router.get('/reference-roles', requirePermissions(['role:read']), rbacController.getReferenceRoles);

export { router as rbacRoutes };
