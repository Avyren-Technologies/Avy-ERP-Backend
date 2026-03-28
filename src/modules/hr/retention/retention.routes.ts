import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { retentionController } from './retention.controller';

const router = Router();

// ── Retention Policies ────────────────────────────────────────────────────
router.get('/retention/policies', requirePermissions(['hr:read']), retentionController.listPolicies);
router.post('/retention/policies', requirePermissions(['hr:create']), retentionController.upsertPolicy);
router.delete('/retention/policies/:id', requirePermissions(['hr:delete']), retentionController.deletePolicy);

// ── Data Access Requests ──────────────────────────────────────────────────
router.get('/retention/data-requests', requirePermissions(['hr:read']), retentionController.listDataAccessRequests);
router.post('/retention/data-requests', requirePermissions(['hr:create']), retentionController.createDataAccessRequest);
router.patch('/retention/data-requests/:id', requirePermissions(['hr:update']), retentionController.processDataAccessRequest);

// ── Data Export ───────────────────────────────────────────────────────────
router.get('/retention/data-export/:employeeId', requirePermissions(['hr:read']), retentionController.exportEmployeeData);

// ── Anonymisation ─────────────────────────────────────────────────────────
router.post('/retention/anonymise/:employeeId', requirePermissions(['hr:delete']), retentionController.anonymiseEmployee);

// ── Consent Management ────────────────────────────────────────────────────
router.get('/retention/consents/:employeeId', requirePermissions(['hr:read']), retentionController.listConsents);
router.post('/retention/consents', requirePermissions(['hr:create']), retentionController.recordConsent);

// ── Retention Check ───────────────────────────────────────────────────────
router.get('/retention/check-due', requirePermissions(['hr:read']), retentionController.checkRetentionDue);

export { router as retentionRoutes };
