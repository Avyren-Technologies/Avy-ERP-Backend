import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { logger } from '../../../config/logger';
import { generateNextNumber } from '../../../shared/utils/number-series';
import { n } from '../../../shared/utils/prisma-helpers';
import crypto from 'crypto';
import type {
  CreateVisitInput,
  CheckInInput,
  CheckOutInput,
  ExtendVisitInput,
  VisitListFilters,
} from './visit.types';

class VisitService {

  /**
   * Generate a cryptographically random 6-character visit code.
   * Excludes ambiguous characters (I, O, 0, 1) for readability.
   * Retries up to 3 times on collision.
   */
  private async generateVisitCode(): Promise<string> {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 3; attempt++) {
      let code = '';
      const bytes = crypto.randomBytes(6);
      for (let i = 0; i < 6; i++) {
        code += chars[bytes[i]! % chars.length];
      }
      const existing = await platformPrisma.visit.findUnique({ where: { visitCode: code } });
      if (!existing) return code;
    }
    throw ApiError.conflict('Unable to generate unique visit code. Please try again.');
  }

  /**
   * Create a pre-registration (single visitor)
   */
  async createVisit(companyId: string, input: CreateVisitInput, createdBy: string): Promise<any> {
    // Validate visitor type exists and is active
    const visitorType = await platformPrisma.visitorType.findFirst({
      where: { id: input.visitorTypeId, companyId, isActive: true },
    });
    if (!visitorType) throw ApiError.notFound('Visitor type not found');

    // Validate host employee exists for this company
    const hostEmployee = await platformPrisma.employee.findFirst({
      where: { id: input.hostEmployeeId, companyId },
    });
    if (!hostEmployee) throw ApiError.notFound('Host employee not found');

    // Validate plant (location) exists for this company
    const plant = await platformPrisma.location.findFirst({
      where: { id: input.plantId, companyId },
    });
    if (!plant) throw ApiError.notFound('Plant/location not found');

    // Check watchlist/blocklist before creating
    await this.checkWatchlistBlocklist(companyId, input.visitorMobile, input.visitorName);

    const visitCode = await this.generateVisitCode();

    return platformPrisma.$transaction(async (tx) => {
      const visitNumber = await generateNextNumber(
        tx, companyId, ['Visitor', 'Visitor Registration'], 'Visitor Registration',
      );

      const visit = await tx.visit.create({
        data: {
          companyId,
          visitNumber,
          visitCode,
          visitorName: input.visitorName,
          visitorMobile: input.visitorMobile,
          visitorEmail: n(input.visitorEmail),
          visitorCompany: n(input.visitorCompany),
          visitorDesignation: n(input.visitorDesignation),
          visitorTypeId: input.visitorTypeId,
          purpose: input.purpose as any,
          purposeNotes: n(input.purposeNotes),
          expectedDate: new Date(input.expectedDate),
          expectedTime: n(input.expectedTime),
          expectedDurationMinutes: input.expectedDurationMinutes ?? visitorType.defaultMaxDurationMinutes ?? null,
          hostEmployeeId: input.hostEmployeeId,
          plantId: input.plantId,
          gateId: n(input.gateId),
          registrationMethod: 'PRE_REGISTERED',
          approvalStatus: visitorType.requireHostApproval ? 'PENDING' : 'AUTO_APPROVED',
          status: 'EXPECTED',
          vehicleRegNumber: n(input.vehicleRegNumber),
          vehicleType: n(input.vehicleType),
          materialCarriedIn: n(input.materialCarriedIn),
          specialInstructions: n(input.specialInstructions),
          emergencyContact: n(input.emergencyContact),
          meetingRef: n(input.meetingRef),
          purchaseOrderRef: n(input.purchaseOrderRef),
          safetyInductionStatus: visitorType.requireSafetyInduction ? 'PENDING' : 'NOT_REQUIRED',
          createdBy,
        },
        include: { visitorType: true },
      });

      // Dispatch notification to host (non-blocking)
      try {
        const { notificationService } = await import('../../../core/notifications/notification.service');
        await notificationService.dispatch({
          companyId,
          triggerEvent: 'VMS_PRE_REGISTRATION_CREATED',
          entityType: 'visit',
          entityId: visit.id,
          explicitRecipients: [input.hostEmployeeId],
          tokens: {
            visitorName: input.visitorName,
            visitorCompany: input.visitorCompany ?? '',
            visitDate: input.expectedDate,
            visitCode,
          },
          type: 'info',
        });
      } catch (err) {
        logger.warn('Failed to dispatch VMS pre-registration notification', { error: err, visitId: visit.id });
      }

      return visit;
    });
  }

  /**
   * List visits with filters and pagination
   */
  async listVisits(companyId: string, filters: VisitListFilters): Promise<{ data: any[]; total: number }> {
    const { page, limit, status, visitorTypeId, hostEmployeeId, plantId, gateId, registrationMethod, fromDate, toDate, search } = filters;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (status) where.status = status;
    if (visitorTypeId) where.visitorTypeId = visitorTypeId;
    if (hostEmployeeId) where.hostEmployeeId = hostEmployeeId;
    if (plantId) where.plantId = plantId;
    if (gateId) where.gateId = gateId;
    if (registrationMethod) where.registrationMethod = registrationMethod;
    if (fromDate || toDate) {
      where.expectedDate = {};
      if (fromDate) where.expectedDate.gte = new Date(fromDate);
      if (toDate) where.expectedDate.lte = new Date(toDate);
    }
    if (search) {
      where.OR = [
        { visitorName: { contains: search, mode: 'insensitive' } },
        { visitorMobile: { contains: search } },
        { visitorCompany: { contains: search, mode: 'insensitive' } },
        { visitCode: { contains: search, mode: 'insensitive' } },
        { visitNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      platformPrisma.visit.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { expectedDate: 'desc' },
        include: { visitorType: true },
      }),
      platformPrisma.visit.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Get visit by ID with all relations
   */
  async getVisitById(companyId: string, id: string): Promise<any> {
    const visit = await platformPrisma.visit.findFirst({
      where: { id, companyId },
      include: {
        visitorType: true,
        checkInGate: true,
        checkOutGate: true,
        assignedGate: true,
        groupVisit: true,
        recurringPass: true,
      },
    });
    if (!visit) throw ApiError.notFound('Visit not found');
    return visit;
  }

  /**
   * Get visit by visit code (for QR scan / code entry at gate)
   */
  async getVisitByCode(visitCode: string): Promise<any> {
    const visit = await platformPrisma.visit.findUnique({
      where: { visitCode },
      include: { visitorType: true },
    });
    if (!visit) throw ApiError.notFound('Visit not found for the provided code');
    return visit;
  }

  /**
   * Update visit (pre-registration details, before check-in only)
   */
  async updateVisit(companyId: string, id: string, input: Partial<CreateVisitInput>, updatedBy: string): Promise<any> {
    const visit = await platformPrisma.visit.findFirst({ where: { id, companyId } });
    if (!visit) throw ApiError.notFound('Visit not found');
    if (!['EXPECTED', 'ARRIVED'].includes(visit.status)) {
      throw ApiError.badRequest('Cannot update a visit that has already been checked in or completed');
    }

    return platformPrisma.visit.update({
      where: { id },
      data: {
        ...(input.visitorName && { visitorName: input.visitorName }),
        ...(input.visitorMobile && { visitorMobile: input.visitorMobile }),
        ...(input.visitorEmail !== undefined && { visitorEmail: n(input.visitorEmail) }),
        ...(input.visitorCompany !== undefined && { visitorCompany: n(input.visitorCompany) }),
        ...(input.visitorDesignation !== undefined && { visitorDesignation: n(input.visitorDesignation) }),
        ...(input.visitorTypeId && { visitorTypeId: input.visitorTypeId }),
        ...(input.purpose && { purpose: input.purpose as any }),
        ...(input.purposeNotes !== undefined && { purposeNotes: n(input.purposeNotes) }),
        ...(input.expectedDate && { expectedDate: new Date(input.expectedDate) }),
        ...(input.expectedTime !== undefined && { expectedTime: n(input.expectedTime) }),
        ...(input.expectedDurationMinutes && { expectedDurationMinutes: input.expectedDurationMinutes }),
        ...(input.hostEmployeeId && { hostEmployeeId: input.hostEmployeeId }),
        ...(input.plantId && { plantId: input.plantId }),
        ...(input.gateId !== undefined && { gateId: n(input.gateId) }),
        ...(input.vehicleRegNumber !== undefined && { vehicleRegNumber: n(input.vehicleRegNumber) }),
        ...(input.vehicleType !== undefined && { vehicleType: n(input.vehicleType) }),
        ...(input.materialCarriedIn !== undefined && { materialCarriedIn: n(input.materialCarriedIn) }),
        ...(input.specialInstructions !== undefined && { specialInstructions: n(input.specialInstructions) }),
        ...(input.emergencyContact !== undefined && { emergencyContact: n(input.emergencyContact) }),
        ...(input.purchaseOrderRef !== undefined && { purchaseOrderRef: n(input.purchaseOrderRef) }),
        updatedBy,
      },
      include: { visitorType: true },
    });
  }

  /**
   * Cancel a visit (only when not yet checked in)
   */
  async cancelVisit(companyId: string, id: string, cancelledBy: string): Promise<any> {
    const visit = await platformPrisma.visit.findFirst({ where: { id, companyId } });
    if (!visit) throw ApiError.notFound('Visit not found');
    if (['CHECKED_IN', 'CHECKED_OUT', 'AUTO_CHECKED_OUT'].includes(visit.status)) {
      throw ApiError.badRequest('Cannot cancel a visit that is already in progress or completed');
    }

    return platformPrisma.visit.update({
      where: { id },
      data: { status: 'CANCELLED', updatedBy: cancelledBy },
    });
  }

  /**
   * Check in a visitor -- atomic conditional update to prevent duplicate check-ins.
   * Uses raw SQL to ensure atomicity: only updates if status is EXPECTED or ARRIVED.
   */
  async checkIn(companyId: string, id: string, input: CheckInInput, guardId: string): Promise<any> {
    return platformPrisma.$transaction(async (tx) => {
      // Atomic conditional update: only succeeds if status is valid for check-in
      const updated = await tx.$executeRaw`
        UPDATE visits
        SET status = 'CHECKED_IN',
            "checkInTime" = NOW(),
            "checkInGateId" = ${input.checkInGateId},
            "checkInGuardId" = ${guardId},
            "visitorPhoto" = COALESCE(${input.visitorPhoto ?? null}, "visitorPhoto"),
            "governmentIdType" = COALESCE(${input.governmentIdType ?? null}, "governmentIdType"),
            "governmentIdNumber" = COALESCE(${input.governmentIdNumber ?? null}, "governmentIdNumber"),
            "idDocumentPhoto" = COALESCE(${input.idDocumentPhoto ?? null}, "idDocumentPhoto"),
            "badgeFormat" = COALESCE(${input.badgeFormat ?? null}, "badgeFormat"),
            "updatedAt" = NOW(),
            "updatedBy" = ${guardId}
        WHERE id = ${id}
          AND "companyId" = ${companyId}
          AND status IN ('EXPECTED', 'ARRIVED')
      `;

      if (updated === 0) {
        // Determine the specific reason for failure
        const existing = await tx.visit.findFirst({ where: { id, companyId } });
        if (!existing) throw ApiError.notFound('Visit not found');
        if (existing.status === 'CHECKED_IN') {
          throw ApiError.conflict(
            `This visitor is already checked in (checked in at ${existing.checkInTime?.toISOString()})`,
          );
        }
        throw ApiError.badRequest(`Cannot check in a visit with status: ${existing.status}`);
      }

      // Generate badge number using number series
      const badgeNumber = await generateNextNumber(
        tx, companyId, ['Visitor Badge', 'Badge'], 'Visitor Badge',
      );
      await tx.visit.update({
        where: { id },
        data: { badgeNumber },
      });

      // Check watchlist/blocklist after check-in (for warnings)
      const visit = await tx.visit.findUnique({
        where: { id },
        include: { visitorType: true, checkInGate: true },
      });

      let watchlistWarning: string | undefined;
      try {
        const watchlistMatch = await this.checkWatchlistBlocklistSafe(
          companyId, visit!.visitorMobile, visit!.visitorName,
        );
        if (watchlistMatch) {
          watchlistWarning = `Watchlist alert: ${watchlistMatch.reason}`;
        }
      } catch (err) {
        // If blocklist match found after check-in, create denied entry and revert
        if (err instanceof ApiError) {
          await tx.visit.update({
            where: { id },
            data: { status: 'CANCELLED', updatedBy: guardId },
          });
          await tx.deniedEntry.create({
            data: {
              companyId,
              visitorName: visit!.visitorName,
              visitorMobile: visit!.visitorMobile,
              visitorCompany: visit!.visitorCompany,
              denialReason: 'BLOCKLIST_MATCH',
              denialDetails: 'Blocklist match detected during check-in',
              visitId: id,
              plantId: visit!.plantId,
              deniedBy: guardId,
            },
          });
          throw err;
        }
      }

      // Dispatch host notification (non-blocking)
      try {
        const { notificationService } = await import('../../../core/notifications/notification.service');
        await notificationService.dispatch({
          companyId,
          triggerEvent: 'VMS_VISITOR_CHECKED_IN',
          entityType: 'visit',
          entityId: id,
          explicitRecipients: [visit!.hostEmployeeId],
          tokens: {
            visitorName: visit!.visitorName,
            gate: visit!.checkInGate?.name ?? 'Unknown',
            badgeNumber: badgeNumber,
          },
          type: 'info',
        });
      } catch (err) {
        logger.warn('Failed to dispatch VMS check-in notification', { error: err, visitId: id });
      }

      return { ...visit, badgeNumber, watchlistWarning };
    });
  }

  /**
   * Check out a visitor -- atomic conditional update.
   * Only succeeds if the visitor is currently checked in.
   */
  async checkOut(companyId: string, id: string, input: CheckOutInput, userId: string): Promise<any> {
    return platformPrisma.$transaction(async (tx) => {
      const updated = await tx.$executeRaw`
        UPDATE visits
        SET status = 'CHECKED_OUT',
            "checkOutTime" = NOW(),
            "checkOutGateId" = ${input.checkOutGateId ?? null},
            "checkOutMethod" = ${input.checkOutMethod}::"CheckOutMethod",
            "badgeReturned" = ${input.badgeReturned ?? null},
            "materialOut" = ${input.materialOut ?? null},
            "updatedAt" = NOW(),
            "updatedBy" = ${userId}
        WHERE id = ${id}
          AND "companyId" = ${companyId}
          AND status = 'CHECKED_IN'
      `;

      if (updated === 0) {
        const existing = await tx.visit.findFirst({ where: { id, companyId } });
        if (!existing) throw ApiError.notFound('Visit not found');
        if (existing.status === 'CHECKED_OUT' || existing.status === 'AUTO_CHECKED_OUT') {
          throw ApiError.conflict('This visitor has already been checked out');
        }
        throw ApiError.badRequest(`Cannot check out a visit with status: ${existing.status}`);
      }

      // Calculate visit duration
      const visit = await tx.visit.findUnique({ where: { id } });
      if (visit?.checkInTime && visit?.checkOutTime) {
        const durationMs = visit.checkOutTime.getTime() - visit.checkInTime.getTime();
        const durationMinutes = Math.round(durationMs / 60000);
        await tx.visit.update({
          where: { id },
          data: { visitDurationMinutes: durationMinutes },
        });
      }

      const final = await tx.visit.findUnique({
        where: { id },
        include: { visitorType: true },
      });

      // Dispatch host notification (non-blocking)
      try {
        const { notificationService } = await import('../../../core/notifications/notification.service');
        await notificationService.dispatch({
          companyId,
          triggerEvent: 'VMS_VISITOR_CHECKED_OUT',
          entityType: 'visit',
          entityId: id,
          explicitRecipients: [final!.hostEmployeeId],
          tokens: {
            visitorName: final!.visitorName,
            duration: `${final!.visitDurationMinutes ?? 0} minutes`,
          },
          type: 'info',
        });
      } catch (err) {
        logger.warn('Failed to dispatch VMS check-out notification', { error: err, visitId: id });
      }

      return final;
    });
  }

  /**
   * Approve a visit (host or authorized approver)
   */
  async approveVisit(companyId: string, id: string, approvedBy: string, notes?: string): Promise<any> {
    const visit = await platformPrisma.visit.findFirst({ where: { id, companyId } });
    if (!visit) throw ApiError.notFound('Visit not found');
    if (visit.approvalStatus !== 'PENDING') {
      throw ApiError.badRequest(`Visit is already ${visit.approvalStatus.toLowerCase()}`);
    }

    return platformPrisma.visit.update({
      where: { id },
      data: {
        approvalStatus: 'APPROVED',
        approvedBy,
        approvalTimestamp: new Date(),
        approvalNotes: n(notes),
        updatedBy: approvedBy,
      },
      include: { visitorType: true },
    });
  }

  /**
   * Reject a visit and create a denied entry record
   */
  async rejectVisit(companyId: string, id: string, rejectedBy: string, notes?: string): Promise<any> {
    const visit = await platformPrisma.visit.findFirst({ where: { id, companyId } });
    if (!visit) throw ApiError.notFound('Visit not found');
    if (visit.approvalStatus !== 'PENDING') {
      throw ApiError.badRequest(`Visit is already ${visit.approvalStatus.toLowerCase()}`);
    }

    const updated = await platformPrisma.visit.update({
      where: { id },
      data: {
        approvalStatus: 'REJECTED',
        status: 'REJECTED',
        approvedBy: rejectedBy,
        approvalTimestamp: new Date(),
        approvalNotes: n(notes),
        updatedBy: rejectedBy,
      },
    });

    // Create denied entry record for audit trail
    await platformPrisma.deniedEntry.create({
      data: {
        companyId,
        visitorName: visit.visitorName,
        visitorMobile: visit.visitorMobile,
        visitorCompany: visit.visitorCompany,
        denialReason: 'HOST_REJECTED',
        denialDetails: n(notes),
        visitId: id,
        plantId: visit.plantId,
        deniedBy: rejectedBy,
      },
    });

    return updated;
  }

  /**
   * Extend visit duration (only while checked in)
   * Max 3 extensions, max 24 hours total duration.
   */
  async extendVisit(companyId: string, id: string, input: ExtendVisitInput, extendedBy: string): Promise<any> {
    const visit = await platformPrisma.visit.findFirst({ where: { id, companyId } });
    if (!visit) throw ApiError.notFound('Visit not found');
    if (visit.status !== 'CHECKED_IN') {
      throw ApiError.badRequest('Can only extend an active (checked-in) visit');
    }

    const maxExtensions = 3;
    if (visit.extensionCount >= maxExtensions) {
      throw ApiError.badRequest(`Maximum ${maxExtensions} extensions allowed per visit`);
    }

    const currentDuration = visit.expectedDurationMinutes ?? 480;
    const newDuration = currentDuration + input.additionalMinutes;
    if (newDuration > 1440) {
      throw ApiError.badRequest('Total visit duration cannot exceed 24 hours');
    }

    // Persist extension reason in specialInstructions
    const extensionNote = `[Extension ${visit.extensionCount + 1}] +${input.additionalMinutes}min: ${input.reason}`;
    const updatedInstructions = visit.specialInstructions
      ? `${visit.specialInstructions}\n${extensionNote}`
      : extensionNote;

    return platformPrisma.visit.update({
      where: { id },
      data: {
        expectedDurationMinutes: newDuration,
        originalDurationMinutes: visit.originalDurationMinutes ?? currentDuration,
        extensionCount: visit.extensionCount + 1,
        lastExtendedAt: new Date(),
        lastExtendedBy: extendedBy,
        specialInstructions: updatedInstructions,
        updatedBy: extendedBy,
      },
      include: { visitorType: true },
    });
  }

  /**
   * Complete safety induction for a visit
   */
  async completeInduction(companyId: string, id: string, score: number | undefined, passed: boolean): Promise<any> {
    const visit = await platformPrisma.visit.findFirst({ where: { id, companyId } });
    if (!visit) throw ApiError.notFound('Visit not found');

    return platformPrisma.visit.update({
      where: { id },
      data: {
        safetyInductionStatus: passed ? 'COMPLETED' : 'FAILED',
        safetyInductionScore: score ?? null,
        safetyInductionTimestamp: new Date(),
      },
    });
  }

  /**
   * Check visitor against watchlist/blocklist.
   * Throws ApiError if blocklisted. Returns watchlist match if found.
   */
  async checkWatchlistBlocklist(
    companyId: string,
    mobile: string,
    name: string,
    idNumber?: string,
  ): Promise<any | null> {
    const conditions: any[] = [];
    if (mobile) conditions.push({ mobileNumber: mobile });
    if (idNumber) conditions.push({ idNumber });
    if (name) conditions.push({ personName: { contains: name, mode: 'insensitive' } });

    if (conditions.length === 0) return null;

    const entries = await platformPrisma.visitorWatchlist.findMany({
      where: {
        companyId,
        isActive: true,
        OR: conditions,
        // Exclude expired UNTIL_DATE entries
        NOT: {
          blockDuration: 'UNTIL_DATE',
          expiryDate: { lt: new Date() },
        },
      },
    });

    const blocklisted = entries.find(e => e.type === 'BLOCKLIST');
    if (blocklisted) {
      throw ApiError.badRequest(
        `Entry denied: ${blocklisted.reason}. This person is on the blocklist.`,
      );
    }

    const watchlisted = entries.find(e => e.type === 'WATCHLIST');
    return watchlisted ?? null;
  }

  /**
   * Safe version of watchlist check that returns null instead of throwing
   * for watchlist matches (blocklist still throws).
   */
  private async checkWatchlistBlocklistSafe(
    companyId: string,
    mobile: string,
    name: string,
  ): Promise<any | null> {
    const conditions: any[] = [];
    if (mobile) conditions.push({ mobileNumber: mobile });
    if (name) conditions.push({ personName: { contains: name, mode: 'insensitive' } });

    if (conditions.length === 0) return null;

    const entries = await platformPrisma.visitorWatchlist.findMany({
      where: {
        companyId,
        isActive: true,
        OR: conditions,
        NOT: {
          blockDuration: 'UNTIL_DATE',
          expiryDate: { lt: new Date() },
        },
      },
    });

    const blocklisted = entries.find(e => e.type === 'BLOCKLIST');
    if (blocklisted) {
      throw ApiError.badRequest(
        `Entry denied: ${blocklisted.reason}. This person is on the blocklist.`,
      );
    }

    return entries.find(e => e.type === 'WATCHLIST') ?? null;
  }
}

export const visitService = new VisitService();
