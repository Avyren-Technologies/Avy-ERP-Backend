import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { advancedHRController as controller } from './advanced.controller';

const router = Router();

// ═══════════════════════════════════════════════════════════════════
// RECRUITMENT — Requisitions
// ═══════════════════════════════════════════════════════════════════
router.get('/requisitions', requirePermissions(['hr:read']), controller.listRequisitions);
router.post('/requisitions', requirePermissions(['hr:create']), controller.createRequisition);
router.get('/requisitions/:id', requirePermissions(['hr:read']), controller.getRequisition);
router.patch('/requisitions/:id', requirePermissions(['hr:update']), controller.updateRequisition);
router.patch('/requisitions/:id/status', requirePermissions(['hr:update']), controller.updateRequisitionStatus);
router.delete('/requisitions/:id', requirePermissions(['hr:delete']), controller.deleteRequisition);

// ═══════════════════════════════════════════════════════════════════
// RECRUITMENT — Candidates
// ═══════════════════════════════════════════════════════════════════
router.get('/candidates', requirePermissions(['hr:read']), controller.listCandidates);
router.post('/candidates', requirePermissions(['hr:create']), controller.createCandidate);
router.get('/candidates/:id', requirePermissions(['hr:read']), controller.getCandidate);
router.patch('/candidates/:id', requirePermissions(['hr:update']), controller.updateCandidate);
router.patch('/candidates/:id/stage', requirePermissions(['hr:update']), controller.advanceCandidateStage);
router.delete('/candidates/:id', requirePermissions(['hr:delete']), controller.deleteCandidate);

// ═══════════════════════════════════════════════════════════════════
// RECRUITMENT — Interviews
// ═══════════════════════════════════════════════════════════════════
router.get('/interviews', requirePermissions(['hr:read']), controller.listInterviews);
router.post('/interviews', requirePermissions(['hr:create']), controller.createInterview);
router.get('/interviews/:id', requirePermissions(['hr:read']), controller.getInterview);
router.patch('/interviews/:id', requirePermissions(['hr:update']), controller.updateInterview);
router.patch('/interviews/:id/complete', requirePermissions(['hr:update']), controller.completeInterview);
router.patch('/interviews/:id/cancel', requirePermissions(['hr:update']), controller.cancelInterview);
router.delete('/interviews/:id', requirePermissions(['hr:delete']), controller.deleteInterview);

// ── Recruitment Dashboard ────────────────────────────────────────
router.get('/recruitment-dashboard', requirePermissions(['hr:read']), controller.getRecruitmentDashboard);

// ═══════════════════════════════════════════════════════════════════
// TRAINING — Catalogue
// ═══════════════════════════════════════════════════════════════════
router.get('/training-catalogues', requirePermissions(['hr:read']), controller.listTrainingCatalogues);
router.post('/training-catalogues', requirePermissions(['hr:create']), controller.createTrainingCatalogue);
router.get('/training-catalogues/:id', requirePermissions(['hr:read']), controller.getTrainingCatalogue);
router.patch('/training-catalogues/:id', requirePermissions(['hr:update']), controller.updateTrainingCatalogue);
router.delete('/training-catalogues/:id', requirePermissions(['hr:delete']), controller.deleteTrainingCatalogue);

// ═══════════════════════════════════════════════════════════════════
// TRAINING — Nominations
// ═══════════════════════════════════════════════════════════════════
router.get('/training-nominations', requirePermissions(['hr:read']), controller.listTrainingNominations);
router.post('/training-nominations', requirePermissions(['hr:create']), controller.createTrainingNomination);
router.get('/training-nominations/:id', requirePermissions(['hr:read']), controller.getTrainingNomination);
router.patch('/training-nominations/:id', requirePermissions(['hr:update']), controller.updateTrainingNomination);
router.patch('/training-nominations/:id/complete', requirePermissions(['hr:update']), controller.completeTrainingNomination);
router.delete('/training-nominations/:id', requirePermissions(['hr:delete']), controller.deleteTrainingNomination);

// ── Training Dashboard ──────────────────────────────────────────
router.get('/training-dashboard', requirePermissions(['hr:read']), controller.getTrainingDashboard);

