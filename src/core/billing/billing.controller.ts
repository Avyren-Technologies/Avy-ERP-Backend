import { Request, Response } from 'express';
import { billingService } from './billing.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../shared/utils';
import { asyncHandler } from '../../middleware/error.middleware';

export class BillingController {
  // ── Billing Summary KPIs ─────────────────────────────────────────────
  getBillingSummary = asyncHandler(async (req: Request, res: Response) => {
    const summary = await billingService.getBillingSummary();
    res.json(createSuccessResponse(summary, 'Billing summary retrieved successfully'));
  });

  // ── List Invoices (paginated) ────────────────────────────────────────
  listInvoices = asyncHandler(async (req: Request, res: Response) => {
    const { page, limit } = getPaginationParams(req.query);
    const { status } = req.query;

    const result = await billingService.listInvoices({
      page,
      limit,
      status: status as string,
    });

    res.json(createPaginatedResponse(
      result.invoices,
      result.pagination.page,
      result.pagination.limit,
      result.pagination.total,
      'Invoices retrieved successfully',
    ));
  });

  // ── Revenue Chart Data ───────────────────────────────────────────────
  getRevenueChart = asyncHandler(async (req: Request, res: Response) => {
    const chart = await billingService.getRevenueChart();
    res.json(createSuccessResponse(chart, 'Revenue chart data retrieved successfully'));
  });
}

export const billingController = new BillingController();
