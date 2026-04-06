import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { trainingProgramController } from './training-program.controller';

const router = Router();

router.get('/', requirePermissions(['training:read', 'hr:read']), trainingProgramController.listPrograms);
router.post('/', requirePermissions(['training:create', 'hr:create']), trainingProgramController.createProgram);
router.get('/:id', requirePermissions(['training:read', 'hr:read']), trainingProgramController.getProgram);
router.patch('/:id', requirePermissions(['training:update', 'hr:update']), trainingProgramController.updateProgram);
router.delete('/:id', requirePermissions(['training:delete', 'hr:delete']), trainingProgramController.deleteProgram);
router.post('/:id/courses', requirePermissions(['training:create', 'hr:create']), trainingProgramController.addCourse);
router.delete('/:id/courses/:courseId', requirePermissions(['training:delete', 'hr:delete']), trainingProgramController.removeCourse);
router.post('/:id/enroll', requirePermissions(['training:create', 'hr:create']), trainingProgramController.enrollEmployees);
router.get('/:id/enrollments', requirePermissions(['training:read', 'hr:read']), trainingProgramController.listEnrollments);

export default router;
