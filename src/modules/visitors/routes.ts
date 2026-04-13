import { Router } from 'express';
import { requireModuleEnabled } from '../../shared/middleware/config-enforcement.middleware';
import { visitorTypeRoutes } from './config/visitor-type.routes';
import { gateRoutes } from './config/gate.routes';
import { safetyInductionRoutes } from './config/safety-induction.routes';
import { vmsConfigRoutes } from './config/vms-config.routes';
import { visitRoutes } from './core/visit.routes';
import { watchlistRoutes } from './security/watchlist.routes';
import { deniedEntryRoutes } from './security/denied-entry.routes';
import { recurringPassRoutes } from './passes/recurring-pass.routes';
import { vehiclePassRoutes } from './passes/vehicle-pass.routes';
import { materialPassRoutes } from './passes/material-pass.routes';
import { groupVisitRoutes } from './group/group-visit.routes';
import { dashboardRoutes } from './dashboard/dashboard.routes';
import { reportsRoutes } from './reports/reports.routes';
import { emergencyRoutes } from './emergency/emergency.routes';

const router = Router();

// ── Module Enforcement ─────────────────────────────────────────────
router.use(requireModuleEnabled('visitor'));

// ── Config sub-routes ──────────────────────────────────────────────
router.use('/types', visitorTypeRoutes);
router.use('/gates', gateRoutes);
router.use('/safety-inductions', safetyInductionRoutes);
router.use('/config', vmsConfigRoutes);

// ── Core visit routes ─────────────────────────────────────────────
router.use('/visits', visitRoutes);

// ── Security routes ───────────────────────────────────────────────
router.use('/watchlist', watchlistRoutes);
router.use('/denied-entries', deniedEntryRoutes);

// ── Pass routes ───────────────────────────────────────────────────
router.use('/recurring-passes', recurringPassRoutes);
router.use('/vehicle-passes', vehiclePassRoutes);
router.use('/material-passes', materialPassRoutes);

// ── Group visits ──────────────────────────────────────────────────
router.use('/group-visits', groupVisitRoutes);

// ── Dashboard & Reports ───────────────────────────────────────────
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportsRoutes);

// ── Emergency ─────────────────────────────────────────────────────
router.use('/emergency', emergencyRoutes);

export { router as visitorsRoutes };
