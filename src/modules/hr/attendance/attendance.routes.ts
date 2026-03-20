import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { attendanceController as controller } from './attendance.controller';

const router = Router();

// ── Attendance Records ────────────────────────────────────────────────
router.get('/attendance', requirePermissions(['hr:read']), controller.listRecords);
router.post('/attendance', requirePermissions(['hr:create']), controller.createRecord);
router.get('/attendance/summary', requirePermissions(['hr:read']), controller.getSummary);
router.get('/attendance/:id', requirePermissions(['hr:read']), controller.getRecord);
router.patch('/attendance/:id', requirePermissions(['hr:update']), controller.updateRecord);

// ── Attendance Rules ──────────────────────────────────────────────────
router.get('/attendance/rules', requirePermissions(['hr:read']), controller.getRules);
router.patch('/attendance/rules', requirePermissions(['hr:update']), controller.updateRules);

// ── Overrides / Regularization ────────────────────────────────────────
router.get('/attendance/overrides', requirePermissions(['hr:read']), controller.listOverrides);
router.post('/attendance/overrides', requirePermissions(['hr:create']), controller.createOverride);
router.patch('/attendance/overrides/:id', requirePermissions(['hr:update']), controller.processOverride);

// ── Holiday Calendar ──────────────────────────────────────────────────
router.get('/holidays', requirePermissions(['hr:read']), controller.listHolidays);
router.post('/holidays', requirePermissions(['hr:create']), controller.createHoliday);
router.post('/holidays/clone', requirePermissions(['hr:create']), controller.cloneHolidays);
router.patch('/holidays/:id', requirePermissions(['hr:update']), controller.updateHoliday);
router.delete('/holidays/:id', requirePermissions(['hr:delete']), controller.deleteHoliday);

// ── Rosters ───────────────────────────────────────────────────────────
router.get('/rosters', requirePermissions(['hr:read']), controller.listRosters);
router.post('/rosters', requirePermissions(['hr:create']), controller.createRoster);
router.patch('/rosters/:id', requirePermissions(['hr:update']), controller.updateRoster);
router.delete('/rosters/:id', requirePermissions(['hr:delete']), controller.deleteRoster);

// ── Overtime Rules ────────────────────────────────────────────────────
router.get('/overtime-rules', requirePermissions(['hr:read']), controller.getOvertimeRules);
router.patch('/overtime-rules', requirePermissions(['hr:update']), controller.updateOvertimeRules);

export { router as attendanceRoutes };
