/**
 * Unit tests for WatchlistService (blocklist/watchlist).
 *
 * Source: src/modules/visitors/security/watchlist.service.ts
 */

jest.mock('../../../config/database', () => ({
  platformPrisma: {
    visitorWatchlist: {
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
import { watchlistService } from '../security/watchlist.service';

const mockWatchlist = platformPrisma.visitorWatchlist as any;

const COMPANY_ID = 'company-1';
const USER_ID = 'user-1';

const sampleBlocklistEntry = {
  id: 'wl-1',
  companyId: COMPANY_ID,
  type: 'BLOCKLIST',
  personName: 'Bad Actor',
  mobileNumber: '9876543210',
  email: null,
  idNumber: 'AADHAAR-1234',
  reason: 'Theft on premises',
  actionRequired: 'Deny entry and alert security',
  blockDuration: 'PERMANENT',
  expiryDate: null,
  isActive: true,
  createdAt: new Date('2026-04-01'),
};

const sampleWatchlistEntry = {
  id: 'wl-2',
  companyId: COMPANY_ID,
  type: 'WATCHLIST',
  personName: 'Suspicious Person',
  mobileNumber: '9998887776',
  email: null,
  idNumber: null,
  reason: 'Previous altercation',
  actionRequired: 'Escort required',
  blockDuration: 'UNTIL_DATE',
  expiryDate: new Date('2026-12-31'),
  isActive: true,
  createdAt: new Date('2026-04-01'),
};

describe('WatchlistService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────
  // create
  // ─────────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a blocklist entry', async () => {
      const input = {
        type: 'BLOCKLIST',
        personName: 'Bad Actor',
        mobileNumber: '9876543210',
        reason: 'Theft on premises',
        blockDuration: 'PERMANENT',
        appliesToAllPlants: true,
        plantIds: [],
      };

      mockWatchlist.create.mockResolvedValue({ id: 'wl-new', ...input, companyId: COMPANY_ID });

      const result = await watchlistService.create(COMPANY_ID, input, USER_ID);

      expect(result.id).toBe('wl-new');
      expect(result.type).toBe('BLOCKLIST');
      expect(mockWatchlist.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          companyId: COMPANY_ID,
          type: 'BLOCKLIST',
          personName: 'Bad Actor',
          createdBy: USER_ID,
        }),
      });
    });

    it('should create a watchlist entry', async () => {
      const input = {
        type: 'WATCHLIST',
        personName: 'Person of Interest',
        mobileNumber: '9998887776',
        reason: 'Previous incident',
        actionRequired: 'Escort required at all times',
        blockDuration: 'UNTIL_DATE',
        expiryDate: '2026-12-31',
        appliesToAllPlants: false,
        plantIds: ['plant-1'],
      };

      mockWatchlist.create.mockResolvedValue({ id: 'wl-new', ...input, companyId: COMPANY_ID });

      const result = await watchlistService.create(COMPANY_ID, input, USER_ID);

      expect(result.type).toBe('WATCHLIST');
      expect(mockWatchlist.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'WATCHLIST',
          blockDuration: 'UNTIL_DATE',
          appliesToAllPlants: false,
          plantIds: ['plant-1'],
        }),
      });
    });

    it('should convert expiryDate string to Date object', async () => {
      const input = {
        type: 'BLOCKLIST',
        personName: 'Someone',
        reason: 'Reason',
        blockDuration: 'UNTIL_DATE',
        expiryDate: '2026-12-31',
      };

      mockWatchlist.create.mockResolvedValue({ id: 'wl-new' });

      await watchlistService.create(COMPANY_ID, input, USER_ID);

      const createCall = mockWatchlist.create.mock.calls[0][0];
      expect(createCall.data.expiryDate).toEqual(new Date('2026-12-31'));
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // list
  // ─────────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('should return paginated results', async () => {
      mockWatchlist.findMany.mockResolvedValue([sampleBlocklistEntry, sampleWatchlistEntry]);
      mockWatchlist.count.mockResolvedValue(2);

      const result = await watchlistService.list(COMPANY_ID, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should filter by type', async () => {
      mockWatchlist.findMany.mockResolvedValue([sampleBlocklistEntry]);
      mockWatchlist.count.mockResolvedValue(1);

      await watchlistService.list(COMPANY_ID, { page: 1, limit: 20, type: 'BLOCKLIST' });

      expect(mockWatchlist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'BLOCKLIST' }),
        }),
      );
    });

    it('should filter by isActive', async () => {
      mockWatchlist.findMany.mockResolvedValue([]);
      mockWatchlist.count.mockResolvedValue(0);

      await watchlistService.list(COMPANY_ID, { page: 1, limit: 20, isActive: true });

      expect(mockWatchlist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        }),
      );
    });

    it('should filter by search (name, mobile, idNumber)', async () => {
      mockWatchlist.findMany.mockResolvedValue([]);
      mockWatchlist.count.mockResolvedValue(0);

      await watchlistService.list(COMPANY_ID, { page: 1, limit: 20, search: 'Bad' });

      expect(mockWatchlist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { personName: { contains: 'Bad', mode: 'insensitive' } },
              { mobileNumber: { contains: 'Bad' } },
              { idNumber: { contains: 'Bad' } },
            ],
          }),
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // check
  // ─────────────────────────────────────────────────────────────────────

  describe('check', () => {
    it('should detect a blocklist match by mobile number', async () => {
      mockWatchlist.findMany.mockResolvedValue([sampleBlocklistEntry]);

      const result = await watchlistService.check(COMPANY_ID, {
        mobile: '9876543210',
      });

      expect(result.blocklisted).toBe(true);
      expect(result.watchlisted).toBe(false);
      expect(result.matches).toHaveLength(1);
    });

    it('should detect a watchlist match by name', async () => {
      mockWatchlist.findMany.mockResolvedValue([sampleWatchlistEntry]);

      const result = await watchlistService.check(COMPANY_ID, {
        name: 'Suspicious Person',
      });

      expect(result.blocklisted).toBe(false);
      expect(result.watchlisted).toBe(true);
      expect(result.matches).toHaveLength(1);
    });

    it('should detect a match by idNumber', async () => {
      mockWatchlist.findMany.mockResolvedValue([sampleBlocklistEntry]);

      const result = await watchlistService.check(COMPANY_ID, {
        idNumber: 'AADHAAR-1234',
      });

      expect(result.blocklisted).toBe(true);
      expect(result.matches).toHaveLength(1);
    });

    it('should detect both blocklist and watchlist matches', async () => {
      mockWatchlist.findMany.mockResolvedValue([sampleBlocklistEntry, sampleWatchlistEntry]);

      const result = await watchlistService.check(COMPANY_ID, {
        mobile: '9876543210',
        name: 'Suspicious Person',
      });

      expect(result.blocklisted).toBe(true);
      expect(result.watchlisted).toBe(true);
      expect(result.matches).toHaveLength(2);
    });

    it('should filter out expired UNTIL_DATE entries', async () => {
      const expiredEntry = {
        ...sampleWatchlistEntry,
        blockDuration: 'UNTIL_DATE',
        expiryDate: new Date('2020-01-01'), // expired in the past
      };
      mockWatchlist.findMany.mockResolvedValue([expiredEntry]);

      const result = await watchlistService.check(COMPANY_ID, {
        mobile: '9998887776',
      });

      // The expired entry should be filtered out
      expect(result.blocklisted).toBe(false);
      expect(result.watchlisted).toBe(false);
      expect(result.matches).toHaveLength(0);
    });

    it('should keep PERMANENT entries regardless of expiryDate', async () => {
      const permanentEntry = {
        ...sampleBlocklistEntry,
        blockDuration: 'PERMANENT',
        expiryDate: null,
      };
      mockWatchlist.findMany.mockResolvedValue([permanentEntry]);

      const result = await watchlistService.check(COMPANY_ID, {
        mobile: '9876543210',
      });

      expect(result.blocklisted).toBe(true);
      expect(result.matches).toHaveLength(1);
    });

    it('should return no matches when no criteria provided', async () => {
      const result = await watchlistService.check(COMPANY_ID, {});

      expect(result.blocklisted).toBe(false);
      expect(result.watchlisted).toBe(false);
      expect(result.matches).toHaveLength(0);
      // Should not even query the database
      expect(mockWatchlist.findMany).not.toHaveBeenCalled();
    });

    it('should return no matches when no entries found in DB', async () => {
      mockWatchlist.findMany.mockResolvedValue([]);

      const result = await watchlistService.check(COMPANY_ID, {
        mobile: '1111111111',
      });

      expect(result.blocklisted).toBe(false);
      expect(result.watchlisted).toBe(false);
      expect(result.matches).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // remove (soft delete)
  // ─────────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('should soft delete by setting isActive=false', async () => {
      mockWatchlist.findFirst.mockResolvedValue(sampleBlocklistEntry);
      mockWatchlist.update.mockResolvedValue({ ...sampleBlocklistEntry, isActive: false });

      const result = await watchlistService.remove(COMPANY_ID, 'wl-1');

      expect(result.isActive).toBe(false);
      expect(mockWatchlist.update).toHaveBeenCalledWith({
        where: { id: 'wl-1' },
        data: { isActive: false },
      });
    });

    it('should throw when entry not found', async () => {
      mockWatchlist.findFirst.mockResolvedValue(null);

      await expect(
        watchlistService.remove(COMPANY_ID, 'nonexistent'),
      ).rejects.toThrow('Watchlist entry not found');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // getById
  // ─────────────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('should return the entry when found', async () => {
      mockWatchlist.findFirst.mockResolvedValue(sampleBlocklistEntry);

      const result = await watchlistService.getById(COMPANY_ID, 'wl-1');

      expect(result).toEqual(sampleBlocklistEntry);
    });

    it('should throw when not found', async () => {
      mockWatchlist.findFirst.mockResolvedValue(null);

      await expect(watchlistService.getById(COMPANY_ID, 'none')).rejects.toThrow(
        'Watchlist entry not found',
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // update
  // ─────────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update an existing watchlist entry', async () => {
      mockWatchlist.findFirst.mockResolvedValue(sampleWatchlistEntry);
      mockWatchlist.update.mockResolvedValue({
        ...sampleWatchlistEntry,
        reason: 'Updated reason',
      });

      const result = await watchlistService.update(COMPANY_ID, 'wl-2', {
        reason: 'Updated reason',
      });

      expect(result.reason).toBe('Updated reason');
      expect(mockWatchlist.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wl-2' },
          data: expect.objectContaining({ reason: 'Updated reason' }),
        }),
      );
    });

    it('should throw when entry not found', async () => {
      mockWatchlist.findFirst.mockResolvedValue(null);

      await expect(
        watchlistService.update(COMPANY_ID, 'none', { reason: 'X' }),
      ).rejects.toThrow('Watchlist entry not found');
    });
  });
});
