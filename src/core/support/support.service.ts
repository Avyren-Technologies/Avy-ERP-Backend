import { TicketStatus, TicketCategory, TicketPriority } from '@prisma/client';
import { platformPrisma } from '../../config/database';
import { ApiError } from '../../shared/errors';
import { logger } from '../../config/logger';
import { emitTicketMessage, emitTicketStatusChange, emitNewTicket, emitTicketResolved } from '../../lib/socket';
import { generateNextNumber } from '../../shared/utils/number-series';

// ── Status Transition Map ──────────────────────────────────────────

const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: [TicketStatus.IN_PROGRESS, TicketStatus.WAITING_ON_CUSTOMER, TicketStatus.RESOLVED, TicketStatus.CLOSED],
  IN_PROGRESS: [TicketStatus.WAITING_ON_CUSTOMER, TicketStatus.RESOLVED, TicketStatus.CLOSED],
  WAITING_ON_CUSTOMER: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED, TicketStatus.CLOSED],
  RESOLVED: [TicketStatus.CLOSED],
  CLOSED: [],
};

export class SupportService {
  // ────────────────────────────────────────────────────────────────────
  // Create Ticket
  // ────────────────────────────────────────────────────────────────────

  async createTicket(params: {
    tenantId: string;
    companyId: string;
    companyName: string;
    createdByUserId: string;
    createdByName: string;
    subject: string;
    category: TicketCategory;
    priority?: TicketPriority;
    message: string;
    metadata?: any;
  }) {
    const { tenantId, companyId, companyName, createdByUserId, createdByName, subject, category, priority, message, metadata } = params;

    // Check for duplicate MODULE_CHANGE tickets
    if (category === TicketCategory.MODULE_CHANGE && metadata) {
      const existing = await platformPrisma.supportTicket.findFirst({
        where: {
          companyId,
          category: TicketCategory.MODULE_CHANGE,
          status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.WAITING_ON_CUSTOMER] },
          metadata: {
            path: ['locationId'],
            equals: metadata.locationId,
          },
        },
      });

