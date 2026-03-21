import { Prisma } from '@prisma/client';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { essService } from '../ess/ess.service';

/** Convert undefined to null for Prisma nullable fields. */
function n<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
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
          select: { emiAmount: true },
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

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;
    let employeeCount = 0;

    // Delete any existing entries for re-computation
    await platformPrisma.payrollEntry.deleteMany({ where: { payrollRunId: runId } });

    const entriesToCreate: any[] = [];

    for (const emp of employees) {
      const salary = emp.salaryRecords[0];
      if (!salary) continue; // Skip employees without salary

      const monthlyGross = Number(salary.monthlyGross ?? 0) || Number(salary.annualCtc) / 12;
      const components = salary.components as Record<string, number>;

      // Get attendance for the month
      const attendanceRecords = await platformPrisma.attendanceRecord.findMany({
        where: {
          employeeId: emp.id,
          companyId,
          date: { gte: monthStart, lt: monthEnd },
        },
        select: { status: true, overtimeHours: true },
      });

      let presentDays = 0;
      let lopDays = 0;
      let otHours = 0;

      for (const rec of attendanceRecords) {
        if (rec.status === 'PRESENT' || rec.status === 'LATE') {
          presentDays++;
        } else if (rec.status === 'HALF_DAY') {
          presentDays += 0.5;
          lopDays += 0.5;
        } else if (rec.status === 'LOP') {
          lopDays++;
        } else if (rec.status === 'ON_LEAVE' || rec.status === 'HOLIDAY' || rec.status === 'WEEK_OFF') {
          presentDays++; // Paid leave / holiday / week off counts as present
        } else if (rec.status === 'ABSENT') {
          lopDays++;
        }
        if (rec.overtimeHours) otHours += Number(rec.overtimeHours);
      }

      // If no attendance records, assume full working days (first run scenario)
      if (attendanceRecords.length === 0) {
        presentDays = totalWorkingDays;
        lopDays = 0;
      }

      // Pro-rate for new hires
      if (emp.joiningDate >= monthStart && emp.joiningDate < monthEnd) {
        const joiningDay = emp.joiningDate.getDate();
        const daysInMonth = new Date(run.year, run.month, 0).getDate();
        const effectiveDays = daysInMonth - joiningDay + 1;
        // If no attendance logged yet, use pro-rated working days
        if (attendanceRecords.length === 0) {
          presentDays = Math.round((totalWorkingDays * effectiveDays / daysInMonth) * 10) / 10;
        }
      }

      // Compute earnings with LOP deduction
      const earnings: Record<string, number> = {};
      let grossEarnings = 0;
      for (const [code, amount] of Object.entries(components)) {
        const effectiveAmount = lopDays > 0
          ? Math.round((amount - (amount * lopDays / totalWorkingDays)) * 100) / 100
          : amount;
        if (effectiveAmount > 0) {
          earnings[code] = effectiveAmount;
          grossEarnings += effectiveAmount;
        }
      }

      // Overtime
      let overtimeAmount = 0;
      if (otHours > 0 && otRule) {
        const basicComponent = Object.entries(components).find(([code]) =>
          code.toLowerCase().includes('basic')
        );
        const basicPerDay = basicComponent
          ? basicComponent[1] / totalWorkingDays
          : monthlyGross / totalWorkingDays;
        const ratePerHour = basicPerDay / 8; // 8-hour workday assumption
        overtimeAmount = Math.round(otHours * ratePerHour * Number(otRule.rateMultiplier) * 100) / 100;
        grossEarnings += overtimeAmount;
      }

      // Loan EMI deductions
      let loanDeduction = 0;
      for (const loan of emp.loans) {
        loanDeduction += Number(loan.emiAmount);
      }

      // Standard deductions (non-statutory for now; statutory done in step 4)
      const deductions: Record<string, number> = {};
      let totalDed = loanDeduction;

      // Check salary hold
      const hold = holdMap.get(emp.id);
      const isException = !!hold;
      let exceptionNote = hold
        ? `Salary ${hold.holdType} hold: ${hold.reason}`
        : undefined;

      // Variance calculation
      const netPay = Math.round((grossEarnings - totalDed) * 100) / 100;
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

    // Update run totals
    const updatedRun = await platformPrisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'COMPUTED',
        computedAt: new Date(),
        totalGross: Math.round(totalGross * 100) / 100,
        totalDeductions: Math.round(totalDeductions * 100) / 100,
        totalNet: Math.round(totalNet * 100) / 100,
        employeeCount,
      },
    });

    return updatedRun;
  }

  // Step 4 — Statutory Deductions
  async computeStatutory(companyId: string, runId: string) {
    const run = await this.getRunAndValidateStatus(companyId, runId, 'COMPUTED');

    // Fetch all configs upfront
    const [pfConfig, esiConfig, ptConfigs, lwfConfigs] = await Promise.all([
      platformPrisma.pFConfig.findUnique({ where: { companyId } }),
      platformPrisma.eSIConfig.findUnique({ where: { companyId } }),
      platformPrisma.pTConfig.findMany({ where: { companyId } }),
      platformPrisma.lWFConfig.findMany({ where: { companyId } }),
    ]);

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
        // PF wage = sum of PF-included components, capped at wage ceiling
        // For simplicity, use Basic as PF wage, capped at ceiling
        const basicAmount = Object.entries(earningsObj).find(([code]) =>
          code.toLowerCase().includes('basic')
        )?.[1] ?? 0;
        const pfWage = Math.min(basicAmount, wageCeiling);

        pfEmployee = Math.round(pfWage * Number(pfConfig.employeeRate) / 100 * 100) / 100;

        const epf = Math.round(pfWage * Number(pfConfig.employerEpfRate) / 100 * 100) / 100;
        const eps = Math.round(pfWage * Number(pfConfig.employerEpsRate) / 100 * 100) / 100;
        const edli = Math.round(pfWage * Number(pfConfig.employerEdliRate) / 100 * 100) / 100;
        pfEmployer = epf + eps + edli;
      }

      // 2. ESI Calculation
      if (esiConfig && empType.esiApplicable) {
        const esiCeiling = Number(esiConfig.wageCeiling);
        if (grossEarnings <= esiCeiling) {
          esiEmployee = Math.round(grossEarnings * Number(esiConfig.employeeRate) / 100 * 100) / 100;
          esiEmployer = Math.round(grossEarnings * Number(esiConfig.employerRate) / 100 * 100) / 100;
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

      // 4. TDS — simplified monthly projection (annual tax / 12)
      // Placeholder: compute basic tax using annual gross
      const annualGross = grossEarnings * 12;
      if (annualGross > 400000) { // Threshold for new regime
        // Simple slab calculation for new regime
        let annualTax = 0;
        if (annualGross > 2400000) annualTax += (annualGross - 2400000) * 0.30;
        if (annualGross > 2000000) annualTax += Math.min(annualGross - 2000000, 400000) * 0.25;
        if (annualGross > 1600000) annualTax += Math.min(annualGross - 1600000, 400000) * 0.20;
        if (annualGross > 1200000) annualTax += Math.min(annualGross - 1200000, 400000) * 0.15;
        if (annualGross > 800000) annualTax += Math.min(annualGross - 800000, 400000) * 0.10;
        if (annualGross > 400000) annualTax += Math.min(annualGross - 400000, 400000) * 0.05;
        // Add 4% cess
        annualTax = annualTax * 1.04;
        tdsAmount = Math.round(annualTax / 12 * 100) / 100;
      }

      // 5. LWF
      if (state && lwfByState.has(state)) {
        const lwf = lwfByState.get(state)!;
        lwfEmployee = lwf.employeeAmount;
        lwfEmployer = lwf.employerAmount;
      }

      // Update entry with statutory amounts
      const statutoryDeductions = pfEmployee + esiEmployee + ptAmount + tdsAmount + lwfEmployee;
      const totalDeductions = Number(entry.loanDeduction ?? 0) + statutoryDeductions;
      const netPay = Math.round((grossEarnings - totalDeductions) * 100) / 100;

      const employerContributions: Record<string, number> = {};
      if (pfEmployer > 0) employerContributions.PF_EMPLOYER = pfEmployer;
      if (esiEmployer > 0) employerContributions.ESI_EMPLOYER = esiEmployer;
      if (lwfEmployer > 0) employerContributions.LWF_EMPLOYER = lwfEmployer;

      await platformPrisma.payrollEntry.update({
        where: { id: entry.id },
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

    // Update run totals
    const updatedRun = await platformPrisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'STATUTORY_DONE',
        totalDeductions: Math.round(runTotalDeductions * 100) / 100,
        totalNet: Math.round(runTotalNet * 100) / 100,
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

    // Verify run is in a state that allows overrides (COMPUTED or STATUTORY_DONE)
    const run = await platformPrisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run || !['COMPUTED', 'STATUTORY_DONE'].includes(run.status)) {
      throw ApiError.badRequest('Payroll run must be in COMPUTED or STATUTORY_DONE status to override entries');
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
    const netPay = Math.round((grossEarnings - deductionTotal) * 100) / 100;

    return platformPrisma.payrollEntry.update({
      where: { id: entryId },
      data: {
        earnings: newEarnings,
        deductions: newDeductions,
        grossEarnings: Math.round(grossEarnings * 100) / 100,
        totalDeductions: Math.round(deductionTotal * 100) / 100,
        netPay,
        isException: true,
        exceptionNote: data.exceptionNote ?? entry.exceptionNote ?? 'Manual override applied',
      },
    });
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

    const entries = await platformPrisma.payrollEntry.findMany({
      where: {
        payrollRunId: runId,
        employeeId: { notIn: fullHoldEmployeeIds },
      },
      select: { employeeId: true },
    });

    // Upsert payslips
    const payslipData = entries.map((e) => ({
      payrollRunId: runId,
      employeeId: e.employeeId,
      month: run.month,
      year: run.year,
      companyId,
    }));

    // Delete existing payslips for this run and recreate
    await platformPrisma.payslip.deleteMany({ where: { payrollRunId: runId } });
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
            arrearComponents[code] = Math.round(diff * 100) / 100;
            monthArrear += diff;
          }
        }
      } else {
        // Flat difference
        arrearComponents['CTC_DIFF'] = Math.round(diffMonthly * 100) / 100;
        monthArrear = diffMonthly;
      }

      if (monthArrear > 0) {
        arrearEntries.push({
          companyId,
          employeeId: revision.employeeId,
          revisionId: id,
          forMonth: arrearMonth,
          forYear: arrearYear,
          components: arrearComponents,
          totalAmount: Math.round(monthArrear * 100) / 100,
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
        where: { employeeId: revision.employeeId, companyId, isCurrent: true },
        data: { isCurrent: false, effectiveTo: new Date() },
      });

      // Create new salary record
      const newComponentsData = (revision.newComponents as Record<string, number>) ?? {};
      await tx.employeeSalary.create({
        data: {
          companyId,
          employeeId: revision.employeeId,
          structureId: currentSalary.structureId,
          annualCtc: Number(revision.newCtc),
          monthlyGross: Math.round(newMonthly * 100) / 100,
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
          totalArrears: Math.round(totalArrears * 100) / 100,
        },
      });
    });

    return this.getRevision(companyId, id);
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
      totalEmployee: Math.round(totalEmployee * 100) / 100,
      totalEmployer: Math.round(totalEmployer * 100) / 100,
      totalESI: Math.round((totalEmployee + totalEmployer) * 100) / 100,
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
      totalPT: Math.round(totalPT * 100) / 100,
      byState: Object.fromEntries(
        Array.from(byState.entries()).map(([state, data]) => [
          state,
          { count: data.count, total: Math.round(data.total * 100) / 100 },
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
