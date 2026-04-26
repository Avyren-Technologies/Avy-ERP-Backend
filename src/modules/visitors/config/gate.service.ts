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

class GateService {
  async list(companyId: string, filters: ListFilters) {
    const { page, limit, plantId, isActive } = filters;
    const offset = (page - 1) * limit;
    const where: any = { companyId };
    if (plantId) where.plantId = plantId;
    if (isActive !== undefined) where.isActive = isActive;

    const [gates, total, locations] = await Promise.all([
      platformPrisma.visitorGate.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      platformPrisma.visitorGate.count({ where }),
      platformPrisma.location.findMany({
        where: { companyId },
        select: { id: true, name: true, code: true },
      }),
    ]);

    const locationMap = new Map(locations.map((l) => [l.id, { name: l.name, code: l.code }]));
    const appUrl = process.env.APP_URL || 'https://app.avyerp.com';
    const data = gates.map((g) => {
      const loc = locationMap.get(g.plantId);
      return {
        ...g,
        locationName: loc?.name ?? null,
        qrPosterUrl: `${appUrl}/visit/register/${loc?.code ?? g.plantId}`,
      };
    });

    return { data, total };
  }

  async getById(companyId: string, id: string) {
    const gate = await platformPrisma.visitorGate.findFirst({ where: { id, companyId } });
    if (!gate) throw ApiError.notFound('Gate not found');
    const plant = await platformPrisma.location.findFirst({ where: { id: gate.plantId }, select: { code: true } });
    const appUrl = process.env.APP_URL || 'https://app.avyerp.com';
    return { ...gate, qrPosterUrl: `${appUrl}/visit/register/${plant?.code ?? gate.plantId}` };
  }

  async create(companyId: string, input: any) {
    // Check for duplicate code within company
    const existing = await platformPrisma.visitorGate.findFirst({
      where: { companyId, code: input.code },
    });
    if (existing) throw ApiError.conflict(`Gate code "${input.code}" already exists`);

    // Look up the plant's code for the QR poster URL (endpoint expects plant code, not gate code)
    const plant = await platformPrisma.location.findFirst({
      where: { id: input.plantId },
      select: { code: true },
    });
    const appUrl = process.env.APP_URL || 'https://app.avyerp.com';
    const qrPosterUrl = `${appUrl}/visit/register/${plant?.code ?? input.plantId}`;

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
        isActive: input.isActive ?? true,
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

    // Regenerate QR poster URL if plantId changes (URL uses plant code, not gate code)
    const plantIdChanged = input.plantId && input.plantId !== existing.plantId;
    let qrPosterUrl: string | undefined;
    if (plantIdChanged) {
      const plant = await platformPrisma.location.findFirst({
        where: { id: input.plantId },
        select: { code: true },
      });
      const appUrl = process.env.APP_URL || 'https://app.avyerp.com';
      qrPosterUrl = `${appUrl}/visit/register/${plant?.code ?? input.plantId}`;
    }

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
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(qrPosterUrl && { qrPosterUrl }),
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