      if (existing) {
        // Also check moduleId + type match
        const existingMeta = existing.metadata as any;
        if (existingMeta?.moduleId === metadata.moduleId && existingMeta?.type === metadata.type) {
          throw ApiError.conflict(
            'A module change request for this module at this location is already open',
            'DUPLICATE_MODULE_CHANGE'
          );
        }
      }
    }

    // Generate ticket number from Number Series
    const ticketNumber = await generateNextNumber(
      platformPrisma, companyId, ['Support Ticket', 'Support'], 'Support Ticket',
    );

    // Create ticket + initial message in transaction
    const ticket = await platformPrisma.$transaction(async (tx) => {
      const newTicket = await tx.supportTicket.create({
        data: {
          ticketNumber,
          tenantId,
          companyId,
          companyName,
          createdByUserId,
          createdByName,
          subject,
          category,
          priority: priority ?? TicketPriority.NORMAL,
          metadata: metadata ?? undefined,
        },
      });

      // User's initial message
      await tx.supportMessage.create({
        data: {
          ticketId: newTicket.id,
          senderUserId: createdByUserId,
          senderName: createdByName,
          senderRole: 'COMPANY_ADMIN',
          body: message,
        },
      });

      // Auto system message for MODULE_CHANGE
      if (category === TicketCategory.MODULE_CHANGE && metadata) {
        const action = metadata.type === 'ADD' ? 'add' : 'remove';
        await tx.supportMessage.create({
          data: {
            ticketId: newTicket.id,
            senderName: 'System',
            senderRole: 'SYSTEM',
            body: `Module change request: ${action} "${metadata.moduleName}" at location "${metadata.locationName}". Awaiting admin approval.`,
            isSystemMessage: true,
          },
        });
      }

      return newTicket;
    });

    // Return with messages
    const result = await platformPrisma.supportTicket.findUnique({
      where: { id: ticket.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    // Emit real-time event
    emitNewTicket(result);

    return result;
  }

  // ────────────────────────────────────────────────────────────────────
  // List Tickets (paginated + filterable)
  // ────────────────────────────────────────────────────────────────────

  async listTickets(filters: {
    companyId?: string | undefined;
    status?: TicketStatus | undefined;
    category?: TicketCategory | undefined;
    search?: string | undefined;
    page: number;
    limit: number;
  }) {
    const { companyId, status, category, search, page, limit } = filters;

    const where: any = {};
    if (companyId) where.companyId = companyId;
    if (status) where.status = status;
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { createdByName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [tickets, total] = await Promise.all([
      platformPrisma.supportTicket.findMany({
        where,
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          company: {
            select: { id: true, name: true, displayName: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      platformPrisma.supportTicket.count({ where }),
    ]);

    return { tickets, total, page, limit };
  }

  // ────────────────────────────────────────────────────────────────────
  // Get Single Ticket
  // ────────────────────────────────────────────────────────────────────

  async getTicket(ticketId: string, companyId?: string) {
    const where: any = { id: ticketId };
    if (companyId) where.companyId = companyId;

    const ticket = await platformPrisma.supportTicket.findFirst({
      where,
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        company: {
          select: {
            id: true,
            name: true,
            displayName: true,
            billingType: true,
            userTier: true,
            locationConfig: true,
            wizardStatus: true,
          },
        },
      },
    });

    if (!ticket) {
      throw ApiError.notFound('Support ticket not found');
    }

    return ticket;
  }

  // ────────────────────────────────────────────────────────────────────
  // Send Message
  // ────────────────────────────────────────────────────────────────────

  async sendMessage(params: {
    ticketId: string;
    companyId?: string;
    senderUserId: string;
    senderName: string;
    senderRole: 'COMPANY_ADMIN' | 'SUPER_ADMIN';
    body: string;
  }) {
    const { ticketId, companyId, senderUserId, senderName, senderRole, body } = params;

    // Verify ticket exists and is accessible
    const where: any = { id: ticketId };
    if (companyId) where.companyId = companyId;

    const ticket = await platformPrisma.supportTicket.findFirst({ where });
    if (!ticket) {
      throw ApiError.notFound('Support ticket not found');
    }

    if (ticket.status === TicketStatus.CLOSED) {
      throw ApiError.badRequest('Cannot send messages on a closed ticket');
    }

    const message = await platformPrisma.$transaction(async (tx) => {
      const msg = await tx.supportMessage.create({
        data: {
          ticketId,
          senderUserId,
          senderName,
          senderRole,
          body,
        },
      });

      // Touch ticket updatedAt
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: { updatedAt: new Date() },
      });

      return msg;
    });

    // Emit real-time event
    emitTicketMessage(ticketId, message);

    return message;
  }

  // ────────────────────────────────────────────────────────────────────
  // Update Status
  // ────────────────────────────────────────────────────────────────────

  async updateStatus(ticketId: string, newStatus: TicketStatus) {
    const ticket = await platformPrisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw ApiError.notFound('Support ticket not found');
    }

    const allowed = VALID_TRANSITIONS[ticket.status];
    if (!allowed.includes(newStatus)) {
      throw ApiError.badRequest(
        `Cannot transition from ${ticket.status} to ${newStatus}. Allowed: ${allowed.join(', ') || 'none'}`
      );
    }

    const data: any = { status: newStatus };
    if (newStatus === TicketStatus.RESOLVED) {
      data.resolvedAt = new Date();
    }
    if (newStatus === TicketStatus.CLOSED) {
      data.closedAt = new Date();
    }

    const updated = await platformPrisma.supportTicket.update({
      where: { id: ticketId },
      data,
    });

    // Emit real-time event
    emitTicketStatusChange(ticketId, ticket.companyId, newStatus as string, updated);

    return updated;
  }

  // ────────────────────────────────────────────────────────────────────
  // Approve Module Change
  // ────────────────────────────────────────────────────────────────────

  async approveModuleChange(ticketId: string, approverUserId: string, approverName: string) {
    const ticket = await platformPrisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: { company: { include: { locations: true } } },
    });

    if (!ticket) {
      throw ApiError.notFound('Support ticket not found');
    }

    if (ticket.category !== TicketCategory.MODULE_CHANGE) {
      throw ApiError.badRequest('This ticket is not a module change request');
    }

    if (ticket.status === TicketStatus.RESOLVED || ticket.status === TicketStatus.CLOSED) {
      throw ApiError.badRequest('This ticket has already been resolved');
    }

    const metadata = ticket.metadata as any;
    if (!metadata?.locationId || !metadata?.moduleId) {
      throw ApiError.badRequest('Ticket metadata is missing required module change fields');
    }

    const location = ticket.company.locations.find((l) => l.id === metadata.locationId);
    if (!location) {
      throw ApiError.notFound('Location not found');
    }

    const result = await platformPrisma.$transaction(async (tx) => {
      // Parse current modules
      let currentModules: string[] = [];
      if (location.moduleIds) {
        const raw = location.moduleIds;
        currentModules = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? JSON.parse(raw) : [];
      }

      let updatedModules: string[];
      if (metadata.type === 'ADD') {
        updatedModules = Array.from(new Set([...currentModules, metadata.moduleId]));
      } else {
        updatedModules = currentModules.filter((m: string) => m !== metadata.moduleId);
      }

      // Update location
      await tx.location.update({
        where: { id: metadata.locationId },
        data: { moduleIds: updatedModules },
      });

      // Re-aggregate company selectedModuleIds from all locations
      const allLocations = await tx.location.findMany({
        where: { companyId: ticket.companyId },
        select: { id: true, moduleIds: true },
      });

      const allModules = new Set<string>();
      for (const loc of allLocations) {
        if (loc.id === metadata.locationId) {
          // Use the newly updated modules
          updatedModules.forEach((m) => allModules.add(m));
        } else if (loc.moduleIds) {
          const raw = loc.moduleIds;
          const locModules: string[] = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? JSON.parse(raw) : [];
          locModules.forEach((m) => allModules.add(m));
        }
      }

      await tx.company.update({
        where: { id: ticket.companyId },
        data: { selectedModuleIds: Array.from(allModules) },
      });

      // System message
      const action = metadata.type === 'ADD' ? 'added to' : 'removed from';
      await tx.supportMessage.create({
        data: {
          ticketId,
          senderName: 'System',
          senderRole: 'SYSTEM',
          body: `Module "${metadata.moduleName}" has been ${action} location "${metadata.locationName}" by ${approverName}.`,
          isSystemMessage: true,
        },
      });

      // Resolve ticket
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: { status: TicketStatus.RESOLVED, resolvedAt: new Date() },
      });

      return { updatedModules, companyModules: Array.from(allModules) };
    });

    // Emit real-time event
    emitTicketResolved(ticketId, ticket.companyId, result);

    return result;
  }

  // ────────────────────────────────────────────────────────────────────
  // Reject Module Change
  // ────────────────────────────────────────────────────────────────────

  async rejectModuleChange(ticketId: string, approverName: string, reason: string) {
    const ticket = await platformPrisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw ApiError.notFound('Support ticket not found');
    }

    if (ticket.category !== TicketCategory.MODULE_CHANGE) {
      throw ApiError.badRequest('This ticket is not a module change request');
    }

    if (ticket.status === TicketStatus.RESOLVED || ticket.status === TicketStatus.CLOSED) {
      throw ApiError.badRequest('This ticket has already been resolved');
    }

    await platformPrisma.$transaction(async (tx) => {
      await tx.supportMessage.create({
        data: {
          ticketId,
          senderName: 'System',
          senderRole: 'SYSTEM',
          body: `Module change request rejected by ${approverName}. Reason: ${reason}`,
          isSystemMessage: true,
        },
      });

      await tx.supportTicket.update({
        where: { id: ticketId },
        data: { status: TicketStatus.RESOLVED, resolvedAt: new Date() },
      });
    });

    const rejectResult = { ticketId, status: 'RESOLVED', rejectedBy: approverName, reason };

    // Emit real-time event
    emitTicketResolved(ticketId, ticket.companyId, rejectResult);

    return rejectResult;
  }

  // ────────────────────────────────────────────────────────────────────
  // Stats
  // ────────────────────────────────────────────────────────────────────

  async getStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [open, inProgress, waiting, resolvedToday] = await Promise.all([
      platformPrisma.supportTicket.count({ where: { status: TicketStatus.OPEN } }),
      platformPrisma.supportTicket.count({ where: { status: TicketStatus.IN_PROGRESS } }),
      platformPrisma.supportTicket.count({ where: { status: TicketStatus.WAITING_ON_CUSTOMER } }),
      platformPrisma.supportTicket.count({
        where: {
          status: TicketStatus.RESOLVED,
          resolvedAt: { gte: today },
        },
      }),
    ]);

    return { open, inProgress, waiting, resolvedToday };
  }
}

export const supportService = new SupportService();
