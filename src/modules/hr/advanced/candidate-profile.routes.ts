import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { candidateProfileController as controller } from './candidate-profile.controller';

const router = Router();

// ═══════════════════════════════════════════════════════════════════
// CANDIDATE EDUCATION
// ═══════════════════════════════════════════════════════════════════
router.get('/candidates/:candidateId/education', requirePermissions(['recruitment:read', 'hr:read']), controller.listEducation);
router.post('/candidates/:candidateId/education', requirePermissions(['recruitment:create', 'hr:create']), controller.createEducation);
router.patch('/candidate-education/:id', requirePermissions(['recruitment:update', 'hr:update']), controller.updateEducation);
router.delete('/candidate-education/:id', requirePermissions(['recruitment:delete', 'hr:delete']), controller.deleteEducation);

// ═══════════════════════════════════════════════════════════════════
// CANDIDATE EXPERIENCE
// ═══════════════════════════════════════════════════════════════════
router.get('/candidates/:candidateId/experience', requirePermissions(['recruitment:read', 'hr:read']), controller.listExperience);
router.post('/candidates/:candidateId/experience', requirePermissions(['recruitment:create', 'hr:create']), controller.createExperience);
router.patch('/candidate-experience/:id', requirePermissions(['recruitment:update', 'hr:update']), controller.updateExperience);
router.delete('/candidate-experience/:id', requirePermissions(['recruitment:delete', 'hr:delete']), controller.deleteExperience);

// ═══════════════════════════════════════════════════════════════════
// CANDIDATE DOCUMENTS
// ═══════════════════════════════════════════════════════════════════
router.get('/candidates/:candidateId/documents', requirePermissions(['recruitment:read', 'hr:read']), controller.listDocuments);
router.post('/candidates/:candidateId/documents', requirePermissions(['recruitment:create', 'hr:create']), controller.createDocument);
router.delete('/candidate-documents/:id', requirePermissions(['recruitment:delete', 'hr:delete']), controller.deleteDocument);

export { router as candidateProfileRoutes };
