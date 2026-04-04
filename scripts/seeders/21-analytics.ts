import type { SeederModule } from './types';
import { log, vlog } from './types';
import { randomInt, randomDecimal, getPastMonths, getMonthDates } from './utils';

const MODULE = 'analytics';

export const seeder: SeederModule = {
  name: 'Analytics',
  order: 21,
  seed: async (ctx) => {
    const { prisma, companyId, months, employeeIds, departmentIds, locationIds, gradeIds } = ctx;

    // Check existing analytics
    const existingDaily = await prisma.employeeAnalyticsDaily.count({ where: { companyId } });
    if (existingDaily >= 30) {
      log(MODULE, `Skipping — ${existingDaily} analytics records already exist`);
      return;
    }

    const pastMonths = getPastMonths(months);
    const totalEmployees = employeeIds.length;

    let empDailyCreated = 0;
    let attDailyCreated = 0;
    let payrollMonthlyCreated = 0;
    let attritionMonthlyCreated = 0;

    // Build dept/location/grade breakdown templates
    const deptBreakdown = Object.fromEntries(
      departmentIds.map((id, i) => [id, Math.max(1, Math.floor(totalEmployees / departmentIds.length) + randomInt(-2, 2))]),
    );
    const locBreakdown = Object.fromEntries(
      locationIds.map((id, i) => [id, Math.max(1, Math.floor(totalEmployees / locationIds.length) + randomInt(-1, 1))]),
    );
    const gradeBreakdown = Object.fromEntries(
      gradeIds.map((id) => [id, Math.max(1, Math.floor(totalEmployees / gradeIds.length) + randomInt(-2, 2))]),
    );

    for (const { year, month } of pastMonths) {
      const dates = getMonthDates(year, month);

      // Sample 3 dates per month for daily analytics (first, mid, last)
      const sampleDates = [dates[0], dates[Math.floor(dates.length / 2)], dates[dates.length - 1]];

      for (const dateStr of sampleDates) {
        const date = new Date(dateStr);

        // ── Employee Analytics Daily ──
        const existing = await prisma.employeeAnalyticsDaily.findUnique({
          where: { companyId_date_version: { companyId, date, version: 1 } },
        });
        if (!existing) {
          const joiners = randomInt(0, 2);
          const leavers = randomInt(0, 1);
          const active = totalEmployees - randomInt(0, 3);
          const probation = randomInt(1, Math.max(1, Math.floor(totalEmployees * 0.15)));

          await prisma.employeeAnalyticsDaily.create({
            data: {
              companyId,
              date,
              version: 1,
              totalHeadcount: totalEmployees,
              activeCount: active,
              probationCount: probation,
              noticeCount: randomInt(0, 2),
              separatedCount: leavers,
              joinersCount: joiners,
              leaversCount: leavers,
              transfersCount: randomInt(0, 1),
              promotionsCount: randomInt(0, 1),
              byDepartment: deptBreakdown,
              byLocation: locBreakdown,
              byGrade: gradeBreakdown,
              byEmployeeType: { fullTime: Math.floor(totalEmployees * 0.8), contract: Math.floor(totalEmployees * 0.2) },
              byGender: { MALE: Math.floor(totalEmployees * 0.6), FEMALE: Math.floor(totalEmployees * 0.4) },
              byAgeBand: { '20-30': Math.floor(totalEmployees * 0.35), '30-40': Math.floor(totalEmployees * 0.4), '40-50': Math.floor(totalEmployees * 0.2), '50+': Math.floor(totalEmployees * 0.05) },
              byTenureBand: { '<1yr': Math.floor(totalEmployees * 0.3), '1-3yr': Math.floor(totalEmployees * 0.4), '3-5yr': Math.floor(totalEmployees * 0.2), '5yr+': Math.floor(totalEmployees * 0.1) },
              avgSpanOfControl: randomDecimal(3, 8, 1),
              vacancyRate: randomDecimal(2, 10, 1),
            },
          });
          empDailyCreated++;
        }

        // ── Attendance Analytics Daily ──
        const existingAtt = await prisma.attendanceAnalyticsDaily.findUnique({
          where: { companyId_date_version: { companyId, date, version: 1 } },
        });
        if (!existingAtt) {
          const present = Math.floor(totalEmployees * randomDecimal(0.8, 0.95));
          const onLeave = randomInt(1, Math.max(1, Math.floor(totalEmployees * 0.1)));
          const absent = Math.max(0, totalEmployees - present - onLeave - randomInt(0, 2));

          await prisma.attendanceAnalyticsDaily.create({
            data: {
              companyId,
              date,
              version: 1,
              totalEmployees,
              presentCount: present,
              absentCount: absent,
              lateCount: randomInt(0, Math.floor(totalEmployees * 0.1)),
              halfDayCount: randomInt(0, 3),
              onLeaveCount: onLeave,
              weekOffCount: 0,
              holidayCount: 0,
              avgWorkedHours: randomDecimal(7.5, 9, 1),
              totalOvertimeHours: randomDecimal(0, 15, 1),
              totalOvertimeCost: randomDecimal(0, 5000),
              productivityIndex: randomDecimal(0.85, 0.98, 2),
              avgLateMinutes: randomDecimal(5, 20, 1),
              lateThresholdBreaches: randomInt(0, 5),
              regularizationCount: randomInt(0, 3),
              missedPunchCount: randomInt(0, 4),
              byDepartment: deptBreakdown,
              byLocation: locBreakdown,
              byShift: { General: present, Night: 0 },
              bySource: { BIOMETRIC: Math.floor(present * 0.6), MOBILE_GPS: Math.floor(present * 0.3), MANUAL: Math.floor(present * 0.1) },
            },
          });
          attDailyCreated++;
        }
      }

      // ── Payroll Analytics Monthly ──
      const existingPayroll = await prisma.payrollAnalyticsMonthly.findUnique({
        where: { companyId_month_year_version: { companyId, month, year, version: 1 } },
      });
      if (!existingPayroll) {
        const avgCtc = 900000;
        const monthlyGross = (avgCtc / 12) * totalEmployees;
        const deductions = monthlyGross * 0.25;
        const netPay = monthlyGross - deductions;

        await prisma.payrollAnalyticsMonthly.create({
          data: {
            companyId,
            month,
            year,
            version: 1,
            employeeCount: totalEmployees,
            totalGrossEarnings: monthlyGross,
            totalDeductions: deductions,
            totalNetPay: netPay,
            totalEmployerCost: monthlyGross * 1.15,
            totalPFEmployee: monthlyGross * 0.12 * 0.4, // ~12% of basic, basic~40% of gross
            totalPFEmployer: monthlyGross * 0.12 * 0.4,
            totalESIEmployee: monthlyGross * 0.0075,
            totalESIEmployer: monthlyGross * 0.0325,
            totalPT: totalEmployees * 200,
            totalTDS: monthlyGross * 0.08,
            totalLWFEmployee: 0,
            totalLWFEmployer: 0,
            totalGratuityProvision: monthlyGross * 0.04,
            avgCTC: avgCtc,
            medianCTC: avgCtc * 0.85,
            exceptionCount: randomInt(0, 3),
            varianceFromLastMonth: randomDecimal(-5, 5),
            totalLoanOutstanding: randomDecimal(100000, 500000),
            activeLoanCount: randomInt(2, 8),
            totalSalaryHolds: randomInt(0, 2),
            totalBonusDisbursed: 0,
            totalIncentivesPaid: 0,
            byDepartment: deptBreakdown,
            byLocation: locBreakdown,
            byGrade: gradeBreakdown,
            byCTCBand: { '<5L': 0, '5-10L': Math.floor(totalEmployees * 0.3), '10-15L': Math.floor(totalEmployees * 0.35), '15-25L': Math.floor(totalEmployees * 0.25), '25L+': Math.floor(totalEmployees * 0.1) },
            byComponent: { BASIC: monthlyGross * 0.4, HRA: monthlyGross * 0.2, DA: monthlyGross * 0.04, SPAL: monthlyGross * 0.2 },
          },
        });
        payrollMonthlyCreated++;
      }

      // ── Attrition Metrics Monthly ──
      const existingAttrition = await prisma.attritionMetricsMonthly.findUnique({
        where: { companyId_month_year_version: { companyId, month, year, version: 1 } },
      });
      if (!existingAttrition) {
        const totalExits = randomInt(0, 2);
        const voluntaryExits = Math.min(totalExits, randomInt(0, totalExits));
        const involuntaryExits = totalExits - voluntaryExits;
        const attritionRate = totalEmployees > 0 ? (totalExits / totalEmployees) * 100 : 0;

        await prisma.attritionMetricsMonthly.create({
          data: {
            companyId,
            month,
            year,
            version: 1,
            attritionRate: parseFloat(attritionRate.toFixed(2)),
            voluntaryRate: totalEmployees > 0 ? parseFloat(((voluntaryExits / totalEmployees) * 100).toFixed(2)) : 0,
            involuntaryRate: totalEmployees > 0 ? parseFloat(((involuntaryExits / totalEmployees) * 100).toFixed(2)) : 0,
            earlyAttritionRate: randomDecimal(0, 2),
            totalExits,
            voluntaryExits,
            involuntaryExits,
            retirements: 0,
            earlyExits: randomInt(0, 1),
            avgTenureAtExit: randomDecimal(1, 4, 1),
            exitReasonBreakdown: { 'Better opportunity': 40, 'Personal reasons': 30, 'Relocation': 20, 'Other': 10 },
            wouldRecommendAvg: randomDecimal(3, 5, 1),
            flightRiskEmployees: [],
            pendingFnFCount: randomInt(0, 1),
            totalFnFAmount: randomDecimal(50000, 200000),
            avgFnFProcessingDays: randomDecimal(7, 21, 1),
            byDepartment: {},
            byGrade: {},
            byTenureBand: { '<1yr': randomInt(0, 1), '1-3yr': randomInt(0, 1), '3-5yr': 0, '5yr+': 0 },
            bySeparationType: { VOLUNTARY_RESIGNATION: voluntaryExits, TERMINATION_FOR_CAUSE: involuntaryExits },
          },
        });
        attritionMonthlyCreated++;
      }
    }

    log(
      MODULE,
      `Created ${empDailyCreated} employee daily, ${attDailyCreated} attendance daily, ${payrollMonthlyCreated} payroll monthly, ${attritionMonthlyCreated} attrition monthly`,
    );
  },
};
