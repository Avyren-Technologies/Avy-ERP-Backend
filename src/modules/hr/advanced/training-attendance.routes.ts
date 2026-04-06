import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { trainingAttendanceController as controller } from './training-attendance.controller';

const router = Router();

// ═══════════════════════════════════════════════════════════════════
// TRAINING ATTENDANCE
// ═══════════════════════════════════════════════════════════════════
router.get('/training-sessions/:sessionId/attendance', requirePermissions(['training:read', 'hr:read']), controller.listAttendees);
router.post('/training-sessions/:sessionId/attendance', requirePermissions(['training:create', 'hr:create']), controller.registerAttendees);
router.patch('/training-attendance/:id', requirePermissions(['training:update', 'hr:update']), controller.markAttendance);
router.patch('/training-sessions/:sessionId/attendance/bulk', requirePermissions(['training:update', 'hr:update']), controller.bulkMarkAttendance);

export { router as trainingAttendanceRoutes };
