import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { n } from '../../../shared/utils/prisma-helpers';
import { logger } from '../../../config/logger';

interface ListFilters {
  plantId?: string | undefined;
  isActive?: boolean | undefined;
  page: number;
  limit: number;
}

const APP_URL = process.env.APP_URL || 'https://app.avyerp.com';

class GateService {
  async list(companyId: string, filters: ListFilters) {
    const { page, limit, plantId, isActive } = filters;
    const offset = (page - 1) * limit;
    const where: any = { companyId };
    if (plantId) where.plantId = plantId;
    if (isActive !== undefined) where.isActive = isActive;

    const [data, total] = await Promise.all([
      platformPrisma.visitorGate.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      platformPrisma.visitorGate.count({ where }),
    ]);
    return { data, total };
  }

  async getById(companyId: string, id: string) {
    const gate = await platformPrisma.visitorGate.findFirst({ where: { id, companyId } });
    if (!gate) throw ApiError.notFound('Gate not found');
    return gate;
  }

  async create(companyId: string, input: any) {
    // Check for duplicate code within company
    const existing = await platformPrisma.visitorGate.findFirst({
      where: { companyId, code: input.code },
    });
    if (existing) throw ApiError.conflict(`Gate code "${input.code}" already exists`);

    // Auto-generate QR poster URL
    const qrPosterUrl = `${APP_URL}/visit/register/${input.code}`;

    const gate = await platformPrisma.visitorGate.create({
      data: {
        companyId,
        plantId: input.plantId,
        name: input.name,
        code: input.code,
        type: input.type ?? 'MAIN',
        openTime: n(input.openTime),
        closeTime: n(input.closeTime),
        allowedVisitorTypeIds: input.allowedVisitorTypeIds ?? [],
        qrPosterUrl,
      },
    });

    logger.info(`Gate created: ${gate.code} for company ${companyId}`);
    return gate;
  }

  async update(companyId: string, id: string, input: any) {
    const existing = await platformPrisma.visitorGate.findFirst({ where: { id, companyId } });
    if (!existing) throw ApiError.notFound('Gate not found');

    // If code is changing, check uniqueness
    if (input.code && input.code !== existing.code) {
      const dup = await platformPrisma.visitorGate.findFirst({
        where: { companyId, code: input.code, id: { not: id } },
      });
      if (dup) throw ApiError.conflict(`Gate code "${input.code}" already exists`);
    }

    // If code changes, regenerate QR poster URL
    const codeChanged = input.code && input.code !== existing.code;

    return platformPrisma.visitorGate.update({
      where: { id },
      data: {
        ...(input.plantId && { plantId: input.plantId }),
        ...(input.name && { name: input.name }),
        ...(input.code && { code: input.code }),
        ...(input.type && { type: input.type }),
        ...(input.openTime !== undefined && { openTime: n(input.openTime) }),
        ...(input.closeTime !== undefined && { closeTime: n(input.closeTime) }),
        ...(input.allowedVisitorTypeIds && { allowedVisitorTypeIds: input.allowedVisitorTypeIds }),
        ...(codeChanged && { qrPosterUrl: `${APP_URL}/visit/register/${input.code}` }),
      },
    });
  }

  async deactivate(companyId: string, id: string) {
    const existing = await platformPrisma.visitorGate.findFirst({ where: { id, companyId } });
    if (!existing) throw ApiError.notFound('Gate not found');
    return platformPrisma.visitorGate.update({ where: { id }, data: { isActive: false } });
  }
}

export const gateService = new GateService();
