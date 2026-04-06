import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { trainingMaterialController as controller } from './training-material.controller';

const router = Router();

// ═══════════════════════════════════════════════════════════════════
// TRAINING MATERIALS (nested under training catalogue)
// ═══════════════════════════════════════════════════════════════════
router.get('/training-catalogues/:trainingId/materials', requirePermissions(['training:read', 'hr:read']), controller.listMaterials);
router.post('/training-catalogues/:trainingId/materials', requirePermissions(['training:create', 'hr:create']), controller.createMaterial);
router.patch('/training-materials/:id', requirePermissions(['training:update', 'hr:update']), controller.updateMaterial);
router.delete('/training-materials/:id', requirePermissions(['training:delete', 'hr:delete']), controller.deleteMaterial);

export { router as trainingMaterialRoutes };
