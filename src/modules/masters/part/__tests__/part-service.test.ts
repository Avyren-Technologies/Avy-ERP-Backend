/**
 * Part Service — Integration Tests (mocked Prisma)
 */

import { ApiError } from '../../../../shared/errors';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPrisma = {
  part: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  partCategory: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  productModel: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  unitOfMeasure: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  pipSlabConfig: {
    count: jest.fn(),
  },
};

jest.mock('../../../../config/database', () => ({
  platformPrisma: mockPrisma,
}));

jest.mock('../../../../shared/utils/audit', () => ({
  auditLog: jest.fn(),
}));

jest.mock('../../../../shared/utils/number-series', () => ({
  generateNextNumber: jest.fn().mockResolvedValue('PART-00001'),
}));

jest.mock('../../../../shared/utils/prisma-helpers', () => ({
  n: (v: any) => (v === undefined ? null : v),
}));

jest.mock('../../../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { partService } from '../part.service';
import { auditLog } from '../../../../shared/utils/audit';
import { generateNextNumber } from '../../../../shared/utils/number-series';

// ── Helpers ──────────────────────────────────────────────────────────────────

const COMPANY_ID = 'comp-001';
const USER_ID = 'user-001';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PartService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // listParts
  // ═══════════════════════════════════════════════════════════════════════════

  describe('listParts', () => {
    it('returns paginated results', async () => {
      const parts = [{ id: 'p1' }, { id: 'p2' }];
      mockPrisma.part.findMany.mockResolvedValue(parts);
      mockPrisma.part.count.mockResolvedValue(2);

      const result = await partService.listParts(COMPANY_ID, { page: 1, limit: 25 });

      expect(result.parts).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(25);
    });

    it('applies search filter', async () => {
      mockPrisma.part.findMany.mockResolvedValue([]);
      mockPrisma.part.count.mockResolvedValue(0);

      await partService.listParts(COMPANY_ID, { page: 1, limit: 25, search: 'bolt' });

      expect(mockPrisma.part.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: COMPANY_ID,
            OR: expect.arrayContaining([
              expect.objectContaining({ partNumber: expect.objectContaining({ contains: 'bolt' }) }),
            ]),
          }),
        }),
      );
    });

    it('applies status filter', async () => {
      mockPrisma.part.findMany.mockResolvedValue([]);
      mockPrisma.part.count.mockResolvedValue(0);

      await partService.listParts(COMPANY_ID, { page: 1, limit: 25, status: 'ACTIVE' });

      expect(mockPrisma.part.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: COMPANY_ID, status: 'ACTIVE' }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // createPart
  // ═══════════════════════════════════════════════════════════════════════════

  describe('createPart', () => {
    it('creates successfully with provided partNumber', async () => {
      mockPrisma.part.findUnique.mockResolvedValue(null); // no duplicate
      const created = { id: 'p1', companyId: COMPANY_ID, partNumber: 'BLT-001', name: 'Bolt' };
      mockPrisma.part.create.mockResolvedValue(created);

      const result = await partService.createPart(
        COMPANY_ID,
        { partNumber: 'BLT-001', name: 'Bolt' },
        USER_ID,
      );

      expect(result).toEqual(created);
      expect(generateNextNumber).not.toHaveBeenCalled();
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'Part', action: 'CREATE' }),
      );
    });

    it('calls generateNextNumber when partNumber not provided', async () => {
      const created = { id: 'p2', companyId: COMPANY_ID, partNumber: 'PART-00001', name: 'Widget' };
      mockPrisma.part.create.mockResolvedValue(created);

      const result = await partService.createPart(
        COMPANY_ID,
        { name: 'Widget' },
        USER_ID,
      );

      expect(generateNextNumber).toHaveBeenCalledWith(
        mockPrisma, COMPANY_ID, ['Part Master'], 'Part',
      );
      expect(result.partNumber).toBe('PART-00001');
    });

    it('throws conflict for duplicate partNumber', async () => {
      mockPrisma.part.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        partService.createPart(COMPANY_ID, { partNumber: 'BLT-001', name: 'Bolt' }, USER_ID),
      ).rejects.toThrow(/already exists/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // updatePart
  // ═══════════════════════════════════════════════════════════════════════════

  describe('updatePart', () => {
    const existing = {
      id: 'p1', companyId: COMPANY_ID, partNumber: 'BLT-001', name: 'Bolt',
    };

    it('updates successfully', async () => {
      mockPrisma.part.findUnique.mockResolvedValueOnce(existing); // existing check
      const updated = { ...existing, name: 'Bolt V2' };
      mockPrisma.part.update.mockResolvedValue(updated);

      const result = await partService.updatePart(COMPANY_ID, 'p1', { name: 'Bolt V2' }, USER_ID);

      expect(result.name).toBe('Bolt V2');
      expect(auditLog).toHaveBeenCalled();
    });

    it('throws not found for invalid id', async () => {
      mockPrisma.part.findUnique.mockResolvedValue(null);

      await expect(
        partService.updatePart(COMPANY_ID, 'bad-id', { name: 'X' }, USER_ID),
      ).rejects.toThrow(/Part not found/);
    });

    it('throws conflict if changing partNumber to an existing one', async () => {
      mockPrisma.part.findUnique
        .mockResolvedValueOnce(existing) // existing check
        .mockResolvedValueOnce({ id: 'other', companyId: COMPANY_ID }); // duplicate check

      await expect(
        partService.updatePart(COMPANY_ID, 'p1', { partNumber: 'TAKEN-001' }, USER_ID),
      ).rejects.toThrow(/already exists/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // deletePart
  // ═══════════════════════════════════════════════════════════════════════════

  describe('deletePart', () => {
    it('deletes successfully when not referenced', async () => {
      mockPrisma.part.findUnique.mockResolvedValue({ id: 'p1', companyId: COMPANY_ID });
      mockPrisma.pipSlabConfig.count.mockResolvedValue(0);
      mockPrisma.part.delete.mockResolvedValue({ id: 'p1' });

      const result = await partService.deletePart(COMPANY_ID, 'p1', USER_ID);

      expect(result).toEqual({ id: 'p1' });
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELETE' }),
      );
    });

    it('throws error when part is referenced in PipSlabConfig', async () => {
      mockPrisma.part.findUnique.mockResolvedValue({ id: 'p1', companyId: COMPANY_ID });
      mockPrisma.pipSlabConfig.count.mockResolvedValue(2);

      await expect(
        partService.deletePart(COMPANY_ID, 'p1', USER_ID),
      ).rejects.toThrow(/referenced in 2 slab configuration/);
    });

    it('throws not found for invalid id', async () => {
      mockPrisma.part.findUnique.mockResolvedValue(null);

      await expect(
        partService.deletePart(COMPANY_ID, 'bad-id', USER_ID),
      ).rejects.toThrow(/Part not found/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Category CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  describe('createCategory', () => {
    it('creates successfully with unique name', async () => {
      mockPrisma.partCategory.findUnique.mockResolvedValue(null);
      const created = { id: 'cat-1', companyId: COMPANY_ID, name: 'Fasteners' };
      mockPrisma.partCategory.create.mockResolvedValue(created);

      const result = await partService.createCategory(COMPANY_ID, { name: 'Fasteners' });

      expect(result).toEqual(created);
    });

    it('throws conflict for duplicate category name', async () => {
      mockPrisma.partCategory.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        partService.createCategory(COMPANY_ID, { name: 'Fasteners' }),
      ).rejects.toThrow(/already exists/);
    });
  });

  describe('deleteCategory', () => {
    it('deletes when no parts reference it', async () => {
      mockPrisma.partCategory.findUnique.mockResolvedValue({ id: 'cat-1', companyId: COMPANY_ID });
      mockPrisma.part.count.mockResolvedValue(0);
      mockPrisma.partCategory.delete.mockResolvedValue({ id: 'cat-1' });

      const result = await partService.deleteCategory(COMPANY_ID, 'cat-1');
      expect(result).toEqual({ id: 'cat-1' });
    });

    it('throws when category has referenced parts', async () => {
      mockPrisma.partCategory.findUnique.mockResolvedValue({ id: 'cat-1', companyId: COMPANY_ID });
      mockPrisma.part.count.mockResolvedValue(5);

      await expect(
        partService.deleteCategory(COMPANY_ID, 'cat-1'),
      ).rejects.toThrow(/referenced by 5 part/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Product Model CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  describe('createProductModel', () => {
    it('creates with unique name', async () => {
      mockPrisma.productModel.findUnique.mockResolvedValue(null);
      const created = { id: 'pm-1', companyId: COMPANY_ID, name: 'Model X' };
      mockPrisma.productModel.create.mockResolvedValue(created);

      const result = await partService.createProductModel(COMPANY_ID, { name: 'Model X' });
      expect(result).toEqual(created);
    });

    it('throws conflict for duplicate', async () => {
      mockPrisma.productModel.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        partService.createProductModel(COMPANY_ID, { name: 'Model X' }),
      ).rejects.toThrow(/already exists/);
    });
  });

  describe('deleteProductModel', () => {
    it('throws when referenced by parts', async () => {
      mockPrisma.productModel.findUnique.mockResolvedValue({ id: 'pm-1', companyId: COMPANY_ID });
      mockPrisma.part.count.mockResolvedValue(3);

      await expect(
        partService.deleteProductModel(COMPANY_ID, 'pm-1'),
      ).rejects.toThrow(/referenced by 3 part/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UOM CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  describe('createUom', () => {
    it('creates with unique abbreviation', async () => {
      mockPrisma.unitOfMeasure.findUnique.mockResolvedValue(null);
      const created = { id: 'uom-1', companyId: COMPANY_ID, name: 'Kilogram', abbreviation: 'kg' };
      mockPrisma.unitOfMeasure.create.mockResolvedValue(created);

      const result = await partService.createUom(COMPANY_ID, { name: 'Kilogram', abbreviation: 'kg' });
      expect(result).toEqual(created);
    });

    it('throws conflict for duplicate abbreviation', async () => {
      mockPrisma.unitOfMeasure.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        partService.createUom(COMPANY_ID, { name: 'Kilogram', abbreviation: 'kg' }),
      ).rejects.toThrow(/already exists/);
    });
  });

  describe('deleteUom', () => {
    it('throws when referenced by parts', async () => {
      mockPrisma.unitOfMeasure.findUnique.mockResolvedValue({ id: 'uom-1', companyId: COMPANY_ID });
      mockPrisma.part.count.mockResolvedValue(10);

      await expect(
        partService.deleteUom(COMPANY_ID, 'uom-1'),
      ).rejects.toThrow(/referenced by 10 part/);
    });
  });
});
