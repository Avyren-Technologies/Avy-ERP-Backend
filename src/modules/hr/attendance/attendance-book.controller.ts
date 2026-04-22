import { Request, Response } from 'express';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { createSuccessResponse, createPaginatedResponse } from '../../../shared/utils';
import { attendanceBookService } from './attendance-book.service';
import { bookFetchSchema, bookMarkSchema, bookSaveAllSchema } from './attendance-book.validators';

class AttendanceBookController {
  fetchBook = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = bookFetchSchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const result = await attendanceBookService.fetchBook(companyId, parsed.data);
    res.json(createPaginatedResponse(result.data, result.meta.page, result.meta.limit, result.meta.total, 'Attendance book retrieved'));
  });

  markAttendance = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) throw ApiError.badRequest('Company ID and User ID are required');

    const parsed = bookMarkSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const result = await attendanceBookService.markAttendance(companyId, parsed.data, userId);
    res.status(201).json(createSuccessResponse(result, 'Attendance marked'));
  });

  saveAll = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) throw ApiError.badRequest('Company ID and User ID are required');

    const parsed = bookSaveAllSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const result = await attendanceBookService.saveAll(companyId, parsed.data, userId);
    res.json(
      createSuccessResponse(result, `Batch: ${result.summary.succeeded}/${result.summary.total} succeeded`),
    );
  });
}

export const attendanceBookController = new AttendanceBookController();
