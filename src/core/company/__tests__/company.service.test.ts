/**
 * Unit tests for CompanyService
 *
 * Source file: src/core/company/company.service.ts
 *
 * External dependencies mocked:
 *   - src/config/database  (platformPrisma)
 *   - src/config/logger    (suppress output)
 *   - src/core/tenant/tenant.service (tenantService)
 *
 * CompanyService.getCompanyById delegates entirely to tenantService.getFullCompanyDetail,
 * so the tenant service is mocked rather than re-testing its internals here.
 */

jest.mock('../../../config/database', () => ({
  platformPrisma: {
    company: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// Mock the tenant service singleton used by CompanyService.getCompanyById.
// Path is relative from this test file: up from __tests__, up from company, into tenant.
jest.mock('../../tenant/tenant.service', () => ({
  tenantService: {
    getFullCompanyDetail: jest.fn(),
  },
}));

import { CompanyService } from '../company.service';
import { platformPrisma } from '../../../config/database';
import { tenantService } from '../../tenant/tenant.service';

// Using `as any` avoids the circular Prisma type reference error that
// jest.Mocked<typeof platformPrisma.X> triggers in ts-jest.
const mockCompany = platformPrisma.company as any;
const mockTenantService = tenantService as any;

// ── Shared fixtures ───────────────────────────────────────────────────────────

function makeCompany(overrides: Record<string, any> = {}) {
  return {
    id: 'company-uuid-1',
    name: 'Acme Corp',
    displayName: 'Acme Corp',
    legalName: 'Acme Corporation Pvt Ltd',
    industry: 'Manufacturing',
    companyCode: 'ACME',
    emailDomain: 'acme.com',
    wizardStatus: 'Active',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-03-01'),
    tenant: { id: 'tenant-uuid-1', schemaName: 'tenant_acme', status: 'ACTIVE' },
    _count: { locations: 2, contacts: 3, users: 10 },
    ...overrides,
  };
}

// =============================================================================
// CompanyService
// =============================================================================

describe('CompanyService', () => {
  let service: CompanyService;

  beforeEach(() => {
    service = new CompanyService();
  });

  // ── listCompanies ───────────────────────────────────────────────────────────

  describe('listCompanies', () => {
    it('should return companies and a pagination object', async () => {
      mockCompany.findMany.mockResolvedValueOnce([makeCompany()] as any);
      mockCompany.count.mockResolvedValueOnce(1);

      const result = await service.listCompanies();

      expect(result).toHaveProperty('companies');
      expect(result).toHaveProperty('pagination');
      expect(Array.isArray(result.companies)).toBe(true);
    });

    it('should apply default page=1 and limit=25 when no options are given', async () => {
      mockCompany.findMany.mockResolvedValueOnce([]);
      mockCompany.count.mockResolvedValueOnce(0);

      await service.listCompanies();

      expect(mockCompany.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 25 })
      );
    });

    it('should compute the correct skip offset for page 3 with limit 10', async () => {
      mockCompany.findMany.mockResolvedValueOnce([]);
      mockCompany.count.mockResolvedValueOnce(0);

      await service.listCompanies({ page: 3, limit: 10 });

      expect(mockCompany.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }) // (3-1) * 10 = 20
      );
    });

    it('should calculate totalPages correctly', async () => {
      mockCompany.findMany.mockResolvedValueOnce([]);
      mockCompany.count.mockResolvedValueOnce(53);

      const result = await service.listCompanies({ limit: 25 });

      // ceil(53 / 25) = 3
      expect(result.pagination.totalPages).toBe(3);
    });

    it('should include total and page in the pagination object', async () => {
      mockCompany.findMany.mockResolvedValueOnce([makeCompany(), makeCompany()] as any);
      mockCompany.count.mockResolvedValueOnce(2);

      const result = await service.listCompanies({ page: 1, limit: 25 });

      expect(result.pagination).toMatchObject({
        page: 1,
        limit: 25,
        total: 2,
        totalPages: 1,
      });
    });

    // ── Status filter ──────────────────────────────────────────────────────

    it('should filter by wizardStatus when status option is provided', async () => {
      mockCompany.findMany.mockResolvedValueOnce([]);
      mockCompany.count.mockResolvedValueOnce(0);

      await service.listCompanies({ status: 'Active' });

      expect(mockCompany.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ wizardStatus: 'Active' }),
        })
      );
    });

    it('should NOT add wizardStatus to where clause when status is omitted', async () => {
      mockCompany.findMany.mockResolvedValueOnce([]);
      mockCompany.count.mockResolvedValueOnce(0);

      await service.listCompanies();

      const callArgs = mockCompany.findMany.mock.calls[0][0];
      expect(callArgs.where).not.toHaveProperty('wizardStatus');
    });

    // ── Search ────────────────────────────────────────────────────────────

    it('should add OR search conditions across name, displayName, legalName, industry, emailDomain, companyCode when search is provided', async () => {
      mockCompany.findMany.mockResolvedValueOnce([]);
      mockCompany.count.mockResolvedValueOnce(0);

      await service.listCompanies({ search: 'acme' });

      const callArgs = mockCompany.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toBeDefined();
      // All 6 searchable fields should be in the OR array
      expect(callArgs.where.OR).toHaveLength(6);
      // Verify case-insensitive mode is set on at least one field
      expect(callArgs.where.OR[0]).toMatchObject({
        name: { contains: 'acme', mode: 'insensitive' },
      });
    });

    it('should NOT add OR search conditions when search is omitted', async () => {
      mockCompany.findMany.mockResolvedValueOnce([]);
      mockCompany.count.mockResolvedValueOnce(0);

      await service.listCompanies();

      const callArgs = mockCompany.findMany.mock.calls[0][0];
      expect(callArgs.where).not.toHaveProperty('OR');
    });

    it('should return matching companies when both status and search are provided', async () => {
      const company = makeCompany({ wizardStatus: 'Active' });
      mockCompany.findMany.mockResolvedValueOnce([company] as any);
      mockCompany.count.mockResolvedValueOnce(1);

      const result = await service.listCompanies({ status: 'Active', search: 'acme' });

      expect(result.companies).toHaveLength(1);
      // Both filter conditions should be in the where clause
      const callArgs = mockCompany.findMany.mock.calls[0][0];
      expect(callArgs.where.wizardStatus).toBe('Active');
      expect(callArgs.where.OR).toBeDefined();
    });

    // ── Sorting ───────────────────────────────────────────────────────────

    it('should sort by createdAt desc by default', async () => {
      mockCompany.findMany.mockResolvedValueOnce([]);
      mockCompany.count.mockResolvedValueOnce(0);

      await service.listCompanies();

      expect(mockCompany.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } })
      );
    });

    it('should sort by the specified field and direction when sortBy is provided', async () => {
      mockCompany.findMany.mockResolvedValueOnce([]);
      mockCompany.count.mockResolvedValueOnce(0);

      await service.listCompanies({ sortBy: 'name:asc' });

      expect(mockCompany.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'asc' } })
      );
    });

    it('should default to desc direction when sortBy field has no direction suffix', async () => {
      mockCompany.findMany.mockResolvedValueOnce([]);
      mockCompany.count.mockResolvedValueOnce(0);

      await service.listCompanies({ sortBy: 'displayName:desc' });

      expect(mockCompany.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { displayName: 'desc' } })
      );
    });

    it('should fall back to createdAt:desc when an invalid sortBy field is provided', async () => {
      mockCompany.findMany.mockResolvedValueOnce([]);
      mockCompany.count.mockResolvedValueOnce(0);

      // 'password' is not in the allowed sort fields
      await service.listCompanies({ sortBy: 'password:asc' });

      expect(mockCompany.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } })
      );
    });

    // ── Include shape ─────────────────────────────────────────────────────

    it('should include tenant details and _count relations', async () => {
      mockCompany.findMany.mockResolvedValueOnce([]);
      mockCompany.count.mockResolvedValueOnce(0);

      await service.listCompanies();

      const callArgs = mockCompany.findMany.mock.calls[0][0];
      expect(callArgs.include).toMatchObject({
        tenant: {
          select: { id: true, schemaName: true, status: true },
        },
        _count: {
          select: { locations: true, contacts: true, users: true },
        },
      });
    });

    // ── Pagination edge cases ─────────────────────────────────────────────

    it('should return empty companies array when there are no records', async () => {
      mockCompany.findMany.mockResolvedValueOnce([]);
      mockCompany.count.mockResolvedValueOnce(0);

      const result = await service.listCompanies();

      expect(result.companies).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });

    it('should return 1 totalPage when total equals limit exactly', async () => {
      mockCompany.findMany.mockResolvedValueOnce([makeCompany()] as any);
      mockCompany.count.mockResolvedValueOnce(25); // exactly one page

      const result = await service.listCompanies({ limit: 25 });

      expect(result.pagination.totalPages).toBe(1);
    });
  });

  // ── getCompanyById ──────────────────────────────────────────────────────────

  describe('getCompanyById', () => {
    const fullCompany = {
      ...makeCompany(),
      locations: [],
      contacts: [],
      shifts: [],
      noSeries: [],
      iotReasons: [],
      users: [],
      tenant: {
        id: 'tenant-uuid-1',
        schemaName: 'tenant_acme',
        subscriptions: [],
      },
    };

    it('should delegate to tenantService.getFullCompanyDetail', async () => {
      mockTenantService.getFullCompanyDetail.mockResolvedValueOnce(fullCompany as any);

      const result = await service.getCompanyById('company-uuid-1');

      expect(mockTenantService.getFullCompanyDetail).toHaveBeenCalledWith('company-uuid-1');
      expect(result).toMatchObject({ id: 'company-uuid-1' });
    });

    it('should propagate the notFound error thrown by tenantService', async () => {
      const { ApiError } = await import('../../../shared/errors');
      mockTenantService.getFullCompanyDetail.mockRejectedValueOnce(
        ApiError.notFound('Company not found')
      );

      await expect(service.getCompanyById('ghost-id')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('should return the full company object including nested relations', async () => {
      mockTenantService.getFullCompanyDetail.mockResolvedValueOnce(fullCompany as any);

      const result = await service.getCompanyById('company-uuid-1');

      expect(result).toHaveProperty('locations');
      expect(result).toHaveProperty('contacts');
      expect(result).toHaveProperty('tenant');
      expect(result).toHaveProperty('users');
    });
  });
});
