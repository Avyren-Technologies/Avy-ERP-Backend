import { platformPrisma } from '../../../config/database';
import { getCachedCompanySettings } from '../../../shared/utils/config-cache';
import { logger } from '../../../config/logger';
import { DateTime } from 'luxon';

interface TodayVisitorFilters {
  plantId?: string;
  gateId?: string;
  status?: string;
  search?: string;
  page: number;
  limit: number;
}

class DashboardService {
  // ────────────────────────────────────────────────────────────────────
  // Today's stats
  // ────────────────────────────────────────────────────────────────────

  async getTodayStats(companyId: string, plantId?: string) {
    const tz = await this.getTimezone(companyId);
    const todayStart = DateTime.now().setZone(tz).startOf('day').toJSDate();
    const todayEnd = DateTime.now().setZone(tz).endOf('day').toJSDate();

    const where: any = {
      companyId,
      expectedDate: { gte: todayStart, lte: todayEnd },
    };
    if (plantId) where.plantId = plantId;

    const [totalExpected, checkedIn, checkedOut, onSiteNow, walkIns, noShows, overstaying] = await Promise.all([
      platformPrisma.visit.count({ where: { ...where } }),
      platformPrisma.visit.count({
        where: { ...where, status: { in: ['CHECKED_IN', 'CHECKED_OUT', 'AUTO_CHECKED_OUT'] } },
      }),
      platformPrisma.visit.count({
        where: { ...where, status: { in: ['CHECKED_OUT', 'AUTO_CHECKED_OUT'] } },
      }),
      platformPrisma.visit.count({
        where: { companyId, status: 'CHECKED_IN', ...(plantId ? { plantId } : {}) },
      }),
      platformPrisma.visit.count({
        where: { ...where, registrationMethod: 'WALK_IN' },
      }),
      platformPrisma.visit.count({
        where: { ...where, status: 'NO_SHOW' },
      }),
      this.countOverstaying(companyId, plantId),
    ]);

    return {
      totalExpected,
      checkedIn,
      checkedOut,
      onSiteNow,
      walkIns,
      noShows,
      overstaying,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Today's visitors (paginated)
  // ────────────────────────────────────────────────────────────────────

  async getTodayVisitors(companyId: string, filters: TodayVisitorFilters) {
    const tz = await this.getTimezone(companyId);
    const todayStart = DateTime.now().setZone(tz).startOf('day').toJSDate();
    const todayEnd = DateTime.now().setZone(tz).endOf('day').toJSDate();

    const { page, limit, plantId, gateId, status, search } = filters;
    const offset = (page - 1) * limit;

    const where: any = {
      companyId,
      expectedDate: { gte: todayStart, lte: todayEnd },
    };
    if (plantId) where.plantId = plantId;
    if (gateId) where.gateId = gateId;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { visitorName: { contains: search, mode: 'insensitive' } },
        { visitorCompany: { contains: search, mode: 'insensitive' } },
        { visitCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      platformPrisma.visit.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { expectedDate: 'asc' },
        include: { visitorType: true, checkInGate: true },
      }),
      platformPrisma.visit.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  // ────────────────────────────────────────────────────────────────────
  // On-site visitors (currently checked in)
  // ────────────────────────────────────────────────────────────────────

  async getOnSiteVisitors(companyId: string, plantId?: string) {
    const where: any = { companyId, status: 'CHECKED_IN' };
    if (plantId) where.plantId = plantId;

    return platformPrisma.visit.findMany({
      where,
      orderBy: { checkInTime: 'desc' },
      include: { visitorType: true, checkInGate: true },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Monthly KPI stats
  // ────────────────────────────────────────────────────────────────────

  async getMonthlyStats(companyId: string, plantId?: string) {
    const tz = await this.getTimezone(companyId);
    const now = DateTime.now().setZone(tz);
    const monthStart = now.startOf('month').toJSDate();
    const monthEnd = now.endOf('month').toJSDate();
    const daysElapsed = now.day;

    const where: any = {
      companyId,
      expectedDate: { gte: monthStart, lte: monthEnd },
    };
    if (plantId) where.plantId = plantId;

    const [
      totalVisitsThisMonth,
      preRegistered,
      walkIns,
      avgDurationResult,
      completedWithDuration,
      overstayedVisits,
      inductionRequired,
      inductionCompleted,
    ] = await Promise.all([
      platformPrisma.visit.count({ where }),
      platformPrisma.visit.count({
        where: { ...where, registrationMethod: 'PRE_REGISTERED' },
      }),
      platformPrisma.visit.count({
        where: { ...where, registrationMethod: 'WALK_IN' },
      }),
      platformPrisma.visit.aggregate({
        where: { ...where, visitDurationMinutes: { not: null } },
        _avg: { visitDurationMinutes: true },
      }),
      platformPrisma.visit.count({
        where: {
          ...where,
          status: { in: ['CHECKED_OUT', 'AUTO_CHECKED_OUT'] },
          visitDurationMinutes: { not: null },
          expectedDurationMinutes: { not: null },
        },
      }),
      platformPrisma.visit.count({
        where: {
          ...where,
          status: { in: ['CHECKED_OUT', 'AUTO_CHECKED_OUT'] },
          visitDurationMinutes: { not: null },
          expectedDurationMinutes: { not: null },
        },
      }),
      platformPrisma.visit.count({
        where: {
          ...where,
          safetyInductionStatus: { not: 'NOT_REQUIRED' },
        },
      }),
      platformPrisma.visit.count({
        where: {
          ...where,
          safetyInductionStatus: 'COMPLETED',
        },
      }),
    ]);

    // Calculate overstay rate from completed visits
    let overstayCount = 0;
    if (completedWithDuration > 0) {
      const overstayedVisitsList = await platformPrisma.visit.findMany({
        where: {
          ...where,
          status: { in: ['CHECKED_OUT', 'AUTO_CHECKED_OUT'] },
          visitDurationMinutes: { not: null },
          expectedDurationMinutes: { not: null },
        },
        select: { visitDurationMinutes: true, expectedDurationMinutes: true },
      });
      overstayCount = overstayedVisitsList.filter(
        (v) => v.visitDurationMinutes! > v.expectedDurationMinutes!,
      ).length;
    }

    const avgDailyVisitors = daysElapsed > 0 ? Math.round(totalVisitsThisMonth / daysElapsed) : 0;
    const avgVisitDurationMinutes = Math.round(avgDurationResult._avg.visitDurationMinutes ?? 0);
    const preRegisteredPercent =
      totalVisitsThisMonth > 0 ? Math.round((preRegistered / totalVisitsThisMonth) * 100) : 0;
    const walkInPercent =
      totalVisitsThisMonth > 0 ? Math.round((walkIns / totalVisitsThisMonth) * 100) : 0;
    const overstayRate =
      completedWithDuration > 0 ? Math.round((overstayCount / completedWithDuration) * 100) : 0;
    const safetyInductionCompletionRate =
      inductionRequired > 0 ? Math.round((inductionCompleted / inductionRequired) * 100) : 0;

    return {
      totalVisitsThisMonth,
      avgDailyVisitors,
      avgVisitDurationMinutes,
      preRegisteredPercent,
      walkInPercent,
      overstayRate,
      safetyInductionCompletionRate,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────────

  private async countOverstaying(companyId: string, plantId?: string): Promise<number> {
    const where: any = { companyId, status: 'CHECKED_IN', checkInTime: { not: null } };
    if (plantId) where.plantId = plantId;

    const visitors = await platformPrisma.visit.findMany({
      where,
      select: { checkInTime: true, expectedDurationMinutes: true },
    });

    const now = new Date();
    return visitors.filter((v) => {
      if (!v.checkInTime || !v.expectedDurationMinutes) return false;
      const end = new Date(v.checkInTime.getTime() + v.expectedDurationMinutes * 60000);
      return now > end;
    }).length;
  }

  private async getTimezone(companyId: string): Promise<string> {
    try {
      const settings = await getCachedCompanySettings(companyId);
      return settings.timezone || 'Asia/Kolkata';
    } catch {
      logger.warn(`Could not fetch timezone for company ${companyId}, using default`);
      return 'Asia/Kolkata';
    }
  }
}

export const dashboardService = new DashboardService();
