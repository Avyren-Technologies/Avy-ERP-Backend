import { Request, Response } from 'express';
import { paymentService } from './payment.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../shared/utils';
import { asyncHandler } from '../../middleware/error.middleware';
import { HttpStatus } from '../../shared/types';

export class PaymentController {
  // ── List Payments (paginated, filterable) ──────────────────────────
  listPayments = asyncHandler(async (req: Request, res: Response) => {
    const { page, limit } = getPaginationParams(req.query);
    const { companyId, invoiceId, method, dateFrom, dateTo } = req.query;

    const result = await paymentService.listPayments({
      page,
      limit,
      companyId: companyId as string,
      invoiceId: invoiceId as string,
      method: method as string,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
    });

    res.json(createPaginatedResponse(
      result.payments,
      result.pagination.page,
      result.pagination.limit,
      result.pagination.total,
      'Payments retrieved successfully',
    ));
  });

  // ── Get Payment by ID ─────────────────────────────────────────────
  getPaymentById = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const payment = await paymentService.getPaymentById(id);

    if (!payment) {
      res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        error: 'Payment not found',
      });
      return;
    }

    res.json(createSuccessResponse(payment, 'Payment retrieved successfully'));
  });

  // ── Record Payment ────────────────────────────────────────────────
  recordPayment = asyncHandler(async (req: Request, res: Response) => {
    const { invoiceId, amount, method, transactionReference, paidAt, notes } = req.body;
    const recordedBy = req.user?.id ?? 'system';

    const payment = await paymentService.recordPayment({
      invoiceId,
      amount,
      method,
      transactionReference,
      paidAt: paidAt ? new Date(paidAt) : new Date(),
      notes,
      recordedBy,
    });

    res.status(HttpStatus.CREATED).json(createSuccessResponse(payment, 'Payment recorded successfully'));
  });
}

export const paymentController = new PaymentController();
