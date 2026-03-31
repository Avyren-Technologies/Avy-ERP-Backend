import { platformPrisma, createTenantPrisma } from '../../../../config/database';
import { logger } from '../../../../config/logger';
import cron from 'node-cron';
import { PrismaClient, Prisma } from '@prisma/client';

/** Cast an array/object to Prisma JSON input. */
function toJson<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

// ─── Helper Types ───

interface CompanyWithTimezone {
  id: string;
  timezone: string;
}

interface BreakdownEntry {
  label: string;
  count: number;
}

interface PayrollBreakdownEntry {
  label: string;
  gross: number;
  deductions: number;
  netPay: number;
  employeeCount: number;
}

// ─── Analytics Cron Service ───

class AnalyticsCronService {
  private jobs: cron.ScheduledTask[] = [];

  // ─── Lifecycle ───

  startAll(): void {
    logger.info('analytics_cron_starting', { message: 'Scheduling all analytics cron jobs' });

    // Employee analytics — daily at 1 AM
    this.jobs.push(
      cron.schedule('0 1 * * *', async () => {
        await this.runWithErrorHandling('computeEmployeeAnalyticsDaily', () =>
          this.computeEmployeeAnalyticsDaily(),
        );
      }),
    );

    // Attendance analytics — daily at 11 PM
    this.jobs.push(
      cron.schedule('0 23 * * *', async () => {
        await this.runWithErrorHandling('computeAttendanceAnalyticsDaily', () =>
          this.computeAttendanceAnalyticsDaily(),
        );
      }),
    );

    // Payroll analytics — monthly at 2 AM on 1st
    this.jobs.push(
      cron.schedule('0 2 1 * *', async () => {
        await this.runWithErrorHandling('computePayrollAnalyticsMonthly', () =>
          this.computePayrollAnalyticsMonthly(),
        );
      }),
    );

    // Attrition metrics — daily at 3 AM (monthly aggregation, daily refresh)
    this.jobs.push(
      cron.schedule('0 3 * * *', async () => {
        await this.runWithErrorHandling('computeAttritionMetricsMonthly', () =>
          this.computeAttritionMetricsMonthly(),
        );
      }),
    );

    // Purge old versions — monthly at 4 AM on 1st, retain 90 days
    this.jobs.push(
      cron.schedule('0 4 1 * *', async () => {
        await this.runWithErrorHandling('purgeOldVersions', () => this.purgeOldVersions(90));
      }),
    );

    logger.info('analytics_cron_started', { message: 'All 5 analytics cron jobs scheduled' });
  }

  stopAll(): void {
    for (const job of this.jobs) {
      job.stop();
    }
    this.jobs = [];
    logger.info('analytics_cron_stopped', { message: 'All analytics cron jobs stopped' });
  }

  // ─── Employee Analytics Daily ───

