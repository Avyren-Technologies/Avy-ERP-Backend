/**
 * Machine Service — Integration Tests (mocked Prisma)
 */

import { ApiError } from '../../../../shared/errors';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPrisma = {
  machine: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  machineCategory: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  machineType: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  machineZone: {
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
  generateNextNumber: jest.fn().mockResolvedValue('MACH-00001'),
}));

jest.mock('../../../../shared/utils/prisma-helpers', () => ({
  n: (v: any) => (v === undefined ? null : v),
}));

jest.mock('../../../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { machineService } from '../machine.service';
import { auditLog } from '../../../../shared/utils/audit';
import { generateNextNumber } from '../../../../shared/utils/number-series';

// ── Helpers ──────────────────────────────────────────────────────────────────

const COMPANY_ID = 'comp-001';
const USER_ID = 'user-001';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MachineService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // listMachines
  // ═══════════════════════════════════════════════════════════════════════════

  describe('listMachines', () => {
    it('returns paginated results', async () => {
      const machines = [{ id: 'm1' }, { id: 'm2' }];
      mockPrisma.machine.findMany.mockResolvedValue(machines);
      mockPrisma.machine.count.mockResolvedValue(2);

      const result = await machineService.listMachines(COMPANY_ID, { page: 1, limit: 25 });

      expect(result.machines).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
    });

    it('applies search filter', async () => {
      mockPrisma.machine.findMany.mockResolvedValue([]);
      mockPrisma.machine.count.mockResolvedValue(0);

      await machineService.listMachines(COMPANY_ID, { page: 1, limit: 25, search: 'lathe' });

      expect(mockPrisma.machine.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: COMPANY_ID,
            OR: expect.arrayContaining([
              expect.objectContaining({ assetCode: expect.objectContaining({ contains: 'lathe' }) }),
            ]),
          }),
        }),
      );
    });

    it('applies status and categoryId filters', async () => {
      mockPrisma.machine.findMany.mockResolvedValue([]);
      mockPrisma.machine.count.mockResolvedValue(0);

      await machineService.listMachines(COMPANY_ID, { page: 1, limit: 25, status: 'ACTIVE', categoryId: 'cat-1' });

      expect(mockPrisma.machine.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: COMPANY_ID,
            status: 'ACTIVE',
            categoryId: 'cat-1',
          }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // createMachine
  // ═══════════════════════════════════════════════════════════════════════════

  describe('createMachine', () => {
    it('creates successfully with provided assetCode', async () => {
      mockPrisma.machine.findUnique.mockResolvedValue(null); // no duplicate
      const created = { id: 'm1', companyId: COMPANY_ID, assetCode: 'CNC-001', assetName: 'CNC Lathe' };
      mockPrisma.machine.create.mockResolvedValue(created);

      const result = await machineService.createMachine(
        COMPANY_ID,
        { assetCode: 'CNC-001', assetName: 'CNC Lathe' },
        USER_ID,
      );

      expect(result).toEqual(created);
      expect(generateNextNumber).not.toHaveBeenCalled();
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'Machine', action: 'CREATE' }),
      );
    });

    it('auto-generates assetCode when not provided', async () => {
      const created = { id: 'm2', companyId: COMPANY_ID, assetCode: 'MACH-00001', assetName: 'Press' };
      mockPrisma.machine.create.mockResolvedValue(created);

      const result = await machineService.createMachine(
        COMPANY_ID,
        { assetName: 'Press' },
        USER_ID,
      );

      expect(generateNextNumber).toHaveBeenCalledWith(
        mockPrisma, COMPANY_ID, ['Machine Master'], 'Machine',
      );
      expect(result.assetCode).toBe('MACH-00001');
    });

    it('throws conflict for duplicate assetCode', async () => {
      mockPrisma.machine.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        machineService.createMachine(COMPANY_ID, { assetCode: 'CNC-001', assetName: 'CNC' }, USER_ID),
      ).rejects.toThrow(/already exists/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // updateMachine
  // ═══════════════════════════════════════════════════════════════════════════

  describe('updateMachine', () => {
    const existing = {
      id: 'm1', companyId: COMPANY_ID, assetCode: 'CNC-001', assetName: 'CNC Lathe',
    };

    it('updates successfully', async () => {
      mockPrisma.machine.findUnique.mockResolvedValueOnce(existing);
      const updated = { ...existing, assetName: 'CNC Lathe V2' };
      mockPrisma.machine.update.mockResolvedValue(updated);

      const result = await machineService.updateMachine(COMPANY_ID, 'm1', { assetName: 'CNC Lathe V2' }, USER_ID);

      expect(result.assetName).toBe('CNC Lathe V2');
      expect(auditLog).toHaveBeenCalled();
    });

    it('throws not found for invalid id', async () => {
      mockPrisma.machine.findUnique.mockResolvedValue(null);

      await expect(
        machineService.updateMachine(COMPANY_ID, 'bad-id', { assetName: 'X' }, USER_ID),
      ).rejects.toThrow(/Machine not found/);
    });

    it('throws conflict if changing assetCode to an existing one', async () => {
      mockPrisma.machine.findUnique
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({ id: 'other', companyId: COMPANY_ID });

      await expect(
        machineService.updateMachine(COMPANY_ID, 'm1', { assetCode: 'TAKEN-001' }, USER_ID),
      ).rejects.toThrow(/already exists/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // deleteMachine
  // ═══════════════════════════════════════════════════════════════════════════

  describe('deleteMachine', () => {
    it('deletes successfully when not referenced', async () => {
      mockPrisma.machine.findUnique.mockResolvedValue({ id: 'm1', companyId: COMPANY_ID });
      mockPrisma.pipSlabConfig.count.mockResolvedValue(0);
      mockPrisma.machine.delete.mockResolvedValue({ id: 'm1' });

      const result = await machineService.deleteMachine(COMPANY_ID, 'm1', USER_ID);

      expect(result).toEqual({ id: 'm1' });
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELETE' }),
      );
    });

    it('throws when machine is referenced in PipSlabConfig', async () => {
      mockPrisma.machine.findUnique.mockResolvedValue({ id: 'm1', companyId: COMPANY_ID });
      mockPrisma.pipSlabConfig.count.mockResolvedValue(4);

      await expect(
        machineService.deleteMachine(COMPANY_ID, 'm1', USER_ID),
      ).rejects.toThrow(/referenced in 4 slab configuration/);
    });

    it('throws not found for invalid id', async () => {
      mockPrisma.machine.findUnique.mockResolvedValue(null);

      await expect(
        machineService.deleteMachine(COMPANY_ID, 'bad-id', USER_ID),
      ).rejects.toThrow(/Machine not found/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Machine Category CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  describe('createCategory', () => {
    it('creates with unique name', async () => {
      mockPrisma.machineCategory.findUnique.mockResolvedValue(null);
      const created = { id: 'mc-1', companyId: COMPANY_ID, name: 'CNC' };
      mockPrisma.machineCategory.create.mockResolvedValue(created);

      const result = await machineService.createCategory(COMPANY_ID, { name: 'CNC' });
      expect(result).toEqual(created);
    });

    it('throws conflict for duplicate name', async () => {
      mockPrisma.machineCategory.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        machineService.createCategory(COMPANY_ID, { name: 'CNC' }),
      ).rejects.toThrow(/already exists/);
    });
  });

  describe('deleteCategory', () => {
    it('deletes when no machines reference it', async () => {
      mockPrisma.machineCategory.findUnique.mockResolvedValue({ id: 'mc-1', companyId: COMPANY_ID });
      mockPrisma.machine.count.mockResolvedValue(0);
      mockPrisma.machineCategory.delete.mockResolvedValue({ id: 'mc-1' });

      const result = await machineService.deleteCategory(COMPANY_ID, 'mc-1');
      expect(result).toEqual({ id: 'mc-1' });
    });

    it('throws when category has referenced machines', async () => {
      mockPrisma.machineCategory.findUnique.mockResolvedValue({ id: 'mc-1', companyId: COMPANY_ID });
      mockPrisma.machine.count.mockResolvedValue(7);

      await expect(
        machineService.deleteCategory(COMPANY_ID, 'mc-1'),
      ).rejects.toThrow(/referenced by 7 machine/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Machine Type CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  describe('createType', () => {
    it('creates with unique name', async () => {
      mockPrisma.machineType.findUnique.mockResolvedValue(null);
      const created = { id: 'mt-1', companyId: COMPANY_ID, name: 'Lathe' };
      mockPrisma.machineType.create.mockResolvedValue(created);

      const result = await machineService.createType(COMPANY_ID, { name: 'Lathe' });
      expect(result).toEqual(created);
    });

    it('throws conflict for duplicate name', async () => {
      mockPrisma.machineType.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        machineService.createType(COMPANY_ID, { name: 'Lathe' }),
      ).rejects.toThrow(/already exists/);
    });
  });

  describe('deleteType', () => {
    it('throws when referenced by machines', async () => {
      mockPrisma.machineType.findUnique.mockResolvedValue({ id: 'mt-1', companyId: COMPANY_ID });
      mockPrisma.machine.count.mockResolvedValue(3);

      await expect(
        machineService.deleteType(COMPANY_ID, 'mt-1'),
      ).rejects.toThrow(/referenced by 3 machine/);
    });

    it('deletes when no machines reference it', async () => {
      mockPrisma.machineType.findUnique.mockResolvedValue({ id: 'mt-1', companyId: COMPANY_ID });
      mockPrisma.machine.count.mockResolvedValue(0);
      mockPrisma.machineType.delete.mockResolvedValue({ id: 'mt-1' });

      const result = await machineService.deleteType(COMPANY_ID, 'mt-1');
      expect(result).toEqual({ id: 'mt-1' });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Machine Zone CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  describe('createZone', () => {
    it('creates with unique name', async () => {
      mockPrisma.machineZone.findUnique.mockResolvedValue(null);
      const created = { id: 'mz-1', companyId: COMPANY_ID, name: 'Zone A' };
      mockPrisma.machineZone.create.mockResolvedValue(created);

      const result = await machineService.createZone(COMPANY_ID, { name: 'Zone A' });
      expect(result).toEqual(created);
    });

    it('throws conflict for duplicate name', async () => {
      mockPrisma.machineZone.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        machineService.createZone(COMPANY_ID, { name: 'Zone A' }),
      ).rejects.toThrow(/already exists/);
    });
  });

  describe('deleteZone', () => {
    it('throws when referenced by machines', async () => {
      mockPrisma.machineZone.findUnique.mockResolvedValue({ id: 'mz-1', companyId: COMPANY_ID });
      mockPrisma.machine.count.mockResolvedValue(2);

      await expect(
        machineService.deleteZone(COMPANY_ID, 'mz-1'),
      ).rejects.toThrow(/referenced by 2 machine/);
    });

    it('deletes when no machines reference it', async () => {
      mockPrisma.machineZone.findUnique.mockResolvedValue({ id: 'mz-1', companyId: COMPANY_ID });
      mockPrisma.machine.count.mockResolvedValue(0);
      mockPrisma.machineZone.delete.mockResolvedValue({ id: 'mz-1' });

      const result = await machineService.deleteZone(COMPANY_ID, 'mz-1');
      expect(result).toEqual({ id: 'mz-1' });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getMachine
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getMachine', () => {
    it('returns machine when found', async () => {
      const machine = { id: 'm1', companyId: COMPANY_ID, assetCode: 'CNC-001' };
      mockPrisma.machine.findUnique.mockResolvedValue(machine);

      const result = await machineService.getMachine(COMPANY_ID, 'm1');
      expect(result).toEqual(machine);
    });

    it('throws not found when machine does not exist', async () => {
      mockPrisma.machine.findUnique.mockResolvedValue(null);

      await expect(
        machineService.getMachine(COMPANY_ID, 'bad-id'),
      ).rejects.toThrow(/Machine not found/);
    });

    it('throws not found when machine belongs to different company', async () => {
      mockPrisma.machine.findUnique.mockResolvedValue({ id: 'm1', companyId: 'other-comp' });

      await expect(
        machineService.getMachine(COMPANY_ID, 'm1'),
      ).rejects.toThrow(/Machine not found/);
    });
  });
});
