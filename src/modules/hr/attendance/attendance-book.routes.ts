import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { attendanceBookController } from './attendance-book.controller';

const router = Router();

router.get('/', requirePermissions(['attendance:mark']), attendanceBookController.fetchBook);
router.post('/mark', requirePermissions(['attendance:mark']), attendanceBookController.markAttendance);
router.post('/save-all', requirePermissions(['hr:create']), attendanceBookController.saveAll);

export { router as attendanceBookRoutes };
