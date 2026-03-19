import { Request, Response } from 'express';
import { invoiceService } from './invoice.service';
import { pdfService } from './pdf.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../shared/utils';
import { asyncHandler } from '../../middleware/error.middleware';
import { HttpStatus } from '../../shared/types';

export class InvoiceController {
  // ── List Invoices (paginated + filtered) ────────────────────────────
  listInvoices = asyncHandler(async (req: Request, res: Response) => {
    const { page, limit } = getPaginationParams(req.query);
    const { status, invoiceType, companyId, dateFrom, dateTo, search } = req.query;

    const result = await invoiceService.listInvoices({
      page,
      limit,
      status: status as string,
      invoiceType: invoiceType as string,
      companyId: companyId as string,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      search: search as string,
    });

    res.json(createPaginatedResponse(
      result.invoices,
      result.pagination.page,
      result.pagination.limit,
      result.pagination.total,
      'Invoices retrieved successfully',
    ));
  });

  // ── Get Invoice by ID ───────────────────────────────────────────────
  getInvoiceById = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const invoice = await invoiceService.getInvoiceById(id);

    if (!invoice) {
      res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        error: 'Invoice not found',
      });
      return;
    }

    res.json(createSuccessResponse(invoice, 'Invoice retrieved successfully'));
  });

  // ── Generate Invoice ────────────────────────────────────────────────
  generateInvoice = asyncHandler(async (req: Request, res: Response) => {
    const { companyId, locationId, invoiceType, billingPeriodStart, billingPeriodEnd, customLineItems, notes } = req.body;

    const invoice = await invoiceService.generateInvoice({
      companyId,
      locationId,
      invoiceType,
      billingPeriodStart: billingPeriodStart ? new Date(billingPeriodStart) : undefined,
      billingPeriodEnd: billingPeriodEnd ? new Date(billingPeriodEnd) : undefined,
      customLineItems,
      notes,
    });

    res.status(HttpStatus.CREATED).json(createSuccessResponse(invoice, 'Invoice generated successfully'));
  });

  // ── Mark Invoice as Paid ────────────────────────────────────────────
  markAsPaid = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { method, transactionReference, paidAt, notes } = req.body;

    const result = await invoiceService.markAsPaid(id, {
      method,
      transactionReference,
      paidAt: paidAt ? new Date(paidAt) : undefined,
      recordedBy: (req as any).user?.id ?? 'system',
      notes,
    });

    res.json(createSuccessResponse(result, 'Invoice marked as paid'));
  });

  // ── Void Invoice ────────────────────────────────────────────────────
  voidInvoice = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const invoice = await invoiceService.voidInvoice(id);

    res.json(createSuccessResponse(invoice, 'Invoice voided successfully'));
  });

  // ── Send Invoice Email ──────────────────────────────────────────────
  sendEmail = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const result = await invoiceService.sendInvoiceEmail(id);

    res.json(createSuccessResponse(result, 'Invoice email sent successfully'));
  });

  // ── Download PDF ────────────────────────────────────────────────────
  downloadPdf = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const invoice = await invoiceService.getInvoiceById(id);

    if (!invoice) {
      res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        message: 'Invoice not found',
      });
      return;
    }

    const pdfBuffer = await pdfService.generateInvoicePdf(invoice);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    res.send(pdfBuffer);
  });
}

export const invoiceController = new InvoiceController();
