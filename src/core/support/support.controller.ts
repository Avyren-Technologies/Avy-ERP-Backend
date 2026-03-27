import { Request, Response } from 'express';
import { supportService } from './support.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../shared/utils';
import { asyncHandler } from '../../middleware/error.middleware';
import { ApiError } from '../../shared/errors';
import { createTicketSchema, sendMessageSchema, updateStatusSchema, rejectModuleSchema } from './support.validators';
import { TicketStatus, TicketCategory } from '@prisma/client';
import { platformPrisma } from '../../config/database';

export class SupportController {
  // ────────────────────────────────────────────────────────────────────
  // Company Admin Handlers
  // ────────────────────────────────────────────────────────────────────

  createTicket = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const tenantId = req.user?.tenantId;
    if (!companyId || !tenantId) throw ApiError.badRequest('Company and tenant context required');

    const parsed = createTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const { subject, category, priority, message, metadata } = parsed.data;
    const createdByName = `${req.user?.firstName ?? ''} ${req.user?.lastName ?? ''}`.trim() || 'Unknown';

    // Fetch company name
    const company = await platformPrisma.company.findUnique({
      where: { id: companyId },
      select: { displayName: true, name: true },
    });
    const companyName = company?.displayName ?? company?.name ?? 'Unknown Company';

    const ticket = await supportService.createTicket({
      tenantId,
      companyId,
      companyName,
      createdByUserId: req.user!.id,
      createdByName,
      subject,
      category: category as TicketCategory,
      priority: priority as any,
      message,
      metadata,
    });

    res.status(201).json(createSuccessResponse(ticket, 'Support ticket created'));
  });

  listMyTickets = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const status = req.query.status as TicketStatus | undefined;
    const category = req.query.category as TicketCategory | undefined;
    const search = req.query.search as string | undefined;

    const result = await supportService.listTickets({ companyId, status, category, search, page, limit });
    res.json(createPaginatedResponse(result.tickets, result.page, result.limit, result.total, 'Tickets retrieved'));
  });

  getMyTicket = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const ticket = await supportService.getTicket(req.params.id!, companyId);
    res.json(createSuccessResponse(ticket, 'Ticket retrieved'));
  });

  sendMyMessage = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const senderName = `${req.user?.firstName ?? ''} ${req.user?.lastName ?? ''}`.trim() || 'Unknown';

    const message = await supportService.sendMessage({
      ticketId: req.params.id!,
      companyId,
      senderUserId: req.user!.id,
      senderName,
      senderRole: 'COMPANY_ADMIN',
      body: parsed.data.body,
    });

    res.status(201).json(createSuccessResponse(message, 'Message sent'));
  });

  closeMyTicket = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    // Verify ownership first
    await supportService.getTicket(req.params.id!, companyId);
    const ticket = await supportService.updateStatus(req.params.id!, TicketStatus.CLOSED);
    res.json(createSuccessResponse(ticket, 'Ticket closed'));
  });

  // ────────────────────────────────────────────────────────────────────
  // Super Admin Handlers
  // ────────────────────────────────────────────────────────────────────

  listAllTickets = asyncHandler(async (req: Request, res: Response) => {
    const { page, limit } = getPaginationParams(req.query);
    const status = req.query.status as TicketStatus | undefined;
    const category = req.query.category as TicketCategory | undefined;
    const search = req.query.search as string | undefined;

    const result = await supportService.listTickets({ status, category, search, page, limit });
    res.json(createPaginatedResponse(result.tickets, result.page, result.limit, result.total, 'Tickets retrieved'));
  });

  getTicketAdmin = asyncHandler(async (req: Request, res: Response) => {
    const ticket = await supportService.getTicket(req.params.id!);
    res.json(createSuccessResponse(ticket, 'Ticket retrieved'));
  });

  replyToTicket = asyncHandler(async (req: Request, res: Response) => {
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const senderName = `${req.user?.firstName ?? ''} ${req.user?.lastName ?? ''}`.trim() || 'Admin';

    const message = await supportService.sendMessage({
      ticketId: req.params.id!,
      senderUserId: req.user!.id,
      senderName,
      senderRole: 'SUPER_ADMIN',
      body: parsed.data.body,
    });

    res.status(201).json(createSuccessResponse(message, 'Reply sent'));
  });

  updateTicketStatus = asyncHandler(async (req: Request, res: Response) => {
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const ticket = await supportService.updateStatus(req.params.id!, parsed.data.status as TicketStatus);
    res.json(createSuccessResponse(ticket, 'Ticket status updated'));
  });

  approveModuleChange = asyncHandler(async (req: Request, res: Response) => {
    const approverName = `${req.user?.firstName ?? ''} ${req.user?.lastName ?? ''}`.trim() || 'Admin';

    const result = await supportService.approveModuleChange(req.params.id!, req.user!.id, approverName);
    res.json(createSuccessResponse(result, 'Module change approved'));
  });

  rejectModuleChange = asyncHandler(async (req: Request, res: Response) => {
    const parsed = rejectModuleSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const approverName = `${req.user?.firstName ?? ''} ${req.user?.lastName ?? ''}`.trim() || 'Admin';

    const result = await supportService.rejectModuleChange(req.params.id!, approverName, parsed.data.reason);
    res.json(createSuccessResponse(result, 'Module change rejected'));
  });

  getTicketStats = asyncHandler(async (_req: Request, res: Response) => {
    const stats = await supportService.getStats();
    res.json(createSuccessResponse(stats, 'Ticket stats retrieved'));
  });
}

export const supportController = new SupportController();
