import { platformPrisma } from '../../config/database';
import { ApiError } from '../../shared/errors';
import { tenantService } from '../tenant/tenant.service';
import { logger } from '../../config/logger';

export class CompanyService {
  // ────────────────────────────────────────────────────────────────────
  // List companies with pagination, search, filter
  // ────────────────────────────────────────────────────────────────────
  async listCompanies(options: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    sortBy?: string;
  } = {}) {
    const { page = 1, limit = 25, status, search, sortBy } = options;
    const offset = (page - 1) * limit;

    const where: any = {};

    // Filter by wizardStatus
    if (status) {
      where.wizardStatus = status;
    }

    // Search across multiple fields
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
        { legalName: { contains: search, mode: 'insensitive' } },
        { industry: { contains: search, mode: 'insensitive' } },
        { emailDomain: { contains: search, mode: 'insensitive' } },
        { companyCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Determine sort order
    let orderBy: any = { createdAt: 'desc' };
    if (sortBy) {
      const [field, direction] = sortBy.split(':');
      if (field && ['name', 'displayName', 'industry', 'createdAt', 'updatedAt', 'wizardStatus'].includes(field)) {
        orderBy = { [field]: direction === 'asc' ? 'asc' : 'desc' };
      }
    }

    const [companies, total] = await Promise.all([
      platformPrisma.company.findMany({
        where,
        include: {
          tenant: {
            select: {
              id: true,
              schemaName: true,
              status: true,
            },
          },
          _count: {
            select: {
              locations: true,
              contacts: true,
              users: true,
            },
          },
        },
        skip: offset,
        take: limit,
        orderBy,
      }),
      platformPrisma.company.count({ where }),
    ]);

    // Strip sensitive fields from list responses (razorpayConfig, pan, tan, etc.)
    const sanitized = companies.map((c: any) => {
      const { razorpayConfig, ...safe } = c;
      if (safe.locationConfig === 'per-location') {
        return {
          ...safe,
          address: undefined,
          contactPerson: undefined,
          selectedModuleIds: undefined,
          customModulePricing: undefined,
          userTier: undefined,
          customUserLimit: undefined,
          customTierPrice: undefined,
          billingType: undefined,
        };
      }
      return {
        ...safe,
        address: undefined,
        contactPerson: undefined,
      };
    });

    return {
      companies: sanitized,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Get company by ID (delegates to tenant service for full detail)
  // ────────────────────────────────────────────────────────────────────
  async getCompanyById(companyId: string) {
    return tenantService.getFullCompanyDetail(companyId);
  }
}

export const companyService = new CompanyService();
