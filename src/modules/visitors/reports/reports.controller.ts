import { Request, Response } from 'express';
import { DateTime } from 'luxon';
import { reportsService } from './reports.service';
import { createSuccessResponse } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';

/**
 * Default to current month range if fromDate/toDate not provided.
 */
function getDateRange(query: any): { fromDate: string; toDate: string } {
  if (query.fromDate && query.toDate) {
    return { fromDate: query.fromDate as string, toDate: query.toDate as string };
  }
  // Default: first day of current month to today
  const now = DateTime.now();
  return {
    fromDate: now.startOf('month').toISODate()!,
    toDate: now.toISODate()!,
  };
}

class ReportsController {

  getDailyLog = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const date = (req.query.date as string) || DateTime.now().toISODate()!;
    const plantId = req.query.plantId as string | undefined;

    const visits = await reportsService.getDailyLog(companyId, date, plantId);
    res.json(createSuccessResponse(visits, 'Daily log retrieved'));
  });

  getSummary = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { fromDate, toDate } = getDateRange(req.query);
    const plantId = req.query.plantId as string | undefined;

    const summary = await reportsService.getSummary(companyId, fromDate, toDate, plantId);
    res.json(createSuccessResponse(summary, 'Summary retrieved'));
  });

  getOverstay = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { fromDate, toDate } = getDateRange(req.query);
    const plantId = req.query.plantId as string | undefined;

    const visits = await reportsService.getOverstayReport(companyId, fromDate, toDate, plantId);
    res.json(createSuccessResponse(visits, 'Overstay report retrieved'));
  });

  getAnalytics = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { fromDate, toDate } = getDateRange(req.query);
    const plantId = req.query.plantId as string | undefined;

    const analytics = await reportsService.getAnalytics(companyId, fromDate, toDate, plantId);
    res.json(createSuccessResponse(analytics, 'Analytics retrieved'));
  });
}

export const reportsController = new ReportsController();
