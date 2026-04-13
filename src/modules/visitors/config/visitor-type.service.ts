import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { n } from '../../../shared/utils/prisma-helpers';
import { logger } from '../../../config/logger';

interface ListFilters {
  isActive?: boolean | undefined;
  page: number;
  limit: number;
}

class VisitorTypeService {
  async list(companyId: string, filters: ListFilters) {
    const { page, limit, isActive } = filters;
    const offset = (page - 1) * limit;
    const where: any = { companyId };
    if (isActive !== undefined) where.isActive = isActive;

    const [data, total] = await Promise.all([
      platformPrisma.visitorType.findMany({
        where,
        include: {
          _count: {
            select: { visits: true },
          },
        },
        skip: offset,
        take: limit,
        orderBy: { sortOrder: 'asc' },
      }),
      platformPrisma.visitorType.count({ where }),
    ]);

    return { data, total };
  }

  async getById(companyId: string, id: string) {
    const type = await platformPrisma.visitorType.findFirst({
      where: { id, companyId },
      include: {
        _count: {
          select: { visits: true },
        },
        safetyInduction: true,
      },
    });
    if (!type) throw ApiError.notFound('Visitor type not found');
    return type;
  }

  async create(companyId: string, input: any) {
    // Check for duplicate code within company
    const existing = await platformPrisma.visitorType.findFirst({
      where: { companyId, code: input.code },
    });
    if (existing) throw ApiError.conflict(`Visitor type code "${input.code}" already exists`);

    // If this is the first visitor type for the company, seed defaults first
    const count = await platformPrisma.visitorType.count({ where: { companyId } });
    if (count === 0) {
      await this.seedDefaults(companyId);
      logger.info(`Seeded default visitor types for company ${companyId}`);
    }

    return platformPrisma.visitorType.create({
      data: {
        companyId,
        name: input.name,
        code: input.code,
        badgeColour: input.badgeColour ?? '#3B82F6',
        requirePhoto: input.requirePhoto ?? true,
        requireIdVerification: input.requireIdVerification ?? true,
        requireSafetyInduction: input.requireSafetyInduction ?? false,
        requireNda: input.requireNda ?? false,
        requireHostApproval: input.requireHostApproval ?? true,
        requireEscort: input.requireEscort ?? false,
        defaultMaxDurationMinutes: input.defaultMaxDurationMinutes ?? undefined,
        safetyInductionId: n(input.safetyInductionId),
        sortOrder: input.sortOrder ?? 0,
      },
    });
  }

  async update(companyId: string, id: string, input: any) {
    const existing = await platformPrisma.visitorType.findFirst({ where: { id, companyId } });
    if (!existing) throw ApiError.notFound('Visitor type not found');

    // If code is changing, check uniqueness
    if (input.code && input.code !== existing.code) {
      const dup = await platformPrisma.visitorType.findFirst({
        where: { companyId, code: input.code, id: { not: id } },
      });
      if (dup) throw ApiError.conflict(`Visitor type code "${input.code}" already exists`);
    }

    return platformPrisma.visitorType.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.code && { code: input.code }),
        ...(input.badgeColour && { badgeColour: input.badgeColour }),
        ...(input.requirePhoto !== undefined && { requirePhoto: input.requirePhoto }),
        ...(input.requireIdVerification !== undefined && { requireIdVerification: input.requireIdVerification }),
        ...(input.requireSafetyInduction !== undefined && { requireSafetyInduction: input.requireSafetyInduction }),
        ...(input.requireNda !== undefined && { requireNda: input.requireNda }),
        ...(input.requireHostApproval !== undefined && { requireHostApproval: input.requireHostApproval }),
        ...(input.requireEscort !== undefined && { requireEscort: input.requireEscort }),
        ...(input.defaultMaxDurationMinutes !== undefined && { defaultMaxDurationMinutes: input.defaultMaxDurationMinutes }),
        ...(input.safetyInductionId !== undefined && { safetyInductionId: n(input.safetyInductionId) }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      },
    });
  }

  async deactivate(companyId: string, id: string) {
    const existing = await platformPrisma.visitorType.findFirst({ where: { id, companyId } });
    if (!existing) throw ApiError.notFound('Visitor type not found');
    if (existing.isDefault) throw ApiError.badRequest('Cannot deactivate a default visitor type');

    return platformPrisma.visitorType.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Seed default visitor types for a new company.
   * Called when VMS module is first activated (first create triggers this).
   */
  async seedDefaults(companyId: string) {
    const defaults = [
      { name: 'Business Guest', code: 'BG', badgeColour: '#3B82F6', requireSafetyInduction: false, requireNda: false, sortOrder: 1 },
      { name: 'Vendor / Supplier', code: 'VN', badgeColour: '#22C55E', requireSafetyInduction: false, requireNda: false, sortOrder: 2 },
      { name: 'Contractor', code: 'CT', badgeColour: '#F97316', requireSafetyInduction: true, requireNda: true, sortOrder: 3 },
      { name: 'Delivery Agent', code: 'DA', badgeColour: '#EAB308', requireSafetyInduction: false, requireNda: false, requireHostApproval: false, defaultMaxDurationMinutes: 120, sortOrder: 4 },
      { name: 'Government Inspector', code: 'GI', badgeColour: '#EF4444', requireSafetyInduction: false, requireNda: false, sortOrder: 5 },
      { name: 'Job Candidate', code: 'JC', badgeColour: '#A855F7', requireSafetyInduction: false, requireNda: false, sortOrder: 6 },
      { name: 'Personal Visitor', code: 'FV', badgeColour: '#F5F5F5', requireSafetyInduction: false, requireNda: false, sortOrder: 7 },
      { name: 'VIP / Board Member', code: 'VP', badgeColour: '#F59E0B', requireSafetyInduction: false, requireNda: false, requireHostApproval: false, sortOrder: 8 },
      { name: 'Auditor', code: 'AU', badgeColour: '#1F2937', requireSafetyInduction: false, requireNda: false, sortOrder: 9 },
    ];

    for (const def of defaults) {
      const existing = await platformPrisma.visitorType.findFirst({
        where: { companyId, code: def.code },
      });
      if (!existing) {
        await platformPrisma.visitorType.create({
          data: {
            companyId,
            ...def,
            isDefault: true,
            isActive: true,
            requirePhoto: true,
            requireIdVerification: true,
            requireHostApproval: (def as any).requireHostApproval ?? true,
            defaultMaxDurationMinutes: (def as any).defaultMaxDurationMinutes ?? 480,
          },
        });
      }
    }
  }
}

export const visitorTypeService = new VisitorTypeService();
