import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { trainingProgramController } from './training-program.controller';

const router = Router();

router.get('/', requirePermissions(['hr:read']), trainingProgramController.listPrograms);
router.post('/', requirePermissions(['hr:create']), trainingProgramController.createProgram);
router.get('/:id', requirePermissions(['hr:read']), trainingProgramController.getProgram);
router.patch('/:id', requirePermissions(['hr:update']), trainingProgramController.updateProgram);
router.delete('/:id', requirePermissions(['hr:delete']), trainingProgramController.deleteProgram);
router.post('/:id/courses', requirePermissions(['hr:create']), trainingProgramController.addCourse);
router.delete('/:id/courses/:courseId', requirePermissions(['hr:delete']), trainingProgramController.removeCourse);
router.post('/:id/enroll', requirePermissions(['hr:create']), trainingProgramController.enrollEmployees);
router.get('/:id/enrollments', requirePermissions(['hr:read']), trainingProgramController.listEnrollments);

export default router;