// ═══════════════════════════════════════════════════════════════════
// ASSETS — Categories
// ═══════════════════════════════════════════════════════════════════
router.get('/asset-categories', requirePermissions(['hr:read']), controller.listAssetCategories);
router.post('/asset-categories', requirePermissions(['hr:create']), controller.createAssetCategory);
router.get('/asset-categories/:id', requirePermissions(['hr:read']), controller.getAssetCategory);
router.patch('/asset-categories/:id', requirePermissions(['hr:update']), controller.updateAssetCategory);
router.delete('/asset-categories/:id', requirePermissions(['hr:delete']), controller.deleteAssetCategory);

// ═══════════════════════════════════════════════════════════════════
// ASSETS — Assets
// ═══════════════════════════════════════════════════════════════════
router.get('/assets', requirePermissions(['hr:read']), controller.listAssets);
router.post('/assets', requirePermissions(['hr:create']), controller.createAsset);
router.get('/assets/:id', requirePermissions(['hr:read']), controller.getAsset);
router.patch('/assets/:id', requirePermissions(['hr:update']), controller.updateAsset);
router.delete('/assets/:id', requirePermissions(['hr:delete']), controller.deleteAsset);

// ═══════════════════════════════════════════════════════════════════
// ASSETS — Assignments
// ═══════════════════════════════════════════════════════════════════
router.get('/asset-assignments', requirePermissions(['hr:read']), controller.listAssetAssignments);
router.post('/asset-assignments', requirePermissions(['hr:create']), controller.createAssetAssignment);
router.patch('/asset-assignments/:id/return', requirePermissions(['hr:update']), controller.returnAssetAssignment);

// ═══════════════════════════════════════════════════════════════════
// EXPENSE CLAIMS
// ═══════════════════════════════════════════════════════════════════
router.get('/expense-claims', requirePermissions(['hr:read']), controller.listExpenseClaims);
router.post('/expense-claims', requirePermissions(['hr:create']), controller.createExpenseClaim);
router.get('/expense-claims/:id', requirePermissions(['hr:read']), controller.getExpenseClaim);
router.patch('/expense-claims/:id', requirePermissions(['hr:update']), controller.updateExpenseClaim);
router.patch('/expense-claims/:id/submit', requirePermissions(['hr:update']), controller.submitExpenseClaim);
router.patch('/expense-claims/:id/approve-reject', requirePermissions(['hr:update']), controller.approveRejectExpenseClaim);
router.delete('/expense-claims/:id', requirePermissions(['hr:delete']), controller.deleteExpenseClaim);

// ═══════════════════════════════════════════════════════════════════
// HR LETTER TEMPLATES
// ═══════════════════════════════════════════════════════════════════
router.get('/letter-templates', requirePermissions(['hr:read']), controller.listLetterTemplates);
router.post('/letter-templates', requirePermissions(['hr:create']), controller.createLetterTemplate);
router.get('/letter-templates/:id', requirePermissions(['hr:read']), controller.getLetterTemplate);
router.patch('/letter-templates/:id', requirePermissions(['hr:update']), controller.updateLetterTemplate);
router.delete('/letter-templates/:id', requirePermissions(['hr:delete']), controller.deleteLetterTemplate);

// ═══════════════════════════════════════════════════════════════════
// HR LETTERS
// ═══════════════════════════════════════════════════════════════════
router.get('/hr-letters', requirePermissions(['hr:read']), controller.listLetters);
router.post('/hr-letters', requirePermissions(['hr:create']), controller.createLetter);
router.get('/hr-letters/:id', requirePermissions(['hr:read']), controller.getLetter);
router.delete('/hr-letters/:id', requirePermissions(['hr:delete']), controller.deleteLetter);

// ═══════════════════════════════════════════════════════════════════
// GRIEVANCE — Categories
// ═══════════════════════════════════════════════════════════════════
router.get('/grievance-categories', requirePermissions(['hr:read']), controller.listGrievanceCategories);
router.post('/grievance-categories', requirePermissions(['hr:create']), controller.createGrievanceCategory);
router.get('/grievance-categories/:id', requirePermissions(['hr:read']), controller.getGrievanceCategory);
router.patch('/grievance-categories/:id', requirePermissions(['hr:update']), controller.updateGrievanceCategory);
router.delete('/grievance-categories/:id', requirePermissions(['hr:delete']), controller.deleteGrievanceCategory);

