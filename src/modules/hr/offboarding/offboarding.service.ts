import { Prisma, SeparationType, ExitStatus, ClearanceStatus, FnFStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { generateNextNumber } from '../../../shared/utils/number-series';
import { getCachedCompanySettings } from '../../../shared/utils/config-cache';
import { essService } from '../ess/ess.service';

/** Convert undefined to null for Prisma nullable fields. */
function n<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

interface ListOptions {
  page?: number | undefined;
  limit?: number | undefined;
  status?: string | undefined;
}

// Default clearance departments auto-created on exit initiation
const DEFAULT_CLEARANCE_DEPARTMENTS = ['IT', 'ADMIN', 'FINANCE', 'HR', 'LIBRARY'];

// Default clearance items per department
const DEPARTMENT_CLEARANCE_ITEMS: Record<string, string[]> = {
  IT: ['Laptop/Desktop', 'ID Card/Access Card', 'Email Account Deactivation', 'VPN/Software Licenses', 'Data Backup'],
  ADMIN: ['Office Keys', 'Parking Pass', 'Company Property', 'Stationery', 'Uniform'],
  FINANCE: ['Expense Settlements', 'Travel Advances', 'Petty Cash', 'Corporate Credit Card'],
  HR: ['Leave Balance Settlement', 'Policy Documents', 'NDA/Non-compete Acknowledgement', 'Experience Letter'],
  LIBRARY: ['Books/Journals', 'Reference Material', 'Training Material'],
};

// Gratuity cap as per Payment of Gratuity Act
const GRATUITY_CAP = 2000000; // 20 Lakhs

export class OffboardingService {
  // ════════════════════════════════════════════════════════════════════
  // EXIT REQUESTS
  // ════════════════════════════════════════════════════════════════════

  async listExitRequests(companyId: string, options: ListOptions = {}) {
    const { page = 1, limit = 25, status } = options;
    const offset = (page - 1) * limit;

    const where: Prisma.ExitRequestWhereInput = { companyId };
    if (status) {
      where.status = status as ExitStatus;
    }

    const [exitRequests, total] = await Promise.all([
      platformPrisma.exitRequest.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              employeeId: true,
              firstName: true,
              lastName: true,
              departmentId: true,
              department: { select: { id: true, name: true } },
              designation: { select: { id: true, name: true } },
            },
          },
          _count: { select: { clearances: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.exitRequest.count({ where }),
    ]);

    return { exitRequests, total, page, limit };
  }

  async getExitRequest(companyId: string, id: string) {
    const exitRequest = await platformPrisma.exitRequest.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            joiningDate: true,
            noticePeriodDays: true,
            department: { select: { id: true, name: true } },
            designation: { select: { id: true, name: true } },
            grade: { select: { id: true, name: true } },
          },
        },
        clearances: { orderBy: { department: 'asc' } },
        exitInterview: true,
        fnfSettlement: true,
      },
    });

    if (!exitRequest || exitRequest.companyId !== companyId) {
      throw ApiError.notFound('Exit request not found');
    }

    return exitRequest;
  }

  async createExitRequest(
    companyId: string,
    data: {
      employeeId: string;
      separationType: SeparationType;
      resignationDate?: string | undefined;
      noticePeriodWaiver?: boolean | undefined;
      exitInterviewNotes?: string | undefined;
    },
    initiatedBy?: string | undefined,
  ) {
    // Verify employee exists and belongs to company
    const employee = await platformPrisma.employee.findFirst({
      where: { id: data.employeeId, companyId },
      include: {
        grade: true,
        designation: true,
      },
    });

    if (!employee) {
      throw ApiError.notFound('Employee not found');
    }

    if (employee.status === 'EXITED') {
      throw ApiError.badRequest('Employee has already exited');
    }

    // Check for existing active exit request
    const existing = await platformPrisma.exitRequest.findFirst({
      where: {
        employeeId: data.employeeId,
        companyId,
        status: { notIn: ['COMPLETED', 'FNF_PAID'] },
      },
    });

    if (existing) {
      throw ApiError.badRequest('An active exit request already exists for this employee');
    }

    // Calculate notice period and last working date
    const noticePeriodDays = employee.noticePeriodDays ?? 30; // default 30 days
    let lastWorkingDate: Date | null = null;
    const resignationDate = data.resignationDate ? new Date(data.resignationDate) : new Date();

    if (data.noticePeriodWaiver) {
      // If waiver, last working date is resignation date
      lastWorkingDate = resignationDate;
    } else {
      // Last working date = resignation date + notice period days
      lastWorkingDate = new Date(resignationDate);
      lastWorkingDate.setDate(lastWorkingDate.getDate() + noticePeriodDays);
    }

    // Generate exit number from Number Series
    const exitNumber = await generateNextNumber(
      platformPrisma, companyId, ['Offboarding', 'Exit Request'], 'Exit Request',
    );

    // Create exit request + clearance records in a transaction
    const exitRequest = await platformPrisma.$transaction(async (tx) => {
      // 1. Create exit request
      const request = await tx.exitRequest.create({
        data: {
          exitNumber,
          employeeId: data.employeeId,
          separationType: data.separationType,
          resignationDate: resignationDate,
          lastWorkingDate: lastWorkingDate,
          noticePeriodDays: noticePeriodDays,
          noticePeriodWaiver: data.noticePeriodWaiver ?? false,
          exitInterviewNotes: n(data.exitInterviewNotes),
          status: 'INITIATED',
          initiatedBy: n(initiatedBy),
          companyId,
        },
      });

      // 2. Auto-create clearance records for each department
      const clearanceData = DEFAULT_CLEARANCE_DEPARTMENTS.map((dept) => ({
        exitRequestId: request.id,
        department: dept,
        items: (DEPARTMENT_CLEARANCE_ITEMS[dept] || []).map((item) => ({
          item,
          status: 'PENDING',
          notes: '',
        })),
        status: 'PENDING' as ClearanceStatus,
        companyId,
      }));

      await tx.exitClearance.createMany({ data: clearanceData });

      // 3. Update employee status to ON_NOTICE
      await tx.employee.update({
        where: { id: data.employeeId },
        data: {
          status: 'ON_NOTICE',
          lastWorkingDate: lastWorkingDate,
          exitReason: data.separationType,
        },
      });

      // 4. Add timeline event
      await tx.employeeTimeline.create({
        data: {
          employeeId: data.employeeId,
          eventType: 'RESIGNED',
          title: `Exit Initiated — ${data.separationType.replace(/_/g, ' ')}`,
          description: `Separation type: ${data.separationType}. Notice period: ${noticePeriodDays} days. Last working date: ${lastWorkingDate?.toISOString().split('T')[0]}.`,
          performedBy: n(initiatedBy),
          eventData: {
            exitRequestId: request.id,
            separationType: data.separationType,
            resignationDate: resignationDate.toISOString(),
            lastWorkingDate: lastWorkingDate?.toISOString(),
            noticePeriodWaiver: data.noticePeriodWaiver ?? false,
          },
        },
      });

      return request;
    });

    // Wire approval workflow
    await essService.createRequest(companyId, {
      requesterId: data.employeeId,
      entityType: 'ExitRequest',
      entityId: exitRequest.id,
      triggerEvent: 'RESIGNATION',
      data: { separationType: data.separationType, employeeId: data.employeeId },
    });

    // Return full exit request with relations
    return this.getExitRequest(companyId, exitRequest.id);
  }

  async updateExitRequest(
    companyId: string,
    id: string,
    data: {
      lastWorkingDate?: string | undefined;
      noticePeriodWaiver?: boolean | undefined;
      waiverAmount?: number | undefined;
      exitInterviewDone?: boolean | undefined;
      exitInterviewNotes?: string | undefined;
      knowledgeTransferDone?: boolean | undefined;
      status?: ExitStatus | undefined;
    },
  ) {
    const existing = await platformPrisma.exitRequest.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Exit request not found');
    }

    const updateData: Prisma.ExitRequestUpdateInput = {};
    if (data.lastWorkingDate !== undefined) updateData.lastWorkingDate = new Date(data.lastWorkingDate);
    if (data.noticePeriodWaiver !== undefined) updateData.noticePeriodWaiver = data.noticePeriodWaiver;
    if (data.waiverAmount !== undefined) updateData.waiverAmount = new Prisma.Decimal(data.waiverAmount);
    if (data.exitInterviewDone !== undefined) updateData.exitInterviewDone = data.exitInterviewDone;
    if (data.exitInterviewNotes !== undefined) updateData.exitInterviewNotes = n(data.exitInterviewNotes);
    if (data.knowledgeTransferDone !== undefined) updateData.knowledgeTransferDone = data.knowledgeTransferDone;
    if (data.status !== undefined) updateData.status = data.status;

    await platformPrisma.exitRequest.update({ where: { id }, data: updateData });

    return this.getExitRequest(companyId, id);
  }

  // ════════════════════════════════════════════════════════════════════
  // CLEARANCES
  // ════════════════════════════════════════════════════════════════════

  async listClearances(companyId: string, exitRequestId: string) {
    // Verify exit request belongs to company
    const exitRequest = await platformPrisma.exitRequest.findUnique({ where: { id: exitRequestId } });
    if (!exitRequest || exitRequest.companyId !== companyId) {
      throw ApiError.notFound('Exit request not found');
    }

    return platformPrisma.exitClearance.findMany({
      where: { exitRequestId, companyId },
      orderBy: { department: 'asc' },
    });
  }

  async updateClearance(
    companyId: string,
    id: string,
    data: {
      status: ClearanceStatus;
      clearedBy?: string | undefined;
      items?: Array<{ item: string; status: string; notes?: string | undefined }> | undefined;
    },
  ) {
    const clearance = await platformPrisma.exitClearance.findUnique({
      where: { id },
      include: { exitRequest: true },
    });

    if (!clearance || clearance.companyId !== companyId) {
      throw ApiError.notFound('Clearance record not found');
    }

    const updateData: Prisma.ExitClearanceUpdateInput = {
      status: data.status,
    };

    if (data.status === 'CLEARED') {
      updateData.clearedBy = n(data.clearedBy);
      updateData.clearedAt = new Date();
    }

    if (data.items) {
      updateData.items = data.items;
    }

    const updated = await platformPrisma.exitClearance.update({
      where: { id },
      data: updateData,
    });

    // Check if all clearances for this exit request are now cleared/NA
    const allClearances = await platformPrisma.exitClearance.findMany({
      where: { exitRequestId: clearance.exitRequestId },
    });

    const allCleared = allClearances.every(
      (c) => c.status === 'CLEARED' || c.status === 'NOT_APPLICABLE',
    );

    if (allCleared) {
      await platformPrisma.exitRequest.update({
        where: { id: clearance.exitRequestId },
        data: { status: 'CLEARANCE_DONE' },
      });
    }

    return updated;
  }

  // ════════════════════════════════════════════════════════════════════
  // EXIT INTERVIEW
  // ════════════════════════════════════════════════════════════════════

  async createExitInterview(
    companyId: string,
    exitRequestId: string,
    data: {
      responses: Array<{ question: string; answer: string }>;
      conductedBy?: string | undefined;
      overallRating?: number | undefined;
      wouldRecommend?: boolean | undefined;
    },
  ) {
    // Verify exit request belongs to company
    const exitRequest = await platformPrisma.exitRequest.findUnique({ where: { id: exitRequestId } });
    if (!exitRequest || exitRequest.companyId !== companyId) {
      throw ApiError.notFound('Exit request not found');
    }

    // Upsert — create or update
    const interview = await platformPrisma.exitInterview.upsert({
      where: { exitRequestId },
      create: {
        exitRequestId,
        responses: data.responses,
        conductedBy: n(data.conductedBy),
        conductedAt: new Date(),
        overallRating: n(data.overallRating),
        wouldRecommend: n(data.wouldRecommend),
        companyId,
      },
      update: {
        responses: data.responses,
        conductedBy: n(data.conductedBy),
        conductedAt: new Date(),
        overallRating: n(data.overallRating),
        wouldRecommend: n(data.wouldRecommend),
      },
    });

    // Mark exit interview done on the exit request
    await platformPrisma.exitRequest.update({
      where: { id: exitRequestId },
      data: { exitInterviewDone: true },
    });

    return interview;
  }

  async getExitInterview(companyId: string, exitRequestId: string) {
    const exitRequest = await platformPrisma.exitRequest.findUnique({ where: { id: exitRequestId } });
    if (!exitRequest || exitRequest.companyId !== companyId) {
      throw ApiError.notFound('Exit request not found');
    }

    const interview = await platformPrisma.exitInterview.findUnique({
      where: { exitRequestId },
    });

    if (!interview) {
      throw ApiError.notFound('Exit interview not found');
    }

    return interview;
  }

  // ════════════════════════════════════════════════════════════════════
  // F&F SETTLEMENT
  // ════════════════════════════════════════════════════════════════════

  async computeFnF(
    companyId: string,
    exitRequestId: string,
    overrides?: { otherEarnings?: number | undefined; otherDeductions?: number | undefined } | undefined,
  ) {
    const exitRequest = await platformPrisma.exitRequest.findUnique({
      where: { id: exitRequestId },
      include: {
        employee: {
          include: {
            grade: true,
            designation: true,
          },
        },
      },
    });

    if (!exitRequest || exitRequest.companyId !== companyId) {
      throw ApiError.notFound('Exit request not found');
    }

    const employee = exitRequest.employee;
    const employeeId = employee.id;

    // ── 1. Get current salary ──────────────────────────────────────
    const currentSalary = await platformPrisma.employeeSalary.findFirst({
      where: { employeeId, companyId, isCurrent: true },
      orderBy: { effectiveFrom: 'desc' },
    });

    const monthlyGross = currentSalary?.monthlyGross
      ? Number(currentSalary.monthlyGross)
      : Number(currentSalary?.annualCtc ?? 0) / 12;

    // Extract basic from salary components (JSON)
    const components = (currentSalary?.components as Record<string, number>) ?? {};
    const basicMonthly = components['BASIC'] ?? components['basic'] ?? monthlyGross * 0.4; // fallback 40% of gross

    // ── 2. Calculate tenure ────────────────────────────────────────
    const joiningDate = new Date(employee.joiningDate);
    const lastWorkingDate = exitRequest.lastWorkingDate ?? new Date();
    const tenureDays = Math.max(0, Math.floor((lastWorkingDate.getTime() - joiningDate.getTime()) / (1000 * 60 * 60 * 24)));
    const tenureYears = tenureDays / 365.25;

    // ── 3. Salary for worked days in last month ────────────────────
    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings?.timezone ?? 'Asia/Kolkata';
    const lwdDt = DateTime.fromJSDate(lastWorkingDate).setZone(companyTimezone);
    const dayOfMonth = lwdDt.day;
    const daysInLastMonth = lwdDt.daysInMonth!;
    const salaryForWorkedDays = (monthlyGross / daysInLastMonth) * dayOfMonth;
    const dailyRate = monthlyGross / daysInLastMonth;

    // ── 4. Leave encashment ────────────────────────────────────────
    const currentYear = DateTime.now().setZone(companyTimezone).year;
    const leaveBalances = await platformPrisma.leaveBalance.findMany({
      where: {
        employeeId,
        companyId,
        year: currentYear,
      },
      include: {
        leaveType: true,
      },
    });

    // Encash only PL/EL (Privilege Leave / Earned Leave) type balances
    let encashableDays = 0;
    for (const lb of leaveBalances) {
      const ltName = lb.leaveType.name.toUpperCase();
      if (ltName.includes('PRIVILEGE') || ltName.includes('EARNED') || ltName.includes('PL') || ltName.includes('EL') || ltName.includes('ANNUAL')) {
        encashableDays += Number(lb.balance);
      }
    }
    const leaveEncashment = encashableDays * (basicMonthly / 26);

    // ── 5. Gratuity ────────────────────────────────────────────────
    let gratuityAmount = 0;
    const gratuityEligible =
      exitRequest.separationType === 'RETIREMENT' ||
      exitRequest.separationType === 'DEATH' ||
      tenureYears >= 5;

    // Forfeit gratuity on termination for cause
    const gratuityForfeited = exitRequest.separationType === 'TERMINATION_FOR_CAUSE';

    if (gratuityEligible && !gratuityForfeited) {
      // Gratuity = (Last drawn basic * 15 * years of service) / 26
      // Per Indian Gratuity Act: 6+ months in last year rounds up to full year
      const lastYearFraction = tenureYears - Math.floor(tenureYears);
      const roundedYears = lastYearFraction >= 0.5 ? Math.ceil(tenureYears) : Math.floor(tenureYears);
      gratuityAmount = Math.min(
        (basicMonthly * 15 * roundedYears) / 26,
        GRATUITY_CAP,
      );
    }

    // ── 6. Bonus pro-rata ──────────────────────────────────────────
    let bonusProRata = 0;
    // No bonus on termination for cause
    if (exitRequest.separationType !== 'TERMINATION_FOR_CAUSE') {
      // Check if bonus config exists
      const bonusConfig = await platformPrisma.bonusConfig.findFirst({
        where: { companyId },
      });
      if (bonusConfig) {
        // ── Eligibility check per Payment of Bonus Act ──
        // 1. Salary threshold: monthly basic must be ≤ wageCeiling (default ₹7,000)
        const wageCeiling = Number(bonusConfig.wageCeiling) || 7000;
        const salaryEligible = basicMonthly <= wageCeiling;

        // 2. Minimum working days: employee must have worked ≥ eligibilityDays (default 30) in the year
        const eligibilityDays = Number(bonusConfig.eligibilityDays) || 30;
        const yearStart = lwdDt.startOf('year').toJSDate();
        const attendanceCount = await platformPrisma.attendanceRecord.count({
          where: {
            employeeId,
            companyId,
            date: { gte: yearStart, lte: lastWorkingDate },
            status: { in: ['PRESENT', 'LATE', 'HALF_DAY'] },
          },
        });
        const workingDaysEligible = attendanceCount >= eligibilityDays;

        // Only compute bonus if BOTH conditions are met
        if (salaryEligible && workingDaysEligible) {
          const bonusPercentage = Number(bonusConfig.minBonusPercent); // minimum bonus %
          const monthsWorkedInYear = Math.min(12, Math.max(0, lwdDt.month));
          bonusProRata = (basicMonthly * bonusPercentage / 100) * monthsWorkedInYear;
        }
      }
    }

    // ── 7. Notice pay ──────────────────────────────────────────────
    let noticePay = 0;
    const noticePeriodDays = exitRequest.noticePeriodDays ?? 30;

    if (exitRequest.separationType === 'RETIREMENT' || exitRequest.separationType === 'DEATH') {
      // No notice recovery for retirement or death
      noticePay = 0;
    } else if (exitRequest.noticePeriodWaiver) {
      // Company waives notice period — company pays remaining notice days
      const resignDate = exitRequest.resignationDate ?? new Date();
      const daysServedInNotice = Math.max(0, Math.floor(
        (lastWorkingDate.getTime() - resignDate.getTime()) / (1000 * 60 * 60 * 24),
      ));
      const remainingNoticeDays = Math.max(0, noticePeriodDays - daysServedInNotice);
      // Positive = company pays employee for unserved notice
      noticePay = remainingNoticeDays * dailyRate;
    } else {
      // Check if employee served full notice
      const resignDate = exitRequest.resignationDate ?? new Date();
      const daysServedInNotice = Math.max(0, Math.floor(
        (lastWorkingDate.getTime() - resignDate.getTime()) / (1000 * 60 * 60 * 24),
      ));
      const shortfall = Math.max(0, noticePeriodDays - daysServedInNotice);
      if (shortfall > 0) {
        // Negative = employee owes company (deduction)
        noticePay = -(shortfall * dailyRate);
      }
    }

    // ── 8. Retrenchment compensation (layoff only) ─────────────────
    let retrenchmentCompensation = 0;
    if (exitRequest.separationType === 'LAYOFF_RETRENCHMENT') {
      // 15 days average wages per year of service
      retrenchmentCompensation = (basicMonthly / 26) * 15 * Math.floor(tenureYears);
    }

    // ── 9. Loan recovery ───────────────────────────────────────────
    const activeLoans = await platformPrisma.loanRecord.findMany({
      where: {
        employeeId,
        companyId,
        status: { in: ['ACTIVE', 'APPROVED'] },
      },
    });
    const loanRecovery = activeLoans.reduce((sum, loan) => sum + Number(loan.outstanding), 0);

    // ── 10. Asset recovery ─────────────────────────────────────────
    const unreturnedAssets = await platformPrisma.assetAssignment.findMany({
      where: {
        employeeId,
        companyId,
        returnDate: null,
      },
      include: {
        asset: true,
      },
    });
    // Value of unreturned assets that are damaged or not returned
    const assetRecovery = unreturnedAssets.reduce((sum, assignment) => {
      return sum + Number(assignment.asset.purchaseValue ?? 0);
    }, 0);

    // ── 11. Pending reimbursements ─────────────────────────────────
    const pendingClaims = await platformPrisma.expenseClaim.findMany({
      where: {
        employeeId,
        companyId,
        status: 'APPROVED',
        paidAt: null,
      },
    });
    const reimbursementPending = pendingClaims.reduce((sum, claim) => sum + Number(claim.amount), 0);

    // ── 12. Other earnings/deductions from overrides ────────────────
    const otherEarnings = overrides?.otherEarnings ?? 0;
    const otherDeductions = overrides?.otherDeductions ?? 0;

    // ── 13. TDS on F&F (simplified) ────────────────────────────────
    const totalEarnings = salaryForWorkedDays + leaveEncashment + gratuityAmount + bonusProRata
      + retrenchmentCompensation + reimbursementPending + otherEarnings
      + Math.max(0, noticePay); // only if company pays
    const totalDeductionsBeforeTds = loanRecovery + assetRecovery + otherDeductions
      + Math.abs(Math.min(0, noticePay)); // only if employee shortfall

    // TDS on taxable components (salary, bonus, leave encashment)
    // Gratuity exempt up to limit, reimbursement non-taxable
    const taxableAmount = Math.max(0, salaryForWorkedDays + bonusProRata + leaveEncashment + Math.max(0, noticePay));
    let tdsOnFnF = 0;
    const annualTaxableProjection = taxableAmount * 12 / lwdDt.month; // Annualize
    if (annualTaxableProjection > 400000) {
      // Use new regime slabs (simplified)
      let annualTax = 0;
      const slabs = [
        { limit: 400000, rate: 0 },
        { limit: 800000, rate: 0.05 },
        { limit: 1200000, rate: 0.10 },
        { limit: 1600000, rate: 0.15 },
        { limit: 2000000, rate: 0.20 },
        { limit: 2400000, rate: 0.25 },
        { limit: Infinity, rate: 0.30 },
      ];
      let remaining = annualTaxableProjection;
      let prevLimit = 0;
      for (const slab of slabs) {
        const slabAmount = Math.min(remaining, slab.limit - prevLimit);
        if (slabAmount <= 0) break;
        annualTax += slabAmount * slab.rate;
        remaining -= slabAmount;
        prevLimit = slab.limit;
      }
      annualTax *= 1.04; // 4% cess
      // Pro-rate to months worked
      const monthsWorked = lwdDt.month;
      tdsOnFnF = Math.round(annualTax * monthsWorked / 12 * 100) / 100;
    }

    // ── 14. Total amount ───────────────────────────────────────────
    const totalAmount = totalEarnings - totalDeductionsBeforeTds - tdsOnFnF;

    // ── 15. Build components breakdown ─────────────────────────────
    const componentsBreakdown = {
      earnings: {
        salaryForWorkedDays: round2(salaryForWorkedDays),
        leaveEncashment: round2(leaveEncashment),
        gratuityAmount: round2(gratuityAmount),
        bonusProRata: round2(bonusProRata),
        retrenchmentCompensation: round2(retrenchmentCompensation),
        reimbursementPending: round2(reimbursementPending),
        noticePay: noticePay > 0 ? round2(noticePay) : 0,
        otherEarnings: round2(otherEarnings),
      },
      deductions: {
        loanRecovery: round2(loanRecovery),
        assetRecovery: round2(assetRecovery),
        noticeBuyout: noticePay < 0 ? round2(Math.abs(noticePay)) : 0,
        tdsOnFnF: round2(tdsOnFnF),
        otherDeductions: round2(otherDeductions),
      },
      meta: {
        separationType: exitRequest.separationType,
        tenureYears: round2(tenureYears),
        noticePeriodDays,
        encashableLeaveDays: encashableDays,
        basicMonthly: round2(basicMonthly),
        monthlyGross: round2(monthlyGross),
        gratuityEligible,
        gratuityForfeited,
        lastWorkingDate: lastWorkingDate.toISOString().split('T')[0],
      },
    };

    // ── 16. Create/update F&F settlement record ────────────────────
    const settlement = await platformPrisma.fnFSettlement.upsert({
      where: { exitRequestId },
      create: {
        exitRequestId,
        employeeId,
        salaryForWorkedDays: new Prisma.Decimal(round2(salaryForWorkedDays)),
        leaveEncashment: new Prisma.Decimal(round2(leaveEncashment)),
        gratuityAmount: new Prisma.Decimal(round2(gratuityAmount)),
        bonusProRata: new Prisma.Decimal(round2(bonusProRata)),
        noticePay: new Prisma.Decimal(round2(noticePay)),
        loanRecovery: new Prisma.Decimal(round2(loanRecovery)),
        assetRecovery: new Prisma.Decimal(round2(assetRecovery)),
        reimbursementPending: new Prisma.Decimal(round2(reimbursementPending)),
        tdsOnFnF: new Prisma.Decimal(round2(tdsOnFnF)),
        otherEarnings: new Prisma.Decimal(round2(otherEarnings)),
        otherDeductions: new Prisma.Decimal(round2(otherDeductions)),
        totalAmount: new Prisma.Decimal(round2(totalAmount)),
        components: componentsBreakdown,
        status: 'COMPUTED',
        companyId,
      },
      update: {
        salaryForWorkedDays: new Prisma.Decimal(round2(salaryForWorkedDays)),
        leaveEncashment: new Prisma.Decimal(round2(leaveEncashment)),
        gratuityAmount: new Prisma.Decimal(round2(gratuityAmount)),
        bonusProRata: new Prisma.Decimal(round2(bonusProRata)),
        noticePay: new Prisma.Decimal(round2(noticePay)),
        loanRecovery: new Prisma.Decimal(round2(loanRecovery)),
        assetRecovery: new Prisma.Decimal(round2(assetRecovery)),
        reimbursementPending: new Prisma.Decimal(round2(reimbursementPending)),
        tdsOnFnF: new Prisma.Decimal(round2(tdsOnFnF)),
        otherEarnings: new Prisma.Decimal(round2(otherEarnings)),
        otherDeductions: new Prisma.Decimal(round2(otherDeductions)),
        totalAmount: new Prisma.Decimal(round2(totalAmount)),
        components: componentsBreakdown,
        status: 'COMPUTED',
      },
    });

    // Update exit request status
    await platformPrisma.exitRequest.update({
      where: { id: exitRequestId },
      data: { status: 'FNF_COMPUTED' },
    });

    return settlement;
  }

  async approveFnF(companyId: string, settlementId: string, userId: string) {
    const settlement = await platformPrisma.fnFSettlement.findUnique({ where: { id: settlementId } });
    if (!settlement || settlement.companyId !== companyId) {
      throw ApiError.notFound('F&F settlement not found');
    }

    if (settlement.status !== 'COMPUTED') {
      throw ApiError.badRequest(`Cannot approve settlement in ${settlement.status} status. Must be COMPUTED.`);
    }

    return platformPrisma.fnFSettlement.update({
      where: { id: settlementId },
      data: {
        status: 'APPROVED',
        approvedBy: userId,
        approvedAt: new Date(),
      },
    });
  }

  async payFnF(companyId: string, settlementId: string) {
    const settlement = await platformPrisma.fnFSettlement.findUnique({
      where: { id: settlementId },
      include: { exitRequest: true },
    });

    if (!settlement || settlement.companyId !== companyId) {
      throw ApiError.notFound('F&F settlement not found');
    }

    if (settlement.status !== 'APPROVED') {
      throw ApiError.badRequest(`Cannot mark as paid. Settlement must be in APPROVED status, currently: ${settlement.status}`);
    }

    return platformPrisma.$transaction(async (tx) => {
      // 1. Update settlement to PAID
      const updated = await tx.fnFSettlement.update({
        where: { id: settlementId },
        data: {
          status: 'PAID',
          paidAt: new Date(),
        },
      });

      // 2. Update exit request status
      await tx.exitRequest.update({
        where: { id: settlement.exitRequestId },
        data: { status: 'FNF_PAID' },
      });

      // 3. Update employee status to EXITED
      await tx.employee.update({
        where: { id: settlement.employeeId },
        data: { status: 'EXITED' },
      });

      // 4. Add timeline event
      await tx.employeeTimeline.create({
        data: {
          employeeId: settlement.employeeId,
          eventType: 'EXITED',
          title: 'Employee Exited — F&F Settled',
          description: `Full and final settlement of ${Number(settlement.totalAmount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} has been paid.`,
          eventData: {
            fnfSettlementId: settlementId,
            totalAmount: Number(settlement.totalAmount),
          },
        },
      });

      return updated;
    });
  }

  async getFnFByExitRequest(companyId: string, exitRequestId: string) {
    const settlement = await platformPrisma.fnFSettlement.findUnique({
      where: { exitRequestId },
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
        exitRequest: {
          select: {
            separationType: true,
            resignationDate: true,
            lastWorkingDate: true,
            status: true,
          },
        },
      },
    });

    if (!settlement || settlement.companyId !== companyId) {
      throw ApiError.notFound('F&F settlement not found');
    }

    return settlement;
  }

  async listFnFSettlements(companyId: string, options: ListOptions = {}) {
    const { page = 1, limit = 25, status } = options;
    const offset = (page - 1) * limit;

    const where: Prisma.FnFSettlementWhereInput = { companyId };
    if (status) {
      where.status = status as FnFStatus;
    }

    const [settlements, total] = await Promise.all([
      platformPrisma.fnFSettlement.findMany({
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
          exitRequest: {
            select: { separationType: true, status: true },
          },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.fnFSettlement.count({ where }),
    ]);

    return { settlements, total, page, limit };
  }

  async getFnFSettlement(companyId: string, id: string) {
    const settlement = await platformPrisma.fnFSettlement.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            joiningDate: true,
            department: { select: { name: true } },
            designation: { select: { name: true } },
          },
        },
        exitRequest: {
          select: {
            separationType: true,
            resignationDate: true,
            lastWorkingDate: true,
            noticePeriodDays: true,
            status: true,
          },
        },
      },
    });

    if (!settlement || settlement.companyId !== companyId) {
      throw ApiError.notFound('F&F settlement not found');
    }

    return settlement;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const offboardingService = new OffboardingService();
