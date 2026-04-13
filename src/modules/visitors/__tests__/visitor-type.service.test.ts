/**
 * Unit tests for VisitorTypeService CRUD operations.
 *
 * Source: src/modules/visitors/config/visitor-type.service.ts
 */

jest.mock('../../../config/database', () => ({
  platformPrisma: {
    visitorType: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  },
}));

jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../shared/utils/prisma-helpers', () => ({
  n: (v: any) => (v === undefined ? null : v),
}));

import { platformPrisma } from '../../../config/database';
import { visitorTypeService } from '../config/visitor-type.service';

const mockVisitorType = platformPrisma.visitorType as any;

const COMPANY_ID = 'company-1';

describe('VisitorTypeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────
  // create
  // ─────────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a visitor type with valid data', async () => {
      const input = {
        name: 'Contractor',
        code: 'CT',
        badgeColour: '#F97316',
        requirePhoto: true,
        requireIdVerification: true,
        requireSafetyInduction: true,
        requireNda: true,
        requireHostApproval: true,
        requireEscort: false,
      };

      mockVisitorType.findFirst.mockResolvedValue(null); // no duplicate code
      mockVisitorType.count.mockResolvedValue(5); // not the first type
      mockVisitorType.create.mockResolvedValue({ id: 'vt-1', ...input, companyId: COMPANY_ID });

      const result = await visitorTypeService.create(COMPANY_ID, input);

      expect(result.id).toBe('vt-1');
      expect(result.name).toBe('Contractor');
      expect(mockVisitorType.create).toHaveBeenCalledTimes(1);
      expect(mockVisitorType.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: COMPANY_ID,
            name: 'Contractor',
            code: 'CT',
          }),
        }),
      );
    });

    it('should reject duplicate code for the same company', async () => {
      mockVisitorType.findFirst.mockResolvedValue({ id: 'vt-existing', code: 'CT' });

      await expect(
        visitorTypeService.create(COMPANY_ID, { name: 'Contractor', code: 'CT' }),
      ).rejects.toThrow('Visitor type code "CT" already exists');
    });

    it('should seed defaults when this is the first visitor type for the company', async () => {
      mockVisitorType.findFirst
        .mockResolvedValueOnce(null) // no duplicate for the new code
        .mockResolvedValue(null);   // no existing defaults during seeding
      mockVisitorType.count.mockResolvedValue(0); // first type triggers seed
      mockVisitorType.create.mockResolvedValue({ id: 'vt-new', name: 'Custom', code: 'CU' });

      await visitorTypeService.create(COMPANY_ID, { name: 'Custom', code: 'CU' });

      // 9 default types + 1 custom = at least 10 create calls
      expect(mockVisitorType.create).toHaveBeenCalledTimes(10);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // list
  // ─────────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('should return paginated visitor types', async () => {
      const types = [
        { id: 'vt-1', name: 'Business Guest', code: 'BG' },
        { id: 'vt-2', name: 'Contractor', code: 'CT' },
      ];
      mockVisitorType.findMany.mockResolvedValue(types);
      mockVisitorType.count.mockResolvedValue(2);

      const result = await visitorTypeService.list(COMPANY_ID, {
        page: 1,
        limit: 50,
      });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mockVisitorType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: COMPANY_ID },
          skip: 0,
          take: 50,
          orderBy: { sortOrder: 'asc' },
        }),
      );
    });

    it('should filter by isActive', async () => {
      mockVisitorType.findMany.mockResolvedValue([]);
      mockVisitorType.count.mockResolvedValue(0);

      await visitorTypeService.list(COMPANY_ID, {
        page: 1,
        limit: 50,
        isActive: true,
      });

      expect(mockVisitorType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: COMPANY_ID, isActive: true },
        }),
      );
    });

    it('should calculate pagination offset correctly', async () => {
      mockVisitorType.findMany.mockResolvedValue([]);
      mockVisitorType.count.mockResolvedValue(100);

      await visitorTypeService.list(COMPANY_ID, { page: 3, limit: 10 });

      expect(mockVisitorType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // update
  // ─────────────────────────────────────────────────────────────────────

  describe('update', () => {
    const existingType = { id: 'vt-1', companyId: COMPANY_ID, name: 'Guest', code: 'GU' };

    it('should update a visitor type', async () => {
      mockVisitorType.findFirst
        .mockResolvedValueOnce(existingType)  // find existing
        .mockResolvedValueOnce(null);          // no duplicate code
      mockVisitorType.update.mockResolvedValue({ ...existingType, name: 'Updated Guest' });

      const result = await visitorTypeService.update(COMPANY_ID, 'vt-1', {
        name: 'Updated Guest',
        code: 'UG',
      });

      expect(result.name).toBe('Updated Guest');
      expect(mockVisitorType.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'vt-1' },
        }),
      );
    });

    it('should throw when visitor type not found', async () => {
      mockVisitorType.findFirst.mockResolvedValue(null);

      await expect(
        visitorTypeService.update(COMPANY_ID, 'nonexistent', { name: 'X' }),
      ).rejects.toThrow('Visitor type not found');
    });

    it('should reject duplicate code when changing code', async () => {
      mockVisitorType.findFirst
        .mockResolvedValueOnce(existingType) // find existing
        .mockResolvedValueOnce({ id: 'vt-other', code: 'BG' }); // duplicate found

      await expect(
        visitorTypeService.update(COMPANY_ID, 'vt-1', { code: 'BG' }),
      ).rejects.toThrow('Visitor type code "BG" already exists');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // deactivate
  // ─────────────────────────────────────────────────────────────────────

  describe('deactivate', () => {
    it('should deactivate a non-default visitor type', async () => {
      mockVisitorType.findFirst.mockResolvedValue({
        id: 'vt-1',
        companyId: COMPANY_ID,
        isDefault: false,
      });
      mockVisitorType.update.mockResolvedValue({ id: 'vt-1', isActive: false });

      const result = await visitorTypeService.deactivate(COMPANY_ID, 'vt-1');

      expect(result.isActive).toBe(false);
      expect(mockVisitorType.update).toHaveBeenCalledWith({
        where: { id: 'vt-1' },
        data: { isActive: false },
      });
    });

    it('should throw when visitor type not found', async () => {
      mockVisitorType.findFirst.mockResolvedValue(null);

      await expect(
        visitorTypeService.deactivate(COMPANY_ID, 'nonexistent'),
      ).rejects.toThrow('Visitor type not found');
    });

    it('should reject deactivation of default visitor types', async () => {
      mockVisitorType.findFirst.mockResolvedValue({
        id: 'vt-default',
        companyId: COMPANY_ID,
        isDefault: true,
      });

      await expect(
        visitorTypeService.deactivate(COMPANY_ID, 'vt-default'),
      ).rejects.toThrow('Cannot deactivate a default visitor type');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // seedDefaults
  // ─────────────────────────────────────────────────────────────────────

  describe('seedDefaults', () => {
    it('should seed exactly 9 default visitor types', async () => {
      mockVisitorType.findFirst.mockResolvedValue(null); // none exist yet
      mockVisitorType.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: `vt-${data.code}`, ...data }),
      );

      await visitorTypeService.seedDefaults(COMPANY_ID);

      expect(mockVisitorType.create).toHaveBeenCalledTimes(9);
    });

    it('should skip types that already exist', async () => {
      // Simulate 3 types already existing
      let callCount = 0;
      mockVisitorType.findFirst.mockImplementation(() => {
        callCount++;
        // First 3 calls return existing, rest return null
        return Promise.resolve(callCount <= 3 ? { id: `existing-${callCount}` } : null);
      });
      mockVisitorType.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: `vt-${data.code}`, ...data }),
      );

      await visitorTypeService.seedDefaults(COMPANY_ID);

      // 9 total minus 3 existing = 6 new creates
      expect(mockVisitorType.create).toHaveBeenCalledTimes(6);
    });

    it('should create all types with isDefault=true and isActive=true', async () => {
      mockVisitorType.findFirst.mockResolvedValue(null);
      mockVisitorType.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'id', ...data }),
      );

      await visitorTypeService.seedDefaults(COMPANY_ID);

      for (const call of mockVisitorType.create.mock.calls) {
        expect(call[0].data.isDefault).toBe(true);
        expect(call[0].data.isActive).toBe(true);
        expect(call[0].data.companyId).toBe(COMPANY_ID);
      }
    });

    it('should include the expected default type codes', async () => {
      mockVisitorType.findFirst.mockResolvedValue(null);
      mockVisitorType.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'id', ...data }),
      );

      await visitorTypeService.seedDefaults(COMPANY_ID);

      const createdCodes = mockVisitorType.create.mock.calls.map(
        (call: any) => call[0].data.code,
      );
      expect(createdCodes).toEqual(
        expect.arrayContaining(['BG', 'VN', 'CT', 'DA', 'GI', 'JC', 'FV', 'VP', 'AU']),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // getById
  // ─────────────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('should return the visitor type with relations', async () => {
      const type = { id: 'vt-1', name: 'Guest', _count: { visits: 5 }, safetyInduction: null };
      mockVisitorType.findFirst.mockResolvedValue(type);

      const result = await visitorTypeService.getById(COMPANY_ID, 'vt-1');

      expect(result).toEqual(type);
      expect(mockVisitorType.findFirst).toHaveBeenCalledWith({
        where: { id: 'vt-1', companyId: COMPANY_ID },
        include: {
          _count: { select: { visits: true } },
          safetyInduction: true,
        },
      });
    });

    it('should throw when not found', async () => {
      mockVisitorType.findFirst.mockResolvedValue(null);

      await expect(visitorTypeService.getById(COMPANY_ID, 'none')).rejects.toThrow(
        'Visitor type not found',
      );
    });
  });
});
