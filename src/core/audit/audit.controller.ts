import { Request, Response } from 'express';
import { auditService } from './audit.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../shared/utils';
import { asyncHandler } from '../../middleware/error.middleware';

export class AuditController {
  // ── List Audit Logs (paginated, filterable) ────────────────────────
  listAuditLogs = asyncHandler(async (req: Request, res: Response) => {
    const { page, limit } = getPaginationParams(req.query);
    const { action, entityType, userId, tenantId, dateFrom, dateTo, search } = req.query;

    const result = await auditService.listAuditLogs({
      page,
      limit,
      action: action as string,
      entityType: entityType as string,
      userId: userId as string,
      tenantId: tenantId as string,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      search: search as string,
    });

    res.json(createPaginatedResponse(
      result.logs,
      result.page,
      result.limit,
      result.total,
      'Audit logs retrieved successfully',
    ));
  });

  // ── Get Single Audit Log ───────────────────────────────────────────
  getAuditLogById = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id!;
    const log = await auditService.getAuditLogById(id);

    if (!log) {
      res.status(404).json(createSuccessResponse(null, 'Audit log not found'));
      return;
    }

    res.json(createSuccessResponse(log, 'Audit log retrieved successfully'));
  });

  // ── Get Audit Logs by Entity ───────────────────────────────────────
  getAuditLogsByEntity = asyncHandler(async (req: Request, res: Response) => {
    const entityType = req.params.entityType!;
    const entityId = req.params.entityId!;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

    const logs = await auditService.getAuditLogsByEntity(entityType, entityId, limit);
    res.json(createSuccessResponse(logs, 'Entity audit logs retrieved successfully'));
  });

  // ── Get Filter Options ─────────────────────────────────────────────
  getFilterOptions = asyncHandler(async (req: Request, res: Response) => {
    const [actionTypes, entityTypes] = await Promise.all([
      auditService.getActionTypes(),
      auditService.getEntityTypes(),
    ]);

    res.json(createSuccessResponse(
      { actionTypes, entityTypes },
      'Filter options retrieved successfully',
    ));
  });
}

export const auditController = new AuditController();
