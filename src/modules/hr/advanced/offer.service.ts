import { Prisma } from '@prisma/client';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { generateNextNumber } from '../../../shared/utils/number-series';
import { auditLog } from '../../../shared/utils/audit';
import {
  validateTransition,
  OFFER_TRANSITIONS,
  CANDIDATE_STAGE_TRANSITIONS,
} from '../../../shared/utils/state-machine';
import { eventBus } from '../../../shared/events/event-bus';
import { HR_EVENTS } from '../../../shared/events/hr-events';

/** Convert undefined to null for Prisma nullable fields. */
function n<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

interface ListOptions {
  page?: number;
  limit?: number;
}

interface OfferListOptions extends ListOptions {
  candidateId?: string;
  status?: string;
}

class OfferService {
  // ════════════════════════════════════════════════════════════════
  // LIST
  // ════════════════════════════════════════════════════════════════

  async listOffers(companyId: string, options: OfferListOptions = {}) {
    const { page = 1, limit = 25, candidateId, status } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (candidateId) where.candidateId = candidateId;
    if (status) where.status = status.toUpperCase();

    const [offers, total] = await Promise.all([
      platformPrisma.candidateOffer.findMany({
        where,
        include: {
          candidate: { select: { id: true, name: true, email: true, stage: true } },
          designation: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.candidateOffer.count({ where }),
    ]);

    // Lazy expiry: auto-expire SENT offers past validUntil
    const now = new Date();
    for (const offer of offers) {
      if (offer.status === 'SENT' && offer.validUntil && new Date(offer.validUntil) < now) {
        await platformPrisma.candidateOffer.update({
          where: { id: offer.id },
          data: { status: 'EXPIRED' },
        });
        (offer as any).status = 'EXPIRED';
      }
    }

    return { offers, total, page, limit };
  }

  // ════════════════════════════════════════════════════════════════
  // GET
  // ════════════════════════════════════════════════════════════════

  async getOffer(companyId: string, id: string) {
    const offer = await platformPrisma.candidateOffer.findUnique({
      where: { id },
      include: {
        candidate: { select: { id: true, name: true, email: true, stage: true } },
        designation: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });

    if (!offer || offer.companyId !== companyId) {
      throw ApiError.notFound('Offer not found');
    }

    // Lazy expiry
    if (offer.status === 'SENT' && offer.validUntil && new Date(offer.validUntil) < new Date()) {
      const updated = await platformPrisma.candidateOffer.update({
        where: { id },
        data: { status: 'EXPIRED' },
        include: {
          candidate: { select: { id: true, name: true, email: true, stage: true } },
          designation: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
        },
      });
      return updated;
    }

    return offer;
  }

  // ════════════════════════════════════════════════════════════════
  // CREATE
  // ════════════════════════════════════════════════════════════════

  async createOffer(companyId: string, data: any, userId?: string) {
    // Validate candidate exists and belongs to company
    const candidate = await platformPrisma.candidate.findUnique({
      where: { id: data.candidateId },
    });
    if (!candidate || candidate.companyId !== companyId) {
      throw ApiError.notFound('Candidate not found');
    }

    const offerNumber = await generateNextNumber(
      platformPrisma, companyId, ['Offer Management'], 'Offer',
    );

    const offer = await platformPrisma.candidateOffer.create({
      data: {
        companyId,
        offerNumber,
        candidateId: data.candidateId,
        designationId: n(data.designationId),
        departmentId: n(data.departmentId),
        offeredCtc: data.offeredCtc,
        ctcBreakup: data.ctcBreakup ?? Prisma.JsonNull,
        joiningDate: data.joiningDate ? new Date(data.joiningDate) : null,
        offerLetterUrl: n(data.offerLetterUrl),
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        notes: n(data.notes),
        status: 'DRAFT',
      },
      include: {
        candidate: { select: { id: true, name: true, email: true, stage: true } },
        designation: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });

    return offer;
  }

  // ════════════════════════════════════════════════════════════════
  // UPDATE
  // ════════════════════════════════════════════════════════════════

  async updateOffer(companyId: string, id: string, data: any) {
    const offer = await platformPrisma.candidateOffer.findUnique({ where: { id } });
    if (!offer || offer.companyId !== companyId) {
      throw ApiError.notFound('Offer not found');
    }

    if (offer.status !== 'DRAFT') {
      throw ApiError.badRequest('Only DRAFT offers can be updated');
    }

    return platformPrisma.candidateOffer.update({
      where: { id },
      data: {
        ...(data.designationId !== undefined && { designationId: n(data.designationId) }),
        ...(data.departmentId !== undefined && { departmentId: n(data.departmentId) }),
        ...(data.offeredCtc !== undefined && { offeredCtc: data.offeredCtc }),
        ...(data.ctcBreakup !== undefined && { ctcBreakup: data.ctcBreakup ?? Prisma.JsonNull }),
        ...(data.joiningDate !== undefined && { joiningDate: data.joiningDate ? new Date(data.joiningDate) : null }),
        ...(data.offerLetterUrl !== undefined && { offerLetterUrl: n(data.offerLetterUrl) }),
        ...(data.validUntil !== undefined && { validUntil: data.validUntil ? new Date(data.validUntil) : null }),
        ...(data.notes !== undefined && { notes: n(data.notes) }),
      },
      include: {
        candidate: { select: { id: true, name: true, email: true, stage: true } },
        designation: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });
  }

  // ════════════════════════════════════════════════════════════════
  // UPDATE STATUS
  // ════════════════════════════════════════════════════════════════

  async updateOfferStatus(companyId: string, id: string, statusData: { status: string; rejectionReason?: string | undefined }, userId?: string) {
    const offer = await platformPrisma.candidateOffer.findUnique({ where: { id } });
    if (!offer || offer.companyId !== companyId) {
      throw ApiError.notFound('Offer not found');
    }

    const oldStatus = offer.status;
    validateTransition(oldStatus, statusData.status, OFFER_TRANSITIONS, 'offer status');

    const updateData: any = { status: statusData.status };

    switch (statusData.status) {
      case 'ACCEPTED':
        updateData.acceptedAt = new Date();
        break;
      case 'REJECTED':
        updateData.rejectedAt = new Date();
        updateData.rejectionReason = statusData.rejectionReason;
        break;
      case 'WITHDRAWN':
        updateData.withdrawnAt = new Date();
        break;
    }

    const updated = await platformPrisma.candidateOffer.update({
      where: { id },
      data: updateData,
      include: {
        candidate: { select: { id: true, name: true, email: true, stage: true } },
        designation: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });

    // On ACCEPTED: auto-advance candidate to HIRED stage
    if (statusData.status === 'ACCEPTED') {
      const candidate = await platformPrisma.candidate.findUnique({
        where: { id: offer.candidateId },
      });
      if (candidate && candidate.stage !== 'HIRED') {
        // Only advance if transition is valid
        const allowed = CANDIDATE_STAGE_TRANSITIONS[candidate.stage];
        if (allowed && allowed.includes('HIRED')) {
          await platformPrisma.candidate.update({
            where: { id: offer.candidateId },
            data: { stage: 'HIRED' },
          });
        }
      }
    }

    await auditLog({
      entityType: 'CandidateOffer',
      entityId: id,
      action: 'STATUS_CHANGE',
      before: { status: oldStatus },
      after: { status: statusData.status },
      changedBy: userId || 'system',
      companyId,
    });

    if (statusData.status === 'SENT') {
      eventBus.emitEvent(HR_EVENTS.OFFER_SENT, { offerId: id, candidateId: offer.candidateId, companyId });
    }
    if (statusData.status === 'ACCEPTED') {
      eventBus.emitEvent(HR_EVENTS.OFFER_ACCEPTED, { offerId: id, candidateId: offer.candidateId, companyId });
    }
    if (statusData.status === 'REJECTED') {
      eventBus.emitEvent(HR_EVENTS.OFFER_REJECTED, { offerId: id, candidateId: offer.candidateId, companyId });
    }

    return updated;
  }

  // ════════════════════════════════════════════════════════════════
  // DELETE
  // ════════════════════════════════════════════════════════════════

  async deleteOffer(companyId: string, id: string) {
    const offer = await platformPrisma.candidateOffer.findUnique({ where: { id } });
    if (!offer || offer.companyId !== companyId) {
      throw ApiError.notFound('Offer not found');
    }

    if (offer.status !== 'DRAFT') {
      throw ApiError.badRequest('Only DRAFT offers can be deleted');
    }

    await platformPrisma.candidateOffer.delete({ where: { id } });
    return { message: 'Offer deleted' };
  }
}

export const offerService = new OfferService();
