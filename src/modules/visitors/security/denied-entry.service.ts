import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';

interface DeniedEntryListFilters {
  denialReason?: string;
  fromDate?: string;
  toDate?: string;
  gateId?: string;
  search?: string;
  page: number;
  limit: number;
}

class DeniedEntryService {
  // ────────────────────────────────────────────────────────────────────
  // List denied entries
  // ────────────────────────────────────────────────────────────────────

  async list(companyId: string, filters: DeniedEntryListFilters) {
    const { page, limit, denialReason, fromDate, toDate, gateId, search } = filters;
    const offset = (page - 1) * limit;
    const where: any = { companyId };

    if (denialReason) where.denialReason = denialReason;
    if (gateId) where.gateId = gateId;

    if (fromDate || toDate) {
      where.deniedAt = {};
      if (fromDate) where.deniedAt.gte = new Date(fromDate);
      if (toDate) where.deniedAt.lte = new Date(toDate);
    }

    if (search) {
      where.OR = [
        { visitorName: { contains: search, mode: 'insensitive' } },
        { visitorMobile: { contains: search } },
      ];
    }

    const [data, total] = await Promise.all([
      platformPrisma.deniedEntry.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { deniedAt: 'desc' },
        include: { visit: true, watchlistEntry: true },
      }),
      platformPrisma.deniedEntry.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  // ────────────────────────────────────────────────────────────────────
  // Get by ID
  // ────────────────────────────────────────────────────────────────────

  async getById(companyId: string, id: string) {
    const entry = await platformPrisma.deniedEntry.findFirst({
      where: { id, companyId },
      include: { visit: true, watchlistEntry: true },
    });
    if (!entry) throw ApiError.notFound('Denied entry not found');
    return entry;
  }
}

export const deniedEntryService = new DeniedEntryService();