// ═══════════════════════════════════════════════════════════════════
// GRIEVANCE — Cases
// ═══════════════════════════════════════════════════════════════════
router.get('/grievance-cases', requirePermissions(['hr:read']), controller.listGrievanceCases);
router.post('/grievance-cases', requirePermissions(['hr:create']), controller.createGrievanceCase);
router.get('/grievance-cases/:id', requirePermissions(['hr:read']), controller.getGrievanceCase);
router.patch('/grievance-cases/:id', requirePermissions(['hr:update']), controller.updateGrievanceCase);
router.patch('/grievance-cases/:id/resolve', requirePermissions(['hr:update']), controller.resolveGrievanceCase);
router.delete('/grievance-cases/:id', requirePermissions(['hr:delete']), controller.deleteGrievanceCase);

// ═══════════════════════════════════════════════════════════════════
// DISCIPLINARY ACTIONS
// ═══════════════════════════════════════════════════════════════════
router.get('/disciplinary-actions', requirePermissions(['hr:read']), controller.listDisciplinaryActions);
router.post('/disciplinary-actions', requirePermissions(['hr:create']), controller.createDisciplinaryAction);
router.get('/disciplinary-actions/:id', requirePermissions(['hr:read']), controller.getDisciplinaryAction);
router.patch('/disciplinary-actions/:id', requirePermissions(['hr:update']), controller.updateDisciplinaryAction);
router.delete('/disciplinary-actions/:id', requirePermissions(['hr:delete']), controller.deleteDisciplinaryAction);

// ═══════════════════════════════════════════════════════════════════
// BONUS BATCHES
// ═══════════════════════════════════════════════════════════════════
router.get('/bonus-batches', requirePermissions(['hr:read']), controller.listBonusBatches);
router.post('/bonus-batches', requirePermissions(['hr:create']), controller.createBonusBatch);
router.get('/bonus-batches/:id', requirePermissions(['hr:read']), controller.getBonusBatch);
router.patch('/bonus-batches/:id/approve', requirePermissions(['hr:update']), controller.approveBonusBatch);
router.post('/bonus-batches/:id/merge', requirePermissions(['hr:update']), controller.mergeBonusBatch);

// ═══════════════════════════════════════════════════════════════════
// E-SIGN INTEGRATION (ORA-7)
// ═══════════════════════════════════════════════════════════════════
router.get('/hr-letters/pending-esign', requirePermissions(['hr:read']), controller.listPendingESignLetters);
router.post('/hr-letters/esign-callback', controller.processESignCallback);
router.post('/hr-letters/:id/dispatch-esign', requirePermissions(['hr:update']), controller.dispatchESign);
router.get('/hr-letters/:id/esign-status', requirePermissions(['hr:read']), controller.getESignStatus);

// ═══════════════════════════════════════════════════════════════════
// PRODUCTION INCENTIVE (ORA-9)
// ═══════════════════════════════════════════════════════════════════
router.get('/production-incentives/configs', requirePermissions(['hr:read']), controller.listIncentiveConfigs);
router.post('/production-incentives/configs', requirePermissions(['hr:create']), controller.createIncentiveConfig);
router.get('/production-incentives/configs/:id', requirePermissions(['hr:read']), controller.getIncentiveConfig);
router.patch('/production-incentives/configs/:id', requirePermissions(['hr:update']), controller.updateIncentiveConfig);
router.delete('/production-incentives/configs/:id', requirePermissions(['hr:delete']), controller.deleteIncentiveConfig);
router.post('/production-incentives/configs/:id/compute', requirePermissions(['hr:create']), controller.computeIncentives);
router.post('/production-incentives/configs/:id/merge', requirePermissions(['hr:update']), controller.mergeIncentivesToPayroll);
router.get('/production-incentives/records', requirePermissions(['hr:read']), controller.listIncentiveRecords);

export { router as advancedRoutes };
