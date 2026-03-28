import { Prisma } from '@prisma/client';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { essService } from '../ess/ess.service';

/** Convert undefined to null for Prisma nullable fields. */
function n<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

/** Round to 2 decimal places. */
function round(v: number): number {
  return Math.round(v * 100) / 100;
}

interface ListOptions {
  page?: number;
  limit?: number;
  search?: string;
}

interface RunListOptions extends ListOptions {
  year?: number;
  month?: number;
  status?: string;
}

interface EntryListOptions extends ListOptions {
  exceptionsOnly?: boolean;
}

interface PayslipListOptions extends ListOptions {
  employeeId?: string;
  month?: number;
  year?: number;
}

interface HoldListOptions extends ListOptions {
  payrollRunId?: string;
}

interface RevisionListOptions extends ListOptions {
  employeeId?: string;
  status?: string;
}

interface ArrearListOptions extends ListOptions {
  employeeId?: string;
  payrollRunId?: string;
}

interface FilingListOptions extends ListOptions {
  year?: number;
  type?: string;
  status?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Helper: get the number of working days in a month for a company
// ────────────────────────────────────────────────────────────────────────────
async function getWorkingDaysInMonth(companyId: string, month: number, year: number): Promise<number> {
  // Get company's fiscal config for working days
  const company = await platformPrisma.company.findUnique({
    where: { id: companyId },
    select: { fiscalConfig: true, weeklyOffs: true },
  });

  const weeklyOffs: string[] = (company?.weeklyOffs as string[]) ?? ['Sunday'];
  const dayMap: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6,
  };
  const offDays = new Set(weeklyOffs.map((d) => dayMap[d] ?? -1));

  // Count non-weekend days
  const daysInMonth = new Date(year, month, 0).getDate();
  let workingDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (!offDays.has(dow)) workingDays++;
  }

  // Subtract holidays
  const holidays = await platformPrisma.holidayCalendar.count({
    where: {
      companyId,
      year,
      date: {
        gte: new Date(year, month - 1, 1),
        lt: new Date(year, month, 1),
      },
      isOptional: false,
    },
  });

  return Math.max(workingDays - holidays, 1); // at least 1
}

// ────────────────────────────────────────────────────────────────────────────
// Helper: get fiscal year start month (default April for India)
// ────────────────────────────────────────────────────────────────────────────
function getFiscalYearRange(month: number, year: number): { startMonth: number; startYear: number } {
  // Indian fiscal year: April to March
  if (month >= 4) {
    return { startMonth: 4, startYear: year };
  }
  return { startMonth: 4, startYear: year - 1 };
}

function getFiscalYearLabel(month: number, year: number): string {
  const { startYear } = getFiscalYearRange(month, year);
  return `${startYear}-${String(startYear + 1).slice(2)}`;
}

// ────────────────────────────────────────────────────────────────────────────
// PayrollRunService
// ────────────────────────────────────────────────────────────────────────────

export class PayrollRunService {
  // ══════════════════════════════════════════════════════════════════════════
  // Payroll Run CRUD
  // ══════════════════════════════════════════════════════════════════════════

  async listRuns(companyId: string, options: RunListOptions = {}) {
    const { page = 1, limit = 25, year, month, status } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (year) where.year = year;
    if (month) where.month = month;
    if (status) where.status = status.toUpperCase();

    const [runs, total] = await Promise.all([
      platformPrisma.payrollRun.findMany({
        where,
        include: {
          _count: { select: { entries: true } },
        },
        skip: offset,
        take: limit,
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      }),
      platformPrisma.payrollRun.count({ where }),
    ]);

    return { runs, total, page, limit };
  }

  async getRun(companyId: string, id: string) {
    const run = await platformPrisma.payrollRun.findUnique({
      where: { id },
      include: {
        _count: { select: { entries: true, payslips: true, holds: true } },
      },
    });
    if (!run || run.companyId !== companyId) {
      throw ApiError.notFound('Payroll run not found');
    }

    // Count exception entries
    const exceptionsCount = await platformPrisma.payrollEntry.count({
      where: { payrollRunId: id, isException: true },
    });

    return { ...run, exceptionsCount };
  }

  async createRun(companyId: string, month: number, year: number) {
    // Validate no existing run for this month/year
    const existing = await platformPrisma.payrollRun.findUnique({
      where: { companyId_month_year: { companyId, month, year } },
    });
    if (existing) {
      throw ApiError.conflict(`Payroll run for ${month}/${year} already exists (status: ${existing.status})`);
    }

    return platformPrisma.payrollRun.create({
      data: {
        companyId,
        month,
        year,
        status: 'DRAFT',
      },
    });
  }

  // M9: Delete run (DRAFT only)
  async deleteRun(companyId: string, runId: string) {
    const run = await platformPrisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run || run.companyId !== companyId) {
      throw ApiError.notFound('Payroll run not found');
    }
    if (run.status !== 'DRAFT') {
      throw ApiError.badRequest('Only DRAFT payroll runs can be deleted');
    }

    // Delete entries first, then the run
    await platformPrisma.$transaction([
      platformPrisma.payrollEntry.deleteMany({ where: { payrollRunId: runId } }),
      platformPrisma.payrollRun.delete({ where: { id: runId } }),
    ]);

    return { message: `Payroll run ${runId} for ${run.month}/${run.year} deleted successfully` };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 6-Step Wizard
  // ══════════════════════════════════════════════════════════════════════════

