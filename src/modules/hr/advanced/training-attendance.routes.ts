import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { trainingAttendanceController as controller } from './training-attendance.controller';

const router = Router();

// ═══════════════════════════════════════════════════════════════════
// TRAINING ATTENDANCE
// ═══════════════════════════════════════════════════════════════════
router.get('/training-sessions/:sessionId/attendance', requirePermissions(['hr:read']), controller.listAttendees);
router.post('/training-sessions/:sessionId/attendance', requirePermissions(['hr:create']), controller.registerAttendees);
router.patch('/training-attendance/:id', requirePermissions(['hr:update']), controller.markAttendance);
router.patch('/training-sessions/:sessionId/attendance/bulk', requirePermissions(['hr:update']), controller.bulkMarkAttendance);

export { router as trainingAttendanceRoutes };
