import { Request, Response } from 'express';
import { dashboardService } from './dashboard.service';
import { createSuccessResponse } from '../../shared/utils';
import { asyncHandler } from '../../middleware/error.middleware';
import { ApiError } from '../../shared/errors';

export class DashboardController {
  // ── Super Admin Stats ────────────────────────────────────────────────
  getSuperAdminStats = asyncHandler(async (req: Request, res: Response) => {
    const stats = await dashboardService.getSuperAdminStats();
    res.json(createSuccessResponse(stats, 'Dashboard stats retrieved successfully'));
  });

  // ── Recent Activity ──────────────────────────────────────────────────
  getRecentActivity = asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 10;
    const activity = await dashboardService.getRecentActivity(limit);
    res.json(createSuccessResponse(activity, 'Recent activity retrieved successfully'));
  });

  // ── Revenue Metrics ──────────────────────────────────────────────────
  getRevenueMetrics = asyncHandler(async (req: Request, res: Response) => {
    const metrics = await dashboardService.getRevenueMetrics();
    res.json(createSuccessResponse(metrics, 'Revenue metrics retrieved successfully'));
  });

  // ── Company Admin Stats (tenant-scoped) ──────────────────────────────
  getCompanyAdminStats = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw ApiError.badRequest('Company ID is required');
    }

    const stats = await dashboardService.getCompanyAdminStats(companyId);
    res.json(createSuccessResponse(stats, 'Company dashboard stats retrieved successfully'));
  });
}

export const dashboardController = new DashboardController();
