import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { createSuccessResponse } from '../../../shared/utils';
import { notificationAnalyticsService } from './notification-analytics.service';

const daysQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(365).optional().default(30),
});

const topFailingQuerySchema = daysQuerySchema.extend({
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
});

class NotificationAnalyticsController {
  getSummary = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('User has no company context');

    const parsed = daysQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }
    const result = await notificationAnalyticsService.getSummary(companyId, parsed.data.days);
    res.json(createSuccessResponse(result));
  });

  getTopFailing = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('User has no company context');

    const parsed = topFailingQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }
    const result = await notificationAnalyticsService.getTopFailing(
      companyId,
      parsed.data.days,
      parsed.data.limit,
    );
    res.json(createSuccessResponse(result));
  });

  getDeliveryTrend = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('User has no company context');

    const parsed = daysQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }
    const result = await notificationAnalyticsService.getDeliveryTrend(
      companyId,
      parsed.data.days,
    );
    res.json(createSuccessResponse(result));
  });
}

export const notificationAnalyticsController = new NotificationAnalyticsController();
