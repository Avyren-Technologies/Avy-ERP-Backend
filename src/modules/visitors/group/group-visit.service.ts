import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { generateNextNumber } from '../../../shared/utils/number-series';
import { n } from '../../../shared/utils/prisma-helpers';
import crypto from 'crypto';

class GroupVisitService {

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

  private async generateGroupVisitCode(): Promise<string> {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 3; attempt++) {
      let code = 'G-';
      const bytes = crypto.randomBytes(6);
      for (let i = 0; i < 6; i++) {
        code += chars[bytes[i]! % chars.length];
      }
      const existing = await platformPrisma.groupVisit.findUnique({ where: { visitCode: code } });
      if (!existing) return code;
    }
    throw ApiError.conflict('Unable to generate unique group visit code');
  }

  async list(companyId: string, filters: { status?: string | undefined; fromDate?: string | undefined; toDate?: string | undefined; search?: string | undefined; page: number; limit: number }) {
    const { page, limit, status, fromDate, toDate, search } = filters;
    const offset = (page - 1) * limit;
    const where: any = { companyId };
    if (status) where.status = status;
    if (fromDate || toDate) {
      where.expectedDate = {};
      if (fromDate) where.expectedDate.gte = new Date(fromDate);
      if (toDate) where.expectedDate.lte = new Date(toDate);
    }
    if (search) {
      where.OR = [
        { groupName: { contains: search, mode: 'insensitive' } },
        { visitCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      platformPrisma.groupVisit.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { expectedDate: 'desc' },
        include: { members: true },
      }),
      platformPrisma.groupVisit.count({ where }),
    ]);
    return { data, total };
  }

  async getById(companyId: string, id: string) {
    const group = await platformPrisma.groupVisit.findFirst({
      where: { id, companyId },
      include: { members: { include: { visit: true } } },
    });
    if (!group) throw ApiError.notFound('Group visit not found');
    return group;
  }

  async create(companyId: string, input: any, createdBy: string) {
    const visitCode = await this.generateGroupVisitCode();

    return platformPrisma.$transaction(async (tx) => {
      const group = await tx.groupVisit.create({
        data: {
          companyId,
          groupName: input.groupName,
          visitCode,
          hostEmployeeId: input.hostEmployeeId,
          purpose: input.purpose,
          expectedDate: new Date(input.expectedDate),
          expectedTime: n(input.expectedTime),
          plantId: input.plantId,
          gateId: n(input.gateId),
          totalMembers: input.members.length,
          createdBy,
        },
      });

      // Create group members
      for (const member of input.members) {
        await tx.groupVisitMember.create({
          data: {
            groupVisitId: group.id,
            visitorName: member.visitorName,
            visitorMobile: member.visitorMobile,
            visitorEmail: n(member.visitorEmail),
            visitorCompany: n(member.visitorCompany),
          },
        });
      }

      return tx.groupVisit.findUnique({
        where: { id: group.id },
        include: { members: true },
      });
    });
  }

  async update(companyId: string, id: string, input: any) {
    const existing = await platformPrisma.groupVisit.findFirst({ where: { id, companyId } });
    if (!existing) throw ApiError.notFound('Group visit not found');
    if (existing.status !== 'PLANNED') throw ApiError.badRequest('Can only update planned group visits');

    return platformPrisma.groupVisit.update({
      where: { id },
      data: {
        ...(input.groupName && { groupName: input.groupName }),
        ...(input.purpose && { purpose: input.purpose }),
        ...(input.expectedDate && { expectedDate: new Date(input.expectedDate) }),
        ...(input.expectedTime !== undefined && { expectedTime: n(input.expectedTime) }),
      },
      include: { members: true },
    });
  }

  async batchCheckIn(companyId: string, groupId: string, memberIds: string[], gateId: string, guardId: string) {
    const group = await platformPrisma.groupVisit.findFirst({
      where: { id: groupId, companyId },
      include: { members: true },
    });
    if (!group) throw ApiError.notFound('Group visit not found');

    // Look up default visitor type ("Business Guest" code: 'BG') for this company
    const defaultVisitorType = await platformPrisma.visitorType.findFirst({
      where: { companyId, code: 'BG', isActive: true },
    });
    if (!defaultVisitorType) {
      throw ApiError.badRequest('No default visitor type (Business Guest) configured for this company. Please set up visitor types first.');
    }

    const results: any[] = [];
    await platformPrisma.$transaction(async (tx) => {
      for (const memberId of memberIds) {
        const member = group.members.find(m => m.id === memberId);
        if (!member) continue;
        if (member.status !== 'EXPECTED') continue;

        // Create individual visit record for this member
        const visitCode = await this.generateVisitCode();
        const visitNumber = await generateNextNumber(
          tx, companyId, ['Visitor', 'Visitor Registration'], 'Visitor Registration',
        );
        const badgeNumber = await generateNextNumber(
          tx, companyId, ['Visitor Badge', 'Badge'], 'Visitor Badge',
        );

        const visit = await tx.visit.create({
          data: {
            companyId,
            visitNumber,
            visitCode,
            visitorName: member.visitorName,
            visitorMobile: member.visitorMobile,
            visitorEmail: member.visitorEmail,
            visitorCompany: member.visitorCompany,
            visitorTypeId: defaultVisitorType.id,
            purpose: 'OTHER' as any,
            purposeNotes: group.purpose,
            expectedDate: group.expectedDate,
            hostEmployeeId: group.hostEmployeeId,
            plantId: group.plantId,
            gateId,
            registrationMethod: 'PRE_REGISTERED',
            approvalStatus: 'AUTO_APPROVED',
            status: 'CHECKED_IN',
            checkInTime: new Date(),
            checkInGateId: gateId,
            checkInGuardId: guardId,
            badgeNumber,
            groupVisitId: groupId,
            createdBy: guardId,
          },
        });

        await tx.groupVisitMember.update({
          where: { id: memberId },
          data: { visitId: visit.id, status: 'CHECKED_IN' },
        });

        results.push(visit);
      }

      // Update group status
      await tx.groupVisit.update({
        where: { id: groupId },
        data: { status: 'IN_PROGRESS' },
      });
    });

    return results;
  }

  async batchCheckOut(companyId: string, groupId: string, memberIds: string[] | undefined, gateId: string | undefined, method: string, userId: string) {
    const group = await platformPrisma.groupVisit.findFirst({
      where: { id: groupId, companyId },
      include: { members: { include: { visit: true } } },
    });
    if (!group) throw ApiError.notFound('Group visit not found');

    const membersToCheckOut = memberIds
      ? group.members.filter(m => memberIds.includes(m.id) && m.status === 'CHECKED_IN')
      : group.members.filter(m => m.status === 'CHECKED_IN');

    const { visitService } = await import('../core/visit.service');

    for (const member of membersToCheckOut) {
      if (member.visitId) {
        await visitService.checkOut(companyId, member.visitId, {
          checkOutGateId: gateId,
          checkOutMethod: method,
        }, userId);

        await platformPrisma.groupVisitMember.update({
          where: { id: member.id },
          data: { status: 'CHECKED_OUT' },
        });
      }
    }

    // Check if all members are done
    const updatedGroup = await platformPrisma.groupVisit.findUnique({
      where: { id: groupId },
      include: { members: true },
    });
    const allDone = updatedGroup?.members.every(m => ['CHECKED_OUT', 'NO_SHOW'].includes(m.status));
    if (allDone) {
      await platformPrisma.groupVisit.update({
        where: { id: groupId },
        data: { status: 'COMPLETED' },
      });
    }

    return updatedGroup;
  }
}

export const groupVisitService = new GroupVisitService();
