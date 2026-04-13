import { platformPrisma } from '../../../config/database';
import { DateTime } from 'luxon';

class ReportsService {

  async getDailyLog(companyId: string, date: string, plantId?: string) {
    const settings = await platformPrisma.companySettings.findUnique({ where: { companyId }, select: { timezone: true } });
    const tz = settings?.timezone || 'Asia/Kolkata';
    const dayStart = DateTime.fromISO(date, { zone: tz }).startOf('day').toJSDate();
    const dayEnd = DateTime.fromISO(date, { zone: tz }).endOf('day').toJSDate();

    const where: any = {
      companyId,
      expectedDate: { gte: dayStart, lt: dayEnd },
    };
    if (plantId) where.plantId = plantId;

    return platformPrisma.visit.findMany({
      where,
      orderBy: { checkInTime: 'asc' },
      include: { visitorType: true, checkInGate: true, checkOutGate: true },
    });
  }

  async getSummary(companyId: string, fromDate: string, toDate: string, plantId?: string | undefined) {
    const settings = await platformPrisma.companySettings.findUnique({ where: { companyId }, select: { timezone: true } });
    const tz = settings?.timezone || 'Asia/Kolkata';
    const start = DateTime.fromISO(fromDate, { zone: tz }).startOf('day').toJSDate();
    const end = DateTime.fromISO(toDate, { zone: tz }).endOf('day').toJSDate();
    const where: any = {
      companyId,
      expectedDate: { gte: start, lte: end },
    };
    if (plantId) where.plantId = plantId;

    const [totalVisits, byType, byMethod, byStatus, avgDuration] = await Promise.all([
      platformPrisma.visit.count({ where }),
      platformPrisma.visit.groupBy({ by: ['visitorTypeId'], where, _count: true }),
      platformPrisma.visit.groupBy({ by: ['registrationMethod'], where, _count: true }),
      platformPrisma.visit.groupBy({ by: ['status'], where, _count: true }),
      platformPrisma.visit.aggregate({
        where: { ...where, visitDurationMinutes: { not: null } },
        _avg: { visitDurationMinutes: true },
      }),
    ]);

    return {
      totalVisits,
      byType,
      byMethod,
      byStatus,
      avgDurationMinutes: avgDuration._avg.visitDurationMinutes,
    };
  }

  async getOverstayReport(companyId: string, fromDate: string, toDate: string, plantId?: string | undefined) {
    const settings = await platformPrisma.companySettings.findUnique({ where: { companyId }, select: { timezone: true } });
    const tz = settings?.timezone || 'Asia/Kolkata';
    const start = DateTime.fromISO(fromDate, { zone: tz }).startOf('day').toJSDate();
    const end = DateTime.fromISO(toDate, { zone: tz }).endOf('day').toJSDate();
    const where: any = {
      companyId,
      expectedDate: { gte: start, lte: end },
      status: { in: ['CHECKED_OUT', 'AUTO_CHECKED_OUT'] },
      visitDurationMinutes: { not: null },
      expectedDurationMinutes: { not: null },
    };
    if (plantId) where.plantId = plantId;

    const visits = await platformPrisma.visit.findMany({
      where,
      include: { visitorType: true },
    });

    return visits.filter(v =>
      v.visitDurationMinutes! > v.expectedDurationMinutes!
    );
  }

  async getAnalytics(companyId: string, fromDate: string, toDate: string, plantId?: string) {
    const where: any = {
      companyId,
      expectedDate: { gte: new Date(fromDate), lte: new Date(toDate) },
    };
    if (plantId) where.plantId = plantId;

    const [totalVisits, avgDuration, preRegPct, overstayRate, inductionRate] = await Promise.all([
      platformPrisma.visit.count({ where }),
      platformPrisma.visit.aggregate({
        where: { ...where, visitDurationMinutes: { not: null } },
        _avg: { visitDurationMinutes: true },
      }),
      platformPrisma.visit.count({ where: { ...where, registrationMethod: 'PRE_REGISTERED' } }),
      this.calculateOverstayRate(companyId, where),
      this.calculateInductionRate(companyId, where),
    ]);

    return {
      totalVisits,
      avgDurationMinutes: avgDuration._avg.visitDurationMinutes,
      preRegisteredPercent: totalVisits > 0 ? Math.round((preRegPct / totalVisits) * 100) : 0,
      overstayRatePercent: overstayRate,
      safetyInductionCompletionPercent: inductionRate,
    };
  }

  private async calculateOverstayRate(companyId: string, where: any): Promise<number> {
    const completed = await platformPrisma.visit.findMany({
      where: {
        ...where,
        status: { in: ['CHECKED_OUT', 'AUTO_CHECKED_OUT'] },
        visitDurationMinutes: { not: null },
        expectedDurationMinutes: { not: null },
      },
      select: { visitDurationMinutes: true, expectedDurationMinutes: true },
    });
    if (completed.length === 0) return 0;
    const overstayed = completed.filter(v => v.visitDurationMinutes! > v.expectedDurationMinutes!);
    return Math.round((overstayed.length / completed.length) * 100);
  }

  private async calculateInductionRate(companyId: string, where: any): Promise<number> {
    const required = await platformPrisma.visit.count({
      where: { ...where, safetyInductionStatus: { not: 'NOT_REQUIRED' } },
    });
    if (required === 0) return 100;
    const completed = await platformPrisma.visit.count({
      where: { ...where, safetyInductionStatus: 'COMPLETED' },
    });
    return Math.round((completed / required) * 100);
  }
}

export const reportsService = new ReportsService();
