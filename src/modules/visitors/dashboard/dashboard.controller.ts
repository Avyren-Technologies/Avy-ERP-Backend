import { Request, Response } from 'express';
import { dashboardService } from './dashboard.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';

export class DashboardController {
  // ────────────────────────────────────────────────────────────────────
  // Today's dashboard (stats + visitors list)
  // ────────────────────────────────────────────────────────────────────

  getTodayDashboard = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const plantId = req.query.plantId as string | undefined;
    const { page, limit } = getPaginationParams(req.query);

    const filters: {
      plantId?: string;
      gateId?: string;
      status?: string;
      search?: string;
      page: number;
      limit: number;
    } = { page, limit };

    if (plantId) filters.plantId = plantId;
    if (req.query.gateId) filters.gateId = req.query.gateId as string;
    if (req.query.status) filters.status = req.query.status as string;
    if (req.query.search) filters.search = req.query.search as string;

    const [stats, visitorsResult] = await Promise.all([
      dashboardService.getTodayStats(companyId, plantId),
      dashboardService.getTodayVisitors(companyId, filters),
    ]);

    res.json(
      createSuccessResponse(
        {
          stats,
          visitors: visitorsResult.data,
          meta: {
            page: visitorsResult.page,
            limit: visitorsResult.limit,
            total: visitorsResult.total,
            totalPages: Math.ceil(visitorsResult.total / visitorsResult.limit),
          },
        },
        'Today dashboard retrieved',
      ),
    );
  });

  // ────────────────────────────────────────────────────────────────────
  // On-site visitors (currently checked in)
  // ────────────────────────────────────────────────────────────────────

  getOnSite = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const plantId = req.query.plantId as string | undefined;
    const visitors = await dashboardService.getOnSiteVisitors(companyId, plantId);
    res.json(createSuccessResponse(visitors, 'On-site visitors retrieved'));
  });

  // ────────────────────────────────────────────────────────────────────
  // Monthly KPI stats
  // ────────────────────────────────────────────────────────────────────

  getStats = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const plantId = req.query.plantId as string | undefined;
    const stats = await dashboardService.getMonthlyStats(companyId, plantId);
    res.json(createSuccessResponse(stats, 'Monthly stats retrieved'));
  });
}

export const dashboardController = new DashboardController();
