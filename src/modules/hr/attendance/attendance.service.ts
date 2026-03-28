import { Prisma } from '@prisma/client';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';

/** Convert undefined to null for Prisma nullable fields. */
function n<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

interface ListOptions {
  page?: number;
  limit?: number;
}

interface AttendanceListOptions extends ListOptions {
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  departmentId?: string;
}

interface OverrideListOptions extends ListOptions {
  status?: string;
}

interface HolidayListOptions extends ListOptions {
  year?: number;
  type?: string;
}

export class AttendanceService {
  // ────────────────────────────────────────────────────────────────────
  // Attendance Records
  // ────────────────────────────────────────────────────────────────────

  async listRecords(companyId: string, options: AttendanceListOptions = {}) {
    const { page = 1, limit = 25, employeeId, dateFrom, dateTo, status, departmentId } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };

    if (employeeId) {
      where.employeeId = employeeId;
    }

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    if (status) {
      where.status = status;
    }

    if (departmentId) {
      where.employee = { departmentId };
    }

    const [records, total] = await Promise.all([
      platformPrisma.attendanceRecord.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              employeeId: true,
              firstName: true,
              lastName: true,
              department: { select: { id: true, name: true } },
              designation: { select: { id: true, name: true } },
            },
          },
          shift: { select: { id: true, name: true, fromTime: true, toTime: true } },
          location: { select: { id: true, name: true } },
        },
        skip: offset,
        take: limit,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
      platformPrisma.attendanceRecord.count({ where }),
    ]);

    return { records, total, page, limit };
  }

  async getRecord(companyId: string, id: string) {
    const record = await platformPrisma.attendanceRecord.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            department: { select: { id: true, name: true } },
            designation: { select: { id: true, name: true } },
          },
        },
        shift: { select: { id: true, name: true, fromTime: true, toTime: true } },
        location: { select: { id: true, name: true } },
        overrides: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!record || record.companyId !== companyId) {
      throw ApiError.notFound('Attendance record not found');
    }

    return record;
  }

  async createRecord(companyId: string, data: any) {
    // Verify employee belongs to company
    const employee = await platformPrisma.employee.findUnique({
      where: { id: data.employeeId },
      select: { id: true, companyId: true, shiftId: true },
    });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.badRequest('Employee not found in this company');
    }

    // Check for duplicate record on same date
    const existing = await platformPrisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId: data.employeeId, date: new Date(data.date) } },
    });
    if (existing) {
      throw ApiError.conflict('Attendance record already exists for this employee on this date');
    }

    // Calculate worked hours and detect late/early exit
    const { workedHours, isLate, lateMinutes, isEarlyExit, earlyMinutes } =
      await this.calculateAttendanceMetrics(companyId, data, employee.shiftId);

    return platformPrisma.attendanceRecord.create({
      data: {
        companyId,
        employeeId: data.employeeId,
        date: new Date(data.date),
        shiftId: n(data.shiftId) ?? n(employee.shiftId),
        punchIn: data.punchIn ? new Date(data.punchIn) : null,
        punchOut: data.punchOut ? new Date(data.punchOut) : null,
        workedHours,
        status: data.status,
        source: data.source,
        isLate,
        lateMinutes,
        isEarlyExit,
        earlyMinutes,
        remarks: n(data.remarks),
        locationId: n(data.locationId),
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            department: { select: { id: true, name: true } },
            designation: { select: { id: true, name: true } },
          },
        },
        shift: { select: { id: true, name: true, fromTime: true, toTime: true } },
      },
    });
  }

  async updateRecord(companyId: string, id: string, data: any) {
    const record = await platformPrisma.attendanceRecord.findUnique({
      where: { id },
      include: { employee: { select: { shiftId: true } } },
    });
    if (!record || record.companyId !== companyId) {
      throw ApiError.notFound('Attendance record not found');
    }

    // Recalculate metrics if punch times changed
    let metrics: any = {};
    const punchIn = data.punchIn !== undefined ? data.punchIn : record.punchIn?.toISOString();
    const punchOut = data.punchOut !== undefined ? data.punchOut : record.punchOut?.toISOString();
    const shiftId = data.shiftId !== undefined ? data.shiftId : record.shiftId;

    if (data.punchIn !== undefined || data.punchOut !== undefined) {
      const calcData = { ...data, punchIn, punchOut, shiftId };
      metrics = await this.calculateAttendanceMetrics(companyId, calcData, record.employee?.shiftId ?? null);
    }

    return platformPrisma.attendanceRecord.update({
      where: { id },
      data: {
        ...(data.shiftId !== undefined && { shiftId: n(data.shiftId) }),
        ...(data.punchIn !== undefined && { punchIn: data.punchIn ? new Date(data.punchIn) : null }),
        ...(data.punchOut !== undefined && { punchOut: data.punchOut ? new Date(data.punchOut) : null }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.source !== undefined && { source: data.source }),
        ...(data.remarks !== undefined && { remarks: n(data.remarks) }),
        ...(data.locationId !== undefined && { locationId: n(data.locationId) }),
        ...(metrics.workedHours !== undefined && { workedHours: metrics.workedHours }),
        ...(metrics.isLate !== undefined && { isLate: metrics.isLate }),
        ...(metrics.lateMinutes !== undefined && { lateMinutes: metrics.lateMinutes }),
        ...(metrics.isEarlyExit !== undefined && { isEarlyExit: metrics.isEarlyExit }),
        ...(metrics.earlyMinutes !== undefined && { earlyMinutes: metrics.earlyMinutes }),
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            department: { select: { id: true, name: true } },
            designation: { select: { id: true, name: true } },
          },
        },
        shift: { select: { id: true, name: true, fromTime: true, toTime: true } },
      },
    });
  }

  async getSummary(companyId: string, date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    // Normalize to start of day
    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23, 59, 59, 999);

    // Get counts grouped by status
    const statusCounts = await platformPrisma.attendanceRecord.groupBy({
      by: ['status'],
      where: {
        companyId,
        date: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
      _count: { status: true },
    });

    // Get late count
    const lateCount = await platformPrisma.attendanceRecord.count({
      where: {
        companyId,
        date: { gte: dayStart, lte: dayEnd },
        isLate: true,
      },
    });

    // Get total employees
    const totalEmployees = await platformPrisma.employee.count({
      where: { companyId, status: { in: ['ACTIVE', 'PROBATION', 'CONFIRMED'] } },
    });

    // Build summary map
    const summary: Record<string, number> = {
      total: totalEmployees,
      present: 0,
      absent: 0,
      halfDay: 0,
      late: lateCount,
      onLeave: 0,
      holiday: 0,
      weekOff: 0,
      lop: 0,
    };

    for (const row of statusCounts) {
      const key = row.status === 'PRESENT' ? 'present'
        : row.status === 'ABSENT' ? 'absent'
        : row.status === 'HALF_DAY' ? 'halfDay'
        : row.status === 'LATE' ? 'present' // LATE status counts toward present
        : row.status === 'ON_LEAVE' ? 'onLeave'
        : row.status === 'HOLIDAY' ? 'holiday'
        : row.status === 'WEEK_OFF' ? 'weekOff'
        : row.status === 'LOP' ? 'lop'
        : null;

      if (key) {
        summary[key] = (summary[key] ?? 0) + row._count.status;
      }
    }

    // Department-wise breakdown — fetch records with employee.department, group in JS
    const deptRecords = await platformPrisma.attendanceRecord.findMany({
      where: {
        companyId,
        date: { gte: dayStart, lte: dayEnd },
        employee: { departmentId: { not: null } },
      },
      select: {
        status: true,
        employee: {
          select: {
            department: { select: { id: true, name: true } },
          },
        },
      },
    });

    const deptMap = new Map<string, { departmentId: string; departmentName: string; present: number; absent: number; onLeave: number; total: number }>();
    for (const rec of deptRecords) {
      const dept = rec.employee?.department;
      if (!dept) continue;
      if (!deptMap.has(dept.id)) {
        deptMap.set(dept.id, { departmentId: dept.id, departmentName: dept.name, present: 0, absent: 0, onLeave: 0, total: 0 });
      }
      const entry = deptMap.get(dept.id)!;
      entry.total++;
      if (rec.status === 'PRESENT' || rec.status === 'LATE') entry.present++;
      else if (rec.status === 'ABSENT') entry.absent++;
      else if (rec.status === 'ON_LEAVE') entry.onLeave++;
    }
    const departmentBreakdown = Array.from(deptMap.values()).sort((a, b) => a.departmentName.localeCompare(b.departmentName));

    return {
      date: dayStart.toISOString().split('T')[0],
      summary,
      departmentBreakdown,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Populate Month (auto-fill holidays & week-offs)
  // ────────────────────────────────────────────────────────────────────

  async populateMonthAttendance(companyId: string, month: number, year: number) {
    const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // 1. Get all active employees for the company
    const employees = await platformPrisma.employee.findMany({
      where: { companyId, status: { in: ['ACTIVE', 'PROBATION', 'CONFIRMED'] } },
      select: { id: true },
    });

    if (employees.length === 0) {
      return { created: 0 };
    }

    // 2. Get the company's default roster for week-off days
    const roster = await platformPrisma.roster.findFirst({
      where: { companyId, isDefault: true },
    });
    const weekOff1 = roster?.weekOff1 ?? null;
    const weekOff2 = roster?.weekOff2 ?? null;

    // 3. Get all holidays for this month
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0); // last day of month
    const holidays = await platformPrisma.holidayCalendar.findMany({
      where: {
        companyId,
        date: { gte: monthStart, lte: monthEnd },
      },
      select: { date: true },
    });

    // Build a Set of holiday date strings (YYYY-MM-DD) for fast lookup
    const holidayDates = new Set(
      holidays.map((h) => h.date.toISOString().split('T')[0])
    );

    // 4. Get all existing attendance records for the month to avoid overwriting
    const existingRecords = await platformPrisma.attendanceRecord.findMany({
      where: {
        companyId,
        date: { gte: monthStart, lte: new Date(year, month - 1, monthEnd.getDate(), 23, 59, 59, 999) },
      },
      select: { employeeId: true, date: true },
    });

    const existingKeys = new Set(
      existingRecords.map((r) => `${r.employeeId}_${r.date.toISOString().split('T')[0]}`)
    );

    // 5. Build the batch of records to create
    const daysInMonth = monthEnd.getDate();
    const recordsToCreate: Array<{
      companyId: string;
      employeeId: string;
      date: Date;
      status: string;
      source: string;
    }> = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dateStr = date.toISOString().split('T')[0];
      const dow = dayOfWeek[date.getDay()];
      const isHoliday = holidayDates.has(dateStr);
      const isWeekOff = dow === weekOff1 || dow === weekOff2;

      if (!isHoliday && !isWeekOff) continue;

      const status = isHoliday ? 'HOLIDAY' : 'WEEK_OFF';

      for (const emp of employees) {
        const key = `${emp.id}_${dateStr}`;
        if (existingKeys.has(key)) continue;

        recordsToCreate.push({
          companyId,
          employeeId: emp.id,
          date,
          status,
          source: 'MANUAL',
        });
      }
    }

    if (recordsToCreate.length === 0) {
      return { created: 0 };
    }

    // 6. Batch create using createMany with skipDuplicates
    const result = await platformPrisma.attendanceRecord.createMany({
      data: recordsToCreate,
      skipDuplicates: true,
    });

    return { created: result.count };
  }

  // ────────────────────────────────────────────────────────────────────
  // Attendance Rules
  // ────────────────────────────────────────────────────────────────────

  async getRules(companyId: string) {
    let rules = await platformPrisma.attendanceRule.findUnique({
      where: { companyId },
    });

    if (!rules) {
      // Create default rules
      rules = await platformPrisma.attendanceRule.create({
        data: {
          companyId,
          dayBoundaryTime: '00:00',
          halfDayThresholdHours: 5.0,
          fullDayThresholdHours: 8.0,
          lateArrivalsAllowed: 3,
          gracePeriodMinutes: 15,
          earlyExitMinutes: 15,
          lopAutoDeduct: true,
          missingPunchAlert: true,
          selfieRequired: false,
          gpsRequired: false,
        },
      });
    }

    return rules;
  }

  async updateRules(companyId: string, data: any) {
    return platformPrisma.attendanceRule.upsert({
      where: { companyId },
      create: {
        companyId,
        dayBoundaryTime: data.dayBoundaryTime ?? '00:00',
        halfDayThresholdHours: data.halfDayThresholdHours ?? 5.0,
        fullDayThresholdHours: data.fullDayThresholdHours ?? 8.0,
        lateArrivalsAllowed: data.lateArrivalsAllowed ?? 3,
        gracePeriodMinutes: data.gracePeriodMinutes ?? 15,
        earlyExitMinutes: data.earlyExitMinutes ?? 15,
        lopAutoDeduct: data.lopAutoDeduct ?? true,
        missingPunchAlert: data.missingPunchAlert ?? true,
        selfieRequired: data.selfieRequired ?? false,
        gpsRequired: data.gpsRequired ?? false,
      },
      update: {
        ...(data.dayBoundaryTime !== undefined && { dayBoundaryTime: data.dayBoundaryTime }),
        ...(data.halfDayThresholdHours !== undefined && { halfDayThresholdHours: data.halfDayThresholdHours }),
        ...(data.fullDayThresholdHours !== undefined && { fullDayThresholdHours: data.fullDayThresholdHours }),
        ...(data.lateArrivalsAllowed !== undefined && { lateArrivalsAllowed: data.lateArrivalsAllowed }),
        ...(data.gracePeriodMinutes !== undefined && { gracePeriodMinutes: data.gracePeriodMinutes }),
        ...(data.earlyExitMinutes !== undefined && { earlyExitMinutes: data.earlyExitMinutes }),
        ...(data.lopAutoDeduct !== undefined && { lopAutoDeduct: data.lopAutoDeduct }),
        ...(data.missingPunchAlert !== undefined && { missingPunchAlert: data.missingPunchAlert }),
        ...(data.selfieRequired !== undefined && { selfieRequired: data.selfieRequired }),
        ...(data.gpsRequired !== undefined && { gpsRequired: data.gpsRequired }),
      },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Overrides / Regularization
  // ────────────────────────────────────────────────────────────────────

  async listOverrides(companyId: string, options: OverrideListOptions = {}) {
    const { page = 1, limit = 25, status } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (status) {
      where.status = status;
    }

    const [overrides, total] = await Promise.all([
      platformPrisma.attendanceOverride.findMany({
        where,
        include: {
          attendanceRecord: {
            include: {
              employee: {
                select: {
                  id: true,
                  employeeId: true,
                  firstName: true,
                  lastName: true,
                  department: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.attendanceOverride.count({ where }),
    ]);

    return { overrides, total, page, limit };
  }

  async createOverride(companyId: string, userId: string, data: any) {
    // Verify attendance record belongs to company
    const record = await platformPrisma.attendanceRecord.findUnique({
      where: { id: data.attendanceRecordId },
    });
    if (!record || record.companyId !== companyId) {
      throw ApiError.notFound('Attendance record not found');
    }

    // Check if payroll is locked for this record's month
    const recordDate = new Date(record.date);
    const recordMonth = recordDate.getMonth() + 1;
    const recordYear = recordDate.getFullYear();

    const payrollRun = await platformPrisma.payrollRun.findUnique({
      where: { companyId_month_year: { companyId, month: recordMonth, year: recordYear } },
    });

    if (payrollRun && payrollRun.status !== 'DRAFT') {
      throw ApiError.badRequest(
        `Cannot create override: attendance for ${recordMonth}/${recordYear} is locked for payroll processing (status: ${payrollRun.status})`
      );
    }

    return platformPrisma.attendanceOverride.create({
      data: {
        companyId,
        attendanceRecordId: data.attendanceRecordId,
        issueType: data.issueType,
        correctedPunchIn: data.correctedPunchIn ? new Date(data.correctedPunchIn) : null,
        correctedPunchOut: data.correctedPunchOut ? new Date(data.correctedPunchOut) : null,
        reason: data.reason,
        requestedBy: userId,
        status: 'PENDING',
      },
      include: {
        attendanceRecord: {
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
        },
      },
    });
  }

  async processOverride(companyId: string, overrideId: string, userId: string, status: 'APPROVED' | 'REJECTED') {
    const override = await platformPrisma.attendanceOverride.findUnique({
      where: { id: overrideId },
      include: { attendanceRecord: true },
    });

    if (!override || override.companyId !== companyId) {
      throw ApiError.notFound('Override request not found');
    }

    if (override.status !== 'PENDING') {
      throw ApiError.badRequest('Override request has already been processed');
    }

    // Update the override
    const updatedOverride = await platformPrisma.attendanceOverride.update({
      where: { id: overrideId },
      data: {
        status,
        approvedBy: userId,
      },
    });

    // If approved, update the parent attendance record
    if (status === 'APPROVED') {
      const record = override.attendanceRecord;
      const updateData: any = {};

      if (override.correctedPunchIn) {
        updateData.punchIn = override.correctedPunchIn;
      }
      if (override.correctedPunchOut) {
        updateData.punchOut = override.correctedPunchOut;
      }

      // Recalculate worked hours if punches changed
      const newPunchIn = override.correctedPunchIn ?? record.punchIn;
      const newPunchOut = override.correctedPunchOut ?? record.punchOut;

      if (newPunchIn && newPunchOut) {
        const diffMs = newPunchOut.getTime() - newPunchIn.getTime();
        const workedHours = Math.max(0, diffMs / (1000 * 60 * 60));
        updateData.workedHours = Math.round(workedHours * 100) / 100;

        // Re-evaluate status based on rules
        const rules = await this.getRules(companyId);
        const fullDayThreshold = rules.fullDayThresholdHours ? Number(rules.fullDayThresholdHours) : 8;
        const halfDayThreshold = rules.halfDayThresholdHours ? Number(rules.halfDayThresholdHours) : 5;

        if (workedHours >= fullDayThreshold) {
          updateData.status = 'PRESENT';
        } else if (workedHours >= halfDayThreshold) {
          updateData.status = 'HALF_DAY';
        }

        // Re-evaluate late/early exit
        const shiftId = record.shiftId;
        if (shiftId) {
          const shift = await platformPrisma.companyShift.findUnique({ where: { id: shiftId } });
          if (shift) {
            const { isLate, lateMinutes, isEarlyExit, earlyMinutes } =
              this.detectLateAndEarlyExit(newPunchIn, newPunchOut, shift, rules);
            updateData.isLate = isLate;
            updateData.lateMinutes = lateMinutes;
            updateData.isEarlyExit = isEarlyExit;
            updateData.earlyMinutes = earlyMinutes;
          }
        }
      }

      // Handle absent override — mark as present
      if (override.issueType === 'ABSENT_OVERRIDE') {
        updateData.status = 'PRESENT';
      }

      // Handle late override — clear late flag
      if (override.issueType === 'LATE_OVERRIDE') {
        updateData.isLate = false;
        updateData.lateMinutes = 0;
      }

      // Mark as regularized
      updateData.isRegularized = true;
      updateData.regularizedAt = new Date();
      updateData.regularizedBy = userId;
      updateData.regularizationReason = override.reason;

      if (Object.keys(updateData).length > 0) {
        await platformPrisma.attendanceRecord.update({
          where: { id: record.id },
          data: updateData,
        });
      }
    }

    return updatedOverride;
  }

  // ────────────────────────────────────────────────────────────────────
  // Holiday Calendar
  // ────────────────────────────────────────────────────────────────────

  async listHolidays(companyId: string, options: HolidayListOptions = {}) {
    const { page = 1, limit = 50, year, type } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (year) where.year = year;
    if (type) where.type = type;

    const [holidays, total] = await Promise.all([
      platformPrisma.holidayCalendar.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { date: 'asc' },
      }),
      platformPrisma.holidayCalendar.count({ where }),
    ]);

    return { holidays, total, page, limit };
  }

  async createHoliday(companyId: string, data: any) {
    // Validate unique name+date
    const existing = await platformPrisma.holidayCalendar.findUnique({
      where: {
        companyId_name_date: {
          companyId,
          name: data.name,
          date: new Date(data.date),
        },
      },
    });
    if (existing) {
      throw ApiError.conflict(`Holiday "${data.name}" already exists on this date`);
    }

    return platformPrisma.holidayCalendar.create({
      data: {
        companyId,
        name: data.name,
        date: new Date(data.date),
        type: data.type,
        branchIds: data.branchIds ?? Prisma.JsonNull,
        year: data.year,
        description: n(data.description),
        isOptional: data.isOptional ?? false,
        maxOptionalSlots: n(data.maxOptionalSlots),
      },
    });
  }

  async updateHoliday(companyId: string, id: string, data: any) {
    const holiday = await platformPrisma.holidayCalendar.findUnique({ where: { id } });
    if (!holiday || holiday.companyId !== companyId) {
      throw ApiError.notFound('Holiday not found');
    }

    return platformPrisma.holidayCalendar.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.date !== undefined && { date: new Date(data.date) }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.branchIds !== undefined && { branchIds: data.branchIds ?? Prisma.JsonNull }),
        ...(data.year !== undefined && { year: data.year }),
        ...(data.description !== undefined && { description: n(data.description) }),
        ...(data.isOptional !== undefined && { isOptional: data.isOptional }),
        ...(data.maxOptionalSlots !== undefined && { maxOptionalSlots: n(data.maxOptionalSlots) }),
      },
    });
  }

  async deleteHoliday(companyId: string, id: string) {
    const holiday = await platformPrisma.holidayCalendar.findUnique({ where: { id } });
    if (!holiday || holiday.companyId !== companyId) {
      throw ApiError.notFound('Holiday not found');
    }

    await platformPrisma.holidayCalendar.delete({ where: { id } });
    return { message: 'Holiday deleted' };
  }

  async cloneHolidays(companyId: string, fromYear: number, toYear: number) {
    if (fromYear === toYear) {
      throw ApiError.badRequest('Source and target years must be different');
    }

    const sourceHolidays = await platformPrisma.holidayCalendar.findMany({
      where: { companyId, year: fromYear },
    });

    if (sourceHolidays.length === 0) {
      throw ApiError.notFound(`No holidays found for year ${fromYear}`);
    }

    // Check for existing holidays in target year
    const existingCount = await platformPrisma.holidayCalendar.count({
      where: { companyId, year: toYear },
    });
    if (existingCount > 0) {
      throw ApiError.conflict(`Holidays already exist for year ${toYear}. Delete them first or choose a different year.`);
    }

    const yearDiff = toYear - fromYear;

    const clonedHolidays = await platformPrisma.$transaction(
      sourceHolidays.map((holiday) => {
        const newDate = new Date(holiday.date);
        newDate.setFullYear(newDate.getFullYear() + yearDiff);

        return platformPrisma.holidayCalendar.create({
          data: {
            companyId,
            name: holiday.name,
            date: newDate,
            type: holiday.type,
            branchIds: holiday.branchIds ?? Prisma.JsonNull,
            year: toYear,
            description: holiday.description,
            isOptional: holiday.isOptional,
            maxOptionalSlots: holiday.maxOptionalSlots,
          },
        });
      })
    );

    return { cloned: clonedHolidays.length, holidays: clonedHolidays };
  }

  // ────────────────────────────────────────────────────────────────────
  // Rosters
  // ────────────────────────────────────────────────────────────────────

  async listRosters(companyId: string) {
    return platformPrisma.roster.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async createRoster(companyId: string, data: any) {
    // Validate unique name
    const existing = await platformPrisma.roster.findUnique({
      where: { companyId_name: { companyId, name: data.name } },
    });
    if (existing) {
      throw ApiError.conflict(`Roster "${data.name}" already exists`);
    }

    // If setting as default, unset other defaults
    if (data.isDefault) {
      await platformPrisma.roster.updateMany({
        where: { companyId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return platformPrisma.roster.create({
      data: {
        companyId,
        name: data.name,
        pattern: data.pattern,
        weekOff1: n(data.weekOff1),
        weekOff2: n(data.weekOff2),
        applicableTypeIds: data.applicableTypeIds ?? Prisma.JsonNull,
        effectiveFrom: new Date(data.effectiveFrom),
        isDefault: data.isDefault ?? false,
      },
    });
  }

  async updateRoster(companyId: string, id: string, data: any) {
    const roster = await platformPrisma.roster.findUnique({ where: { id } });
    if (!roster || roster.companyId !== companyId) {
      throw ApiError.notFound('Roster not found');
    }

    // If name is changing, check uniqueness
    if (data.name && data.name !== roster.name) {
      const existing = await platformPrisma.roster.findUnique({
        where: { companyId_name: { companyId, name: data.name } },
      });
      if (existing) {
        throw ApiError.conflict(`Roster "${data.name}" already exists`);
      }
    }

    // If setting as default, unset other defaults
    if (data.isDefault) {
      await platformPrisma.roster.updateMany({
        where: { companyId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    return platformPrisma.roster.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.pattern !== undefined && { pattern: data.pattern }),
        ...(data.weekOff1 !== undefined && { weekOff1: n(data.weekOff1) }),
        ...(data.weekOff2 !== undefined && { weekOff2: n(data.weekOff2) }),
        ...(data.applicableTypeIds !== undefined && { applicableTypeIds: data.applicableTypeIds ?? Prisma.JsonNull }),
        ...(data.effectiveFrom !== undefined && { effectiveFrom: new Date(data.effectiveFrom) }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
      },
    });
  }

  async deleteRoster(companyId: string, id: string) {
    const roster = await platformPrisma.roster.findUnique({ where: { id } });
    if (!roster || roster.companyId !== companyId) {
      throw ApiError.notFound('Roster not found');
    }

    await platformPrisma.roster.delete({ where: { id } });
    return { message: 'Roster deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Overtime Rules
  // ────────────────────────────────────────────────────────────────────

  async getOvertimeRules(companyId: string) {
    let rules = await platformPrisma.overtimeRule.findUnique({
      where: { companyId },
    });

    if (!rules) {
      rules = await platformPrisma.overtimeRule.create({
        data: {
          companyId,
          rateMultiplier: 1.5,
          thresholdMinutes: 30,
          autoIncludePayroll: false,
          approvalRequired: true,
        },
      });
    }

    return rules;
  }

  async updateOvertimeRules(companyId: string, data: any) {
    return platformPrisma.overtimeRule.upsert({
      where: { companyId },
      create: {
        companyId,
        eligibleTypeIds: data.eligibleTypeIds ?? Prisma.JsonNull,
        rateMultiplier: data.rateMultiplier ?? 1.5,
        thresholdMinutes: n(data.thresholdMinutes),
        monthlyCap: n(data.monthlyCap),
        weeklyCap: n(data.weeklyCap),
        autoIncludePayroll: data.autoIncludePayroll ?? false,
        approvalRequired: data.approvalRequired ?? true,
      },
      update: {
        ...(data.eligibleTypeIds !== undefined && { eligibleTypeIds: data.eligibleTypeIds ?? Prisma.JsonNull }),
        ...(data.rateMultiplier !== undefined && { rateMultiplier: data.rateMultiplier }),
        ...(data.thresholdMinutes !== undefined && { thresholdMinutes: n(data.thresholdMinutes) }),
        ...(data.monthlyCap !== undefined && { monthlyCap: n(data.monthlyCap) }),
        ...(data.weeklyCap !== undefined && { weeklyCap: n(data.weeklyCap) }),
        ...(data.autoIncludePayroll !== undefined && { autoIncludePayroll: data.autoIncludePayroll }),
        ...(data.approvalRequired !== undefined && { approvalRequired: data.approvalRequired }),
      },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ────────────────────────────────────────────────────────────────────

  private async calculateAttendanceMetrics(
    companyId: string,
    data: any,
    employeeShiftId: string | null
  ) {
    let workedHours: number | null = null;
    let isLate = false;
    let lateMinutes: number | null = null;
    let isEarlyExit = false;
    let earlyMinutes: number | null = null;

    const punchIn = data.punchIn ? new Date(data.punchIn) : null;
    const punchOut = data.punchOut ? new Date(data.punchOut) : null;

    // Calculate worked hours
    if (punchIn && punchOut) {
      const diffMs = punchOut.getTime() - punchIn.getTime();
      workedHours = Math.max(0, Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100);
    }

    // Detect late arrival and early exit using shift + rules
    const shiftId = data.shiftId ?? employeeShiftId;
    if (shiftId && (punchIn || punchOut)) {
      const shift = await platformPrisma.companyShift.findUnique({ where: { id: shiftId } });
      const rules = await this.getRules(companyId);

      if (shift) {
        const result = this.detectLateAndEarlyExit(punchIn, punchOut, shift, rules);
        isLate = result.isLate;
        lateMinutes = result.lateMinutes;
        isEarlyExit = result.isEarlyExit;
        earlyMinutes = result.earlyMinutes;
      }
    }

    return { workedHours, isLate, lateMinutes, isEarlyExit, earlyMinutes };
  }

  private detectLateAndEarlyExit(
    punchIn: Date | null,
    punchOut: Date | null,
    shift: { fromTime: string; toTime: string },
    rules: any
  ) {
    let isLate = false;
    let lateMinutes: number | null = null;
    let isEarlyExit = false;
    let earlyMinutes: number | null = null;

    const gracePeriod = rules.gracePeriodMinutes ? Number(rules.gracePeriodMinutes) : 0;
    const earlyExitTolerance = rules.earlyExitMinutes ? Number(rules.earlyExitMinutes) : 0;

    // Check late arrival
    if (punchIn && shift.fromTime) {
      const parts = shift.fromTime.split(':').map(Number);
      const shiftHour = parts[0] ?? 0;
      const shiftMin = parts[1] ?? 0;
      const shiftStart = new Date(punchIn);
      shiftStart.setHours(shiftHour, shiftMin, 0, 0);

      // Add grace period
      const graceEnd = new Date(shiftStart.getTime() + gracePeriod * 60 * 1000);
      const diffMs = punchIn.getTime() - graceEnd.getTime();

      if (diffMs > 0) {
        isLate = true;
        lateMinutes = Math.ceil(diffMs / (60 * 1000));
      }
    }

    // Check early exit (with night-shift cross-midnight support)
    if (punchOut && shift.toTime) {
      const fromParts = shift.fromTime.split(':').map(Number);
      const toParts = shift.toTime.split(':').map(Number);
      const fromMinutes = (fromParts[0] ?? 0) * 60 + (fromParts[1] ?? 0);
      const toMinutes = (toParts[0] ?? 0) * 60 + (toParts[1] ?? 0);
      const isOvernightShift = toMinutes < fromMinutes;

      const shiftEnd = new Date(punchOut);
      shiftEnd.setHours(toParts[0] ?? 0, toParts[1] ?? 0, 0, 0);

      // If overnight shift and punchOut is still on the first day (before midnight),
      // the shift end is on the next day
      if (isOvernightShift && punchOut.getHours() >= (fromParts[0] ?? 0)) {
        shiftEnd.setDate(shiftEnd.getDate() + 1);
      }

      const toleranceEnd = new Date(shiftEnd.getTime() - earlyExitTolerance * 60 * 1000);
      const diffMs = toleranceEnd.getTime() - punchOut.getTime();

      if (diffMs > 0) {
        isEarlyExit = true;
        earlyMinutes = Math.ceil(diffMs / (60 * 1000));
      }
    }

    return { isLate, lateMinutes, isEarlyExit, earlyMinutes };
  }
}

export const attendanceService = new AttendanceService();
