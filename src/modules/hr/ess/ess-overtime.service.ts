import { OvertimeRequestStatus, type RoundingStrategy, type OTMultiplierSource, Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { platformPrisma } from '../../../config/database';
import { logger } from '../../../config/logger';
import { ApiError } from '../../../shared/errors';
import { notificationService } from '../../../core/notifications/notification.service';
import type {
  ClaimOvertimeInput,
  MyOvertimeListInput,
  MyOvertimeSummaryInput,
} from './ess-overtime.validators';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a Prisma Decimal to a plain number (safe for JSON). */
const dec = (v: unknown): number => (v == null ? 0 : Number(v));

/** ISO date string from a Date object (date-only, no time). */
const isoDate = (d: Date | null | undefined): string | null =>
  d ? d.toISOString().split('T')[0]! : null;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class EssOvertimeService {
  // ── 1. List my OT requests ──────────────────────────────────────────────

  async getMyOvertimeRequests(
    companyId: string,
    employeeId: string,
    params: MyOvertimeListInput,
  ) {
    const { status, source, dateFrom, dateTo, page, limit } = params;

    const where: Prisma.OvertimeRequestWhereInput = {
      companyId,
      employeeId,
      ...(status ? { status: status as OvertimeRequestStatus } : {}),
      ...(source ? { source: source as 'AUTO' | 'MANUAL' } : {}),
      ...(dateFrom || dateTo
        ? {
            date: {
              ...(dateFrom ? { gte: new Date(dateFrom + 'T00:00:00Z') } : {}),
              ...(dateTo ? { lte: new Date(dateTo + 'T00:00:00Z') } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      platformPrisma.overtimeRequest.findMany({
        where,
        select: {
          id: true,
          date: true,
          requestedHours: true,
          appliedMultiplier: true,
          multiplierSource: true,
          calculatedAmount: true,
          status: true,
          source: true,
          reason: true,
          attachments: true,
          compOffGranted: true,
          approvalNotes: true,
          approvedAt: true,
          createdAt: true,
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      platformPrisma.overtimeRequest.count({ where }),
    ]);

    const data = rows.map((r) => ({
      id: r.id,
      date: isoDate(r.date),
      requestedHours: dec(r.requestedHours),
      appliedMultiplier: dec(r.appliedMultiplier),
      multiplierSource: r.multiplierSource,
      calculatedAmount: r.calculatedAmount != null ? dec(r.calculatedAmount) : null,
      status: r.status,
      source: r.source,
      reason: r.reason,
      attachments: r.attachments ?? null,
      compOffGranted: r.compOffGranted,
      approvalNotes: r.approvalNotes ?? null,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ── 2. Single OT request detail ─────────────────────────────────────────

  async getMyOvertimeDetail(
    companyId: string,
    employeeId: string,
    requestId: string,
  ) {
    const row = await platformPrisma.overtimeRequest.findFirst({
      where: { id: requestId, companyId, employeeId },
      include: {
        attendanceRecord: {
          select: {
            id: true,
            date: true,
            punchIn: true,
            punchOut: true,
            shift: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!row) {
      throw ApiError.notFound('Overtime request not found');
    }

    // Resolve requester & approver names
    const userIds = [row.requestedBy, row.approvedBy].filter(Boolean) as string[];
    const users = userIds.length
      ? await platformPrisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()]));

    return {
      id: row.id,
      date: isoDate(row.date),
      requestedHours: dec(row.requestedHours),
      appliedMultiplier: dec(row.appliedMultiplier),
      multiplierSource: row.multiplierSource,
      calculatedAmount: row.calculatedAmount != null ? dec(row.calculatedAmount) : null,
      status: row.status,
      source: row.source,
      reason: row.reason,
      attachments: row.attachments ?? null,
      compOffGranted: row.compOffGranted,
      requestedByName: userMap.get(row.requestedBy) ?? null,
      approvedByName: row.approvedBy ? (userMap.get(row.approvedBy) ?? null) : null,
      approvalNotes: row.approvalNotes,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      attendanceRecord: row.attendanceRecord
        ? {
            id: row.attendanceRecord.id,
            date: isoDate(row.attendanceRecord.date),
            punchIn: row.attendanceRecord.punchIn?.toISOString() ?? null,
            punchOut: row.attendanceRecord.punchOut?.toISOString() ?? null,
            shiftName: row.attendanceRecord.shift?.name ?? null,
          }
        : null,
    };
  }

  // ── 3. Summary stats for header cards ───────────────────────────────────

  async getMyOvertimeSummary(
    companyId: string,
    employeeId: string,
    params: MyOvertimeSummaryInput,
  ) {
    const now = DateTime.now();
    const month = params.month ?? now.month;
    const year = params.year ?? now.year;

    // Build the month date range (UTC)
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0)); // last day of month

    const dateRange = { gte: monthStart, lte: monthEnd };

    // Run aggregations in parallel
    const [totalOt, pendingCount, approvedAmount, totalRequests, compOffData] =
      await Promise.all([
        // SUM requestedHours where APPROVED or PAID
        platformPrisma.overtimeRequest.aggregate({
          where: {
            companyId,
            employeeId,
            date: dateRange,
            status: { in: ['APPROVED', 'PAID'] },
          },
          _sum: { requestedHours: true },
        }),

        // COUNT PENDING
        platformPrisma.overtimeRequest.count({
          where: { companyId, employeeId, date: dateRange, status: 'PENDING' },
        }),

        // SUM calculatedAmount where APPROVED or PAID
        platformPrisma.overtimeRequest.aggregate({
          where: {
            companyId,
            employeeId,
            date: dateRange,
            status: { in: ['APPROVED', 'PAID'] },
          },
          _sum: { calculatedAmount: true },
        }),

        // Total requests for the month
        platformPrisma.overtimeRequest.count({
          where: { companyId, employeeId, date: dateRange },
        }),

        // Comp-off balance (if enabled)
        this.getCompOffBalance(companyId, employeeId, year),
      ]);

    return {
      totalOtHours: dec(totalOt._sum.requestedHours),
      pendingCount,
      approvedAmount: dec(approvedAmount._sum.calculatedAmount),
      totalRequests,
      compOff: compOffData,
      month,
      year,
    };
  }

  /** Fetch comp-off balance if OT rule has compOffEnabled. */
  private async getCompOffBalance(
    companyId: string,
    employeeId: string,
    year: number,
  ): Promise<{ enabled: boolean; balance: number; expiresAt: string | null; leaveTypeId: string | null } | null> {
    const otRule = await platformPrisma.overtimeRule.findUnique({
      where: { companyId },
      select: { compOffEnabled: true, compOffExpiryDays: true },
    });

    if (!otRule?.compOffEnabled) return null;

    // Find COMPENSATORY leave type for this company
    const compOffType = await platformPrisma.leaveType.findFirst({
      where: { companyId, category: 'COMPENSATORY' },
      select: { id: true },
    });

    if (!compOffType) return { enabled: true, balance: 0, expiresAt: null, leaveTypeId: null };

    const lb = await platformPrisma.leaveBalance.findFirst({
      where: { employeeId, leaveTypeId: compOffType.id, year },
      select: { balance: true, expiresAt: true },
    });

    // Compute expiry date from compOffExpiryDays if set
    const expiresAt = lb?.expiresAt
      ? lb.expiresAt.toISOString()
      : otRule.compOffExpiryDays
        ? DateTime.now().plus({ days: otRule.compOffExpiryDays }).toISO()
        : null;

    return {
      enabled: true,
      balance: dec(lb?.balance),
      expiresAt,
      leaveTypeId: compOffType.id,
    };
  }

  // ── 4. Submit manual OT claim ───────────────────────────────────────────

  async claimOvertime(
    companyId: string,
    userId: string,
    employeeId: string,
    data: ClaimOvertimeInput,
  ) {
    // Step 1 — Validate employee is active
    const employee = await platformPrisma.employee.findFirst({
      where: { id: employeeId, companyId, status: 'ACTIVE' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeTypeId: true,
        shiftId: true,
      },
    });
    if (!employee) {
      throw ApiError.badRequest('Employee not found or not active');
    }

    // Step 2 — Get OT rules
    const otRule = await platformPrisma.overtimeRule.findUnique({
      where: { companyId },
    });
    if (!otRule) {
      throw ApiError.badRequest(
        'Overtime rules are not configured for this company. Please contact your admin.',
      );
    }

    // Step 3 — Check eligible type IDs
    if (otRule.eligibleTypeIds != null) {
      const eligible = otRule.eligibleTypeIds as string[];
      if (employee.employeeTypeId && !eligible.includes(employee.employeeTypeId)) {
        throw ApiError.forbidden('Your employee type is not eligible for overtime claims');
      }
    }

    // Step 4 — Duplicate check (same employee + date)
    const claimDate = new Date(data.date + 'T00:00:00Z');
    const existing = await platformPrisma.overtimeRequest.findFirst({
      where: {
        companyId,
        employeeId,
        date: claimDate,
        status: { notIn: ['REJECTED'] },
      },
      select: { id: true, status: true },
    });
    if (existing) {
      throw ApiError.conflict(
        `An overtime request already exists for ${data.date} (status: ${existing.status})`,
      );
    }

    // Step 5 — Apply thresholdMinutes dead-zone (AFTER_SHIFT only)
    let hours = data.hours;
    if (otRule.calculationBasis === 'AFTER_SHIFT') {
      const thresholdHours = otRule.thresholdMinutes / 60;
      if (hours <= thresholdHours) {
        throw ApiError.badRequest(
          `Claimed hours (${hours}) are within the ${otRule.thresholdMinutes}-minute threshold. Minimum OT must exceed ${thresholdHours} hours.`,
        );
      }
    }

    // Step 6 — Apply minimumOtMinutes floor
    const minHours = otRule.minimumOtMinutes / 60;
    if (hours < minHours) {
      throw ApiError.badRequest(
        `Minimum overtime is ${otRule.minimumOtMinutes} minutes (${minHours} hours). You claimed ${hours} hours.`,
      );
    }

    // Step 7 — Apply rounding strategy
    hours = this.applyOtRounding(hours, otRule.roundingStrategy);

    // Step 8 — Enforce caps (daily, weekly, monthly)
    if (otRule.enforceCaps) {
      hours = await this.enforceOtCaps(companyId, employeeId, claimDate, hours, otRule);
    }

    // Step 9 — Determine multiplier source
    const { multiplierSource, multiplier } = await this.determineMultiplierSource(
      companyId,
      employeeId,
      claimDate,
      employee.shiftId,
      otRule,
    );

    // Step 10 — Create OvertimeRequest
    const otRequest = await platformPrisma.overtimeRequest.create({
      data: {
        companyId,
        employeeId,
        overtimeRuleId: otRule.id,
        date: claimDate,
        requestedHours: new Prisma.Decimal(hours),
        appliedMultiplier: new Prisma.Decimal(multiplier),
        multiplierSource,
        calculatedAmount: null, // calculated at approval/payroll time
        status: otRule.approvalRequired ? 'PENDING' : 'APPROVED',
        requestedBy: userId,
        source: 'MANUAL',
        reason: data.reason,
        attachments: data.attachments ?? Prisma.JsonNull,
      },
      select: {
        id: true,
        date: true,
        requestedHours: true,
        appliedMultiplier: true,
        multiplierSource: true,
        status: true,
        source: true,
        reason: true,
        createdAt: true,
      },
    });

    // Dispatch notification (fire-and-forget)
    const employeeName = `${employee.firstName ?? ''} ${employee.lastName ?? ''}`.trim();
    await notificationService
      .dispatch({
        companyId,
        triggerEvent: 'OVERTIME_CLAIM',
        entityType: 'OvertimeRequest',
        entityId: otRequest.id,
        tokens: {
          employee_name: employeeName,
          date: data.date,
          hours,
        },
        priority: 'MEDIUM',
        type: 'OVERTIME',
        actionUrl: '/company/hr/approval-requests',
      })
      .catch((err) => logger.warn('Failed to dispatch OT claim notification', err));

    return {
      id: otRequest.id,
      date: isoDate(otRequest.date),
      requestedHours: dec(otRequest.requestedHours),
      appliedMultiplier: dec(otRequest.appliedMultiplier),
      multiplierSource: otRequest.multiplierSource,
      status: otRequest.status,
      source: otRequest.source,
      reason: otRequest.reason,
      createdAt: otRequest.createdAt.toISOString(),
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  /**
   * Applies the configured rounding strategy to OT hours.
   * E.g. NEAREST_15 rounds 1.37 → 1.25, CEIL_15 rounds 1.37 → 1.5.
   */
  private applyOtRounding(hours: number, strategy: RoundingStrategy): number {
    switch (strategy) {
      case 'NEAREST_15':
        return Math.round(hours * 4) / 4;
      case 'NEAREST_30':
        return Math.round(hours * 2) / 2;
      case 'FLOOR_15':
        return Math.floor(hours * 4) / 4;
      case 'CEIL_15':
        return Math.ceil(hours * 4) / 4;
      case 'NONE':
      default:
        return hours;
    }
  }

  /**
   * Enforces daily / weekly / monthly OT caps.
   * Returns the (potentially capped) hours. Throws if daily cap fully exhausted.
   */
  private async enforceOtCaps(
    companyId: string,
    employeeId: string,
    date: Date,
    hours: number,
    otRule: {
      dailyCapHours: unknown;
      weeklyCapHours: unknown;
      monthlyCapHours: unknown;
    },
  ): Promise<number> {
    let capped = hours;

    // Daily cap
    const dailyCap = dec(otRule.dailyCapHours);
    if (dailyCap > 0) {
      const dailyAgg = await platformPrisma.overtimeRequest.aggregate({
        where: {
          companyId,
          employeeId,
          date,
          status: { notIn: ['REJECTED'] },
        },
        _sum: { requestedHours: true },
      });
      const usedToday = dec(dailyAgg._sum.requestedHours);
      const remaining = dailyCap - usedToday;
      if (remaining <= 0) {
        throw ApiError.badRequest(
          `Daily overtime cap of ${dailyCap} hours has been reached for this date`,
        );
      }
      capped = Math.min(capped, remaining);
    }

    // Weekly cap
    const weeklyCap = dec(otRule.weeklyCapHours);
    if (weeklyCap > 0) {
      // Calculate week start (Monday) and end (Sunday)
      const dt = DateTime.fromJSDate(date, { zone: 'utc' });
      const weekStart = dt.startOf('week'); // Monday in Luxon
      const weekEnd = dt.endOf('week');
      const weeklyAgg = await platformPrisma.overtimeRequest.aggregate({
        where: {
          companyId,
          employeeId,
          date: {
            gte: weekStart.toJSDate(),
            lte: weekEnd.toJSDate(),
          },
          status: { notIn: ['REJECTED'] },
        },
        _sum: { requestedHours: true },
      });
      const usedWeek = dec(weeklyAgg._sum.requestedHours);
      const weekRemaining = weeklyCap - usedWeek;
      if (weekRemaining > 0) {
        capped = Math.min(capped, weekRemaining);
      } else {
        throw ApiError.badRequest(
          `Weekly overtime cap of ${weeklyCap} hours has been reached`,
        );
      }
    }

    // Monthly cap
    const monthlyCap = dec(otRule.monthlyCapHours);
    if (monthlyCap > 0) {
      const dt = DateTime.fromJSDate(date, { zone: 'utc' });
      const monthStart = dt.startOf('month');
      const monthEnd = dt.endOf('month');
      const monthlyAgg = await platformPrisma.overtimeRequest.aggregate({
        where: {
          companyId,
          employeeId,
          date: {
            gte: monthStart.toJSDate(),
            lte: monthEnd.toJSDate(),
          },
          status: { notIn: ['REJECTED'] },
        },
        _sum: { requestedHours: true },
      });
      const usedMonth = dec(monthlyAgg._sum.requestedHours);
      const monthRemaining = monthlyCap - usedMonth;
      if (monthRemaining > 0) {
        capped = Math.min(capped, monthRemaining);
      } else {
        throw ApiError.badRequest(
          `Monthly overtime cap of ${monthlyCap} hours has been reached`,
        );
      }
    }

    return capped;
  }

  /**
   * Determines the multiplier source for an OT claim.
   * Priority: Holiday > Weekend > Night Shift > Weekday
   */
  private async determineMultiplierSource(
    companyId: string,
    _employeeId: string,
    date: Date,
    shiftId: string | null,
    otRule: {
      weekdayMultiplier: unknown;
      weekendMultiplier: unknown;
      holidayMultiplier: unknown;
      nightShiftMultiplier: unknown;
    },
  ): Promise<{ multiplierSource: OTMultiplierSource; multiplier: number }> {
    // 1. Check holiday
    const holidayMultiplier = dec(otRule.holidayMultiplier);
    if (holidayMultiplier > 0) {
      const holiday = await platformPrisma.holidayCalendar.findFirst({
        where: { companyId, date },
        select: { id: true },
      });
      if (holiday) {
        return { multiplierSource: 'HOLIDAY', multiplier: holidayMultiplier };
      }
    }

    // 2. Check weekly off (weekend)
    const weekendMultiplier = dec(otRule.weekendMultiplier);
    if (weekendMultiplier > 0) {
      const company = await platformPrisma.company.findUnique({
        where: { id: companyId },
        select: { weeklyOffs: true },
      });
      if (company?.weeklyOffs) {
        const weeklyOffs = company.weeklyOffs as string[];
        const dt = DateTime.fromJSDate(date, { zone: 'utc' });
        const dayName = dt.toFormat('EEEE'); // e.g. "Sunday"
        if (weeklyOffs.includes(dayName)) {
          return { multiplierSource: 'WEEKEND', multiplier: weekendMultiplier };
        }
      }
    }

    // 3. Check night shift
    const nightShiftMultiplier = dec(otRule.nightShiftMultiplier);
    if (nightShiftMultiplier > 0 && shiftId) {
      const shift = await platformPrisma.companyShift.findUnique({
        where: { id: shiftId },
        select: { shiftType: true },
      });
      if (shift?.shiftType === 'NIGHT') {
        return { multiplierSource: 'NIGHT_SHIFT', multiplier: nightShiftMultiplier };
      }
    }

    // 4. Default to weekday
    return {
      multiplierSource: 'WEEKDAY',
      multiplier: dec(otRule.weekdayMultiplier),
    };
  }
}

export const essOvertimeService = new EssOvertimeService();
