import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { logger } from '../../../config/logger';
import { generateNextNumber } from '../../../shared/utils/number-series';
import { n } from '../../../shared/utils/prisma-helpers';
import QRCode from 'qrcode';

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

    // Resolve host employee names from IDs
    const hostIds = [...new Set(data.map(p => p.hostEmployeeId).filter(Boolean))] as string[];
    const hosts = hostIds.length > 0 ? await platformPrisma.employee.findMany({
      where: { id: { in: hostIds } },
      select: { id: true, firstName: true, lastName: true },
    }) : [];
    const hostMap = new Map(hosts.map(h => [h.id, `${h.firstName} ${h.lastName}`]));

    const enrichedData = data.map(p => ({
      ...p,
      hostEmployeeName: p.hostEmployeeId ? (hostMap.get(p.hostEmployeeId) ?? null) : null,
    }));

    return { data: enrichedData, total };
  }

  async getById(companyId: string, id: string) {
    const pass = await platformPrisma.recurringVisitorPass.findFirst({ where: { id, companyId } });
    if (!pass) throw ApiError.notFound('Recurring pass not found');

    // Resolve host employee name
    let hostEmployeeName: string | null = null;
    if (pass.hostEmployeeId) {
      const host = await platformPrisma.employee.findUnique({
        where: { id: pass.hostEmployeeId },
        select: { firstName: true, lastName: true },
      });
      if (host) hostEmployeeName = `${host.firstName} ${host.lastName}`;
    }

    return { ...pass, hostEmployeeName };
  }

  async create(companyId: string, input: any, createdBy: string) {
    const pass = await platformPrisma.$transaction(async (tx) => {
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

    // Generate QR code as data URL (non-blocking — pass is still usable without it)
    try {
      const qrCode = await QRCode.toDataURL(pass.passNumber, {
        width: 300,
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' },
      });
      await platformPrisma.recurringVisitorPass.update({
        where: { id: pass.id },
        data: { qrCode },
      });
      pass.qrCode = qrCode;
    } catch (err) {
      logger.warn('Failed to generate QR code for recurring pass', { passId: pass.id, error: err });
    }

    // Send pass email to visitor (non-blocking)
    if (input.visitorEmail) {
      try {
        const { sendRecurringPassEmail } = await import('../shared/vms-email.service');
        const company = await platformPrisma.company.findFirst({ where: { id: companyId }, select: { name: true, displayName: true } });
        const host = input.hostEmployeeId ? await platformPrisma.employee.findFirst({ where: { id: input.hostEmployeeId }, select: { firstName: true, lastName: true } }) : null;
        const plantRecord = input.plantId ? await platformPrisma.location.findFirst({ where: { id: input.plantId }, select: { name: true } }) : null;

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const allowedDaysStr = input.allowedDays?.length > 0
          ? input.allowedDays.map((d: number) => dayNames[d]).join(', ')
          : 'All days';
        const allowedTimeStr = input.allowedTimeFrom && input.allowedTimeTo
          ? `${input.allowedTimeFrom} - ${input.allowedTimeTo}`
          : undefined;

        sendRecurringPassEmail({
          visitorEmail: input.visitorEmail,
          visitorName: input.visitorName,
          visitorCompany: input.visitorCompany,
          companyName: company?.displayName ?? company?.name ?? 'Facility',
          passNumber: pass.passNumber,
          passType: input.passType,
          validFrom: input.validFrom,
          validUntil: input.validUntil,
          hostName: host ? `${host.firstName} ${host.lastName}` : undefined,
          purpose: input.purpose,
          plantName: plantRecord?.name,
          qrCodeDataUrl: pass.qrCode ?? undefined,
          allowedDays: allowedDaysStr,
          allowedTime: allowedTimeStr,
        });
      } catch (emailErr) {
        logger.warn('Failed to send recurring pass email', { error: emailErr, passId: pass.id });
      }
    }

    return pass;
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

    // Check allowed time window
    if (pass.allowedTimeFrom && pass.allowedTimeTo) {
      const currentTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
      if (currentTime < pass.allowedTimeFrom || currentTime > pass.allowedTimeTo) {
        throw ApiError.badRequest(`Pass is only valid between ${pass.allowedTimeFrom} and ${pass.allowedTimeTo}`);
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
