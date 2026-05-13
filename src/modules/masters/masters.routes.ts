import { Router } from 'express';
import { partRoutes } from './part/part.routes';
import { machineRoutes } from './machine/machine.routes';

const router = Router();

router.use('/parts', partRoutes);
router.use('/machines', machineRoutes);

export { router as mastersRoutes };
