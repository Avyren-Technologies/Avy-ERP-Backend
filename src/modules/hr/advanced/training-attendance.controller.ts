import { Request, Response } from 'express';
import { trainingAttendanceService } from './training-attendance.service';
import { createSuccessResponse } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import {
  registerAttendeesSchema,
  markAttendanceSchema,
  bulkMarkAttendanceSchema,
} from './training-attendance.validators';

export class TrainingAttendanceController {
  listAttendees = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const attendees = await trainingAttendanceService.listAttendees(
      companyId,
      req.params.sessionId!,
    );
    res.json(createSuccessResponse(attendees, 'Training attendees retrieved'));
  });

  registerAttendees = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = registerAttendeesSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const result = await trainingAttendanceService.registerAttendees(
      companyId,
      req.params.sessionId!,
      parsed.data,
    );
    res.json(createSuccessResponse(result, 'Attendees registered'));
  });

  markAttendance = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = markAttendanceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const result = await trainingAttendanceService.markAttendance(
      companyId,
      req.params.id!,
      parsed.data,
    );
    res.json(createSuccessResponse(result, 'Attendance marked'));
  });

  bulkMarkAttendance = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = bulkMarkAttendanceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const result = await trainingAttendanceService.bulkMarkAttendance(
      companyId,
      req.params.sessionId!,
      parsed.data,
    );
    res.json(createSuccessResponse(result, 'Bulk attendance updated'));
  });
}

export const trainingAttendanceController = new TrainingAttendanceController();
