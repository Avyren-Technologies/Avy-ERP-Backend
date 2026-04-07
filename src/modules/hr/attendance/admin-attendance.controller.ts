import { Request, Response } from 'express';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { createSuccessResponse, createPaginatedResponse } from '../../../shared/utils';
import { adminAttendanceService } from './admin-attendance.service';
import { adminMarkSchema, adminBulkMarkSchema, todayLogSchema } from './admin-attendance.validators';

class AdminAttendanceController {
  getEmployeeStatus = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { employeeId } = req.params;
    if (!employeeId) throw ApiError.badRequest('Employee ID is required');

    const result = await adminAttendanceService.getEmployeeStatus(companyId, employeeId);
    res.json(createSuccessResponse(result, 'Employee status retrieved'));
  });

  markAttendance = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = adminMarkSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));
    }

    // Check if caller has admin override privileges
    const permissions: string[] = req.user?.permissions ?? [];
    const callerHasOverride = permissions.some(
      p => p === 'hr:create' || p === 'hr:configure' || p === 'company:configure' || p === '*',
    );

    // Require remarks for admin override
    if (callerHasOverride && parsed.data.skipValidation && !parsed.data.remarks?.trim()) {
      throw ApiError.badRequest('Remarks are required when using admin override');
    }

    const result = await adminAttendanceService.markAttendance(companyId, parsed.data, callerHasOverride);
    res.status(201).json(
      createSuccessResponse(
        result,
        `Employee ${result.status === 'CHECKED_IN' ? 'checked in' : 'checked out'} successfully`,
      ),
    );
  });

  bulkMark = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = adminBulkMarkSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));
    }

    const result = await adminAttendanceService.bulkMark(companyId, parsed.data);
    res.json(
      createSuccessResponse(result, `Bulk operation: ${result.summary.succeeded}/${result.summary.total} succeeded`),
    );
  });

  getTodayLog = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = todayLogSchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));
    }

    const result = await adminAttendanceService.getTodayLog(companyId, parsed.data);
    res.json(createPaginatedResponse(result.records, result.page, result.limit, result.total, 'Today log retrieved'));
  });
}

export const adminAttendanceController = new AdminAttendanceController();
