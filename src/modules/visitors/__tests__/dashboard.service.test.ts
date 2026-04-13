/**
 * Unit tests for VMS DashboardService.
 *
 * Source: src/modules/visitors/dashboard/dashboard.service.ts
 */

jest.mock('../../../config/database', () => ({
  platformPrisma: {
    visit: {
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
  },
}));

jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../shared/utils/config-cache', () => ({
  getCachedCompanySettings: jest.fn().mockResolvedValue({ timezone: 'Asia/Kolkata' }),
}));

import { platformPrisma } from '../../../config/database';
import { dashboardService } from '../dashboard/dashboard.service';

const mockVisit = platformPrisma.visit as any;

const COMPANY_ID = 'company-1';

describe('DashboardService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────
  // getTodayStats
  // ─────────────────────────────────────────────────────────────────────

  describe('getTodayStats', () => {
    beforeEach(() => {
      // Default mock return values for the 7 parallel count queries
      mockVisit.count
        .mockResolvedValueOnce(25)  // totalExpected
        .mockResolvedValueOnce(18)  // checkedIn (includes checked-out)
        .mockResolvedValueOnce(10)  // checkedOut
        .mockResolvedValueOnce(8)   // onSiteNow
        .mockResolvedValueOnce(5)   // walkIns
        .mockResolvedValueOnce(2);  // noShows

      // Mock for countOverstaying
      mockVisit.findMany.mockResolvedValue([]);
    });

    it('should return all expected stat fields', async () => {
      const result = await dashboardService.getTodayStats(COMPANY_ID);

      expect(result).toEqual(
        expect.objectContaining({
          totalExpected: 25,
          checkedIn: 18,
          checkedOut: 10,
          onSiteNow: 8,
          walkIns: 5,
          noShows: 2,
          overstaying: expect.any(Number),
        }),
      );
    });

    it('should return zero for all stats when no visits exist', async () => {
      mockVisit.count.mockReset();
      mockVisit.count.mockResolvedValue(0);
      mockVisit.findMany.mockResolvedValue([]);

      const result = await dashboardService.getTodayStats(COMPANY_ID);

      expect(result.totalExpected).toBe(0);
      expect(result.onSiteNow).toBe(0);
      expect(result.overstaying).toBe(0);
    });

    it('should filter by plantId when provided', async () => {
      const result = await dashboardService.getTodayStats(COMPANY_ID, 'plant-1');

      // Verify all count calls include the plantId filter
      for (const call of mockVisit.count.mock.calls) {
        const where = call[0].where;
        // The onSiteNow query uses a different where structure
        if (where.status === 'CHECKED_IN') {
          expect(where.plantId).toBe('plant-1');
        }
      }

      expect(result).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Overstay detection
  // ─────────────────────────────────────────────────────────────────────

  describe('overstay detection (countOverstaying)', () => {
    it('should count visitors who have exceeded their expected duration', async () => {
      // Reset count mock for this test
      mockVisit.count.mockResolvedValue(0);

      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      mockVisit.findMany.mockResolvedValue([
        {
          // Overstaying: checked in 2 hours ago, expected 60 min
          checkInTime: twoHoursAgo,
          expectedDurationMinutes: 60,
        },
        {
          // Not overstaying: checked in 2 hours ago, expected 180 min
          checkInTime: twoHoursAgo,
          expectedDurationMinutes: 180,
        },
        {
          // No expected duration, should not count as overstay
          checkInTime: twoHoursAgo,
          expectedDurationMinutes: null,
        },
      ]);

      const result = await dashboardService.getTodayStats(COMPANY_ID);

      expect(result.overstaying).toBe(1);
    });

    it('should return 0 when no visitors have expected duration', async () => {
      mockVisit.count.mockResolvedValue(0);
      mockVisit.findMany.mockResolvedValue([
        { checkInTime: new Date(), expectedDurationMinutes: null },
      ]);

      const result = await dashboardService.getTodayStats(COMPANY_ID);

      expect(result.overstaying).toBe(0);
    });

    it('should return 0 when no visitors are checked in', async () => {
      mockVisit.count.mockResolvedValue(0);
      mockVisit.findMany.mockResolvedValue([]);

      const result = await dashboardService.getTodayStats(COMPANY_ID);

      expect(result.overstaying).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // getOnSiteVisitors
  // ─────────────────────────────────────────────────────────────────────

  describe('getOnSiteVisitors', () => {
    it('should return visitors with CHECKED_IN status', async () => {
      const visitors = [
        { id: 'v-1', status: 'CHECKED_IN', visitorName: 'Alice' },
        { id: 'v-2', status: 'CHECKED_IN', visitorName: 'Bob' },
      ];
      mockVisit.findMany.mockResolvedValue(visitors);

      const result = await dashboardService.getOnSiteVisitors(COMPANY_ID);

      expect(result).toHaveLength(2);
      expect(mockVisit.findMany).toHaveBeenCalledWith({
        where: { companyId: COMPANY_ID, status: 'CHECKED_IN' },
        orderBy: { checkInTime: 'desc' },
        include: { visitorType: true, checkInGate: true },
      });
    });

    it('should filter by plantId when provided', async () => {
      mockVisit.findMany.mockResolvedValue([]);

      await dashboardService.getOnSiteVisitors(COMPANY_ID, 'plant-1');

      expect(mockVisit.findMany).toHaveBeenCalledWith({
        where: { companyId: COMPANY_ID, status: 'CHECKED_IN', plantId: 'plant-1' },
        orderBy: { checkInTime: 'desc' },
        include: { visitorType: true, checkInGate: true },
      });
    });

    it('should return empty array when no visitors are on-site', async () => {
      mockVisit.findMany.mockResolvedValue([]);

      const result = await dashboardService.getOnSiteVisitors(COMPANY_ID);

      expect(result).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // getTodayVisitors
  // ─────────────────────────────────────────────────────────────────────

  describe('getTodayVisitors', () => {
    it('should return paginated today visitors', async () => {
      const visitors = [
        { id: 'v-1', visitorName: 'Alice', status: 'EXPECTED' },
      ];
      mockVisit.findMany.mockResolvedValue(visitors);
      mockVisit.count.mockResolvedValue(1);

      const result = await dashboardService.getTodayVisitors(COMPANY_ID, {
        page: 1,
        limit: 20,
      });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should apply search filter', async () => {
      mockVisit.findMany.mockResolvedValue([]);
      mockVisit.count.mockResolvedValue(0);

      await dashboardService.getTodayVisitors(COMPANY_ID, {
        page: 1,
        limit: 20,
        search: 'Alice',
      });

      expect(mockVisit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { visitorName: { contains: 'Alice', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // getMonthlyStats
  // ─────────────────────────────────────────────────────────────────────

  describe('getMonthlyStats', () => {
    beforeEach(() => {
      mockVisit.count
        .mockResolvedValueOnce(100)  // totalVisitsThisMonth
        .mockResolvedValueOnce(70)   // preRegistered
        .mockResolvedValueOnce(30)   // walkIns
        .mockResolvedValueOnce(50)   // completedWithDuration
        .mockResolvedValueOnce(50)   // overstayedVisits (same query as completedWithDuration)
        .mockResolvedValueOnce(10)   // inductionRequired
        .mockResolvedValueOnce(8);   // inductionCompleted

      mockVisit.aggregate.mockResolvedValue({
        _avg: { visitDurationMinutes: 95.5 },
      });

      // Mock for overstay calculation
      mockVisit.findMany.mockResolvedValue([
        { visitDurationMinutes: 120, expectedDurationMinutes: 60 },   // overstayed
        { visitDurationMinutes: 50, expectedDurationMinutes: 120 },   // not overstayed
        { visitDurationMinutes: 200, expectedDurationMinutes: 100 },  // overstayed
      ]);
    });

    it('should return all KPI fields', async () => {
      const result = await dashboardService.getMonthlyStats(COMPANY_ID);

      expect(result).toEqual(
        expect.objectContaining({
          totalVisitsThisMonth: expect.any(Number),
          avgDailyVisitors: expect.any(Number),
          avgVisitDurationMinutes: expect.any(Number),
          preRegisteredPercent: expect.any(Number),
          walkInPercent: expect.any(Number),
          overstayRate: expect.any(Number),
          safetyInductionCompletionRate: expect.any(Number),
        }),
      );
    });

    it('should calculate pre-registered percentage correctly', async () => {
      const result = await dashboardService.getMonthlyStats(COMPANY_ID);

      // 70 pre-registered out of 100 total = 70%
      expect(result.preRegisteredPercent).toBe(70);
    });

    it('should calculate walk-in percentage correctly', async () => {
      const result = await dashboardService.getMonthlyStats(COMPANY_ID);

      // 30 walk-ins out of 100 total = 30%
      expect(result.walkInPercent).toBe(30);
    });

    it('should calculate safety induction completion rate', async () => {
      const result = await dashboardService.getMonthlyStats(COMPANY_ID);

      // 8 completed out of 10 required = 80%
      expect(result.safetyInductionCompletionRate).toBe(80);
    });

    it('should round average visit duration', async () => {
      const result = await dashboardService.getMonthlyStats(COMPANY_ID);

      // 95.5 should round to 96
      expect(result.avgVisitDurationMinutes).toBe(96);
    });

    it('should handle zero visits gracefully', async () => {
      mockVisit.count.mockReset();
      mockVisit.count.mockResolvedValue(0);
      mockVisit.aggregate.mockResolvedValue({
        _avg: { visitDurationMinutes: null },
      });
      mockVisit.findMany.mockResolvedValue([]);

      const result = await dashboardService.getMonthlyStats(COMPANY_ID);

      expect(result.totalVisitsThisMonth).toBe(0);
      expect(result.preRegisteredPercent).toBe(0);
      expect(result.walkInPercent).toBe(0);
      expect(result.overstayRate).toBe(0);
      expect(result.avgVisitDurationMinutes).toBe(0);
    });
  });
});