  // Step 1 — Lock Attendance
  async lockAttendance(companyId: string, runId: string, userId: string) {
    const run = await this.getRunAndValidateStatus(companyId, runId, 'DRAFT');

    // Count unresolved attendance issues for the month
    const monthStart = new Date(run.year, run.month - 1, 1);
    const monthEnd = new Date(run.year, run.month, 1);

    const unresolvedOverrides = await platformPrisma.attendanceOverride.count({
      where: {
        companyId,
        status: 'PENDING',
        attendanceRecord: {
          date: { gte: monthStart, lt: monthEnd },
        },
      },
    });

    // Missing punch records (no punchOut)
    const missingPunches = await platformPrisma.attendanceRecord.count({
      where: {
        companyId,
        date: { gte: monthStart, lt: monthEnd },
        status: 'PRESENT',
        punchOut: null,
      },
    });

    // LOP records
    const lopRecords = await platformPrisma.attendanceRecord.count({
      where: {
        companyId,
        date: { gte: monthStart, lt: monthEnd },
        status: 'LOP',
      },
    });

    const exceptionsCount = unresolvedOverrides + missingPunches;

    await platformPrisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'ATTENDANCE_LOCKED',
        lockedBy: userId,
        lockedAt: new Date(),
        exceptionsCount,
      },
    });

    return {
      status: 'ATTENDANCE_LOCKED',
      unresolvedOverrides,
      missingPunches,
      lopRecords,
      exceptionsCount,
    };
  }

  // Step 2 — Review Exceptions
  async reviewExceptions(companyId: string, runId: string) {
    const run = await this.getRunAndValidateStatus(companyId, runId, 'ATTENDANCE_LOCKED');

    const monthStart = new Date(run.year, run.month - 1, 1);
    const monthEnd = new Date(run.year, run.month, 1);

    const exceptions: any[] = [];

    // Detect new hires who joined this month
    const newHires = await platformPrisma.employee.findMany({
      where: {
        companyId,
        status: { in: ['ACTIVE', 'PROBATION', 'CONFIRMED'] },
        joiningDate: { gte: monthStart, lt: monthEnd },
      },
      select: { id: true, employeeId: true, firstName: true, lastName: true, joiningDate: true },
    });
    for (const emp of newHires) {
      exceptions.push({
        employeeId: emp.id,
        type: 'NEW_HIRE',
        description: `${emp.firstName} ${emp.lastName} (${emp.employeeId}) joined on ${emp.joiningDate.toISOString().slice(0, 10)}. Pro-rated salary may apply.`,
        resolved: false,
      });
    }

    // Detect employees with salary holds
    const holds = await platformPrisma.salaryHold.findMany({
      where: {
        companyId,
        payrollRunId: runId,
        releasedAt: null,
      },
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
      },
    });
    for (const hold of holds) {
      exceptions.push({
        employeeId: hold.employeeId,
        type: 'SALARY_HOLD',
        description: `${hold.employee.firstName} ${hold.employee.lastName} has ${hold.holdType} salary hold: ${hold.reason}`,
        resolved: false,
      });
    }

    // Detect employees without salary records
    const activeEmployees = await platformPrisma.employee.findMany({
      where: {
        companyId,
        status: { in: ['ACTIVE', 'PROBATION', 'CONFIRMED'] },
      },
      select: { id: true, employeeId: true, firstName: true, lastName: true },
    });
    const salaryEmployeeIds = new Set(
      (
        await platformPrisma.employeeSalary.findMany({
          where: { companyId, isCurrent: true },
          select: { employeeId: true },
        })
      ).map((s) => s.employeeId)
    );
    for (const emp of activeEmployees) {
      if (!salaryEmployeeIds.has(emp.id)) {
        exceptions.push({
          employeeId: emp.id,
          type: 'NO_SALARY_RECORD',
          description: `${emp.firstName} ${emp.lastName} (${emp.employeeId}) has no current salary record.`,
          resolved: false,
        });
      }
    }

    // Detect employees on notice/exited during the month
    const exitingEmployees = await platformPrisma.employee.findMany({
      where: {
        companyId,
        status: { in: ['ON_NOTICE', 'EXITED'] },
        lastWorkingDate: { gte: monthStart, lt: monthEnd },
      },
      select: { id: true, employeeId: true, firstName: true, lastName: true, lastWorkingDate: true },
    });
    for (const emp of exitingEmployees) {
      exceptions.push({
        employeeId: emp.id,
        type: 'EXIT_IN_MONTH',
        description: `${emp.firstName} ${emp.lastName} (${emp.employeeId}) last working date: ${emp.lastWorkingDate?.toISOString().slice(0, 10)}. Full & final may apply.`,
        resolved: false,
      });
    }

    await platformPrisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'EXCEPTIONS_REVIEWED',
        exceptions: exceptions as any,
        exceptionsCount: exceptions.length,
      },
    });

    return { status: 'EXCEPTIONS_REVIEWED', exceptions, exceptionsCount: exceptions.length };
  }

  // Step 3 — Compute Salaries
  async computeSalaries(companyId: string, runId: string) {
    const run = await this.getRunAndValidateStatus(companyId, runId, 'EXCEPTIONS_REVIEWED');

    const totalWorkingDays = await getWorkingDaysInMonth(companyId, run.month, run.year);
    const monthStart = new Date(run.year, run.month - 1, 1);
    const monthEnd = new Date(run.year, run.month, 1);

    // Get all active employees with current salary
    const employees = await platformPrisma.employee.findMany({
      where: {
        companyId,
        status: { in: ['ACTIVE', 'PROBATION', 'CONFIRMED', 'ON_NOTICE'] },
      },
      include: {
        salaryRecords: {
          where: { isCurrent: true },
          take: 1,
        },
        employeeType: {
          select: { pfApplicable: true, esiApplicable: true, ptApplicable: true },
        },
        loans: {
          where: { status: 'ACTIVE' },
          select: { id: true, emiAmount: true },
        },
      },
    });

    // Get salary holds for this run
    const holds = await platformPrisma.salaryHold.findMany({
      where: { payrollRunId: runId, releasedAt: null, companyId },
    });
    const holdMap = new Map<string, typeof holds[0]>();
    for (const h of holds) holdMap.set(h.employeeId, h);

    // Get previous month's entries for variance
    let prevMonth = run.month - 1;
    let prevYear = run.year;
    if (prevMonth < 1) { prevMonth = 12; prevYear--; }
    const prevRun = await platformPrisma.payrollRun.findUnique({
      where: { companyId_month_year: { companyId, month: prevMonth, year: prevYear } },
      select: { id: true },
    });
    const prevEntries = new Map<string, number>();
    if (prevRun) {
      const entries = await platformPrisma.payrollEntry.findMany({
        where: { payrollRunId: prevRun.id },
        select: { employeeId: true, netPay: true },
      });
      for (const e of entries) prevEntries.set(e.employeeId, Number(e.netPay));
    }

    // Get overtime rule
    const otRule = await platformPrisma.overtimeRule.findUnique({ where: { companyId } });

    // L1: Fetch attendance rules ONCE for fullDayThresholdHours
    const attendanceRules = await platformPrisma.attendanceRule.findUnique({ where: { companyId } });
    const workHoursPerDay = attendanceRules?.fullDayThresholdHours
      ? Number(attendanceRules.fullDayThresholdHours)
      : 8;

    // C4: Fetch salary components with pfInclusion ONCE before the loop
    const pfInclusionComponents = await platformPrisma.salaryComponent.findMany({
      where: { companyId, pfInclusion: true, isActive: true },
      select: { code: true },
    });
    const pfInclusionCodes = new Set(pfInclusionComponents.map((c) => c.code));

    // M5: Batch-fetch ALL attendance records for the company/month
    const allAttendance = await platformPrisma.attendanceRecord.findMany({
      where: { companyId, date: { gte: monthStart, lt: monthEnd } },
      select: { employeeId: true, date: true, status: true, overtimeHours: true },
    });
    const attendanceByEmployee = new Map<string, typeof allAttendance>();
    for (const rec of allAttendance) {
      if (!attendanceByEmployee.has(rec.employeeId)) attendanceByEmployee.set(rec.employeeId, []);
      attendanceByEmployee.get(rec.employeeId)!.push(rec);
    }

    // C1: Batch-fetch ALL approved leave requests for the month
    const allLeaveRequests = await platformPrisma.leaveRequest.findMany({
      where: {
        companyId,
        status: { in: ['APPROVED', 'AUTO_APPROVED'] },
        fromDate: { lt: monthEnd },
        toDate: { gte: monthStart },
      },
      select: { employeeId: true, fromDate: true, toDate: true, isHalfDay: true, days: true },
    });
    const leaveByEmployee = new Map<string, typeof allLeaveRequests>();
    for (const lr of allLeaveRequests) {
      if (!leaveByEmployee.has(lr.employeeId)) leaveByEmployee.set(lr.employeeId, []);
      leaveByEmployee.get(lr.employeeId)!.push(lr);
    }

    // ORA-2: Fetch company fiscal config for LOP divisor and rounding rule
    const company = await platformPrisma.company.findUnique({
      where: { id: companyId },
      select: { fiscalConfig: true },
    });
    const fiscalConfig = company?.fiscalConfig as any;
    const lopDivisor = fiscalConfig?.lopDivisorMethod ?? 'ACTUAL_WORKING_DAYS';
    // ORA-3: Salary rounding rule
    const salaryRoundingRule = fiscalConfig?.salaryRoundingRule ?? 'NEAREST_RUPEE';

    // YEL-8: Fetch approved unpaid expense claims for reimbursement merge
    const approvedClaims = await platformPrisma.expenseClaim.findMany({
      where: { companyId, status: 'APPROVED', paidAt: null },
    });
    const claimsByEmployee = new Map<string, typeof approvedClaims>();
    for (const claim of approvedClaims) {
      if (!claimsByEmployee.has(claim.employeeId)) claimsByEmployee.set(claim.employeeId, []);
      claimsByEmployee.get(claim.employeeId)!.push(claim);
    }

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;
    let employeeCount = 0;

    // Delete any existing entries for re-computation
    await platformPrisma.payrollEntry.deleteMany({ where: { payrollRunId: runId } });

    const entriesToCreate: any[] = [];
    // M7: Collect loan updates for batch processing
    const loanUpdates: { id: string; emiAmount: number }[] = [];

    for (const emp of employees) {
      const salary = emp.salaryRecords[0];
      if (!salary) continue; // Skip employees without salary

      const monthlyGross = Number(salary.monthlyGross ?? 0) || Number(salary.annualCtc) / 12;
      const components = salary.components as Record<string, number>;

      // M5: Use batch-fetched attendance records
      const attendanceRecords = attendanceByEmployee.get(emp.id) ?? [];

      // C1: Get leave requests for this employee
      const empLeaveRequests = leaveByEmployee.get(emp.id) ?? [];

      // Build a set of dates that have attendance records for quick lookup
      const attendanceDateSet = new Set<string>();
      for (const rec of attendanceRecords) {
        attendanceDateSet.add(rec.date.toISOString().slice(0, 10));
      }

      // Build a map of leave dates (date -> isHalfDay) for this employee in this month
      const leaveDateMap = new Map<string, boolean>(); // date string -> isHalfDay
      for (const lr of empLeaveRequests) {
        const leaveStart = lr.fromDate < monthStart ? monthStart : lr.fromDate;
        const leaveEnd = lr.toDate >= monthEnd ? new Date(monthEnd.getTime() - 86400000) : lr.toDate;
        const cursor = new Date(leaveStart);
        while (cursor <= leaveEnd) {
          const dateStr = cursor.toISOString().slice(0, 10);
          leaveDateMap.set(dateStr, !!lr.isHalfDay);
          cursor.setDate(cursor.getDate() + 1);
        }
      }

      let presentDays = 0;
      let lopDays = 0;
      let otHours = 0;

      for (const rec of attendanceRecords) {
        const dateStr = rec.date.toISOString().slice(0, 10);
        if (rec.status === 'PRESENT' || rec.status === 'LATE') {
          presentDays++;
        } else if (rec.status === 'HALF_DAY') {
          // M1: Check if the half-day is covered by approved leave
          const hasApprovedLeave = leaveDateMap.has(dateStr);
          if (hasApprovedLeave) {
            // Leave covers the half-day, count as full present
            presentDays += 1;
          } else {
            presentDays += 0.5;
            lopDays += 0.5;
          }
        } else if (rec.status === 'LOP') {
          lopDays++;
        } else if (rec.status === 'ON_LEAVE' || rec.status === 'HOLIDAY' || rec.status === 'WEEK_OFF') {
          presentDays++; // Paid leave / holiday / week off counts as present
        } else if (rec.status === 'ABSENT') {
          lopDays++;
        }
        if (rec.overtimeHours) otHours += Number(rec.overtimeHours);
      }

      // C1: For approved leave days without attendance records, add to presentDays
      for (const [dateStr, isHalfDay] of leaveDateMap) {
        if (!attendanceDateSet.has(dateStr)) {
          // This leave day has no attendance record — count as present
          presentDays += isHalfDay ? 0.5 : 1;
        }
      }

      // If no attendance records AND no leave records, assume full working days (first run scenario)
      if (attendanceRecords.length === 0 && leaveDateMap.size === 0) {
        presentDays = totalWorkingDays;
        lopDays = 0;
      }

      // Pro-rate for new hires
      if (emp.joiningDate >= monthStart && emp.joiningDate < monthEnd) {
        const joiningDay = emp.joiningDate.getDate();
        const daysInMonth = new Date(run.year, run.month, 0).getDate();
        const effectiveDays = daysInMonth - joiningDay + 1;
        // If no attendance logged yet, use pro-rated working days
        if (attendanceRecords.length === 0 && leaveDateMap.size === 0) {
          presentDays = Math.round((totalWorkingDays * effectiveDays / daysInMonth) * 10) / 10;
        }
      }

      // ORA-2: Compute LOP divisor based on company config
      const divisor = lopDivisor === 'FIXED_26' ? 26 : lopDivisor === 'FIXED_30' ? 30 : totalWorkingDays;

      // Compute earnings with LOP deduction
      const earnings: Record<string, number> = {};
      let grossEarnings = 0;
      for (const [code, amount] of Object.entries(components)) {
        const effectiveAmount = lopDays > 0
          ? round(amount - (amount * lopDays / divisor))
          : amount;
        if (effectiveAmount > 0) {
          earnings[code] = effectiveAmount;
          grossEarnings += effectiveAmount;
        }
      }

      // YEL-8: Add reimbursement from approved expense claims
      let reimbursementTotal = 0;
      const empClaims = claimsByEmployee.get(emp.id) ?? [];
      for (const claim of empClaims) {
        reimbursementTotal += Number(claim.amount);
      }
      if (reimbursementTotal > 0) {
        earnings['REIMBURSEMENT'] = round(reimbursementTotal);
        grossEarnings += round(reimbursementTotal);
      }

      // Overtime
      let overtimeAmount = 0;
      if (otHours > 0 && otRule) {
        // C4: Use pfInclusion components for basic/PF wage calculation instead of string matching
        let basicAmount = 0;
        for (const [code, amount] of Object.entries(components)) {
          if (pfInclusionCodes.has(code)) {
            basicAmount += amount;
          }
        }
        // Fallback: if no pfInclusion components matched, use string matching
        if (basicAmount === 0) {
          const basicComponent = Object.entries(components).find(([code]) =>
            code.toLowerCase().includes('basic')
          );
          basicAmount = basicComponent ? basicComponent[1] : monthlyGross;
        }
        const basicPerDay = basicAmount / totalWorkingDays;
        // L1: Use fullDayThresholdHours instead of hardcoded 8
        const ratePerHour = basicPerDay / workHoursPerDay;
        overtimeAmount = round(otHours * ratePerHour * Number(otRule.rateMultiplier));
        grossEarnings += overtimeAmount;
      }

      // Loan EMI deductions
      let loanDeduction = 0;
      for (const loan of emp.loans) {
        loanDeduction += Number(loan.emiAmount);
        // M7: Collect loan updates for batch processing
        loanUpdates.push({ id: loan.id, emiAmount: Number(loan.emiAmount) });
      }

      // Standard deductions (non-statutory for now; statutory done in step 4)
      const deductions: Record<string, number> = {};
      let totalDed = loanDeduction;

      // Check salary hold
      const hold = holdMap.get(emp.id);
      let isException = !!hold;
      let exceptionNote = hold
        ? `Salary ${hold.holdType} hold: ${hold.reason}`
        : undefined;

      // ORA-3: Apply salary rounding rule
      const applyRounding = (value: number): number => {
        if (salaryRoundingRule === 'NEAREST_50P') return Math.round(value * 2) / 2;
        if (salaryRoundingRule === 'NO_ROUNDING') return Math.round(value * 100) / 100;
        return Math.round(value); // NEAREST_RUPEE (default)
      };

      // Variance calculation
      const netPay = applyRounding(grossEarnings - totalDed);
      const prevNet = prevEntries.get(emp.id);
      let variancePercent: number | null = null;
      if (prevNet && prevNet > 0) {
        variancePercent = Math.round(((netPay - prevNet) / prevNet) * 10000) / 100;
      }

      // Flag as exception if variance > 10%
      if (variancePercent !== null && Math.abs(variancePercent) > 10) {
        exceptionNote = exceptionNote
          ? `${exceptionNote}; Variance ${variancePercent}% vs previous month`
          : `Variance ${variancePercent}% vs previous month`;
      }

      // ORA-4: Negative salary detection
      if (netPay < 0) {
        isException = true;
        exceptionNote = (exceptionNote ? exceptionNote + '; ' : '') +
          `NEGATIVE SALARY: Net pay ₹${netPay}. Deductions (₹${totalDed}) exceed earnings (₹${grossEarnings}).`;
      }

      entriesToCreate.push({
        payrollRunId: runId,
        employeeId: emp.id,
        companyId,
        grossEarnings,
        totalDeductions: totalDed,
        netPay,
        earnings,
        deductions,
        employerContributions: Prisma.JsonNull,
        workingDays: totalWorkingDays,
        presentDays,
        lopDays,
        overtimeHours: otHours,
        overtimeAmount,
        loanDeduction,
        variancePercent,
        isException: isException || (variancePercent !== null && Math.abs(variancePercent) > 10),
        exceptionNote: n(exceptionNote),
      });

      totalGross += grossEarnings;
      totalDeductions += totalDed;
      totalNet += netPay;
      employeeCount++;
    }

    // Bulk create entries
    if (entriesToCreate.length > 0) {
      await platformPrisma.payrollEntry.createMany({ data: entriesToCreate });
    }

    // YEL-8: Mark approved expense claims as paid
    const paidClaimIds = approvedClaims
      .filter((c) => employees.some((e) => e.id === c.employeeId))
      .map((c) => c.id);
    if (paidClaimIds.length > 0) {
      await platformPrisma.expenseClaim.updateMany({
        where: { id: { in: paidClaimIds } },
        data: { paidAt: new Date() },
      });
    }

    // M7: Batch-update loan outstanding balances
    if (loanUpdates.length > 0) {
      await platformPrisma.$transaction(
        loanUpdates.map((lu) =>
          platformPrisma.loanRecord.update({
            where: { id: lu.id },
            data: { outstanding: { decrement: lu.emiAmount } },
          })
        )
      );
    }

    // Update run totals
    const updatedRun = await platformPrisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'COMPUTED',
        computedAt: new Date(),
        totalGross: round(totalGross),
        totalDeductions: round(totalDeductions),
        totalNet: round(totalNet),
        employeeCount,
      },
    });

    return updatedRun;
  }

  // Step 4 — Statutory Deductions
  async computeStatutory(companyId: string, runId: string) {
    const run = await this.getRunAndValidateStatus(companyId, runId, 'COMPUTED');

    // Fetch all configs upfront
    const [pfConfig, esiConfig, ptConfigs, lwfConfigs, taxConfig] = await Promise.all([
      platformPrisma.pFConfig.findUnique({ where: { companyId } }),
      platformPrisma.eSIConfig.findUnique({ where: { companyId } }),
      platformPrisma.pTConfig.findMany({ where: { companyId } }),
      platformPrisma.lWFConfig.findMany({ where: { companyId } }),
      // C3: Fetch TaxConfig ONCE outside the loop
      platformPrisma.taxConfig.findUnique({ where: { companyId } }),
    ]);

    // C4: Fetch salary components with pfInclusion ONCE before the loop
    const pfInclusionComponents = await platformPrisma.salaryComponent.findMany({
      where: { companyId, pfInclusion: true, isActive: true },
      select: { code: true },
    });
    const pfInclusionCodes = new Set(pfInclusionComponents.map((c) => c.code));

    // Build PT slab lookup by state
    const ptSlabsByState = new Map<string, any[]>();
    for (const ptc of ptConfigs) {
      ptSlabsByState.set(ptc.state, ptc.slabs as any[]);
    }

    // Build LWF lookup by state
    const lwfByState = new Map<string, { employeeAmount: number; employerAmount: number }>();
    for (const lwf of lwfConfigs) {
      lwfByState.set(lwf.state, {
        employeeAmount: Number(lwf.employeeAmount),
        employerAmount: Number(lwf.employerAmount),
      });
    }

    // RED-2: Tax configuration is REQUIRED — no hardcoded fallbacks
    if (!taxConfig) {
      throw ApiError.badRequest(
        'Tax configuration not found for this company. Please set up TaxConfig before computing statutory deductions.'
      );
    }
    const cessRate = Number(taxConfig.cessRate) / 100;

    // C3: Determine fiscal year range for YTD calculation
    const { startMonth, startYear } = getFiscalYearRange(run.month, run.year);
    const fiscalYearLabel = getFiscalYearLabel(run.month, run.year);

    // C3: Batch-fetch all previous payroll entries this fiscal year for YTD gross
    const fiscalStart = new Date(startYear, startMonth - 1, 1);
    const previousRuns = await platformPrisma.payrollRun.findMany({
      where: {
        companyId,
        status: { in: ['COMPUTED', 'STATUTORY_DONE', 'APPROVED', 'DISBURSED', 'ARCHIVED'] },
        OR: [
          { year: startYear, month: { gte: startMonth } },
          ...(startYear < run.year ? [{ year: run.year, month: { lt: run.month } }] : []),
          // Same year but earlier month (and after fiscal start)
          ...(startYear === run.year ? [{ year: run.year, month: { gte: startMonth, lt: run.month } }] : []),
        ],
      },
      select: { id: true },
    });
    const prevRunIds = previousRuns.map((r) => r.id);

    // Build YTD gross per employee and YTD TDS per employee
    const ytdGrossMap = new Map<string, number>();
    const ytdTdsMap = new Map<string, number>();
    if (prevRunIds.length > 0) {
      const prevEntries = await platformPrisma.payrollEntry.findMany({
        where: { payrollRunId: { in: prevRunIds } },
        select: { employeeId: true, grossEarnings: true, tdsAmount: true },
      });
      for (const pe of prevEntries) {
        ytdGrossMap.set(pe.employeeId, (ytdGrossMap.get(pe.employeeId) ?? 0) + Number(pe.grossEarnings));
        ytdTdsMap.set(pe.employeeId, (ytdTdsMap.get(pe.employeeId) ?? 0) + Number(pe.tdsAmount ?? 0));
      }
    }

    // C3: Batch-fetch IT declarations for employee regime preferences + deduction amounts (RED-1)
    const itDeclarations = await platformPrisma.iTDeclaration.findMany({
      where: {
        companyId,
        financialYear: fiscalYearLabel,
        status: { in: ['SUBMITTED', 'VERIFIED'] },
      },
      select: {
        employeeId: true,
        regime: true,
        section80C: true,
        section80CCD: true,
        section80D: true,
        section80E: true,
        section80G: true,
        section80TTA: true,
        homeLoanInterest: true,
        hraExemption: true,
      },
    });
    const employeeRegimeMap = new Map<string, string>();
    // RED-1: Build deduction amounts per employee from IT declarations
    const deductionsByEmployee = new Map<string, number>();
    // ORA-1: Build HRA exemption data per employee
    const hraDataByEmployee = new Map<string, { rentPaid: number; cityType: string }>();
    for (const itd of itDeclarations) {
      employeeRegimeMap.set(itd.employeeId, itd.regime);

      let totalDeductions = 0;

      // Section 80C (cap ₹1,50,000)
      const s80c = itd.section80C as any;
      if (s80c?.total) totalDeductions += Math.min(Number(s80c.total), 150000);

      // Section 80CCD NPS additional (cap ₹50,000)
      const s80ccd = itd.section80CCD as any;
      if (s80ccd?.npsAdditional) totalDeductions += Math.min(Number(s80ccd.npsAdditional), 50000);

      // Section 80D health insurance
      const s80d = itd.section80D as any;
      if (s80d) {
        if (s80d.selfPremium) totalDeductions += Math.min(Number(s80d.selfPremium), 25000);
        const parentCap = s80d.seniorCitizen ? 50000 : 25000;
        if (s80d.parentPremium) totalDeductions += Math.min(Number(s80d.parentPremium), parentCap);
      }

      // Section 80E education loan interest (no cap)
      const s80e = itd.section80E as any;
      if (s80e?.educationLoanInterest) totalDeductions += Number(s80e.educationLoanInterest);

      // Section 80G donations (simplified 50%)
      const s80g = itd.section80G as any;
      if (s80g?.donations) totalDeductions += Number(s80g.donations) * 0.5;

      // Section 80TTA savings interest (cap ₹10,000)
      const s80tta = itd.section80TTA as any;
      if (s80tta?.savingsInterest) totalDeductions += Math.min(Number(s80tta.savingsInterest), 10000);

      // Home loan interest (cap ₹2,00,000)
      const hli = itd.homeLoanInterest as any;
      if (hli?.interestAmount) totalDeductions += Math.min(Number(hli.interestAmount), 200000);

      deductionsByEmployee.set(itd.employeeId, totalDeductions);

      // ORA-1: Store HRA exemption data for old regime employees
      const hra = itd.hraExemption as any;
      if (hra?.rentPaid) {
        hraDataByEmployee.set(itd.employeeId, {
          rentPaid: Number(hra.rentPaid),
          cityType: hra.cityType ?? 'NON_METRO',
        });
      }
    }

    // Calculate remaining months in fiscal year (including current month)
    const currentMonthIndex = run.month >= startMonth
      ? run.month - startMonth
      : (12 - startMonth) + run.month;
    const remainingMonths = 12 - currentMonthIndex - 1; // months AFTER current

    // Fetch all entries with employee details
    const entries = await platformPrisma.payrollEntry.findMany({
      where: { payrollRunId: runId },
      include: {
        employee: {
          select: {
            id: true,
            employeeType: { select: { pfApplicable: true, esiApplicable: true, ptApplicable: true } },
            location: { select: { state: true } },
          },
        },
      },
    });

    let runTotalDeductions = 0;
    let runTotalNet = 0;

    // M5: Collect all entry updates for batch transaction
    const entryUpdates: { id: string; data: any }[] = [];

    for (const entry of entries) {
      const empType = entry.employee.employeeType;
      const state = entry.employee.location?.state ?? '';
      const grossEarnings = Number(entry.grossEarnings);
      const earningsObj = entry.earnings as Record<string, number>;

      let pfEmployee = 0;
      let pfEmployer = 0;
      let esiEmployee = 0;
      let esiEmployer = 0;
      let ptAmount = 0;
      let tdsAmount = 0;
      let lwfEmployee = 0;
      let lwfEmployer = 0;

      // 1. PF Calculation
      if (pfConfig && empType.pfApplicable) {
        const wageCeiling = Number(pfConfig.wageCeiling);
        // C4: Use pfInclusion components instead of string matching
        let pfWageBase = 0;
        for (const [code, amount] of Object.entries(earningsObj)) {
          if (pfInclusionCodes.has(code)) {
            pfWageBase += amount;
          }
        }
        // Fallback to string matching if no pfInclusion codes matched
        if (pfWageBase === 0) {
          pfWageBase = Object.entries(earningsObj).find(([code]) =>
            code.toLowerCase().includes('basic')
          )?.[1] ?? 0;
        }
        const pfWage = Math.min(pfWageBase, wageCeiling);

        pfEmployee = round(pfWage * Number(pfConfig.employeeRate) / 100);

        const epf = round(pfWage * Number(pfConfig.employerEpfRate) / 100);
        const eps = round(pfWage * Number(pfConfig.employerEpsRate) / 100);
        const edli = round(pfWage * Number(pfConfig.employerEdliRate) / 100);

        // YEL-1: PF Admin Charges
        const adminChargeRate = (pfConfig as any).adminChargeRate != null
          ? Number((pfConfig as any).adminChargeRate)
          : 0.5; // default 0.5%
        const pfAdminCharge = round(pfWage * adminChargeRate / 100);
        const edliAdminCharge = round(pfWage * 0.01 / 100);

        pfEmployer = epf + eps + edli + pfAdminCharge + edliAdminCharge;
      }

      // 2. ESI Calculation (with 6-month contribution period rule per ESIC)
      // Once enrolled, employee stays in ESI for the full contribution period
      // (Apr-Sep or Oct-Mar) even if salary exceeds threshold mid-period.
      if (esiConfig && empType.esiApplicable) {
        const esiCeiling = Number(esiConfig.wageCeiling);
        let esiApplicable = grossEarnings <= esiCeiling;

        // If current gross exceeds ceiling, check if employee was within ceiling
        // at the start of the current contribution period
        if (!esiApplicable) {
          const isFirstHalf = run.month >= 4 && run.month <= 9; // Apr-Sep
          const periodStartMonth = isFirstHalf ? 4 : 10;
          const periodStartYear = run.month >= 4 ? run.year : (run.month <= 3 ? run.year - 1 : run.year);

          // Check salary at contribution period start from payroll entries
          const periodStartRun = await platformPrisma.payrollRun.findUnique({
            where: { companyId_month_year: { companyId, month: periodStartMonth, year: periodStartYear } },
            select: { id: true },
          });
          if (periodStartRun) {
            const periodStartEntry = await platformPrisma.payrollEntry.findUnique({
              where: { payrollRunId_employeeId: { payrollRunId: periodStartRun.id, employeeId: entry.employeeId } },
              select: { grossEarnings: true },
            });
            if (periodStartEntry && Number(periodStartEntry.grossEarnings) <= esiCeiling) {
              esiApplicable = true; // Was eligible at period start — continue for full period
            }
          }
        }

        if (esiApplicable) {
          esiEmployee = round(grossEarnings * Number(esiConfig.employeeRate) / 100);
          esiEmployer = round(grossEarnings * Number(esiConfig.employerRate) / 100);
        }
      }

      // 3. PT Calculation
      if (empType.ptApplicable && state && ptSlabsByState.has(state)) {
        const slabs = ptSlabsByState.get(state)!;
        for (const slab of slabs) {
          if (grossEarnings >= slab.fromAmount && grossEarnings <= slab.toAmount) {
            ptAmount = slab.taxAmount;
            break;
          }
        }
      }

      // 4. TDS — C3: Use TaxConfig + YTD projection + RED-1: IT declaration deductions
      const ytdGross = ytdGrossMap.get(entry.employeeId) ?? 0;
      const ytdTds = ytdTdsMap.get(entry.employeeId) ?? 0;
      const projectedAnnualIncome = ytdGross + grossEarnings + (remainingMonths * grossEarnings);

      // Determine regime: employee preference > company default > NEW
      const empRegime = employeeRegimeMap.get(entry.employeeId)
        ?? (taxConfig.defaultRegime ?? 'NEW');

      // RED-2: Use TaxConfig slabs only — no hardcoded fallback
      const rawSlabs = empRegime === 'OLD'
        ? (taxConfig.oldRegimeSlabs as any[])
        : (taxConfig.newRegimeSlabs as any[]);
      if (!Array.isArray(rawSlabs) || rawSlabs.length === 0) {
        throw ApiError.badRequest(
          `Tax slabs for ${empRegime} regime not configured in TaxConfig. Please configure slabs before computing statutory deductions.`
        );
      }
      const slabs: Array<{ fromAmount: number; toAmount: number; rate: number }> = rawSlabs;

      // RED-1: Compute total deductions to subtract from taxable income
      let totalITDeductions = 0;
      if (empRegime === 'OLD') {
        // Old regime: standard deduction ₹50,000 + all declared deductions
        totalITDeductions = 50000;
        totalITDeductions += deductionsByEmployee.get(entry.employeeId) ?? 0;

        // ORA-1: HRA Exemption (old regime only)
        const hraData = hraDataByEmployee.get(entry.employeeId);
        if (hraData && hraData.rentPaid > 0) {
          // Approximate: Basic ≈ 40% of gross, HRA component ≈ 20% of gross
          const annualGross = projectedAnnualIncome;
          const basicAnnual = annualGross * 0.40;

          // Check if HRA component exists in earnings
          const hraFromEarnings = earningsObj['HRA'] ?? earningsObj['hra'] ?? 0;
          const hraAnnual = hraFromEarnings > 0 ? hraFromEarnings * 12 : annualGross * 0.20;

          const annualRent = hraData.rentPaid * 12;
          const metroPercent = (hraData.cityType === 'METRO') ? 0.50 : 0.40;

          const hraExemption = Math.min(
            hraAnnual,                                    // Actual HRA received
            Math.max(annualRent - (0.10 * basicAnnual), 0), // Rent paid - 10% of basic
            metroPercent * basicAnnual                     // 50%/40% of basic
          );
          totalITDeductions += hraExemption;
        }
      } else {
        // New regime: only standard deduction ₹75,000
        totalITDeductions = 75000;
      }

      // Taxable income after deductions
      const taxableIncome = Math.max(projectedAnnualIncome - totalITDeductions, 0);

      // Apply slabs to taxable income (after deductions)
      let annualTax = 0;
      for (const slab of slabs) {
        const upper = slab.toAmount === null || slab.toAmount === undefined ? Infinity : slab.toAmount;
        if (taxableIncome > slab.fromAmount) {
          const taxableInSlab = Math.min(taxableIncome, upper) - slab.fromAmount;
          annualTax += taxableInSlab * slab.rate;
        }
      }

      // Add cess
      annualTax = annualTax * (1 + cessRate);

      // Subtract YTD TDS to get this month's TDS
      const totalTdsForYear = round(annualTax);
      const monthsElapsed = currentMonthIndex + 1; // including current month
      const proportionalTds = round(totalTdsForYear * monthsElapsed / 12);
      tdsAmount = Math.max(round(proportionalTds - ytdTds), 0);

      // 5. LWF
      if (state && lwfByState.has(state)) {
        const lwf = lwfByState.get(state)!;
        lwfEmployee = lwf.employeeAmount;
        lwfEmployer = lwf.employerAmount;
      }

      // Update entry with statutory amounts
      const statutoryDeductions = pfEmployee + esiEmployee + ptAmount + tdsAmount + lwfEmployee;
      const totalDeductions = Number(entry.loanDeduction ?? 0) + statutoryDeductions;
      const netPay = round(grossEarnings - totalDeductions);

      const employerContributions: Record<string, number> = {};
      if (pfEmployer > 0) {
        employerContributions.PF_EMPLOYER = pfEmployer;
        // YEL-1: Break out admin charges for transparency
        if (pfConfig && empType.pfApplicable) {
          const pfWageBase2 = (() => {
            let base = 0;
            for (const [code, amount] of Object.entries(earningsObj)) {
              if (pfInclusionCodes.has(code)) base += amount;
            }
            if (base === 0) {
              base = Object.entries(earningsObj).find(([code]) =>
                code.toLowerCase().includes('basic')
              )?.[1] ?? 0;
            }
            return Math.min(base, Number(pfConfig.wageCeiling));
          })();
          const adminRate = (pfConfig as any).adminChargeRate != null
            ? Number((pfConfig as any).adminChargeRate) : 0.5;
          employerContributions.PF_ADMIN = round(pfWageBase2 * adminRate / 100);
          employerContributions.EDLI_ADMIN = round(pfWageBase2 * 0.01 / 100);
        }
      }
      if (esiEmployer > 0) employerContributions.ESI_EMPLOYER = esiEmployer;
      if (lwfEmployer > 0) employerContributions.LWF_EMPLOYER = lwfEmployer;

      // M5: Collect updates instead of individual queries
      entryUpdates.push({
        id: entry.id,
        data: {
          pfEmployee,
          pfEmployer,
          esiEmployee,
          esiEmployer,
          ptAmount,
          tdsAmount,
          lwfEmployee,
          lwfEmployer,
          totalDeductions,
          netPay,
          employerContributions: Object.keys(employerContributions).length > 0
            ? employerContributions
            : Prisma.JsonNull,
        },
      });

      runTotalDeductions += totalDeductions;
      runTotalNet += netPay;
    }

    // M5: Apply all entry updates in a single transaction
    if (entryUpdates.length > 0) {
      await platformPrisma.$transaction(
        entryUpdates.map((eu) =>
          platformPrisma.payrollEntry.update({
            where: { id: eu.id },
            data: eu.data,
          })
        )
      );
    }

    // Update run totals
    const updatedRun = await platformPrisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'STATUTORY_DONE',
        totalDeductions: round(runTotalDeductions),
        totalNet: round(runTotalNet),
      },
    });

    return updatedRun;
  }

  // Step 5 — Approve
  async approveRun(companyId: string, runId: string, userId: string) {
    const run = await this.getRunAndValidateStatus(companyId, runId, 'STATUTORY_DONE');

    // Check if an approval workflow exists for payroll approval
    const approvalRequest = await essService.createRequest(companyId, {
      requesterId: userId,
      entityType: 'PayrollRun',
      entityId: runId,
      triggerEvent: 'PAYROLL_APPROVAL',
      data: { month: run.month, year: run.year, totalNet: run.totalNet },
    });

    // If workflow exists and request was created, don't auto-approve — let workflow handle it
    if (approvalRequest) {
      return { ...run, approvalPending: true, approvalRequestId: approvalRequest.id };
    }

    // Otherwise, proceed with existing approval logic
    const updatedRun = await platformPrisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'APPROVED',
        approvedBy: userId,
        approvedAt: new Date(),
      },
    });

    return updatedRun;
  }

  // Step 6 — Disburse
  async disburseRun(companyId: string, runId: string) {
    const run = await this.getRunAndValidateStatus(companyId, runId, 'APPROVED');

    // Generate payslips
    await this.generatePayslips(companyId, runId);

    // Mark as disbursed then archived
    const updatedRun = await platformPrisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'ARCHIVED',
        disbursedAt: new Date(),
      },
    });

    return updatedRun;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Payroll Entries
  // ══════════════════════════════════════════════════════════════════════════

  async listEntries(companyId: string, runId: string, options: EntryListOptions = {}) {
    const { page = 1, limit = 50, search, exceptionsOnly } = options;
    const offset = (page - 1) * limit;

    const where: any = { payrollRunId: runId, companyId };
    if (exceptionsOnly) where.isException = true;
    if (search) {
      where.employee = {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { employeeId: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const [entries, total] = await Promise.all([
      platformPrisma.payrollEntry.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              employeeId: true,
              firstName: true,
              lastName: true,
              department: { select: { name: true } },
              designation: { select: { name: true } },
            },
          },
        },
        skip: offset,
        take: limit,
        orderBy: { employee: { firstName: 'asc' } },
      }),
      platformPrisma.payrollEntry.count({ where }),
    ]);

    return { entries, total, page, limit };
  }

  async getEntry(companyId: string, runId: string, entryId: string) {
    const entry = await platformPrisma.payrollEntry.findUnique({
      where: { id: entryId },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            department: { select: { name: true } },
            designation: { select: { name: true } },
            bankAccountNumber: true,
            bankIfscCode: true,
            bankName: true,
          },
        },
      },
    });

    if (!entry || entry.companyId !== companyId || entry.payrollRunId !== runId) {
      throw ApiError.notFound('Payroll entry not found');
    }

    return entry;
  }

  async overrideEntry(companyId: string, runId: string, entryId: string, data: any) {
    const entry = await platformPrisma.payrollEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.companyId !== companyId || entry.payrollRunId !== runId) {
      throw ApiError.notFound('Payroll entry not found');
    }

    // H1: Guard — reject override if run is in a final state
    const run = await platformPrisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run || !['COMPUTED', 'STATUTORY_DONE'].includes(run.status)) {
      throw ApiError.badRequest('Payroll run must be in COMPUTED or STATUTORY_DONE status to override entries');
    }
    // H1: Additional guard — reject if APPROVED, DISBURSED, or ARCHIVED
    if (['APPROVED', 'DISBURSED', 'ARCHIVED'].includes(run.status)) {
      throw ApiError.badRequest('Cannot override entries in APPROVED, DISBURSED, or ARCHIVED payroll runs');
    }

    const currentEarnings = entry.earnings as Record<string, number>;
    const currentDeductions = entry.deductions as Record<string, number>;

    const newEarnings = data.earnings ? { ...currentEarnings, ...data.earnings } : currentEarnings;
    const newDeductions = data.deductions ? { ...currentDeductions, ...data.deductions } : currentDeductions;

    const grossEarnings = Object.values(newEarnings).reduce<number>((sum, v) => sum + (v as number), 0) + Number(entry.overtimeAmount ?? 0);
    const deductionTotal = Object.values(newDeductions).reduce<number>((sum, v) => sum + (v as number), 0)
      + Number(entry.pfEmployee ?? 0)
      + Number(entry.esiEmployee ?? 0)
      + Number(entry.ptAmount ?? 0)
      + Number(entry.tdsAmount ?? 0)
      + Number(entry.lwfEmployee ?? 0)
      + Number(entry.loanDeduction ?? 0);
    const netPay = round(grossEarnings - deductionTotal);

    const updatedEntry = await platformPrisma.payrollEntry.update({
      where: { id: entryId },
      data: {
        earnings: newEarnings,
        deductions: newDeductions,
        grossEarnings: round(grossEarnings),
        totalDeductions: round(deductionTotal),
        netPay,
        isException: true,
        exceptionNote: data.exceptionNote ?? entry.exceptionNote ?? 'Manual override applied',
      },
    });

    // H2: Recalculate run totals after entry override
    const allEntries = await platformPrisma.payrollEntry.findMany({
      where: { payrollRunId: runId },
      select: { grossEarnings: true, totalDeductions: true, netPay: true },
    });
    const newTotalGross = allEntries.reduce((s, e) => s + Number(e.grossEarnings), 0);
    const newTotalDeductions = allEntries.reduce((s, e) => s + Number(e.totalDeductions), 0);
    const newTotalNet = allEntries.reduce((s, e) => s + Number(e.netPay), 0);
    await platformPrisma.payrollRun.update({
      where: { id: runId },
      data: {
        totalGross: round(newTotalGross),
        totalDeductions: round(newTotalDeductions),
        totalNet: round(newTotalNet),
      },
    });

    return updatedEntry;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Payslips
  // ══════════════════════════════════════════════════════════════════════════

  async listPayslips(companyId: string, options: PayslipListOptions = {}) {
    const { page = 1, limit = 25, employeeId, month, year } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (employeeId) where.employeeId = employeeId;
    if (month) where.month = month;
    if (year) where.year = year;

    const [payslips, total] = await Promise.all([
      platformPrisma.payslip.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              employeeId: true,
              firstName: true,
              lastName: true,
              department: { select: { name: true } },
            },
          },
        },
        skip: offset,
        take: limit,
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      }),
      platformPrisma.payslip.count({ where }),
    ]);

    return { payslips, total, page, limit };
  }

  async getPayslip(companyId: string, id: string) {
    const payslip = await platformPrisma.payslip.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            department: { select: { name: true } },
            designation: { select: { name: true } },
            bankAccountNumber: true,
            bankIfscCode: true,
            bankName: true,
            panNumber: true,
            uan: true,
          },
        },
        payrollRun: {
          select: { id: true, month: true, year: true, status: true },
        },
      },
    });

    if (!payslip || payslip.companyId !== companyId) {
      throw ApiError.notFound('Payslip not found');
    }

    // Fetch the corresponding payroll entry for this employee
    const entry = await platformPrisma.payrollEntry.findUnique({
      where: {
        payrollRunId_employeeId: {
          payrollRunId: payslip.payrollRunId,
          employeeId: payslip.employeeId,
        },
      },
    });

    return { ...payslip, entry };
  }

  // H1: Generate payslips with snapshot data from PayrollEntry
  async generatePayslips(companyId: string, runId: string) {
    const run = await platformPrisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run || run.companyId !== companyId) {
      throw ApiError.notFound('Payroll run not found');
    }

    if (!['APPROVED', 'DISBURSED', 'ARCHIVED'].includes(run.status)) {
      throw ApiError.badRequest('Payroll run must be APPROVED or later to generate payslips');
    }

    // Get all entries without holds (FULL hold = skip payslip)
    const fullHoldEmployeeIds = (
      await platformPrisma.salaryHold.findMany({
        where: { payrollRunId: runId, holdType: 'FULL', releasedAt: null, companyId },
        select: { employeeId: true },
      })
    ).map((h) => h.employeeId);

    // H1: Fetch full entry data for snapshot
    const entries = await platformPrisma.payrollEntry.findMany({
      where: {
        payrollRunId: runId,
        employeeId: { notIn: fullHoldEmployeeIds },
      },
    });

    // Delete existing payslips for this run and recreate with snapshot data
    await platformPrisma.payslip.deleteMany({ where: { payrollRunId: runId } });

    // H1: Create payslips with snapshot data from each entry
    const payslipData = entries.map((e) => ({
      payrollRunId: runId,
      employeeId: e.employeeId,
      month: run.month,
      year: run.year,
      companyId,
      // H1: Snapshot fields from PayrollEntry
      grossEarnings: Number(e.grossEarnings),
      totalDeductions: Number(e.totalDeductions),
      netPay: Number(e.netPay),
      earnings: e.earnings ?? Prisma.JsonNull,
      deductions: e.deductions ?? Prisma.JsonNull,
      employerContributions: e.employerContributions ?? Prisma.JsonNull,
      pfEmployee: e.pfEmployee !== null ? Number(e.pfEmployee) : null,
      pfEmployer: e.pfEmployer !== null ? Number(e.pfEmployer) : null,
      esiEmployee: e.esiEmployee !== null ? Number(e.esiEmployee) : null,
      esiEmployer: e.esiEmployer !== null ? Number(e.esiEmployer) : null,
      ptAmount: e.ptAmount !== null ? Number(e.ptAmount) : null,
      tdsAmount: e.tdsAmount !== null ? Number(e.tdsAmount) : null,
      lwfEmployee: e.lwfEmployee !== null ? Number(e.lwfEmployee) : null,
      lwfEmployer: e.lwfEmployer !== null ? Number(e.lwfEmployer) : null,
      loanDeduction: e.loanDeduction !== null ? Number(e.loanDeduction) : null,
      overtimeAmount: e.overtimeAmount !== null ? Number(e.overtimeAmount) : null,
      workingDays: e.workingDays !== null ? Number(e.workingDays) : null,
      presentDays: e.presentDays !== null ? Number(e.presentDays) : null,
      lopDays: e.lopDays !== null ? Number(e.lopDays) : null,
      // C3: Mark TDS as provisional
      tdsProvisional: true,
    }));

    if (payslipData.length > 0) {
      await platformPrisma.payslip.createMany({ data: payslipData, skipDuplicates: true });
    }

    return { generated: payslipData.length };
  }

  async emailPayslip(companyId: string, id: string) {
    const payslip = await platformPrisma.payslip.findUnique({ where: { id } });
    if (!payslip || payslip.companyId !== companyId) {
      throw ApiError.notFound('Payslip not found');
    }

    // Placeholder: just update emailedAt
    const updated = await platformPrisma.payslip.update({
      where: { id },
      data: { emailedAt: new Date() },
    });

    return updated;
  }

  // L7: Bulk email payslips for a run
  async bulkEmailPayslips(companyId: string, runId: string) {
    const run = await platformPrisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run || run.companyId !== companyId) {
      throw ApiError.notFound('Payroll run not found');
    }

    const result = await platformPrisma.payslip.updateMany({
      where: { payrollRunId: runId, companyId },
      data: { emailedAt: new Date() },
    });

    return { emailed: result.count, runId };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Salary Holds
  // ══════════════════════════════════════════════════════════════════════════

  async listHolds(companyId: string, options: HoldListOptions = {}) {
    const { page = 1, limit = 25, payrollRunId } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (payrollRunId) where.payrollRunId = payrollRunId;

    const [holds, total] = await Promise.all([
      platformPrisma.salaryHold.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              employeeId: true,
              firstName: true,
              lastName: true,
              department: { select: { name: true } },
            },
          },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.salaryHold.count({ where }),
    ]);

    return { holds, total, page, limit };
  }

  async createHold(companyId: string, data: any) {
    // Validate payroll run
    const run = await platformPrisma.payrollRun.findUnique({ where: { id: data.payrollRunId } });
    if (!run || run.companyId !== companyId) {
      throw ApiError.notFound('Payroll run not found');
    }

    // Validate employee
    const employee = await platformPrisma.employee.findUnique({
      where: { id: data.employeeId },
      select: { id: true, companyId: true },
    });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.badRequest('Employee not found in this company');
    }

    return platformPrisma.salaryHold.create({
      data: {
        companyId,
        payrollRunId: data.payrollRunId,
        employeeId: data.employeeId,
        holdType: data.holdType ?? 'FULL',
        reason: data.reason,
        heldComponents: data.heldComponents ?? Prisma.JsonNull,
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async releaseHold(companyId: string, holdId: string, userId: string) {
    const hold = await platformPrisma.salaryHold.findUnique({ where: { id: holdId } });
    if (!hold || hold.companyId !== companyId) {
      throw ApiError.notFound('Salary hold not found');
    }
    if (hold.releasedAt) {
      throw ApiError.badRequest('Salary hold already released');
    }

    return platformPrisma.salaryHold.update({
      where: { id: holdId },
      data: {
        releasedAt: new Date(),
        releasedBy: userId,
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Salary Revisions
  // ══════════════════════════════════════════════════════════════════════════

  async listRevisions(companyId: string, options: RevisionListOptions = {}) {
    const { page = 1, limit = 25, employeeId, status } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status.toUpperCase();

    const [revisions, total] = await Promise.all([
      platformPrisma.salaryRevision.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              employeeId: true,
              firstName: true,
              lastName: true,
              department: { select: { name: true } },
            },
          },
          _count: { select: { arrearEntries: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.salaryRevision.count({ where }),
    ]);

    return { revisions, total, page, limit };
  }

  async createRevision(companyId: string, data: any) {
    // Validate employee
    const employee = await platformPrisma.employee.findUnique({
      where: { id: data.employeeId },
      select: { id: true, companyId: true },
    });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.badRequest('Employee not found in this company');
    }

    // Get current salary
    const currentSalary = await platformPrisma.employeeSalary.findFirst({
      where: { employeeId: data.employeeId, companyId, isCurrent: true },
    });
    if (!currentSalary) {
      throw ApiError.badRequest('Employee has no current salary record');
    }

    const oldCtc = Number(currentSalary.annualCtc);
    const newCtc = data.newCtc;
    const incrementPercent = data.incrementPercent ?? Math.round(((newCtc - oldCtc) / oldCtc) * 10000) / 100;

    return platformPrisma.salaryRevision.create({
      data: {
        companyId,
        employeeId: data.employeeId,
        oldCtc,
        newCtc,
        effectiveDate: new Date(data.effectiveDate),
        incrementPercent,
        newComponents: data.newComponents ?? Prisma.JsonNull,
        status: 'DRAFT',
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async getRevision(companyId: string, id: string) {
    const revision = await platformPrisma.salaryRevision.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            department: { select: { name: true } },
            designation: { select: { name: true } },
          },
        },
        arrearEntries: {
          orderBy: [{ forYear: 'asc' }, { forMonth: 'asc' }],
        },
      },
    });

    if (!revision || revision.companyId !== companyId) {
      throw ApiError.notFound('Salary revision not found');
    }

    return revision;
  }

  async approveRevision(companyId: string, id: string, userId: string) {
    const revision = await platformPrisma.salaryRevision.findUnique({ where: { id } });
    if (!revision || revision.companyId !== companyId) {
      throw ApiError.notFound('Salary revision not found');
    }
    if (revision.status !== 'DRAFT') {
      throw ApiError.badRequest('Only DRAFT revisions can be approved');
    }

    // Check if an approval workflow exists for salary revision
    const approvalRequest = await essService.createRequest(companyId, {
      requesterId: userId,
      entityType: 'SalaryRevision',
      entityId: id,
      triggerEvent: 'SALARY_REVISION',
      data: { employeeId: revision.employeeId, oldCtc: Number(revision.oldCtc), newCtc: Number(revision.newCtc) },
    });

    // If workflow exists, don't auto-approve — let workflow handle it
    if (approvalRequest) {
      return { ...revision, approvalPending: true, approvalRequestId: approvalRequest.id };
    }

    // Otherwise, proceed with direct approval
    return platformPrisma.salaryRevision.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedBy: userId,
        approvedAt: new Date(),
      },
    });
  }

  async applyRevision(companyId: string, id: string) {
    const revision = await platformPrisma.salaryRevision.findUnique({
      where: { id },
      include: {
        employee: {
          include: {
            salaryRecords: { where: { isCurrent: true }, take: 1 },
          },
        },
      },
    });
    if (!revision || revision.companyId !== companyId) {
      throw ApiError.notFound('Salary revision not found');
    }
    if (revision.status !== 'APPROVED') {
      throw ApiError.badRequest('Only APPROVED revisions can be applied');
    }

    const currentSalary = revision.employee.salaryRecords[0];
    if (!currentSalary) {
      throw ApiError.badRequest('Employee has no current salary record');
    }

    const oldMonthly = Number(currentSalary.annualCtc) / 12;
    const newMonthly = Number(revision.newCtc) / 12;
    const diffMonthly = newMonthly - oldMonthly;

    // Compute arrears from effectiveDate to now
    const effectiveDate = new Date(revision.effectiveDate);
    const now = new Date();
    const arrearEntries: any[] = [];
    let totalArrears = 0;

    let arrearMonth = effectiveDate.getMonth() + 1; // 1-12
    let arrearYear = effectiveDate.getFullYear();

    while (arrearYear < now.getFullYear() || (arrearYear === now.getFullYear() && arrearMonth <= now.getMonth() + 1)) {
      // For each month, compute component-level difference
      const oldComponents = currentSalary.components as Record<string, number>;
      const newComponents = (revision.newComponents as Record<string, number>) ?? {};

      const arrearComponents: Record<string, number> = {};
      let monthArrear = 0;

      if (Object.keys(newComponents).length > 0) {
        // Component-level arrear
        for (const [code, newAmt] of Object.entries(newComponents)) {
          const oldAmt = oldComponents[code] ?? 0;
          const diff = newAmt - oldAmt;
          if (diff > 0) {
            arrearComponents[code] = round(diff);
            monthArrear += diff;
          }
        }
      } else {
        // Flat difference
        arrearComponents['CTC_DIFF'] = round(diffMonthly);
        monthArrear = diffMonthly;
      }

      if (monthArrear > 0) {
        arrearEntries.push({
          companyId: revision.companyId,
          employeeId: revision.employeeId,
          revisionId: id,
          forMonth: arrearMonth,
          forYear: arrearYear,
          components: arrearComponents,
          totalAmount: round(monthArrear),
        });
        totalArrears += monthArrear;
      }

      arrearMonth++;
      if (arrearMonth > 12) {
        arrearMonth = 1;
        arrearYear++;
      }
    }

    // Apply in a transaction
    await platformPrisma.$transaction(async (tx) => {
      // Close current salary
      await tx.employeeSalary.updateMany({
        where: { employeeId: revision.employeeId, companyId: revision.companyId, isCurrent: true },
        data: { isCurrent: false, effectiveTo: new Date() },
      });

      // Create new salary record
      const newComponentsData = (revision.newComponents as Record<string, number>) ?? {};
      await tx.employeeSalary.create({
        data: {
          companyId: revision.companyId,
          employeeId: revision.employeeId,
          structureId: currentSalary.structureId,
          annualCtc: Number(revision.newCtc),
          monthlyGross: round(newMonthly),
          components: Object.keys(newComponentsData).length > 0 ? newComponentsData : currentSalary.components as any,
          effectiveFrom: effectiveDate,
          isCurrent: true,
        },
      });

      // Create arrear entries
      if (arrearEntries.length > 0) {
        await tx.arrearEntry.createMany({ data: arrearEntries });
      }

      // Update revision
      await tx.salaryRevision.update({
        where: { id },
        data: {
          status: 'APPLIED',
          arrearsComputed: true,
          totalArrears: round(totalArrears),
        },
      });
    });

    return this.getRevision(revision.companyId, id);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Arrears
  // ══════════════════════════════════════════════════════════════════════════

  async listArrears(companyId: string, options: ArrearListOptions = {}) {
    const { page = 1, limit = 25, employeeId, payrollRunId } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (employeeId) where.employeeId = employeeId;
    if (payrollRunId) where.payrollRunId = payrollRunId;

    const [arrears, total] = await Promise.all([
      platformPrisma.arrearEntry.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              employeeId: true,
              firstName: true,
              lastName: true,
            },
          },
          revision: {
            select: { id: true, oldCtc: true, newCtc: true, effectiveDate: true },
          },
        },
        skip: offset,
        take: limit,
        orderBy: [{ forYear: 'desc' }, { forMonth: 'desc' }],
      }),
      platformPrisma.arrearEntry.count({ where }),
    ]);

    return { arrears, total, page, limit };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Statutory Filings
  // ══════════════════════════════════════════════════════════════════════════

  async listFilings(companyId: string, options: FilingListOptions = {}) {
    const { page = 1, limit = 25, year, type, status } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (year) where.year = year;
    if (type) where.type = type;
    if (status) where.status = status.toUpperCase();

    const [filings, total] = await Promise.all([
      platformPrisma.statutoryFiling.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      }),
      platformPrisma.statutoryFiling.count({ where }),
    ]);

    return { filings, total, page, limit };
  }

  async createFiling(companyId: string, data: any) {
    return platformPrisma.statutoryFiling.create({
      data: {
        companyId,
        type: data.type,
        month: n(data.month),
        year: data.year,
        amount: n(data.amount),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        details: data.details ?? Prisma.JsonNull,
        status: 'PENDING',
      },
    });
  }

  async updateFiling(companyId: string, id: string, data: any) {
    const filing = await platformPrisma.statutoryFiling.findUnique({ where: { id } });
    if (!filing || filing.companyId !== companyId) {
      throw ApiError.notFound('Statutory filing not found');
    }

    return platformPrisma.statutoryFiling.update({
      where: { id },
      data: {
        ...(data.status !== undefined && { status: data.status }),
        ...(data.amount !== undefined && { amount: n(data.amount) }),
        ...(data.fileUrl !== undefined && { fileUrl: n(data.fileUrl) }),
        ...(data.filedAt !== undefined && { filedAt: data.filedAt ? new Date(data.filedAt) : null }),
        ...(data.filedBy !== undefined && { filedBy: n(data.filedBy) }),
        ...(data.details !== undefined && { details: data.details ?? Prisma.JsonNull }),
      },
    });
  }

  async getStatutoryDashboard(companyId: string) {
    const now = new Date();
    const currentYear = now.getFullYear();

    const [totalFilings, filedFilings, dueThisWeek, overdue] = await Promise.all([
      platformPrisma.statutoryFiling.count({ where: { companyId, year: currentYear } }),
      platformPrisma.statutoryFiling.count({
        where: { companyId, year: currentYear, status: { in: ['FILED', 'VERIFIED'] } },
      }),
      platformPrisma.statutoryFiling.count({
        where: {
          companyId,
          status: 'PENDING',
          dueDate: {
            gte: now,
            lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      platformPrisma.statutoryFiling.count({
        where: {
          companyId,
          status: 'PENDING',
          dueDate: { lt: now },
        },
      }),
    ]);

    return {
      totalFilings,
      filedFilings,
      filedPercent: totalFilings > 0 ? Math.round((filedFilings / totalFilings) * 100) : 0,
      dueThisWeek,
      overdue,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Reports
  // ══════════════════════════════════════════════════════════════════════════

  async getSalaryRegister(companyId: string, month: number, year: number) {
    const run = await platformPrisma.payrollRun.findUnique({
      where: { companyId_month_year: { companyId, month, year } },
    });
    if (!run) {
      throw ApiError.notFound(`No payroll run found for ${month}/${year}`);
    }

    const entries = await platformPrisma.payrollEntry.findMany({
      where: { payrollRunId: run.id },
      include: {
        employee: {
          select: {
            employeeId: true,
            firstName: true,
            lastName: true,
            department: { select: { name: true } },
            designation: { select: { name: true } },
          },
        },
      },
      orderBy: { employee: { firstName: 'asc' } },
    });

    return {
      month,
      year,
      runId: run.id,
      status: run.status,
      totalGross: run.totalGross,
      totalDeductions: run.totalDeductions,
      totalNet: run.totalNet,
      employeeCount: run.employeeCount,
      entries,
    };
  }

  async getBankFile(companyId: string, runId: string) {
    const run = await platformPrisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run || run.companyId !== companyId) {
      throw ApiError.notFound('Payroll run not found');
    }

    // Get entries excluding FULL holds
    const fullHoldEmployeeIds = (
      await platformPrisma.salaryHold.findMany({
        where: { payrollRunId: runId, holdType: 'FULL', releasedAt: null, companyId },
        select: { employeeId: true },
      })
    ).map((h) => h.employeeId);

    const entries = await platformPrisma.payrollEntry.findMany({
      where: {
        payrollRunId: runId,
        employeeId: { notIn: fullHoldEmployeeIds },
      },
      include: {
        employee: {
          select: {
            firstName: true,
            lastName: true,
            bankAccountNumber: true,
            bankIfscCode: true,
            bankName: true,
          },
        },
      },
      orderBy: { employee: { firstName: 'asc' } },
    });

    return entries.map((e) => ({
      employeeName: `${e.employee.firstName} ${e.employee.lastName}`,
      bankAccount: e.employee.bankAccountNumber ?? '',
      ifsc: e.employee.bankIfscCode ?? '',
      bankName: e.employee.bankName ?? '',
      amount: Number(e.netPay),
    }));
  }

  async getPFECR(companyId: string, month: number, year: number) {
    const run = await platformPrisma.payrollRun.findUnique({
      where: { companyId_month_year: { companyId, month, year } },
    });
    if (!run) throw ApiError.notFound(`No payroll run found for ${month}/${year}`);

    const entries = await platformPrisma.payrollEntry.findMany({
      where: {
        payrollRunId: run.id,
        pfEmployee: { gt: 0 },
      },
      include: {
        employee: {
          select: {
            employeeId: true,
            firstName: true,
            lastName: true,
            uan: true,
          },
        },
      },
    });

    return entries.map((e) => ({
      uan: e.employee.uan ?? '',
      employeeName: `${e.employee.firstName} ${e.employee.lastName}`,
      grossWages: Number(e.grossEarnings),
      epfWages: Number(e.pfEmployee) > 0 ? Math.round(Number(e.pfEmployee) / 0.12) : 0, // reverse-calc PF wage
      epsWages: Number(e.pfEmployee) > 0 ? Math.round(Number(e.pfEmployee) / 0.12) : 0,
      edliWages: Number(e.pfEmployee) > 0 ? Math.round(Number(e.pfEmployee) / 0.12) : 0,
      epfContribEmployee: Number(e.pfEmployee),
      epsContribEmployer: 0, // broken out in StatutoryDone but stored as pfEmployer total
      epfContribEmployer: Number(e.pfEmployer),
      ncp: Number(e.lopDays ?? 0),
    }));
  }

  async getESIChallan(companyId: string, month: number, year: number) {
    const run = await platformPrisma.payrollRun.findUnique({
      where: { companyId_month_year: { companyId, month, year } },
    });
    if (!run) throw ApiError.notFound(`No payroll run found for ${month}/${year}`);

    const entries = await platformPrisma.payrollEntry.findMany({
      where: {
        payrollRunId: run.id,
        esiEmployee: { gt: 0 },
      },
      include: {
        employee: {
          select: {
            employeeId: true,
            firstName: true,
            lastName: true,
            esiIpNumber: true,
          },
        },
      },
    });

    const totalEmployee = entries.reduce((sum, e) => sum + Number(e.esiEmployee ?? 0), 0);
    const totalEmployer = entries.reduce((sum, e) => sum + Number(e.esiEmployer ?? 0), 0);

    return {
      month,
      year,
      employeeCount: entries.length,
      totalEmployee: round(totalEmployee),
      totalEmployer: round(totalEmployer),
      totalESI: round(totalEmployee + totalEmployer),
      entries: entries.map((e) => ({
        ipNumber: e.employee.esiIpNumber ?? '',
        employeeName: `${e.employee.firstName} ${e.employee.lastName}`,
        grossWages: Number(e.grossEarnings),
        employeeContrib: Number(e.esiEmployee),
        employerContrib: Number(e.esiEmployer),
      })),
    };
  }

  async getPTChallan(companyId: string, month: number, year: number) {
    const run = await platformPrisma.payrollRun.findUnique({
      where: { companyId_month_year: { companyId, month, year } },
    });
    if (!run) throw ApiError.notFound(`No payroll run found for ${month}/${year}`);

    const entries = await platformPrisma.payrollEntry.findMany({
      where: {
        payrollRunId: run.id,
        ptAmount: { gt: 0 },
      },
      include: {
        employee: {
          select: {
            employeeId: true,
            firstName: true,
            lastName: true,
            location: { select: { state: true } },
          },
        },
      },
    });

    // Group by state
    const byState = new Map<string, { count: number; total: number }>();
    for (const e of entries) {
      const state = e.employee.location?.state ?? 'Unknown';
      const curr = byState.get(state) ?? { count: 0, total: 0 };
      curr.count++;
      curr.total += Number(e.ptAmount ?? 0);
      byState.set(state, curr);
    }

    const totalPT = entries.reduce((sum, e) => sum + Number(e.ptAmount ?? 0), 0);

    return {
      month,
      year,
      totalPT: round(totalPT),
      byState: Object.fromEntries(
        Array.from(byState.entries()).map(([state, data]) => [
          state,
          { count: data.count, total: round(data.total) },
        ])
      ),
      entries: entries.map((e) => ({
        employeeName: `${e.employee.firstName} ${e.employee.lastName}`,
        state: e.employee.location?.state ?? 'Unknown',
        grossWages: Number(e.grossEarnings),
        ptAmount: Number(e.ptAmount),
      })),
    };
  }

  async getVarianceReport(companyId: string, month: number, year: number) {
    const run = await platformPrisma.payrollRun.findUnique({
      where: { companyId_month_year: { companyId, month, year } },
    });
    if (!run) throw ApiError.notFound(`No payroll run found for ${month}/${year}`);

    const entries = await platformPrisma.payrollEntry.findMany({
      where: {
        payrollRunId: run.id,
        OR: [
          { variancePercent: { gt: 10 } },
          { variancePercent: { lt: -10 } },
        ],
      },
      include: {
        employee: {
          select: {
            employeeId: true,
            firstName: true,
            lastName: true,
            department: { select: { name: true } },
          },
        },
      },
      orderBy: { variancePercent: 'desc' },
    });

    return {
      month,
      year,
      flaggedCount: entries.length,
      entries: entries.map((e) => ({
        employeeId: e.employee.employeeId,
        employeeName: `${e.employee.firstName} ${e.employee.lastName}`,
        department: e.employee.department?.name ?? '',
        netPay: Number(e.netPay),
        variancePercent: Number(e.variancePercent),
        exceptionNote: e.exceptionNote,
      })),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ORA-5: Bulk Salary Revisions
  // ══════════════════════════════════════════════════════════════════════════

  async bulkCreateRevisions(companyId: string, revisions: any[]) {
    const results: { index: number; success: boolean; data?: any; error?: string }[] = [];

    for (let i = 0; i < revisions.length; i++) {
      try {
        const revision = await this.createRevision(companyId, revisions[i]);
        results.push({ index: i, success: true, data: revision });
      } catch (err: any) {
        results.push({ index: i, success: false, error: err.message ?? 'Unknown error' });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    return { total: revisions.length, successCount, failureCount, results };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ORA-12: GL Journal Export
  // ══════════════════════════════════════════════════════════════════════════

  async getGLJournalExport(companyId: string, month: number, year: number) {
    const run = await platformPrisma.payrollRun.findUnique({
      where: { companyId_month_year: { companyId, month, year } },
    });
    if (!run) {
      throw ApiError.notFound(`No payroll run found for ${month}/${year}`);
    }

    const entries = await platformPrisma.payrollEntry.findMany({
      where: { payrollRunId: run.id },
      include: {
        employee: {
          select: {
            employeeId: true,
            firstName: true,
            lastName: true,
            costCentre: { select: { code: true, name: true, glAccountCode: true } },
          },
        },
      },
    });

    // Group by cost centre code
    const byCostCentre = new Map<string, {
      costCentreCode: string;
      costCentreName: string;
      glAccountCode: string | null;
      totalGross: number;
      totalDeductions: number;
      totalNet: number;
      pfEmployee: number;
      pfEmployer: number;
      esiEmployee: number;
      esiEmployer: number;
      ptAmount: number;
      tdsAmount: number;
      lwfEmployee: number;
      lwfEmployer: number;
      employeeCount: number;
    }>();

    for (const entry of entries) {
      const cc = entry.employee.costCentre;
      const ccCode = cc?.code ?? 'UNASSIGNED';
      const ccName = cc?.name ?? 'Unassigned';
      const glCode = cc?.glAccountCode ?? null;

      if (!byCostCentre.has(ccCode)) {
        byCostCentre.set(ccCode, {
          costCentreCode: ccCode,
          costCentreName: ccName,
          glAccountCode: glCode,
          totalGross: 0,
          totalDeductions: 0,
          totalNet: 0,
          pfEmployee: 0,
          pfEmployer: 0,
          esiEmployee: 0,
          esiEmployer: 0,
          ptAmount: 0,
          tdsAmount: 0,
          lwfEmployee: 0,
          lwfEmployer: 0,
          employeeCount: 0,
        });
      }

      const group = byCostCentre.get(ccCode)!;
      group.totalGross += Number(entry.grossEarnings);
      group.totalDeductions += Number(entry.totalDeductions);
      group.totalNet += Number(entry.netPay);
      group.pfEmployee += Number(entry.pfEmployee ?? 0);
      group.pfEmployer += Number(entry.pfEmployer ?? 0);
      group.esiEmployee += Number(entry.esiEmployee ?? 0);
      group.esiEmployer += Number(entry.esiEmployer ?? 0);
      group.ptAmount += Number(entry.ptAmount ?? 0);
      group.tdsAmount += Number(entry.tdsAmount ?? 0);
      group.lwfEmployee += Number(entry.lwfEmployee ?? 0);
      group.lwfEmployer += Number(entry.lwfEmployer ?? 0);
      group.employeeCount++;
    }

    // Round all amounts
    const costCentres = Array.from(byCostCentre.values()).map((g) => ({
      ...g,
      totalGross: round(g.totalGross),
      totalDeductions: round(g.totalDeductions),
      totalNet: round(g.totalNet),
      pfEmployee: round(g.pfEmployee),
      pfEmployer: round(g.pfEmployer),
      esiEmployee: round(g.esiEmployee),
      esiEmployer: round(g.esiEmployer),
      ptAmount: round(g.ptAmount),
      tdsAmount: round(g.tdsAmount),
      lwfEmployee: round(g.lwfEmployee),
      lwfEmployer: round(g.lwfEmployer),
    }));

    return {
      month,
      year,
      runId: run.id,
      status: run.status,
      totalGross: round(Number(run.totalGross)),
      totalDeductions: round(Number(run.totalDeductions)),
      totalNet: round(Number(run.totalNet)),
      costCentres,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RED-4: Form 16 & 24Q Generation
  // ══════════════════════════════════════════════════════════════════════════

  async generateForm16(companyId: string, financialYear: string) {
    // Parse FY string e.g. "2025-26" → Apr 2025 to Mar 2026
    const startYearStr = financialYear.split('-')[0]!;
    const startYear = parseInt(startYearStr, 10);
    const endYear = startYear + 1;

    // FY months: Apr (4) of startYear through Mar (3) of endYear
    const fyMonths: { month: number; year: number }[] = [];
    for (let m = 4; m <= 12; m++) fyMonths.push({ month: m, year: startYear });
    for (let m = 1; m <= 3; m++) fyMonths.push({ month: m, year: endYear });

    // Fetch all DISBURSED/ARCHIVED payroll runs for the FY
    const runs = await platformPrisma.payrollRun.findMany({
      where: {
        companyId,
        status: { in: ['DISBURSED', 'ARCHIVED'] },
        OR: fyMonths.map((fm) => ({ month: fm.month, year: fm.year })),
      },
      select: { id: true, month: true, year: true },
    });

    if (runs.length === 0) {
      throw ApiError.notFound(`No disbursed payroll runs found for FY ${financialYear}`);
    }

    const runIds = runs.map((r) => r.id);

    // Fetch all payroll entries across those runs with employee details
    const entries = await platformPrisma.payrollEntry.findMany({
      where: { payrollRunId: { in: runIds } },
      include: {
        payrollRun: { select: { month: true, year: true } },
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            panNumber: true,
            aadhaarNumber: true,
            department: { select: { name: true } },
            designation: { select: { name: true } },
          },
        },
      },
    });

    // Fetch IT declarations for the FY (submitted or verified)
    const itDeclarations = await platformPrisma.iTDeclaration.findMany({
      where: {
        companyId,
        financialYear,
        status: { in: ['SUBMITTED', 'VERIFIED'] },
      },
    });
    const itDeclByEmployee = new Map(itDeclarations.map((d) => [d.employeeId, d]));

    // Fetch company info
    const company = await platformPrisma.company.findUnique({
      where: { id: companyId },
      select: { displayName: true, legalName: true, pan: true, tan: true, registeredAddress: true },
    });
    if (!company) throw ApiError.notFound('Company not found');

    // Aggregate per employee: monthly breakdown
    const employeeMap = new Map<string, {
      employee: any;
      monthlyBreakdown: { month: number; year: number; gross: number; pf: number; esi: number; pt: number; tds: number; lwf: number; net: number }[];
      totalGross: number;
      totalPF: number;
      totalESI: number;
      totalPT: number;
      totalTDS: number;
      totalLWF: number;
      totalNet: number;
    }>();

    for (const entry of entries) {
      const empId = entry.employeeId;
      if (!employeeMap.has(empId)) {
        employeeMap.set(empId, {
          employee: entry.employee,
          monthlyBreakdown: [],
          totalGross: 0,
          totalPF: 0,
          totalESI: 0,
          totalPT: 0,
          totalTDS: 0,
          totalLWF: 0,
          totalNet: 0,
        });
      }

      const agg = employeeMap.get(empId)!;
      const gross = Number(entry.grossEarnings);
      const pf = Number(entry.pfEmployee ?? 0);
      const esi = Number(entry.esiEmployee ?? 0);
      const pt = Number(entry.ptAmount ?? 0);
      const tds = Number(entry.tdsAmount ?? 0);
      const lwf = Number(entry.lwfEmployee ?? 0);
      const net = Number(entry.netPay);

      agg.monthlyBreakdown.push({
        month: entry.payrollRun.month,
        year: entry.payrollRun.year,
        gross: round(gross),
        pf: round(pf),
        esi: round(esi),
        pt: round(pt),
        tds: round(tds),
        lwf: round(lwf),
        net: round(net),
      });

      agg.totalGross += gross;
      agg.totalPF += pf;
      agg.totalESI += esi;
      agg.totalPT += pt;
      agg.totalTDS += tds;
      agg.totalLWF += lwf;
      agg.totalNet += net;
    }

    // Build Form 16 Part B records per employee
    const form16Records = Array.from(employeeMap.entries()).map(([empId, agg]) => {
      const decl = itDeclByEmployee.get(empId);

      // Standard deduction (Section 16): ₹50,000 under new regime, ₹50,000 under old
      const standardDeduction = 50000;

      // Chapter VI-A deductions from IT declarations
      let chapterVIA = 0;
      if (decl) {
        const s80c = (decl.section80C as any)?.total ?? 0;
        const s80ccd = ((decl.section80CCD as any)?.npsEmployee ?? 0) + ((decl.section80CCD as any)?.npsAdditional ?? 0);
        const s80d = ((decl.section80D as any)?.selfPremium ?? 0) + ((decl.section80D as any)?.parentPremium ?? 0);
        const s80e = (decl.section80E as any)?.educationLoanInterest ?? 0;
        const s80g = (decl.section80G as any)?.donations ?? 0;
        const s80gg = (decl.section80GG as any)?.rentPaid ?? 0;
        const s80tta = (decl.section80TTA as any)?.savingsInterest ?? 0;
        chapterVIA = s80c + s80ccd + s80d + s80e + s80g + s80gg + s80tta;
      }

      const hraExemption = (decl?.hraExemption as any)?.rentPaid ? Number((decl?.hraExemption as any).rentPaid) : 0;
      const ltaExemption = (decl?.ltaExemption as any)?.travelCost ? Number((decl?.ltaExemption as any).travelCost) : 0;
      const homeLoanInterest = (decl?.homeLoanInterest as any)?.interestAmount ? Number((decl?.homeLoanInterest as any).interestAmount) : 0;
      const otherIncome = decl?.otherIncome
        ? ((decl.otherIncome as any)?.interestIncome ?? 0) + ((decl.otherIncome as any)?.rentalIncome ?? 0) + ((decl.otherIncome as any)?.otherSources ?? 0)
        : 0;

      const grossSalary = round(agg.totalGross);
      const exemptions = round(hraExemption + ltaExemption);
      const incomeFromSalary = round(grossSalary - exemptions - standardDeduction);
      const grossTotalIncome = round(incomeFromSalary + otherIncome - homeLoanInterest);
      const netTaxableIncome = round(Math.max(grossTotalIncome - chapterVIA, 0));
      const totalTDSDeducted = round(agg.totalTDS);

      return {
        employeeId: agg.employee.employeeId,
        employeeName: `${agg.employee.firstName} ${agg.employee.lastName}`,
        pan: agg.employee.panNumber ?? '',
        aadhaar: agg.employee.aadhaarNumber ?? '',
        department: agg.employee.department?.name ?? '',
        designation: agg.employee.designation?.name ?? '',
        regime: decl?.regime ?? 'NEW',
        financialYear,
        assessmentYear: `${endYear}-${String(endYear + 1).slice(2)}`,
        employer: {
          name: company.legalName ?? company.displayName,
          pan: company.pan ?? '',
          tan: company.tan ?? '',
          address: company.registeredAddress ?? {},
        },
        partB: {
          grossSalary,
          exemptions: round(exemptions),
          standardDeduction,
          incomeFromSalary: round(Math.max(incomeFromSalary, 0)),
          otherIncome: round(otherIncome),
          homeLoanInterest: round(homeLoanInterest),
          grossTotalIncome: round(Math.max(grossTotalIncome, 0)),
          chapterVIADeductions: round(chapterVIA),
          netTaxableIncome,
          totalTDSDeducted,
        },
        monthlyBreakdown: agg.monthlyBreakdown.sort((a, b) => a.year - b.year || a.month - b.month),
        totals: {
          gross: grossSalary,
          pf: round(agg.totalPF),
          esi: round(agg.totalESI),
          pt: round(agg.totalPT),
          tds: totalTDSDeducted,
          lwf: round(agg.totalLWF),
          net: round(agg.totalNet),
        },
      };
    });

    // Create StatutoryFiling record
    const filing = await platformPrisma.statutoryFiling.create({
      data: {
        type: 'FORM_16',
        year: startYear,
        status: 'GENERATED',
        companyId,
        details: {
          financialYear,
          assessmentYear: `${endYear}-${String(endYear + 1).slice(2)}`,
          employeeCount: form16Records.length,
          generatedAt: new Date().toISOString(),
        },
      },
    });

    return {
      filingId: filing.id,
      financialYear,
      assessmentYear: `${endYear}-${String(endYear + 1).slice(2)}`,
      employeeCount: form16Records.length,
      employer: {
        name: company.legalName ?? company.displayName,
        pan: company.pan ?? '',
        tan: company.tan ?? '',
      },
      records: form16Records,
    };
  }

  async generateForm24Q(companyId: string, quarter: number, financialYear: string) {
    // Parse FY string e.g. "2025-26" → startYear=2025
    const startYearStr = financialYear.split('-')[0]!;
    const startYear = parseInt(startYearStr, 10);
    const endYear = startYear + 1;

    // Map quarter to FY months
    const quarterMonths: Record<number, { month: number; year: number }[]> = {
      1: [{ month: 4, year: startYear }, { month: 5, year: startYear }, { month: 6, year: startYear }],
      2: [{ month: 7, year: startYear }, { month: 8, year: startYear }, { month: 9, year: startYear }],
      3: [{ month: 10, year: startYear }, { month: 11, year: startYear }, { month: 12, year: startYear }],
      4: [{ month: 1, year: endYear }, { month: 2, year: endYear }, { month: 3, year: endYear }],
    };

    const months = quarterMonths[quarter]!;

    // Fetch payroll runs for the quarter months
    const runs = await platformPrisma.payrollRun.findMany({
      where: {
        companyId,
        status: { in: ['DISBURSED', 'ARCHIVED'] },
        OR: months.map((fm) => ({ month: fm.month, year: fm.year })),
      },
      select: { id: true, month: true, year: true },
    });

    if (runs.length === 0) {
      throw ApiError.notFound(`No disbursed payroll runs found for Q${quarter} of FY ${financialYear}`);
    }

    const runIds = runs.map((r) => r.id);

    // Fetch all payroll entries for the quarter
    const entries = await platformPrisma.payrollEntry.findMany({
      where: { payrollRunId: { in: runIds } },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            panNumber: true,
          },
        },
      },
    });

    // Fetch company TAN
    const company = await platformPrisma.company.findUnique({
      where: { id: companyId },
      select: { legalName: true, displayName: true, tan: true },
    });
    if (!company) throw ApiError.notFound('Company not found');

    // Aggregate per employee
    const employeeMap = new Map<string, {
      employee: any;
      totalAmountPaid: number;
      totalTDSDeducted: number;
      totalTDSDeposited: number; // same as deducted for generated data
    }>();

    for (const entry of entries) {
      const empId = entry.employeeId;
      if (!employeeMap.has(empId)) {
        employeeMap.set(empId, {
          employee: entry.employee,
          totalAmountPaid: 0,
          totalTDSDeducted: 0,
          totalTDSDeposited: 0,
        });
      }

      const agg = employeeMap.get(empId)!;
      agg.totalAmountPaid += Number(entry.grossEarnings);
      agg.totalTDSDeducted += Number(entry.tdsAmount ?? 0);
      agg.totalTDSDeposited += Number(entry.tdsAmount ?? 0); // assume deposited = deducted
    }

    // Build NSDL-format-like deductee records
    const deducteeRecords = Array.from(employeeMap.values()).map((agg) => ({
      employeeId: agg.employee.employeeId,
      employeeName: `${agg.employee.firstName} ${agg.employee.lastName}`,
      pan: agg.employee.panNumber ?? '',
      totalAmountPaid: round(agg.totalAmountPaid),
      totalTDSDeducted: round(agg.totalTDSDeducted),
      totalTDSDeposited: round(agg.totalTDSDeposited),
      section: '192', // TDS on salary
      dateOfPayment: '', // varies per month, left blank for aggregate
      dateOfDeduction: '',
    }));

    const totalAmountPaid = round(deducteeRecords.reduce((sum, r) => sum + r.totalAmountPaid, 0));
    const totalTDSDeducted = round(deducteeRecords.reduce((sum, r) => sum + r.totalTDSDeducted, 0));
    const totalTDSDeposited = round(deducteeRecords.reduce((sum, r) => sum + r.totalTDSDeposited, 0));

    // Create StatutoryFiling record
    const filing = await platformPrisma.statutoryFiling.create({
      data: {
        type: 'TDS_24Q',
        year: startYear,
        status: 'GENERATED',
        amount: totalTDSDeducted,
        companyId,
        details: {
          financialYear,
          quarter,
          deducteeCount: deducteeRecords.length,
          totalAmountPaid,
          totalTDSDeducted,
          totalTDSDeposited,
          generatedAt: new Date().toISOString(),
        },
      },
    });

    return {
      filingId: filing.id,
      financialYear,
      quarter,
      formType: '24Q',
      deductorTAN: company.tan ?? '',
      deductorName: company.legalName ?? company.displayName,
      deducteeCount: deducteeRecords.length,
      totalAmountPaid,
      totalTDSDeducted,
      totalTDSDeposited,
      deducteeRecords,
    };
  }

  async bulkEmailForm16(companyId: string, financialYear: string) {
    // Parse FY for year field
    const startYearStr = financialYear.split('-')[0]!;
    const startYear = parseInt(startYearStr, 10);

    // Create a StatutoryFiling record to track the bulk email dispatch
    const filing = await platformPrisma.statutoryFiling.create({
      data: {
        type: 'FORM_16',
        year: startYear,
        status: 'FILED',
        companyId,
        filedAt: new Date(),
        details: {
          financialYear,
          action: 'BULK_EMAIL',
          dispatchedAt: new Date().toISOString(),
        },
      },
    });

    return {
      filingId: filing.id,
      financialYear,
      status: 'FILED',
      message: `Form 16 bulk email dispatch initiated for FY ${financialYear}`,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Helpers
  // ══════════════════════════════════════════════════════════════════════════

  private async getRunAndValidateStatus(companyId: string, runId: string, expectedStatus: string) {
    const run = await platformPrisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run || run.companyId !== companyId) {
      throw ApiError.notFound('Payroll run not found');
    }
    if (run.status !== expectedStatus) {
      throw ApiError.badRequest(
        `Payroll run must be in ${expectedStatus} status (current: ${run.status})`
      );
    }
    return run;
  }
}

export const payrollRunService = new PayrollRunService();
