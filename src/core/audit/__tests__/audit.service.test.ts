import { AuditService } from '../audit.service';

// Mock the database module
jest.mock('../../../config/database', () => ({
  platformPrisma: {
    auditLog: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
  },
}));

// Mock the logger
jest.mock('../../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { platformPrisma } from '../../../config/database';

const mockAuditLog = platformPrisma.auditLog as any;

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(() => {
    service = new AuditService();
    jest.clearAllMocks();
  });

  // ── listAuditLogs ──────────────────────────────────────────────────

  describe('listAuditLogs', () => {
    const sampleLogs = [
      {
        id: 'log-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        action: 'CREATE',
        entityType: 'Tenant',
        entityId: 'entity-1',
        oldValues: null,
        newValues: { name: 'Test' },
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
        changedAt: new Date('2026-01-15T10:00:00Z'),
      },
      {
        id: 'log-2',
        tenantId: 'tenant-1',
        userId: 'user-2',
        action: 'UPDATE',
        entityType: 'Company',
        entityId: 'entity-2',
        oldValues: { name: 'Old' },
        newValues: { name: 'New' },
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
        changedAt: new Date('2026-01-14T10:00:00Z'),
      },
    ];

    it('should return paginated audit logs with default parameters', async () => {
      mockAuditLog.findMany.mockResolvedValue(sampleLogs);
      mockAuditLog.count.mockResolvedValue(2);

      const result = await service.listAuditLogs();

      expect(result).toEqual({
        logs: sampleLogs,
        total: 2,
        page: 1,
        limit: 25,
        totalPages: 1,
      });

      expect(mockAuditLog.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 25,
        orderBy: { changedAt: 'desc' },
      });
      expect(mockAuditLog.count).toHaveBeenCalledWith({ where: {} });
    });

    it('should apply action filter', async () => {
      mockAuditLog.findMany.mockResolvedValue([sampleLogs[0]]);
      mockAuditLog.count.mockResolvedValue(1);

      const result = await service.listAuditLogs({ action: 'CREATE' });

      expect(mockAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { action: 'CREATE' },
        }),
      );
      expect(result.total).toBe(1);
    });

    it('should apply entityType filter', async () => {
      mockAuditLog.findMany.mockResolvedValue([]);
      mockAuditLog.count.mockResolvedValue(0);

      await service.listAuditLogs({ entityType: 'Tenant' });

      expect(mockAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entityType: 'Tenant' },
        }),
      );
    });

    it('should apply changedBy and companyId filters', async () => {
      mockAuditLog.findMany.mockResolvedValue([]);
      mockAuditLog.count.mockResolvedValue(0);

      await service.listAuditLogs({ changedBy: 'user-1', companyId: 'company-1' });

      expect(mockAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { changedBy: 'user-1', companyId: 'company-1' },
        }),
      );
    });

    it('should apply date range filter', async () => {
      mockAuditLog.findMany.mockResolvedValue([]);
      mockAuditLog.count.mockResolvedValue(0);

      const dateFrom = '2026-01-01';
      const dateTo = '2026-01-31';

      await service.listAuditLogs({ dateFrom, dateTo });

      expect(mockAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            changedAt: {
              gte: new Date(dateFrom),
              lte: new Date(dateTo),
            },
          },
        }),
      );
    });

    it('should apply search filter across action, entityType, entityId', async () => {
      mockAuditLog.findMany.mockResolvedValue([]);
      mockAuditLog.count.mockResolvedValue(0);

      await service.listAuditLogs({ search: 'create' });

      expect(mockAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { action: { contains: 'create', mode: 'insensitive' } },
              { entityType: { contains: 'create', mode: 'insensitive' } },
              { entityId: { contains: 'create', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });

    it('should calculate pagination correctly', async () => {
      mockAuditLog.findMany.mockResolvedValue([]);
      mockAuditLog.count.mockResolvedValue(100);

      const result = await service.listAuditLogs({ page: 3, limit: 10 });

      expect(result).toEqual({
        logs: [],
        total: 100,
        page: 3,
        limit: 10,
        totalPages: 10,
      });

      expect(mockAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
    });

    it('should handle partial date range (only dateFrom)', async () => {
      mockAuditLog.findMany.mockResolvedValue([]);
      mockAuditLog.count.mockResolvedValue(0);

      await service.listAuditLogs({ dateFrom: '2026-01-01' });

      expect(mockAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            changedAt: {
              gte: new Date('2026-01-01'),
            },
          },
        }),
      );
    });
  });

  // ── getAuditLogById ────────────────────────────────────────────────

  describe('getAuditLogById', () => {
    it('should return an audit log when found', async () => {
      const log = { id: 'log-1', action: 'CREATE', entityType: 'Tenant', entityId: 'e-1', changedAt: new Date() };
      mockAuditLog.findUnique.mockResolvedValue(log);

      const result = await service.getAuditLogById('log-1');

      expect(result).toEqual(log);
      expect(mockAuditLog.findUnique).toHaveBeenCalledWith({ where: { id: 'log-1' } });
    });

    it('should return null when not found', async () => {
      mockAuditLog.findUnique.mockResolvedValue(null);

      const result = await service.getAuditLogById('nonexistent');

      expect(result).toBeNull();
      expect(mockAuditLog.findUnique).toHaveBeenCalledWith({ where: { id: 'nonexistent' } });
    });
  });

  // ── getAuditLogsByEntity ───────────────────────────────────────────

  describe('getAuditLogsByEntity', () => {
    it('should return logs for a specific entity with default limit', async () => {
      const logs = [{ id: 'log-1' }, { id: 'log-2' }];
      mockAuditLog.findMany.mockResolvedValue(logs);

      const result = await service.getAuditLogsByEntity('Tenant', 'tenant-1');

      expect(result).toEqual(logs);
      expect(mockAuditLog.findMany).toHaveBeenCalledWith({
        where: { entityType: 'Tenant', entityId: 'tenant-1' },
        take: 50,
        orderBy: { changedAt: 'desc' },
      });
    });

    it('should respect custom limit', async () => {
      mockAuditLog.findMany.mockResolvedValue([]);

      await service.getAuditLogsByEntity('Company', 'comp-1', 10);

      expect(mockAuditLog.findMany).toHaveBeenCalledWith({
        where: { entityType: 'Company', entityId: 'comp-1' },
        take: 10,
        orderBy: { changedAt: 'desc' },
      });
    });
  });

  // ── getActionTypes ─────────────────────────────────────────────────

  describe('getActionTypes', () => {
    it('should return distinct action types', async () => {
      mockAuditLog.findMany.mockResolvedValue([
        { action: 'CREATE' },
        { action: 'DELETE' },
        { action: 'UPDATE' },
      ]);

      const result = await service.getActionTypes();

      expect(result).toEqual(['CREATE', 'DELETE', 'UPDATE']);
      expect(mockAuditLog.findMany).toHaveBeenCalledWith({
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
      });
    });

    it('should return empty array when no logs exist', async () => {
      mockAuditLog.findMany.mockResolvedValue([]);

      const result = await service.getActionTypes();

      expect(result).toEqual([]);
    });
  });

  // ── getEntityTypes ─────────────────────────────────────────────────

  describe('getEntityTypes', () => {
    it('should return distinct entity types', async () => {
      mockAuditLog.findMany.mockResolvedValue([
        { entityType: 'Company' },
        { entityType: 'Tenant' },
        { entityType: 'User' },
      ]);

      const result = await service.getEntityTypes();

      expect(result).toEqual(['Company', 'Tenant', 'User']);
      expect(mockAuditLog.findMany).toHaveBeenCalledWith({
        distinct: ['entityType'],
        select: { entityType: true },
        orderBy: { entityType: 'asc' },
      });
    });

    it('should return empty array when no logs exist', async () => {
      mockAuditLog.findMany.mockResolvedValue([]);

      const result = await service.getEntityTypes();

      expect(result).toEqual([]);
    });
  });
});
