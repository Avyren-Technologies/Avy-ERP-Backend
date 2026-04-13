import { Request, Response } from 'express';
import { reportsService } from './reports.service';
import { createSuccessResponse } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';

class ReportsController {

  getDailyLog = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { date, plantId } = req.query;
    if (!date) throw ApiError.badRequest('Date is required (YYYY-MM-DD)');

    const visits = await reportsService.getDailyLog(companyId, date as string, plantId as string | undefined);
    res.json(createSuccessResponse(visits, 'Daily log retrieved'));
  });

  getSummary = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { fromDate, toDate, plantId } = req.query;
    if (!fromDate || !toDate) throw ApiError.badRequest('fromDate and toDate are required');

    const summary = await reportsService.getSummary(
      companyId,
      fromDate as string,
      toDate as string,
      plantId as string | undefined,
    );
    res.json(createSuccessResponse(summary, 'Summary retrieved'));
  });

  getOverstay = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { fromDate, toDate, plantId } = req.query;
    if (!fromDate || !toDate) throw ApiError.badRequest('fromDate and toDate are required');

    const visits = await reportsService.getOverstayReport(
      companyId,
      fromDate as string,
      toDate as string,
      plantId as string | undefined,
    );
    res.json(createSuccessResponse(visits, 'Overstay report retrieved'));
  });

  getAnalytics = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { fromDate, toDate, plantId } = req.query;
    if (!fromDate || !toDate) throw ApiError.badRequest('fromDate and toDate are required');

    const analytics = await reportsService.getAnalytics(
      companyId,
      fromDate as string,
      toDate as string,
      plantId as string | undefined,
    );
    res.json(createSuccessResponse(analytics, 'Analytics retrieved'));
  });
}

export const reportsController = new ReportsController();
