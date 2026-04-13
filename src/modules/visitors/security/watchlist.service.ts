import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { logger } from '../../../config/logger';
import { n } from '../../../shared/utils/prisma-helpers';

interface WatchlistListFilters {
  type?: string | undefined;
  isActive?: boolean | undefined;
  search?: string | undefined;
  page: number;
  limit: number;
}

interface WatchlistCheckInput {
  name?: string | undefined;
  mobile?: string | undefined;
  idNumber?: string | undefined;
}

class WatchlistService {
  // ────────────────────────────────────────────────────────────────────
  // List
  // ────────────────────────────────────────────────────────────────────

  async list(companyId: string, filters: WatchlistListFilters) {
    const { page, limit, type, isActive, search } = filters;
    const offset = (page - 1) * limit;
    const where: any = { companyId };

    if (type) where.type = type;
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      where.OR = [
        { personName: { contains: search, mode: 'insensitive' } },
        { mobileNumber: { contains: search } },
        { idNumber: { contains: search } },
      ];
    }

    const [data, total] = await Promise.all([
      platformPrisma.visitorWatchlist.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.visitorWatchlist.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  // ────────────────────────────────────────────────────────────────────
  // Get by ID
  // ────────────────────────────────────────────────────────────────────

  async getById(companyId: string, id: string) {
    const entry = await platformPrisma.visitorWatchlist.findFirst({
      where: { id, companyId },
    });
    if (!entry) throw ApiError.notFound('Watchlist entry not found');
    return entry;
  }

  // ────────────────────────────────────────────────────────────────────
  // Create
  // ────────────────────────────────────────────────────────────────────

  async create(companyId: string, input: any, createdBy: string) {
    return platformPrisma.visitorWatchlist.create({
      data: {
        companyId,
        type: input.type,
        personName: input.personName,
        mobileNumber: n(input.mobileNumber),
        email: n(input.email),
        idNumber: n(input.idNumber),
        photo: n(input.photo),
        reason: input.reason,
        actionRequired: n(input.actionRequired),
        blockDuration: input.blockDuration,
        ...(input.expiryDate ? { expiryDate: new Date(input.expiryDate) } : {}),
        appliesToAllPlants: input.appliesToAllPlants ?? true,
        plantIds: input.plantIds ?? [],
        createdBy,
      },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Update
  // ────────────────────────────────────────────────────────────────────

  async update(companyId: string, id: string, input: any) {
    const existing = await platformPrisma.visitorWatchlist.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw ApiError.notFound('Watchlist entry not found');

    return platformPrisma.visitorWatchlist.update({
      where: { id },
      data: {
        ...(input.type !== undefined && { type: input.type }),
        ...(input.personName !== undefined && { personName: input.personName }),
        ...(input.mobileNumber !== undefined && { mobileNumber: n(input.mobileNumber) }),
        ...(input.email !== undefined && { email: n(input.email) }),
        ...(input.idNumber !== undefined && { idNumber: n(input.idNumber) }),
        ...(input.photo !== undefined && { photo: n(input.photo) }),
        ...(input.reason !== undefined && { reason: input.reason }),
        ...(input.actionRequired !== undefined && { actionRequired: n(input.actionRequired) }),
        ...(input.blockDuration !== undefined && { blockDuration: input.blockDuration }),
        ...(input.expiryDate !== undefined && {
          expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
        }),
        ...(input.appliesToAllPlants !== undefined && { appliesToAllPlants: input.appliesToAllPlants }),
        ...(input.plantIds !== undefined && { plantIds: input.plantIds }),
      },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Soft delete (set isActive=false)
  // ────────────────────────────────────────────────────────────────────

  async remove(companyId: string, id: string) {
    const existing = await platformPrisma.visitorWatchlist.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw ApiError.notFound('Watchlist entry not found');

    return platformPrisma.visitorWatchlist.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Check visitor against watchlist/blocklist
  // ────────────────────────────────────────────────────────────────────

  async check(companyId: string, input: WatchlistCheckInput) {
    const conditions: any[] = [];

    if (input.mobile) {
      conditions.push({ mobileNumber: input.mobile });
    }
    if (input.idNumber) {
      conditions.push({ idNumber: input.idNumber });
    }
    if (input.name) {
      conditions.push({ personName: { contains: input.name, mode: 'insensitive' } });
    }

    if (conditions.length === 0) {
      return { blocklisted: false, watchlisted: false, matches: [] };
    }

    const now = new Date();

    const entries = await platformPrisma.visitorWatchlist.findMany({
      where: {
        companyId,
        isActive: true,
        OR: conditions,
      },
    });

    // Filter out expired UNTIL_DATE entries
    const activeEntries = entries.filter((entry) => {
      if (entry.blockDuration === 'UNTIL_DATE' && entry.expiryDate) {
        return entry.expiryDate > now;
      }
      return true;
    });

    const blocklisted = activeEntries.some((e) => e.type === 'BLOCKLIST');
    const watchlisted = activeEntries.some((e) => e.type === 'WATCHLIST');

    logger.info(
      `Watchlist check for company ${companyId}: blocklisted=${blocklisted}, watchlisted=${watchlisted}, matches=${activeEntries.length}`,
    );

    return {
      blocklisted,
      watchlisted,
      matches: activeEntries,
    };
  }
}

export const watchlistService = new WatchlistService();
