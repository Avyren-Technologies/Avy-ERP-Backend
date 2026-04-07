import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { adminAttendanceController } from './admin-attendance.controller';

const router = Router();

router.get('/employee/:employeeId/status', requirePermissions(['attendance:mark']), adminAttendanceController.getEmployeeStatus);
router.post('/mark', requirePermissions(['attendance:mark']), adminAttendanceController.markAttendance);
router.post('/mark/bulk', requirePermissions(['hr:create']), adminAttendanceController.bulkMark);
router.get('/today-log', requirePermissions(['attendance:mark']), adminAttendanceController.getTodayLog);

export { router as adminAttendanceRoutes };
