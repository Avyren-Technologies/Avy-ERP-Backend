import { Router } from 'express';
import { requirePermissions } from '../../middleware/auth.middleware';
import { biometricController } from './biometric.controller';

const router = Router();

// ── Device management ───────────────────────────────────────────────

// Device stats (must be before /:id to avoid route conflict)
router.get('/devices/stats', requirePermissions(['hr.attendance:read']), biometricController.getDeviceStats);

// Claim device by serial number (company admin)
router.post('/devices/claim', requirePermissions(['hr.attendance:configure']), biometricController.claimDevice);

// List company devices
router.get('/devices', requirePermissions(['hr.attendance:read']), biometricController.listDevices);

// Get single device
router.get('/devices/:id', requirePermissions(['hr.attendance:read']), biometricController.getDevice);

// Update device
router.patch('/devices/:id', requirePermissions(['hr.attendance:configure']), biometricController.updateDevice);

// Deactivate device
router.delete('/devices/:id', requirePermissions(['hr.attendance:configure']), biometricController.deactivateDevice);

// ── Employee-device mappings ────────────────────────────────────────

// Unmapped punches (must be before /:id)
router.get('/mappings/unmapped', requirePermissions(['hr.attendance:read']), biometricController.getUnmappedPunches);

// List mappings
router.get('/mappings', requirePermissions(['hr.attendance:configure']), biometricController.listMappings);

// Create mapping
router.post('/mappings', requirePermissions(['hr.attendance:configure']), biometricController.createMapping);

// Delete mapping
router.delete('/mappings/:id', requirePermissions(['hr.attendance:configure']), biometricController.deleteMapping);

// ── Punch logs ──────────────────────────────────────────────────────

router.get('/punch-logs', requirePermissions(['hr.attendance:read']), biometricController.listPunchLogs);

export { router as biometricAdminRoutes };
