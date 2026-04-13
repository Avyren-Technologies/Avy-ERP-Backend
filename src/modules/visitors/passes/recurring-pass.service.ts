import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { generateNextNumber } from '../../../shared/utils/number-series';
import { n } from '../../../shared/utils/prisma-helpers';

class RecurringPassService {

  async list(companyId: string, filters: { status?: string | undefined; search?: string | undefined; page: number; limit: number }) {
    const { page, limit, status, search } = filters;
    const offset = (page - 1) * limit;
    const where: any = { companyId };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { visitorName: { contains: search, mode: 'insensitive' } },
        { visitorCompany: { contains: search, mode: 'insensitive' } },
        { visitorMobile: { contains: search } },
        { passNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      platformPrisma.recurringVisitorPass.findMany({ where, skip: offset, take: limit, orderBy: { createdAt: 'desc' } }),
      platformPrisma.recurringVisitorPass.count({ where }),
    ]);
    return { data, total };
  }

  async getById(companyId: string, id: string) {
    const pass = await platformPrisma.recurringVisitorPass.findFirst({ where: { id, companyId } });
    if (!pass) throw ApiError.notFound('Recurring pass not found');
    return pass;
  }

  async create(companyId: string, input: any, createdBy: string) {
    return platformPrisma.$transaction(async (tx) => {
      const passNumber = await generateNextNumber(
        tx, companyId, ['Recurring Visitor Pass', 'Recurring Pass'], 'Recurring Visitor Pass',
      );

      return tx.recurringVisitorPass.create({
        data: {
          companyId,
          passNumber,
          visitorName: input.visitorName,
          visitorCompany: input.visitorCompany,
          visitorMobile: input.visitorMobile,
          visitorEmail: n(input.visitorEmail),
          visitorPhoto: n(input.visitorPhoto),
          visitorIdType: n(input.visitorIdType),
          visitorIdNumber: n(input.visitorIdNumber),
          passType: input.passType,
          validFrom: new Date(input.validFrom),
          validUntil: new Date(input.validUntil),
          allowedDays: input.allowedDays ?? [],
          allowedTimeFrom: n(input.allowedTimeFrom),
          allowedTimeTo: n(input.allowedTimeTo),
          allowedGateIds: input.allowedGateIds ?? [],
          hostEmployeeId: input.hostEmployeeId,
          purpose: input.purpose,
          plantId: input.plantId,
          createdBy,
        },
      });
    });
  }

  async update(companyId: string, id: string, input: any) {
    const existing = await platformPrisma.recurringVisitorPass.findFirst({ where: { id, companyId } });
    if (!existing) throw ApiError.notFound('Recurring pass not found');
    if (existing.status !== 'ACTIVE') throw ApiError.badRequest('Can only update active passes');

    return platformPrisma.recurringVisitorPass.update({
      where: { id },
      data: {
        ...(input.visitorName && { visitorName: input.visitorName }),
        ...(input.visitorCompany && { visitorCompany: input.visitorCompany }),
        ...(input.visitorMobile && { visitorMobile: input.visitorMobile }),
        ...(input.visitorEmail !== undefined && { visitorEmail: n(input.visitorEmail) }),
        ...(input.visitorPhoto !== undefined && { visitorPhoto: n(input.visitorPhoto) }),
        ...(input.passType && { passType: input.passType }),
        ...(input.validFrom && { validFrom: new Date(input.validFrom) }),
        ...(input.validUntil && { validUntil: new Date(input.validUntil) }),
        ...(input.allowedDays && { allowedDays: input.allowedDays }),
        ...(input.allowedTimeFrom !== undefined && { allowedTimeFrom: n(input.allowedTimeFrom) }),
        ...(input.allowedTimeTo !== undefined && { allowedTimeTo: n(input.allowedTimeTo) }),
        ...(input.allowedGateIds && { allowedGateIds: input.allowedGateIds }),
        ...(input.hostEmployeeId && { hostEmployeeId: input.hostEmployeeId }),
        ...(input.purpose && { purpose: input.purpose }),
        ...(input.plantId && { plantId: input.plantId }),
      },
    });
  }

  async revoke(companyId: string, id: string, reason: string, revokedBy: string) {
    const existing = await platformPrisma.recurringVisitorPass.findFirst({ where: { id, companyId } });
    if (!existing) throw ApiError.notFound('Recurring pass not found');
    if (existing.status !== 'ACTIVE') throw ApiError.badRequest('Pass is already revoked or expired');

    return platformPrisma.recurringVisitorPass.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt: new Date(), revokedBy, revokeReason: reason },
    });
  }

  /**
   * Check in via recurring pass. Creates a full Visit record linked to the pass.
   */
  async checkInViaPass(companyId: string, passId: string, gateId: string, guardId: string) {
    const pass = await platformPrisma.recurringVisitorPass.findFirst({ where: { id: passId, companyId } });
    if (!pass) throw ApiError.notFound('Recurring pass not found');
    if (pass.status !== 'ACTIVE') throw ApiError.badRequest('Pass is not active');

    const now = new Date();
    if (now < pass.validFrom || now > pass.validUntil) {
      throw ApiError.badRequest('Pass is outside its validity period');
    }

    // Check allowed day
    if (pass.allowedDays.length > 0) {
      const today = now.getDay(); // 0=Sun
      if (!pass.allowedDays.includes(today)) {
        throw ApiError.badRequest('Pass is not valid for today');
      }
    }

    // Check allowed gate
    if (pass.allowedGateIds.length > 0 && !pass.allowedGateIds.includes(gateId)) {
      throw ApiError.badRequest('Pass is not valid for this gate');
    }

    // Look up default visitor type ("Business Guest" code: 'BG') for this company
    const defaultVisitorType = await platformPrisma.visitorType.findFirst({
      where: { companyId, code: 'BG', isActive: true },
    });
    if (!defaultVisitorType) {
      throw ApiError.badRequest('No default visitor type (Business Guest) configured for this company. Please set up visitor types first.');
    }

    // Create a visit record linked to this pass
    return platformPrisma.$transaction(async (tx) => {
      const visitNumber = await generateNextNumber(
        tx, companyId, ['Visitor', 'Visitor Registration'], 'Visitor Registration',
      );
      const badgeNumber = await generateNextNumber(
        tx, companyId, ['Visitor Badge', 'Badge'], 'Visitor Badge',
      );

      // Generate a visit code using ambiguous-character-free alphabet
      const crypto = await import('crypto');
      const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let visitCode = '';
      const bytes = crypto.randomBytes(6);
      for (let i = 0; i < 6; i++) {
        visitCode += ALPHABET[bytes[i]! % ALPHABET.length];
      }

      return tx.visit.create({
        data: {
          companyId,
          visitNumber,
          visitCode,
          visitorName: pass.visitorName,
          visitorMobile: pass.visitorMobile,
          visitorEmail: pass.visitorEmail,
          visitorCompany: pass.visitorCompany,
          visitorPhoto: pass.visitorPhoto,
          governmentIdType: pass.visitorIdType,
          governmentIdNumber: pass.visitorIdNumber,
          visitorTypeId: defaultVisitorType.id,
          purpose: 'OTHER' as any,
          purposeNotes: pass.purpose,
          expectedDate: now,
          hostEmployeeId: pass.hostEmployeeId,
          plantId: pass.plantId,
          gateId,
          registrationMethod: 'PRE_REGISTERED',
          approvalStatus: 'AUTO_APPROVED',
          status: 'CHECKED_IN',
          checkInTime: now,
          checkInGateId: gateId,
          checkInGuardId: guardId,
          badgeNumber,
          recurringPassId: passId,
          createdBy: guardId,
        },
      });
    });
  }
}

export const recurringPassService = new RecurringPassService();
