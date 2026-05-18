import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { partController } from './part.controller';

const router = Router();
const controller = partController;

// ── Component Types (must be before /:id to avoid route conflicts) ──
router.get('/component-types/list', requirePermissions(['masters.parts:read']), controller.listPartComponentTypes);
router.post('/component-types', requirePermissions(['masters.parts:create']), controller.createPartComponentType);
router.patch('/component-types/:id', requirePermissions(['masters.parts:update']), controller.updatePartComponentType);
router.delete('/component-types/:id', requirePermissions(['masters.parts:delete']), controller.deletePartComponentType);

// ── Part Categories (must be before /:id to avoid route conflicts) ──
router.get('/categories/list', requirePermissions(['masters.parts:read']), controller.listCategories);
router.post('/categories', requirePermissions(['masters.parts:create']), controller.createCategory);
router.patch('/categories/:id', requirePermissions(['masters.parts:update']), controller.updateCategory);
router.delete('/categories/:id', requirePermissions(['masters.parts:delete']), controller.deleteCategory);

// ── Product Models ──────────────────────────────────────────────────
router.get('/product-models/list', requirePermissions(['masters.parts:read']), controller.listProductModels);
router.post('/product-models', requirePermissions(['masters.parts:create']), controller.createProductModel);
router.patch('/product-models/:id', requirePermissions(['masters.parts:update']), controller.updateProductModel);
router.delete('/product-models/:id', requirePermissions(['masters.parts:delete']), controller.deleteProductModel);

// ── Units of Measure ────────────────────────────────────────────────
router.get('/uoms/list', requirePermissions(['masters.parts:read']), controller.listUoms);
router.post('/uoms', requirePermissions(['masters.parts:create']), controller.createUom);
router.patch('/uoms/:id', requirePermissions(['masters.parts:update']), controller.updateUom);
router.delete('/uoms/:id', requirePermissions(['masters.parts:delete']), controller.deleteUom);

// ── Parts ───────────────────────────────────────────────────────────
router.get('/', requirePermissions(['masters.parts:read']), controller.listParts);
router.post('/', requirePermissions(['masters.parts:create']), controller.createPart);
router.get('/:id', requirePermissions(['masters.parts:read']), controller.getPart);
router.patch('/:id', requirePermissions(['masters.parts:update']), controller.updatePart);
router.delete('/:id', requirePermissions(['masters.parts:delete']), controller.deletePart);

export { router as partRoutes };
