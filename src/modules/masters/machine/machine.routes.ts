import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { machineController } from './machine.controller';

const router = Router();
const controller = machineController;

// ── Machine Categories (must be before /:id to avoid route conflicts) ──
router.get('/categories/list', requirePermissions(['masters.machines:read']), controller.listCategories);
router.post('/categories', requirePermissions(['masters.machines:create']), controller.createCategory);
router.patch('/categories/:id', requirePermissions(['masters.machines:update']), controller.updateCategory);
router.delete('/categories/:id', requirePermissions(['masters.machines:delete']), controller.deleteCategory);

// ── Machine Types ──────────────────────────────────────────────────────
router.get('/types/list', requirePermissions(['masters.machines:read']), controller.listTypes);
router.post('/types', requirePermissions(['masters.machines:create']), controller.createType);
router.patch('/types/:id', requirePermissions(['masters.machines:update']), controller.updateType);
router.delete('/types/:id', requirePermissions(['masters.machines:delete']), controller.deleteType);

// ── Machine Zones ──────────────────────────────────────────────────────
router.get('/zones/list', requirePermissions(['masters.machines:read']), controller.listZones);
router.post('/zones', requirePermissions(['masters.machines:create']), controller.createZone);
router.patch('/zones/:id', requirePermissions(['masters.machines:update']), controller.updateZone);
router.delete('/zones/:id', requirePermissions(['masters.machines:delete']), controller.deleteZone);

// ── Machines ───────────────────────────────────────────────────────────
router.get('/', requirePermissions(['masters.machines:read']), controller.listMachines);
router.post('/', requirePermissions(['masters.machines:create']), controller.createMachine);
router.get('/:id', requirePermissions(['masters.machines:read']), controller.getMachine);
router.patch('/:id', requirePermissions(['masters.machines:update']), controller.updateMachine);
router.delete('/:id', requirePermissions(['masters.machines:delete']), controller.deleteMachine);

export { router as machineRoutes };