  async computeEmployeeAnalyticsDaily(targetDate?: Date): Promise<void> {
    const startTime = Date.now();
    let companiesProcessed = 0;
    let errors = 0;

    const companies = await this.getAllCompaniesWithTimezone();

    for (const company of companies) {
      let tenantDb: PrismaClient | null = null;
      try {
        const today = targetDate ?? this.getCompanyLocalDate(company.timezone);
        tenantDb = await this.getTenantDbForCompany(company.id);
        if (!tenantDb) continue;

        // Fetch all employees with relations
        const employees = await tenantDb.employee.findMany({
          where: { companyId: company.id },
          select: {
            id: true,
            status: true,
            gender: true,
            dateOfBirth: true,
            joiningDate: true,
            departmentId: true,
            locationId: true,
            gradeId: true,
            employeeTypeId: true,
            reportingManagerId: true,
            department: { select: { id: true, name: true } },
            location: { select: { id: true, name: true } },
            grade: { select: { id: true, name: true } },
            employeeType: { select: { id: true, name: true } },
          },
        });

        // Status counts
        const activeCount = employees.filter(
          (e) => e.status === 'ACTIVE' || e.status === 'CONFIRMED',
        ).length;
        const probationCount = employees.filter((e) => e.status === 'PROBATION').length;
        const noticeCount = employees.filter((e) => e.status === 'ON_NOTICE').length;
        const separatedCount = employees.filter((e) => e.status === 'EXITED').length;
        const totalHeadcount = employees.filter((e) => e.status !== 'EXITED').length;

        // Joiners today
        const todayStart = new Date(today);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(today);
        todayEnd.setHours(23, 59, 59, 999);

        const joinersCount = employees.filter((e) => {
          const jd = new Date(e.joiningDate);
          return jd >= todayStart && jd <= todayEnd;
        }).length;

        // Leavers today (exit requests where lastWorkingDate = today)
        const leaversCount = await tenantDb.exitRequest.count({
          where: {
            companyId: company.id,
            lastWorkingDate: {
              gte: todayStart,
              lte: todayEnd,
            },
          },
        });

        // Transfers today
        const transfersCount = await tenantDb.employeeTransfer.count({
          where: {
            companyId: company.id,
            effectiveDate: {
              gte: todayStart,
              lte: todayEnd,
            },
          },
        });

        // Promotions today
        const promotionsCount = await tenantDb.employeePromotion.count({
          where: {
            companyId: company.id,
            effectiveDate: {
              gte: todayStart,
              lte: todayEnd,
            },
          },
        });

        // ── Breakdowns ──
        const activeEmployees = employees.filter((e) => e.status !== 'EXITED');

        const byDepartment = this.groupAndCount(activeEmployees, (e) => e.department?.name ?? 'Unknown');
        const byLocation = this.groupAndCount(activeEmployees, (e) => e.location?.name ?? 'Unknown');
        const byGrade = this.groupAndCount(activeEmployees, (e) => e.grade?.name ?? 'Ungraded');
        const byEmployeeType = this.groupAndCount(activeEmployees, (e) => e.employeeType?.name ?? 'Unknown');
        const byGender = this.groupAndCount(activeEmployees, (e) => e.gender ?? 'Unknown');
        const byAgeBand = this.groupAndCount(activeEmployees, (e) =>
          this.getAgeBand(e.dateOfBirth, today),
        );
        const byTenureBand = this.groupAndCount(activeEmployees, (e) =>
          this.getTenureBand(e.joiningDate, today),
        );

        // Avg span of control
        const managersWithReportees = new Map<string, number>();
        for (const emp of activeEmployees) {
          if (emp.reportingManagerId) {
            managersWithReportees.set(
              emp.reportingManagerId,
              (managersWithReportees.get(emp.reportingManagerId) ?? 0) + 1,
            );
          }
        }
        const managerCounts = Array.from(managersWithReportees.values());
        const avgSpanOfControl =
          managerCounts.length > 0
            ? managerCounts.reduce((s, c) => s + c, 0) / managerCounts.length
            : null;

        // Get next version
        const dateOnly = new Date(today);
        dateOnly.setHours(0, 0, 0, 0);

        const latestVersion = await platformPrisma.employeeAnalyticsDaily.findFirst({
          where: { companyId: company.id, date: dateOnly },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const version = (latestVersion?.version ?? 0) + 1;

        await platformPrisma.employeeAnalyticsDaily.create({
          data: {
            companyId: company.id,
            date: dateOnly,
            version,
            totalHeadcount,
            activeCount,
            probationCount,
            noticeCount,
            separatedCount,
            joinersCount,
            leaversCount,
            transfersCount,
            promotionsCount,
            byDepartment: toJson(byDepartment),
            byLocation: toJson(byLocation),
            byGrade: toJson(byGrade),
            byEmployeeType: toJson(byEmployeeType),
            byGender: toJson(byGender),
            byAgeBand: toJson(byAgeBand),
            byTenureBand: toJson(byTenureBand),
            avgSpanOfControl,
          },
        });

        companiesProcessed++;
      } catch (error) {
        errors++;
        logger.error('analytics_cron_company_error', {
          table: 'EmployeeAnalyticsDaily',
          companyId: company.id,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (tenantDb) await tenantDb.$disconnect();
      }
    }

    logger.info('analytics_cron_completed', {
      table: 'EmployeeAnalyticsDaily',
      companiesProcessed,
      errors,
      durationMs: Date.now() - startTime,
    });
  }

  // ─── Attendance Analytics Daily ───

  async computeAttendanceAnalyticsDaily(targetDate?: Date): Promise<void> {
    const startTime = Date.now();
    let companiesProcessed = 0;
    let errors = 0;

    const companies = await this.getAllCompaniesWithTimezone();

    for (const company of companies) {
      let tenantDb: PrismaClient | null = null;
      try {
        const today = targetDate ?? this.getCompanyLocalDate(company.timezone);
        tenantDb = await this.getTenantDbForCompany(company.id);
        if (!tenantDb) continue;

        const dateOnly = new Date(today);
        dateOnly.setHours(0, 0, 0, 0);

        // Total active employees
        const totalEmployees = await tenantDb.employee.count({
          where: {
            companyId: company.id,
            status: { notIn: ['EXITED'] },
          },
        });

        // Attendance records for today
        const records = await tenantDb.attendanceRecord.findMany({
          where: {
            companyId: company.id,
            date: dateOnly,
          },
          select: {
            status: true,
            workedHours: true,
            overtimeHours: true,
            isLate: true,
            lateMinutes: true,
            isRegularized: true,
            source: true,
            employee: {
              select: {
                departmentId: true,
                locationId: true,
                department: { select: { id: true, name: true } },
                location: { select: { id: true, name: true } },
              },
            },
            shiftId: true,
            shift: { select: { id: true, name: true } },
          },
        });

        // Count by status
        const presentCount = records.filter(
          (r) => r.status === 'PRESENT' || r.status === 'REGULARIZED',
        ).length;
        const absentCount = records.filter((r) => r.status === 'ABSENT').length;
        const lateCount = records.filter((r) => r.status === 'LATE').length;
        const halfDayCount = records.filter((r) => r.status === 'HALF_DAY').length;
        const onLeaveCount = records.filter((r) => r.status === 'ON_LEAVE').length;
        const weekOffCount = records.filter((r) => r.status === 'WEEK_OFF').length;
        const holidayCount = records.filter((r) => r.status === 'HOLIDAY').length;

        // Hours computations
        const workedHoursArr = records
          .map((r) => (r.workedHours ? Number(r.workedHours) : 0))
          .filter((h) => h > 0);
        const avgWorkedHours =
          workedHoursArr.length > 0
            ? workedHoursArr.reduce((s, h) => s + h, 0) / workedHoursArr.length
            : 0;
        const totalOvertimeHours = records.reduce(
          (s, r) => s + (r.overtimeHours ? Number(r.overtimeHours) : 0),
          0,
        );

        // Productivity index: total worked hours / (totalEmployees * 8)
        const expectedHours = totalEmployees * 8;
        const totalWorkedHours = workedHoursArr.reduce((s, h) => s + h, 0);
        const productivityIndex = expectedHours > 0 ? totalWorkedHours / expectedHours : 0;

        // Late analysis
        const lateRecords = records.filter((r) => r.isLate && r.lateMinutes && r.lateMinutes > 0);
        const avgLateMinutes =
          lateRecords.length > 0
            ? lateRecords.reduce((s, r) => s + (r.lateMinutes ?? 0), 0) / lateRecords.length
            : 0;
        const lateThresholdBreaches = lateRecords.length;

        // Regularization and missed punch counts
        const regularizationCount = records.filter((r) => r.isRegularized).length;
        const missedPunchCount = records.filter(
          (r) => r.status === 'INCOMPLETE',
        ).length;

        // ── Breakdowns ──
        const byDepartment = this.groupAndCount(records, (r) => r.employee?.department?.name ?? 'Unknown');
        const byLocation = this.groupAndCount(records, (r) => r.employee?.location?.name ?? 'Unknown');
        const byShift = this.groupAndCount(records, (r) => r.shift?.name ?? 'General');
        const bySource = this.groupAndCount(records, (r) => r.source ?? 'MANUAL');

        // Get next version
        const latestVersion = await platformPrisma.attendanceAnalyticsDaily.findFirst({
          where: { companyId: company.id, date: dateOnly },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const version = (latestVersion?.version ?? 0) + 1;

        await platformPrisma.attendanceAnalyticsDaily.create({
          data: {
            companyId: company.id,
            date: dateOnly,
            version,
            totalEmployees,
            presentCount,
            absentCount,
            lateCount,
            halfDayCount,
            onLeaveCount,
            weekOffCount,
            holidayCount,
            avgWorkedHours: Math.round(avgWorkedHours * 100) / 100,
            totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
            productivityIndex: Math.round(productivityIndex * 10000) / 10000,
            avgLateMinutes: Math.round(avgLateMinutes * 100) / 100,
            lateThresholdBreaches,
            regularizationCount,
            missedPunchCount,
            byDepartment: toJson(byDepartment),
            byLocation: toJson(byLocation),
            byShift: toJson(byShift),
            bySource: toJson(bySource),
          },
        });

        companiesProcessed++;
      } catch (error) {
        errors++;
        logger.error('analytics_cron_company_error', {
          table: 'AttendanceAnalyticsDaily',
          companyId: company.id,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (tenantDb) await tenantDb.$disconnect();
      }
    }

    logger.info('analytics_cron_completed', {
      table: 'AttendanceAnalyticsDaily',
      companiesProcessed,
      errors,
      durationMs: Date.now() - startTime,
    });
  }

  // ─── Payroll Analytics Monthly ───

  async computePayrollAnalyticsMonthly(month?: number, year?: number): Promise<void> {
    const startTime = Date.now();
    let companiesProcessed = 0;
    let errors = 0;

    const now = new Date();
    const targetMonth = month ?? now.getMonth() + 1;
    const targetYear = year ?? now.getFullYear();

    const companies = await this.getAllCompaniesWithTimezone();

    for (const company of companies) {
      let tenantDb: PrismaClient | null = null;
      try {
        tenantDb = await this.getTenantDbForCompany(company.id);
        if (!tenantDb) continue;

        // Get payroll run for this month
        const payrollRun = await tenantDb.payrollRun.findUnique({
          where: {
            companyId_month_year: {
              companyId: company.id,
              month: targetMonth,
              year: targetYear,
            },
          },
          select: { id: true },
        });

        // Get payroll entries
        const entries = payrollRun
          ? await tenantDb.payrollEntry.findMany({
              where: { payrollRunId: payrollRun.id, companyId: company.id },
              select: {
                grossEarnings: true,
                totalDeductions: true,
                netPay: true,
                pfEmployee: true,
                pfEmployer: true,
                esiEmployee: true,
                esiEmployer: true,
                ptAmount: true,
                tdsAmount: true,
                lwfEmployee: true,
                lwfEmployer: true,
                isException: true,
                variancePercent: true,
                employee: {
                  select: {
                    departmentId: true,
                    locationId: true,
                    gradeId: true,
                    department: { select: { name: true } },
                    location: { select: { name: true } },
                    grade: { select: { name: true } },
                  },
                },
                earnings: true,
                deductions: true,
                employerContributions: true,
              },
            })
          : [];

        const employeeCount = entries.length;

        // Core payroll sums
        const totalGrossEarnings = this.sumDecimal(entries, 'grossEarnings');
        const totalDeductions = this.sumDecimal(entries, 'totalDeductions');
        const totalNetPay = this.sumDecimal(entries, 'netPay');

        // Statutory sums
        const totalPFEmployee = this.sumDecimal(entries, 'pfEmployee');
        const totalPFEmployer = this.sumDecimal(entries, 'pfEmployer');
        const totalESIEmployee = this.sumDecimal(entries, 'esiEmployee');
        const totalESIEmployer = this.sumDecimal(entries, 'esiEmployer');
        const totalPT = this.sumDecimal(entries, 'ptAmount');
        const totalTDS = this.sumDecimal(entries, 'tdsAmount');
        const totalLWFEmployee = this.sumDecimal(entries, 'lwfEmployee');
        const totalLWFEmployer = this.sumDecimal(entries, 'lwfEmployer');

        // Total employer cost = gross + employer PF + employer ESI + employer LWF
        const totalEmployerCost = totalGrossEarnings + totalPFEmployer + totalESIEmployer + totalLWFEmployer;

        // Gratuity provision (estimate: 4.81% of basic for eligible employees)
        const totalGratuityProvision = totalGrossEarnings * 0.0481;

        // CTC metrics from current salaries
        const currentSalaries = await tenantDb.employeeSalary.findMany({
          where: { companyId: company.id, isCurrent: true },
          select: { annualCtc: true },
          orderBy: { annualCtc: 'asc' },
        });

        const ctcValues = currentSalaries.map((s) => Number(s.annualCtc)).sort((a, b) => a - b);
        const avgCTC = ctcValues.length > 0 ? ctcValues.reduce((s, v) => s + v, 0) / ctcValues.length : 0;
        const medianCTC = ctcValues.length > 0 ? this.computeMedian(ctcValues) : 0;

        // Exception count
        const exceptionCount = entries.filter((e) => e.isException).length;

        // Variance from last month
        const prevMonthData = await platformPrisma.payrollAnalyticsMonthly.findFirst({
          where: {
            companyId: company.id,
            OR: [
              { month: targetMonth === 1 ? 12 : targetMonth - 1, year: targetMonth === 1 ? targetYear - 1 : targetYear },
            ],
          },
          orderBy: { version: 'desc' },
          select: { totalNetPay: true },
        });
        const varianceFromLastMonth = prevMonthData
          ? prevMonthData.totalNetPay > 0
            ? ((totalNetPay - prevMonthData.totalNetPay) / prevMonthData.totalNetPay) * 100
            : null
          : null;

        // Loan metrics
        const activeLoans = await tenantDb.loanRecord.findMany({
          where: { companyId: company.id, status: 'ACTIVE' },
          select: { outstanding: true },
        });
        const totalLoanOutstanding = activeLoans.reduce((s, l) => s + Number(l.outstanding), 0);
        const activeLoanCount = activeLoans.length;

        // Salary holds
        const totalSalaryHolds = payrollRun
          ? await tenantDb.salaryHold.count({
              where: { payrollRunId: payrollRun.id, companyId: company.id, releasedAt: null },
            })
          : 0;

        // Bonus and incentives — sum from earnings JSON fields that contain bonus/incentive components
        // For now, aggregate from payroll entry earnings JSON
        let totalBonusDisbursed = 0;
        let totalIncentivesPaid = 0;
        for (const entry of entries) {
          const earningsObj = entry.earnings as Record<string, number> | null;
          if (earningsObj) {
            for (const [key, value] of Object.entries(earningsObj)) {
              const lowerKey = key.toLowerCase();
              if (lowerKey.includes('bonus')) totalBonusDisbursed += Number(value) || 0;
              if (lowerKey.includes('incentive')) totalIncentivesPaid += Number(value) || 0;
            }
          }
        }

        // ── Breakdowns ──
        const byDepartment = this.groupPayroll(entries, (e) => e.employee?.department?.name ?? 'Unknown');
        const byLocation = this.groupPayroll(entries, (e) => e.employee?.location?.name ?? 'Unknown');
        const byGrade = this.groupPayroll(entries, (e) => e.employee?.grade?.name ?? 'Ungraded');

        // CTC Band breakdown
        const byCTCBand = this.groupAndCount(
          currentSalaries.map((s) => ({ annualCtc: Number(s.annualCtc) })),
          (s) => this.getCTCBand(s.annualCtc),
        );

        // Component breakdown — aggregate all earnings and deductions components
        const componentTotals = new Map<string, number>();
        for (const entry of entries) {
          const earningsObj = entry.earnings as Record<string, number> | null;
          const deductionsObj = entry.deductions as Record<string, number> | null;
          if (earningsObj) {
            for (const [key, value] of Object.entries(earningsObj)) {
              componentTotals.set(key, (componentTotals.get(key) ?? 0) + (Number(value) || 0));
            }
          }
          if (deductionsObj) {
            for (const [key, value] of Object.entries(deductionsObj)) {
              componentTotals.set(key, (componentTotals.get(key) ?? 0) + (Number(value) || 0));
            }
          }
        }
        const byComponent = Array.from(componentTotals.entries()).map(([label, amount]) => ({
          label,
          amount: Math.round(amount * 100) / 100,
        }));

        // Get next version
        const latestVersion = await platformPrisma.payrollAnalyticsMonthly.findFirst({
          where: { companyId: company.id, month: targetMonth, year: targetYear },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const version = (latestVersion?.version ?? 0) + 1;

        await platformPrisma.payrollAnalyticsMonthly.create({
          data: {
            companyId: company.id,
            month: targetMonth,
            year: targetYear,
            version,
            employeeCount,
            totalGrossEarnings: Math.round(totalGrossEarnings * 100) / 100,
            totalDeductions: Math.round(totalDeductions * 100) / 100,
            totalNetPay: Math.round(totalNetPay * 100) / 100,
            totalEmployerCost: Math.round(totalEmployerCost * 100) / 100,
            totalPFEmployee: Math.round(totalPFEmployee * 100) / 100,
            totalPFEmployer: Math.round(totalPFEmployer * 100) / 100,
            totalESIEmployee: Math.round(totalESIEmployee * 100) / 100,
            totalESIEmployer: Math.round(totalESIEmployer * 100) / 100,
            totalPT: Math.round(totalPT * 100) / 100,
            totalTDS: Math.round(totalTDS * 100) / 100,
            totalLWFEmployee: Math.round(totalLWFEmployee * 100) / 100,
            totalLWFEmployer: Math.round(totalLWFEmployer * 100) / 100,
            totalGratuityProvision: Math.round(totalGratuityProvision * 100) / 100,
            avgCTC: Math.round(avgCTC * 100) / 100,
            medianCTC: Math.round(medianCTC * 100) / 100,
            exceptionCount,
            ...(varianceFromLastMonth != null ? { varianceFromLastMonth: Math.round(varianceFromLastMonth * 100) / 100 } : {}),
            totalLoanOutstanding: Math.round(totalLoanOutstanding * 100) / 100,
            activeLoanCount,
            totalSalaryHolds,
            totalBonusDisbursed: Math.round(totalBonusDisbursed * 100) / 100,
            totalIncentivesPaid: Math.round(totalIncentivesPaid * 100) / 100,
            byDepartment: toJson(byDepartment),
            byLocation: toJson(byLocation),
            byGrade: toJson(byGrade),
            byCTCBand: toJson(byCTCBand),
            byComponent: toJson(byComponent),
          },
        });

        companiesProcessed++;
      } catch (error) {
        errors++;
        logger.error('analytics_cron_company_error', {
          table: 'PayrollAnalyticsMonthly',
          companyId: company.id,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (tenantDb) await tenantDb.$disconnect();
      }
    }

    logger.info('analytics_cron_completed', {
      table: 'PayrollAnalyticsMonthly',
      companiesProcessed,
      errors,
      durationMs: Date.now() - startTime,
    });
  }

  // ─── Attrition Metrics Monthly ───

  async computeAttritionMetricsMonthly(month?: number, year?: number): Promise<void> {
    const startTime = Date.now();
    let companiesProcessed = 0;
    let errors = 0;

    const now = new Date();
    const targetMonth = month ?? now.getMonth() + 1;
    const targetYear = year ?? now.getFullYear();

    const companies = await this.getAllCompaniesWithTimezone();

    for (const company of companies) {
      let tenantDb: PrismaClient | null = null;
      try {
        tenantDb = await this.getTenantDbForCompany(company.id);
        if (!tenantDb) continue;

        // Date range for this month
        const monthStart = new Date(targetYear, targetMonth - 1, 1);
        const monthEnd = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

        // Fetch exit requests for this month
        const exitRequests = await tenantDb.exitRequest.findMany({
          where: {
            companyId: company.id,
            lastWorkingDate: {
              gte: monthStart,
              lte: monthEnd,
            },
          },
          select: {
            id: true,
            separationType: true,
            lastWorkingDate: true,
            employee: {
              select: {
                joiningDate: true,
                departmentId: true,
                gradeId: true,
                department: { select: { name: true } },
                grade: { select: { name: true } },
              },
            },
            exitInterview: {
              select: {
                responses: true,
                wouldRecommend: true,
              },
            },
            fnfSettlement: {
              select: {
                status: true,
                totalAmount: true,
                createdAt: true,
                paidAt: true,
              },
            },
          },
        });

        const totalExits = exitRequests.length;

        // Voluntary vs involuntary classification
        const voluntaryTypes = ['VOLUNTARY_RESIGNATION'];
        const involuntaryTypes = ['TERMINATION_FOR_CAUSE', 'LAYOFF_RETRENCHMENT', 'ABSCONDING'];
        const retirementTypes = ['RETIREMENT'];

        const voluntaryExits = exitRequests.filter((e) => voluntaryTypes.includes(e.separationType)).length;
        const involuntaryExits = exitRequests.filter((e) => involuntaryTypes.includes(e.separationType)).length;
        const retirements = exitRequests.filter((e) => retirementTypes.includes(e.separationType)).length;

        // Early exits: tenure < 1 year at exit
        const earlyExits = exitRequests.filter((e) => {
          if (!e.lastWorkingDate || !e.employee?.joiningDate) return false;
          const tenureMs =
            new Date(e.lastWorkingDate).getTime() - new Date(e.employee.joiningDate).getTime();
          const tenureYears = tenureMs / (365.25 * 24 * 60 * 60 * 1000);
          return tenureYears < 1;
        }).length;

        // Average tenure at exit
        const tenuresAtExit = exitRequests
          .filter((e) => e.lastWorkingDate && e.employee?.joiningDate)
          .map((e) => {
            const tenureMs =
              new Date(e.lastWorkingDate!).getTime() - new Date(e.employee!.joiningDate).getTime();
            return tenureMs / (365.25 * 24 * 60 * 60 * 1000);
          });
        const avgTenureAtExit =
          tenuresAtExit.length > 0
            ? tenuresAtExit.reduce((s, t) => s + t, 0) / tenuresAtExit.length
            : 0;

        // Attrition rate: exits / avg headcount from EmployeeAnalyticsDaily
        const avgHeadcount = await this.getAvgHeadcountForMonth(company.id, targetMonth, targetYear);
        const attritionRate = avgHeadcount > 0 ? (totalExits / avgHeadcount) * 100 : 0;
        const voluntaryRate = avgHeadcount > 0 ? (voluntaryExits / avgHeadcount) * 100 : 0;
        const involuntaryRate = avgHeadcount > 0 ? (involuntaryExits / avgHeadcount) * 100 : 0;
        const earlyAttritionRate = totalExits > 0 ? (earlyExits / totalExits) * 100 : 0;

        // Exit reason breakdown from exit interview responses
        const exitReasonBreakdown = this.extractExitReasons(exitRequests);

        // Would recommend average
        const recommendValues = exitRequests
          .filter((e) => e.exitInterview?.wouldRecommend != null)
          .map((e) => (e.exitInterview!.wouldRecommend ? 1 : 0));
        const wouldRecommendAvg =
          recommendValues.length > 0
            ? recommendValues.reduce<number>((s, v) => s + v, 0) / recommendValues.length
            : null;

        // F&F metrics
        const fnfSettlements = exitRequests
          .filter((e) => e.fnfSettlement)
          .map((e) => e.fnfSettlement!);
        const pendingFnFCount = fnfSettlements.filter((f) => f.status !== 'PAID').length;
        const totalFnFAmount = fnfSettlements.reduce(
          (s, f) => s + (f.totalAmount ? Number(f.totalAmount) : 0),
          0,
        );
        const fnfProcessingDays = fnfSettlements
          .filter((f) => f.paidAt && f.createdAt)
          .map((f) => {
            const diffMs = new Date(f.paidAt!).getTime() - new Date(f.createdAt).getTime();
            return diffMs / (24 * 60 * 60 * 1000);
          });
        const avgFnFProcessingDays =
          fnfProcessingDays.length > 0
            ? fnfProcessingDays.reduce((s, d) => s + d, 0) / fnfProcessingDays.length
            : 0;

        // Flight risk — placeholder for scoring engine (Task 5)
        const flightRiskEmployees: unknown[] = [];

        // ── Breakdowns ──
        const byDepartment = this.groupAndCount(
          exitRequests,
          (e) => e.employee?.department?.name ?? 'Unknown',
        );
        const byGrade = this.groupAndCount(
          exitRequests,
          (e) => e.employee?.grade?.name ?? 'Ungraded',
        );
        const byTenureBand = this.groupAndCount(exitRequests, (e) => {
          if (!e.lastWorkingDate || !e.employee?.joiningDate) return 'Unknown';
          const tenureMs =
            new Date(e.lastWorkingDate).getTime() - new Date(e.employee.joiningDate).getTime();
          const tenureYears = tenureMs / (365.25 * 24 * 60 * 60 * 1000);
          return this.getTenureBandFromYears(tenureYears);
        });
        const bySeparationType = this.groupAndCount(exitRequests, (e) => e.separationType);

        // Get next version
        const latestVersion = await platformPrisma.attritionMetricsMonthly.findFirst({
          where: { companyId: company.id, month: targetMonth, year: targetYear },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const version = (latestVersion?.version ?? 0) + 1;

        await platformPrisma.attritionMetricsMonthly.create({
          data: {
            companyId: company.id,
            month: targetMonth,
            year: targetYear,
            version,
            attritionRate: Math.round(attritionRate * 100) / 100,
            voluntaryRate: Math.round(voluntaryRate * 100) / 100,
            involuntaryRate: Math.round(involuntaryRate * 100) / 100,
            earlyAttritionRate: Math.round(earlyAttritionRate * 100) / 100,
            totalExits,
            voluntaryExits,
            involuntaryExits,
            retirements,
            earlyExits,
            avgTenureAtExit: Math.round(avgTenureAtExit * 100) / 100,
            exitReasonBreakdown: toJson(exitReasonBreakdown),
            ...(wouldRecommendAvg != null ? { wouldRecommendAvg: Math.round(wouldRecommendAvg * 100) / 100 } : {}),
            flightRiskEmployees: toJson(flightRiskEmployees),
            pendingFnFCount,
            totalFnFAmount: Math.round(totalFnFAmount * 100) / 100,
            avgFnFProcessingDays: Math.round(avgFnFProcessingDays * 100) / 100,
            byDepartment: toJson(byDepartment),
            byGrade: toJson(byGrade),
            byTenureBand: toJson(byTenureBand),
            bySeparationType: toJson(bySeparationType),
          },
        });

        companiesProcessed++;
      } catch (error) {
        errors++;
        logger.error('analytics_cron_company_error', {
          table: 'AttritionMetricsMonthly',
          companyId: company.id,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (tenantDb) await tenantDb.$disconnect();
      }
    }

    logger.info('analytics_cron_completed', {
      table: 'AttritionMetricsMonthly',
      companiesProcessed,
      errors,
      durationMs: Date.now() - startTime,
    });
  }

  // ─── Purge Old Versions ───

  async purgeOldVersions(retentionDays: number): Promise<void> {
    const startTime = Date.now();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    try {
      const [empDeleted, attDeleted, payDeleted, attritDeleted] = await Promise.all([
        platformPrisma.employeeAnalyticsDaily.deleteMany({
          where: { computedAt: { lt: cutoffDate } },
        }),
        platformPrisma.attendanceAnalyticsDaily.deleteMany({
          where: { computedAt: { lt: cutoffDate } },
        }),
        platformPrisma.payrollAnalyticsMonthly.deleteMany({
          where: { computedAt: { lt: cutoffDate } },
        }),
        platformPrisma.attritionMetricsMonthly.deleteMany({
          where: { computedAt: { lt: cutoffDate } },
        }),
      ]);

      logger.info('analytics_cron_purge_completed', {
        retentionDays,
        cutoffDate: cutoffDate.toISOString(),
        deletedCounts: {
          employeeAnalytics: empDeleted.count,
          attendanceAnalytics: attDeleted.count,
          payrollAnalytics: payDeleted.count,
          attritionMetrics: attritDeleted.count,
        },
        durationMs: Date.now() - startTime,
      });
    } catch (error) {
      logger.error('analytics_cron_purge_error', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ─── Recompute for Single Company ───

  async recomputeForCompany(companyId: string, date: Date): Promise<void> {
    const month = date.getMonth() + 1;
    const year = date.getFullYear();

    logger.info('analytics_cron_recompute_start', { companyId, date: date.toISOString() });

    // Override getAllCompaniesWithTimezone for single company
    const company = await platformPrisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });

    if (!company) {
      logger.warn('analytics_cron_recompute_skip', { companyId, reason: 'Company not found' });
      return;
    }

    const settings = await platformPrisma.companySettings.findUnique({
      where: { companyId },
      select: { timezone: true },
    });

    const companyWithTz: CompanyWithTimezone = {
      id: companyId,
      timezone: settings?.timezone ?? 'Asia/Kolkata',
    };

    // Store original method and temporarily override
    const origMethod = this.getAllCompaniesWithTimezone.bind(this);
    this.getAllCompaniesWithTimezone = async () => [companyWithTz];

    try {
      await Promise.all([
        this.computeEmployeeAnalyticsDaily(date),
        this.computeAttendanceAnalyticsDaily(date),
        this.computePayrollAnalyticsMonthly(month, year),
        this.computeAttritionMetricsMonthly(month, year),
      ]);
    } finally {
      this.getAllCompaniesWithTimezone = origMethod;
    }

    logger.info('analytics_cron_recompute_completed', { companyId, date: date.toISOString() });
  }

  // ─── Private Helpers ───

  private async getAllCompaniesWithTimezone(): Promise<CompanyWithTimezone[]> {
    const companies = await platformPrisma.company.findMany({
      select: { id: true },
    });

    const result: CompanyWithTimezone[] = [];
    for (const company of companies) {
      const settings = await platformPrisma.companySettings.findUnique({
        where: { companyId: company.id },
        select: { timezone: true },
      });
      result.push({
        id: company.id,
        timezone: settings?.timezone ?? 'Asia/Kolkata',
      });
    }

    return result;
  }

  private async getTenantDbForCompany(companyId: string): Promise<PrismaClient | null> {
    const tenant = await platformPrisma.tenant.findUnique({
      where: { companyId },
      select: { schemaName: true },
    });

    if (!tenant) {
      logger.warn('analytics_cron_no_tenant', { companyId });
      return null;
    }

    return createTenantPrisma(tenant.schemaName);
  }

  private getCompanyLocalDate(timezone: string): Date {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(now);
    const year = Number(parts.find((p) => p.type === 'year')?.value);
    const month = Number(parts.find((p) => p.type === 'month')?.value) - 1;
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    return new Date(year, month, day);
  }

  private groupAndCount<T>(items: T[], keyFn: (item: T) => string): BreakdownEntry[] {
    const map = new Map<string, number>();
    for (const item of items) {
      const key = keyFn(item);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }

  private groupPayroll<T extends { grossEarnings: Prisma.Decimal | null; totalDeductions: Prisma.Decimal | null; netPay: Prisma.Decimal | null }>(
    items: T[],
    keyFn: (item: T) => string,
  ): PayrollBreakdownEntry[] {
    const map = new Map<string, { gross: number; deductions: number; netPay: number; count: number }>();
    for (const item of items) {
      const key = keyFn(item);
      const existing = map.get(key) ?? { gross: 0, deductions: 0, netPay: 0, count: 0 };
      existing.gross += Number(item.grossEarnings ?? 0);
      existing.deductions += Number(item.totalDeductions ?? 0);
      existing.netPay += Number(item.netPay ?? 0);
      existing.count += 1;
      map.set(key, existing);
    }
    return Array.from(map.entries()).map(([label, data]) => ({
      label,
      gross: Math.round(data.gross * 100) / 100,
      deductions: Math.round(data.deductions * 100) / 100,
      netPay: Math.round(data.netPay * 100) / 100,
      employeeCount: data.count,
    }));
  }

  private sumDecimal<T>(items: T[], field: keyof T): number {
    return items.reduce((sum, item) => {
      const val = item[field];
      return sum + (val != null ? Number(val) : 0);
    }, 0);
  }

  private computeMedian(sortedValues: number[]): number {
    const n = sortedValues.length;
    if (n === 0) return 0;
    const mid = Math.floor(n / 2);
    if (n % 2 === 0) {
      return ((sortedValues[mid - 1] ?? 0) + (sortedValues[mid] ?? 0)) / 2;
    }
    return sortedValues[mid] ?? 0;
  }

  private getAgeBand(dateOfBirth: Date, referenceDate: Date): string {
    const age = Math.floor(
      (referenceDate.getTime() - new Date(dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000),
    );
    if (age < 25) return '<25';
    if (age < 30) return '25-29';
    if (age < 35) return '30-34';
    if (age < 40) return '35-39';
    if (age < 45) return '40-44';
    if (age < 50) return '45-49';
    if (age < 55) return '50-54';
    return '55+';
  }

  private getTenureBand(joiningDate: Date, referenceDate: Date): string {
    const tenureYears =
      (referenceDate.getTime() - new Date(joiningDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    return this.getTenureBandFromYears(tenureYears);
  }

  private getTenureBandFromYears(tenureYears: number): string {
    if (tenureYears < 0.5) return '<6 months';
    if (tenureYears < 1) return '6-12 months';
    if (tenureYears < 2) return '1-2 years';
    if (tenureYears < 3) return '2-3 years';
    if (tenureYears < 5) return '3-5 years';
    if (tenureYears < 10) return '5-10 years';
    return '10+ years';
  }

  private getCTCBand(annualCtc: number): string {
    const lakhs = annualCtc / 100000;
    if (lakhs < 3) return '<3L';
    if (lakhs < 5) return '3-5L';
    if (lakhs < 8) return '5-8L';
    if (lakhs < 12) return '8-12L';
    if (lakhs < 20) return '12-20L';
    if (lakhs < 30) return '20-30L';
    if (lakhs < 50) return '30-50L';
    return '50L+';
  }

  private async getAvgHeadcountForMonth(
    companyId: string,
    month: number,
    year: number,
  ): Promise<number> {
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);

    const dailyRecords = await platformPrisma.employeeAnalyticsDaily.findMany({
      where: {
        companyId,
        date: { gte: monthStart, lte: monthEnd },
      },
      orderBy: [{ date: 'asc' }, { version: 'desc' }],
      select: { date: true, totalHeadcount: true, version: true },
    });

    // Take the latest version for each date
    const byDate = new Map<string, number>();
    for (const record of dailyRecords) {
      const dateKey = record.date.toISOString().split('T')[0] ?? '';
      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, record.totalHeadcount);
      }
    }

    const headcounts = Array.from(byDate.values());
    if (headcounts.length === 0) return 0;
    return headcounts.reduce((s, h) => s + h, 0) / headcounts.length;
  }

  private extractExitReasons(
    exitRequests: Array<{
      exitInterview?: { responses: unknown } | null;
    }>,
  ): BreakdownEntry[] {
    const reasonMap = new Map<string, number>();

    for (const exit of exitRequests) {
      if (!exit.exitInterview?.responses) continue;

      const responses = exit.exitInterview.responses as Array<{
        question?: string;
        answer?: string;
      }>;

      if (!Array.isArray(responses)) continue;

      // Look for "reason for leaving" type questions
      for (const response of responses) {
        const question = (response.question ?? '').toLowerCase();
        if (
          question.includes('reason') ||
          question.includes('why') ||
          question.includes('leaving')
        ) {
          const answer = response.answer ?? 'Not specified';
          reasonMap.set(answer, (reasonMap.get(answer) ?? 0) + 1);
        }
      }
    }

    return Array.from(reasonMap.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }

  private async runWithErrorHandling(jobName: string, fn: () => Promise<void>): Promise<void> {
    try {
      logger.info('analytics_cron_job_start', { jobName });
      await fn();
    } catch (error) {
      logger.error('analytics_cron_job_failed', {
        jobName,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }
}

export const analyticsCronService = new AnalyticsCronService();
