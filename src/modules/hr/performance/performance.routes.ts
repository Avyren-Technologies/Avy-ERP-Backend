import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { performanceController as controller } from './performance.controller';

const router = Router();

// ── Appraisal Cycles ───────────────────────────────────────────────
router.get('/appraisal-cycles', requirePermissions(['hr:read']), controller.listCycles);
router.post('/appraisal-cycles', requirePermissions(['hr:create']), controller.createCycle);
router.get('/appraisal-cycles/:id', requirePermissions(['hr:read']), controller.getCycle);
router.patch('/appraisal-cycles/:id', requirePermissions(['hr:update']), controller.updateCycle);
router.delete('/appraisal-cycles/:id', requirePermissions(['hr:delete']), controller.deleteCycle);

// ── Cycle Lifecycle ────────────────────────────────────────────────
router.patch('/appraisal-cycles/:id/activate', requirePermissions(['hr:update']), controller.activateCycle);
router.patch('/appraisal-cycles/:id/close-review', requirePermissions(['hr:update']), controller.closeReviewWindow);
router.patch('/appraisal-cycles/:id/start-calibration', requirePermissions(['hr:update']), controller.startCalibration);
router.patch('/appraisal-cycles/:id/publish-ratings', requirePermissions(['hr:update']), controller.publishRatings);
router.patch('/appraisal-cycles/:id/close', requirePermissions(['hr:update']), controller.closeCycle);

// ── Appraisal Entries ──────────────────────────────────────────────
router.get('/appraisal-cycles/:cycleId/entries', requirePermissions(['hr:read']), controller.listEntries);
router.get('/appraisal-cycles/:cycleId/calibration', requirePermissions(['hr:read']), controller.getCalibrationView);
router.post('/appraisal-entries', requirePermissions(['hr:create']), controller.createEntry);
router.get('/appraisal-entries/:id', requirePermissions(['hr:read']), controller.getEntry);
router.patch('/appraisal-entries/:id/self-review', requirePermissions(['hr:update']), controller.selfReview);
router.patch('/appraisal-entries/:id/manager-review', requirePermissions(['hr:update']), controller.managerReview);
router.patch('/appraisal-entries/:id/publish', requirePermissions(['hr:update']), controller.publishEntry);

// ── Goals ──────────────────────────────────────────────────────────
router.get('/goals', requirePermissions(['hr:read']), controller.listGoals);
router.post('/goals', requirePermissions(['hr:create']), controller.createGoal);
router.get('/goals/cascade/:departmentId', requirePermissions(['hr:read']), controller.getGoalCascade);
router.get('/goals/:id', requirePermissions(['hr:read']), controller.getGoal);
router.patch('/goals/:id', requirePermissions(['hr:update']), controller.updateGoal);
router.delete('/goals/:id', requirePermissions(['hr:delete']), controller.deleteGoal);

// ── 360 Feedback ───────────────────────────────────────────────────
router.get('/appraisal-cycles/:cycleId/feedback', requirePermissions(['hr:read']), controller.listFeedback);
router.get('/feedback360/report/:employeeId/:cycleId', requirePermissions(['hr:read']), controller.getAggregatedFeedbackReport);
router.post('/feedback360', requirePermissions(['hr:create']), controller.createFeedback);
router.get('/feedback360/:id', requirePermissions(['hr:read']), controller.getFeedback);
router.patch('/feedback360/:id', requirePermissions(['hr:update']), controller.updateFeedback);
router.delete('/feedback360/:id', requirePermissions(['hr:delete']), controller.deleteFeedback);
router.patch('/feedback360/:id/submit', requirePermissions(['hr:update']), controller.submitFeedback);

// ── Skill Library ──────────────────────────────────────────────────
router.get('/skills', requirePermissions(['hr:read']), controller.listSkills);
router.post('/skills', requirePermissions(['hr:create']), controller.createSkill);
router.get('/skills/:id', requirePermissions(['hr:read']), controller.getSkill);
router.patch('/skills/:id', requirePermissions(['hr:update']), controller.updateSkill);
router.delete('/skills/:id', requirePermissions(['hr:delete']), controller.deleteSkill);

// ── Skill Mappings ─────────────────────────────────────────────────
router.get('/skill-mappings', requirePermissions(['hr:read']), controller.listSkillMappings);
router.post('/skill-mappings', requirePermissions(['hr:create']), controller.createSkillMapping);
router.get('/skill-mappings/gap-analysis/:employeeId', requirePermissions(['hr:read']), controller.getGapAnalysis);
router.get('/skill-mappings/:id', requirePermissions(['hr:read']), controller.getSkillMapping);
router.patch('/skill-mappings/:id', requirePermissions(['hr:update']), controller.updateSkillMapping);
router.delete('/skill-mappings/:id', requirePermissions(['hr:delete']), controller.deleteSkillMapping);

// ── Succession Plans ───────────────────────────────────────────────
router.get('/succession-plans', requirePermissions(['hr:read']), controller.listSuccessionPlans);
router.get('/succession-plans/nine-box', requirePermissions(['hr:read']), controller.getNineBox);
router.get('/succession-plans/bench-strength', requirePermissions(['hr:read']), controller.getBenchStrength);
router.post('/succession-plans', requirePermissions(['hr:create']), controller.createSuccessionPlan);
router.get('/succession-plans/:id', requirePermissions(['hr:read']), controller.getSuccessionPlan);
router.patch('/succession-plans/:id', requirePermissions(['hr:update']), controller.updateSuccessionPlan);
router.delete('/succession-plans/:id', requirePermissions(['hr:delete']), controller.deleteSuccessionPlan);

// ── Dashboard ──────────────────────────────────────────────────────
router.get('/performance-dashboard', requirePermissions(['hr:read']), controller.getDashboard);

export { router as performanceRoutes };
