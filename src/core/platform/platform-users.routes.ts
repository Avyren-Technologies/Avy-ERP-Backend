import { Router } from 'express';
import { platformUsersController } from './platform-users.controller';

const router = Router();

// Stats & utilities
router.get('/stats', platformUsersController.getStats);
router.get('/companies', platformUsersController.listCompanies);

// CRUD
router.get('/', platformUsersController.listUsers);
router.post('/', platformUsersController.createUser);
router.get('/:id', platformUsersController.getUser);
router.patch('/:id', platformUsersController.updateUser);
router.patch('/:id/password', platformUsersController.resetPassword);
router.patch('/:id/status', platformUsersController.updateStatus);
router.delete('/:id', platformUsersController.deleteUser);

export { router as platformUsersRoutes };
