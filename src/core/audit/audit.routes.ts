import { Router } from 'express';
import { auditController } from './audit.controller';

const router = Router();

// All audit routes are mounted under /platform/audit-logs
// which already has platform:admin permission from the main router

// List audit logs (paginated, filterable)
router.get('/', auditController.listAuditLogs);

// Get filter options (action types + entity types)
router.get('/filters', auditController.getFilterOptions);

// Get audit logs for a specific entity
router.get('/entity/:entityType/:entityId', auditController.getAuditLogsByEntity);

// Get single audit log by ID
router.get('/:id', auditController.getAuditLogById);

export { router as auditRoutes };
