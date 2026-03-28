import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { attendanceController as controller } from './attendance.controller';

const router = Router();

// ── Attendance Rules (must be before :id to avoid "rules" matching as an ID) ──
router.get('/attendance/rules', requirePermissions(['hr:read']), controller.getRules);
router.patch('/attendance/rules', requirePermissions(['hr:update']), controller.updateRules);

// ── Attendance Records ────────────────────────────────────────────────
router.get('/attendance', requirePermissions(['hr:read']), controller.listRecords);
router.post('/attendance', requirePermissions(['hr:create']), controller.createRecord);
router.get('/attendance/summary', requirePermissions(['hr:read']), controller.getSummary);
router.post('/attendance/populate-month', requirePermissions(['hr:create']), controller.populateMonth);

// ── Comp-Off Accrual (must be before :id) ────────────────────────────
router.post('/attendance/process-comp-off', requirePermissions(['hr:create']), controller.processCompOff);

// ── Overrides / Regularization (must be before :id) ──────────────────
router.get('/attendance/overrides', requirePermissions(['hr:read']), controller.listOverrides);
router.post('/attendance/overrides', requirePermissions(['hr:create']), controller.createOverride);
router.patch('/attendance/overrides/:id', requirePermissions(['hr:update']), controller.processOverride);

// ── Attendance by ID (must be last to avoid catching named routes) ────
router.get('/attendance/:id', requirePermissions(['hr:read']), controller.getRecord);
router.patch('/attendance/:id', requirePermissions(['hr:update']), controller.updateRecord);

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

// ── Biometric Devices ────────────────────────────────────────────────
router.get('/biometric-devices', requirePermissions(['hr:read']), controller.listDevices);
router.post('/biometric-devices', requirePermissions(['hr:create']), controller.createDevice);
router.patch('/biometric-devices/:id', requirePermissions(['hr:update']), controller.updateDevice);
router.delete('/biometric-devices/:id', requirePermissions(['hr:delete']), controller.deleteDevice);
router.post('/biometric-devices/:id/test', requirePermissions(['hr:update']), controller.testDeviceConnection);
router.post('/biometric-devices/:id/sync', requirePermissions(['hr:create']), controller.syncDeviceAttendance);

// ── Shift Rotation ───────────────────────────────────────────────────
router.get('/shift-rotations', requirePermissions(['hr:read']), controller.listRotationSchedules);
router.post('/shift-rotations', requirePermissions(['hr:create']), controller.createRotationSchedule);
router.post('/shift-rotations/execute', requirePermissions(['hr:update']), controller.executeShiftRotation);
router.patch('/shift-rotations/:id', requirePermissions(['hr:update']), controller.updateRotationSchedule);
router.delete('/shift-rotations/:id', requirePermissions(['hr:delete']), controller.deleteRotationSchedule);
router.post('/shift-rotations/:id/assign', requirePermissions(['hr:update']), controller.assignEmployeesToRotation);
router.delete('/shift-rotations/:id/assign/:employeeId', requirePermissions(['hr:update']), controller.removeEmployeeFromRotation);

export { router as attendanceRoutes };
