import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { trainingMaterialController as controller } from './training-material.controller';

const router = Router();

// ═══════════════════════════════════════════════════════════════════
// TRAINING MATERIALS (nested under training catalogue)
// ═══════════════════════════════════════════════════════════════════
router.get('/training-catalogues/:trainingId/materials', requirePermissions(['hr:read']), controller.listMaterials);
router.post('/training-catalogues/:trainingId/materials', requirePermissions(['hr:create']), controller.createMaterial);
router.patch('/training-materials/:id', requirePermissions(['hr:update']), controller.updateMaterial);
router.delete('/training-materials/:id', requirePermissions(['hr:delete']), controller.deleteMaterial);

export { router as trainingMaterialRoutes };
