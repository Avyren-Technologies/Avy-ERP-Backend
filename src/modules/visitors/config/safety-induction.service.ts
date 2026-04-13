import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { n } from '../../../shared/utils/prisma-helpers';

interface ListFilters {
  plantId?: string | undefined;
  isActive?: boolean | undefined;
  page: number;
  limit: number;
}

class SafetyInductionService {
  async list(companyId: string, filters: ListFilters) {
    const { page, limit, plantId, isActive } = filters;
    const offset = (page - 1) * limit;
    const where: any = { companyId };
    if (plantId) where.plantId = plantId;
    if (isActive !== undefined) where.isActive = isActive;

    const [data, total] = await Promise.all([
      platformPrisma.safetyInduction.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      platformPrisma.safetyInduction.count({ where }),
    ]);
    return { data, total };
  }

  async getById(companyId: string, id: string) {
    const induction = await platformPrisma.safetyInduction.findFirst({
      where: { id, companyId },
      include: {
        visitorTypes: {
          select: { id: true, name: true, code: true },
        },
      },
    });
    if (!induction) throw ApiError.notFound('Safety induction not found');
    return induction;
  }

  async create(companyId: string, input: any) {
    return platformPrisma.safetyInduction.create({
      data: {
        companyId,
        name: input.name,
        type: input.type,
        contentUrl: n(input.contentUrl),
        questions: input.questions ?? undefined,
        passingScore: input.passingScore ?? 80,
        durationSeconds: input.durationSeconds ?? 120,
        validityDays: input.validityDays ?? 30,
        plantId: n(input.plantId),
      },
    });
  }

  async update(companyId: string, id: string, input: any) {
    const existing = await platformPrisma.safetyInduction.findFirst({ where: { id, companyId } });
    if (!existing) throw ApiError.notFound('Safety induction not found');

    return platformPrisma.safetyInduction.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.type && { type: input.type }),
        ...(input.contentUrl !== undefined && { contentUrl: n(input.contentUrl) }),
        ...(input.questions !== undefined && { questions: input.questions }),
        ...(input.passingScore !== undefined && { passingScore: input.passingScore }),
        ...(input.durationSeconds !== undefined && { durationSeconds: input.durationSeconds }),
        ...(input.validityDays !== undefined && { validityDays: input.validityDays }),
        ...(input.plantId !== undefined && { plantId: n(input.plantId) }),
      },
    });
  }

  async deactivate(companyId: string, id: string) {
    const existing = await platformPrisma.safetyInduction.findFirst({ where: { id, companyId } });
    if (!existing) throw ApiError.notFound('Safety induction not found');
    return platformPrisma.safetyInduction.update({ where: { id }, data: { isActive: false } });
  }
}

export const safetyInductionService = new SafetyInductionService();
