import { Router } from 'express';
import { requirePermissions } from '../../middleware/auth.middleware';
import { companyAdminController as controller } from './company-admin.controller';

const router = Router();

// ── Profile ─────────────────────────────────────────────────────────
router.get('/profile', requirePermissions(['company:read']), controller.getProfile);
router.patch('/profile/sections/:sectionKey', requirePermissions(['company:update']), controller.updateProfileSection);

// ── Locations (NO create — explicit 403) ────────────────────────────
router.get('/locations', requirePermissions(['company:read']), controller.listLocations);
router.get('/locations/:id', requirePermissions(['company:read']), controller.getLocation);
router.post('/locations', controller.createLocation); // Returns 403
router.patch('/locations/:id', requirePermissions(['company:update']), controller.updateLocation);
router.delete('/locations/:id', requirePermissions(['company:delete']), controller.deleteLocation);

// ── Shifts ──────────────────────────────────────────────────────────
router.get('/shifts', requirePermissions(['company:read']), controller.listShifts);
router.get('/shifts/:id', requirePermissions(['company:read']), controller.getShift);
router.post('/shifts', requirePermissions(['company:create']), controller.createShift);
router.patch('/shifts/:id', requirePermissions(['company:update']), controller.updateShift);
router.delete('/shifts/:id', requirePermissions(['company:delete']), controller.deleteShift);

// ── Contacts ────────────────────────────────────────────────────────
router.get('/contacts', requirePermissions(['company:read']), controller.listContacts);
router.get('/contacts/:id', requirePermissions(['company:read']), controller.getContact);
router.post('/contacts', requirePermissions(['company:create']), controller.createContact);
router.patch('/contacts/:id', requirePermissions(['company:update']), controller.updateContact);
router.delete('/contacts/:id', requirePermissions(['company:delete']), controller.deleteContact);

// ── No. Series ──────────────────────────────────────────────────────
router.get('/no-series', requirePermissions(['company:read']), controller.listNoSeries);
router.get('/no-series/:id', requirePermissions(['company:read']), controller.getNoSeries);
router.post('/no-series', requirePermissions(['company:create']), controller.createNoSeries);
router.patch('/no-series/:id', requirePermissions(['company:update']), controller.updateNoSeries);
router.delete('/no-series/:id', requirePermissions(['company:delete']), controller.deleteNoSeries);

// ── IoT Reasons ─────────────────────────────────────────────────────
router.get('/iot-reasons', requirePermissions(['company:read']), controller.listIotReasons);
router.get('/iot-reasons/:id', requirePermissions(['company:read']), controller.getIotReason);
router.post('/iot-reasons', requirePermissions(['company:create']), controller.createIotReason);
router.patch('/iot-reasons/:id', requirePermissions(['company:update']), controller.updateIotReason);
router.delete('/iot-reasons/:id', requirePermissions(['company:delete']), controller.deleteIotReason);

// ── Controls ────────────────────────────────────────────────────────
router.get('/controls', requirePermissions(['company:read']), controller.getControls);
router.patch('/controls', requirePermissions(['company:update']), controller.updateControls);

// ── Settings ────────────────────────────────────────────────────────
router.get('/settings', requirePermissions(['company:read']), controller.getSettings);
router.patch('/settings', requirePermissions(['company:update']), controller.updateSettings);

// ── Users ───────────────────────────────────────────────────────────
router.get('/users', requirePermissions(['user:read']), controller.listUsers);
router.get('/users/:id', requirePermissions(['user:read']), controller.getUser);
router.post('/users', requirePermissions(['user:create']), controller.createUser);
router.patch('/users/:id', requirePermissions(['user:update']), controller.updateUser);
router.patch('/users/:id/status', requirePermissions(['user:update']), controller.updateUserStatus);

// ── Audit Logs ──────────────────────────────────────────────────────
router.get('/audit-logs', requirePermissions(['audit:read']), controller.listAuditLogs);

export { router as companyAdminRoutes };
