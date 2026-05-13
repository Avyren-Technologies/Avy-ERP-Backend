import { getCachedAttendanceRules, getCachedCompanySettings } from '../../../../../../shared/utils/config-cache';
import { logger } from '../../../../../../config/logger';
import type { DashboardFilters, DataScope } from '../../../analytics.types';
import type {
  ReportDataset,
  ReportMode,
  FlatRecord,
  EmployeeSummary,
  HalfInfo,
  OverrideInfo,
  AuditEntry,
  HolidayInfo,
  LeaveBalanceInfo,
  DeptBreakdown,
  ShiftBreakdown,
} from './types';
import { DAY_NAMES, STATUS_CODES } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function flattenRecord(r: any): FlatRecord {
  const emp = r.employee ?? {};
  const shift = r.shift ?? emp.shift ?? {};
  const dateObj = new Date(r.date);
  const dateStr = dateObj.toISOString().slice(0, 10);

  return {
    id: r.id,
    employeeId: r.employeeId,
    date: dateObj,
    dateStr,
    dayOfWeek: DAY_NAMES[dateObj.getUTCDay()] ?? 'Sun',
    status: r.status,
    source: r.source ?? '',
    shiftSequence: r.shiftSequence ?? 1,
    punchIn: r.punchIn ? new Date(r.punchIn) : null,
    punchOut: r.punchOut ? new Date(r.punchOut) : null,
    workedHours: Number(r.workedHours ?? 0),
    overtimeHours: Number(r.overtimeHours ?? 0),
    isLate: r.isLate ?? false,
    lateMinutes: r.lateMinutes ?? 0,
    isEarlyExit: r.isEarlyExit ?? false,
    earlyMinutes: r.earlyMinutes ?? 0,
    appliedBreakDeductionMinutes: r.appliedBreakDeductionMinutes ?? 0,
    appliedLateDeduction: Number(r.appliedLateDeduction ?? 0),
    appliedEarlyExitDeduction: Number(r.appliedEarlyExitDeduction ?? 0),
    geoStatus: r.geoStatus ?? null,
    isRegularized: r.isRegularized ?? false,
    finalStatusReason: r.finalStatusReason ?? null,
    remarks: r.remarks ?? null,
    checkInLatitude: r.checkInLatitude ?? null,
    checkInLongitude: r.checkInLongitude ?? null,
    resolutionTrace: (r.resolutionTrace as Record<string, unknown>) ?? null,
    evaluationContext: (r.evaluationContext as Record<string, unknown>) ?? null,
    updatedAt: new Date(r.updatedAt),
    empCode: emp.employeeId ?? '',
    empName: [emp.firstName, emp.lastName].filter(Boolean).join(' ') || '—',
    department: emp.department?.name ?? '',
    designation: emp.designation?.name ?? '',
    location: r.location?.name ?? emp.location?.name ?? '',
    reportingManager: emp.reportingManager
      ? [emp.reportingManager.firstName, emp.reportingManager.lastName].filter(Boolean).join(' ')
      : '',
    employeeType: emp.employeeType?.name ?? '',
    joiningDate: emp.joiningDate ? new Date(emp.joiningDate) : null,
    fatherMotherName: emp.fatherMotherName ?? null,
    shiftName: shift.name ?? '',
    shiftStart: shift.startTime ?? '',
    shiftEnd: shift.endTime ?? '',
    shiftIsCrossDay: shift.isCrossDay ?? false,
    shiftType: shift.shiftType ?? 'DAY',
    halves: (r.halves ?? []).map((h: any): HalfInfo => ({
      half: h.half,
      status: h.status,
      leaveTypeCode: h.leaveType?.code ?? null,
      leaveTypeName: h.leaveType?.name ?? null,
    })),
  };
}

function buildIndexes(records: FlatRecord[]) {
  const byEmployee = new Map<string, FlatRecord[]>();
  const byDate = new Map<string, FlatRecord[]>();
  const byEmployeeDate = new Map<string, FlatRecord[]>();
  const employees = new Map<string, FlatRecord>();

  for (const rec of records) {
    // byEmployee
    const empArr = byEmployee.get(rec.employeeId) ?? [];
    empArr.push(rec);
    byEmployee.set(rec.employeeId, empArr);

    // byDate
    const dateArr = byDate.get(rec.dateStr) ?? [];
    dateArr.push(rec);
    byDate.set(rec.dateStr, dateArr);

    // byEmployeeDate
    const edKey = `${rec.employeeId}:${rec.dateStr}`;
    const edArr = byEmployeeDate.get(edKey) ?? [];
    edArr.push(rec);
    byEmployeeDate.set(edKey, edArr);

    // employees — first record per employee (for employee info)
    if (!employees.has(rec.employeeId)) {
      employees.set(rec.employeeId, rec);
    }
  }

  return { byEmployee, byDate, byEmployeeDate, employees };
}

function buildEmployeeSummaries(
  byEmployee: Map<string, FlatRecord[]>,
  leaveBalanceMap: Map<string, LeaveBalanceInfo[]>,
): Map<string, EmployeeSummary> {
  const summaries = new Map<string, EmployeeSummary>();

  for (const [empId, records] of byEmployee) {
    const first = records[0]!;
    const summary: EmployeeSummary = {
      employeeId: empId,
      empCode: first.empCode,
      empName: first.empName,
      department: first.department,
      designation: first.designation,
      location: first.location,
      reportingManager: first.reportingManager,
      employeeType: first.employeeType,
      joiningDate: first.joiningDate,
      fatherMotherName: first.fatherMotherName,
      shiftName: first.shiftName,
      presentDays: 0,
      absentDays: 0,
      leaveDays: 0,
      halfDays: 0,
      lateDays: 0,
      earlyExitDays: 0,
      holidayDays: 0,
      weekOffDays: 0,
      lopDays: 0,
      incompleteDays: 0,
      regularizedDays: 0,
      totalWorkedHours: 0,
      totalOTHours: 0,
      totalLateDeduction: 0,
      totalEarlyExitDeduction: 0,
      paidDays: 0,
      holidayWorkedDays: 0,
      weekOffWorkedDays: 0,
      nightShiftDays: 0,
      leaveByType: {},
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
    };

    for (const rec of records) {
      summary.totalWorkedHours += rec.workedHours;
      summary.totalOTHours += rec.overtimeHours;
      summary.totalLateDeduction += rec.appliedLateDeduction;
      summary.totalEarlyExitDeduction += rec.appliedEarlyExitDeduction;

      if (rec.shiftSequence > 1) continue; // Skip sub-sessions for day counts

      switch (rec.status) {
        case 'PRESENT':
          summary.presentDays++;
          break;
        case 'ABSENT':
          summary.absentDays++;
          break;
        case 'ON_LEAVE':
          summary.leaveDays++;
          break;
        case 'HALF_DAY':
          summary.halfDays++;
          break;
        case 'LATE':
          summary.lateDays++;
          summary.presentDays++;
          break;
        case 'EARLY_EXIT':
          summary.earlyExitDays++;
          summary.presentDays++;
          break;
        case 'HOLIDAY':
          summary.holidayDays++;
          break;
        case 'WEEK_OFF':
          summary.weekOffDays++;
          break;
        case 'LOP':
          summary.lopDays++;
          break;
        case 'INCOMPLETE':
          summary.incompleteDays++;
          break;
        case 'REGULARIZED':
          summary.regularizedDays++;
          summary.presentDays++;
          break;
      }

      if (rec.isEarlyExit) summary.earlyExitDays++;
      if (rec.isRegularized) summary.regularizedDays++;
      if (rec.shiftType === 'NIGHT') summary.nightShiftDays++;

      // Holiday/WeekOff worked
      if (rec.status === 'HOLIDAY' && rec.workedHours > 0) summary.holidayWorkedDays++;
      if (rec.status === 'WEEK_OFF' && rec.workedHours > 0) summary.weekOffWorkedDays++;

      // Leave type breakdown from halves
      for (const half of rec.halves) {
        if (half.status === 'ON_LEAVE' && half.leaveTypeCode) {
          summary.leaveByType[half.leaveTypeCode] =
            (summary.leaveByType[half.leaveTypeCode] ?? 0) + 0.5;
        }
      }
    }

    // Determine paid vs unpaid leave from leave balance categories
    const balances = leaveBalanceMap.get(empId) ?? [];
    for (const bal of balances) {
      const usedDays = summary.leaveByType[bal.leaveTypeCode] ?? 0;
      if (usedDays > 0) {
        if (
          bal.category === 'PAID' ||
          bal.category === 'STATUTORY' ||
          bal.category === 'COMPENSATORY'
        ) {
          summary.paidLeaveDays += usedDays;
        } else {
          summary.unpaidLeaveDays += usedDays;
        }
      }
    }

    // Paid days = present + half*0.5 + paid leave + holiday + weekoff
    summary.paidDays =
      summary.presentDays +
      summary.halfDays * 0.5 +
      summary.paidLeaveDays +
      summary.holidayDays +
      summary.weekOffDays;

    summaries.set(empId, summary);
  }

  return summaries;
}

function buildStatusCounts(records: FlatRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const rec of records) {
    if (rec.shiftSequence > 1) continue;
    counts[rec.status] = (counts[rec.status] ?? 0) + 1;
  }
  return counts;
}

function buildDeptBreakdown(records: FlatRecord[]): DeptBreakdown[] {
  const deptMap = new Map<
    string,
    {
      employeeSet: Set<string>;
      present: number;
      absent: number;
      leave: number;
      late: number;
      halfDay: number;
      otHours: number;
      workedHours: number;
      total: number;
    }
  >();

  for (const rec of records) {
    if (rec.shiftSequence > 1) continue;
    const dept = rec.department || '(No Department)';
    const entry = deptMap.get(dept) ?? {
      employeeSet: new Set<string>(),
      present: 0,
      absent: 0,
      leave: 0,
      late: 0,
      halfDay: 0,
      otHours: 0,
      workedHours: 0,
      total: 0,
    };
    entry.employeeSet.add(rec.employeeId);
    entry.total++;
    entry.workedHours += rec.workedHours;
    entry.otHours += rec.overtimeHours;
    switch (rec.status) {
      case 'PRESENT':
      case 'REGULARIZED':
        entry.present++;
        break;
      case 'LATE':
        entry.late++;
        entry.present++;
        break;
      case 'EARLY_EXIT':
        entry.present++;
        break;
      case 'ABSENT':
        entry.absent++;
        break;
      case 'ON_LEAVE':
        entry.leave++;
        break;
      case 'HALF_DAY':
        entry.halfDay++;
        break;
    }
    deptMap.set(dept, entry);
  }

  const result: DeptBreakdown[] = [];
  for (const [department, entry] of deptMap) {
    const attendancePct =
      entry.total > 0 ? Math.round((entry.present / entry.total) * 100 * 10) / 10 : 0;
    result.push({
      department,
      employees: entry.employeeSet.size,
      present: entry.present,
      absent: entry.absent,
      leave: entry.leave,
      late: entry.late,
      halfDay: entry.halfDay,
      otHours: Math.round(entry.otHours * 100) / 100,
      workedHours: Math.round(entry.workedHours * 100) / 100,
      total: entry.total,
      attendancePct,
    });
  }
  result.sort((a, b) => a.department.localeCompare(b.department));
  return result;
}

function buildShiftBreakdown(records: FlatRecord[]): ShiftBreakdown[] {
  const shiftMap = new Map<
    string,
    {
      shiftTiming: string;
      shiftType: string;
      isCrossDay: boolean;
      employeeSet: Set<string>;
      totalRecords: number;
      workedHoursTotal: number;
      lateCount: number;
      otHoursTotal: number;
      presentCount: number;
    }
  >();

  for (const rec of records) {
    if (rec.shiftSequence > 1) continue;
    const key = rec.shiftName || '(Default)';
    const entry = shiftMap.get(key) ?? {
      shiftTiming: rec.shiftStart && rec.shiftEnd ? `${rec.shiftStart}–${rec.shiftEnd}` : '',
      shiftType: rec.shiftType,
      isCrossDay: rec.shiftIsCrossDay,
      employeeSet: new Set<string>(),
      totalRecords: 0,
      workedHoursTotal: 0,
      lateCount: 0,
      otHoursTotal: 0,
      presentCount: 0,
    };
    entry.employeeSet.add(rec.employeeId);
    entry.totalRecords++;
    entry.workedHoursTotal += rec.workedHours;
    entry.otHoursTotal += rec.overtimeHours;
    if (rec.isLate) entry.lateCount++;
    if (
      rec.status === 'PRESENT' ||
      rec.status === 'LATE' ||
      rec.status === 'EARLY_EXIT' ||
      rec.status === 'REGULARIZED'
    ) {
      entry.presentCount++;
    }
    shiftMap.set(key, entry);
  }

  const result: ShiftBreakdown[] = [];
  for (const [shiftName, entry] of shiftMap) {
    const assignedEmployees = entry.employeeSet.size;
    const avgWorkedHours =
      entry.totalRecords > 0
        ? Math.round((entry.workedHoursTotal / entry.totalRecords) * 100) / 100
        : 0;
    const latePct =
      entry.totalRecords > 0
        ? Math.round((entry.lateCount / entry.totalRecords) * 100 * 10) / 10
        : 0;
    const avgOTHours =
      entry.totalRecords > 0
        ? Math.round((entry.otHoursTotal / entry.totalRecords) * 100) / 100
        : 0;
    const attendancePct =
      entry.totalRecords > 0
        ? Math.round((entry.presentCount / entry.totalRecords) * 100 * 10) / 10
        : 0;
    result.push({
      shiftName,
      shiftTiming: entry.shiftTiming,
      shiftType: entry.shiftType,
      isCrossDay: entry.isCrossDay,
      assignedEmployees,
      totalRecords: entry.totalRecords,
      avgWorkedHours,
      lateCount: entry.lateCount,
      latePct,
      otHoursTotal: Math.round(entry.otHoursTotal * 100) / 100,
      avgOTHours,
      attendancePct,
    });
  }
  result.sort((a, b) => a.shiftName.localeCompare(b.shiftName));
  return result;
}

// ─── Main Exported Function ───────────────────────────────────────────────────

export async function fetchReportDataset(
  tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
  mode: ReportMode,
  generatedBy?: string,
): Promise<ReportDataset> {
  // 1. Build date range helpers
  const dateFrom = new Date(filters.dateFrom);
  const dateTo = new Date(filters.dateTo);
  const dayCount =
    Math.round((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const allDates: string[] = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(dateFrom);
    d.setUTCDate(d.getUTCDate() + i);
    allDates.push(d.toISOString().slice(0, 10));
  }

  const companySettings = await getCachedCompanySettings(scope.companyId);
  const companyTimezone: string = (companySettings as any).timezone ?? 'UTC';

  // 2. Build attendance record WHERE clause
  const where: any = {
    companyId: scope.companyId,
    date: {
      gte: new Date(filters.dateFrom),
      lte: new Date(filters.dateTo + 'T23:59:59.999Z'),
    },
  };
  if (filters.departmentId) {
    where.employee = { ...where.employee, departmentId: filters.departmentId };
  }
  if (filters.locationId) {
    where.locationId = filters.locationId;
  }
  if (filters.shiftId) {
    where.shiftId = filters.shiftId;
  }
  if (filters.designationId) {
    where.employee = { ...where.employee, designationId: filters.designationId };
  }
  if (scope.departmentIds?.length) {
    where.employee = { ...where.employee, departmentId: { in: scope.departmentIds } };
  }
  if (scope.employeeIds?.length) {
    where.employeeId = { in: scope.employeeIds };
  }

  // 3. Execute parallel queries
  const [
    rawRecords,
    rawOverrides,
    rawLeaveBalances,
    rawLeaveRequests,
    rawHolidays,
    rawRoster,
    attendanceRules,
    rawPayrollRun,
    rawAuditLogs,
    totalEmployeeCount,
    filteredEmployeeCount,
  ] = await Promise.all([
    // 1. Primary attendance records with full includes
    tenantDb.attendanceRecord.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            fatherMotherName: true,
            joiningDate: true,
            department: { select: { name: true } },
            designation: { select: { name: true } },
            location: { select: { name: true } },
            employeeType: { select: { name: true } },
            shift: {
              select: {
                name: true,
                startTime: true,
                endTime: true,
                isCrossDay: true,
                shiftType: true,
              },
            },
            reportingManager: { select: { firstName: true, lastName: true } },
          },
        },
        halves: {
          include: {
            leaveType: { select: { code: true, name: true, category: true } },
          },
        },
        shift: {
          select: {
            name: true,
            startTime: true,
            endTime: true,
            isCrossDay: true,
            shiftType: true,
          },
        },
        location: { select: { name: true } },
      },
      orderBy: [{ employeeId: 'asc' }, { date: 'asc' }, { shiftSequence: 'asc' }],
    }),
    // 2. Overrides
    tenantDb.attendanceOverride.findMany({
      where: {
        companyId: scope.companyId,
        attendanceRecord: {
          date: {
            gte: new Date(filters.dateFrom),
            lte: new Date(filters.dateTo + 'T23:59:59.999Z'),
          },
        },
      },
      select: {
        id: true,
        attendanceRecordId: true,
        issueType: true,
        status: true,
        correctedPunchIn: true,
        correctedPunchOut: true,
        reason: true,
        attendanceRecord: { select: { employeeId: true } },
      },
    }),
    // 3. Leave balances for employees in scope (current year)
    tenantDb.leaveBalance.findMany({
      where: {
        employee: { companyId: scope.companyId },
        year: new Date(filters.dateFrom).getFullYear(),
      },
      include: {
        leaveType: {
          select: {
            id: true,
            code: true,
            name: true,
            category: true,
            annualEntitlement: true,
          },
        },
      },
    }),
    // 4. Pending leave requests
    tenantDb.leaveRequest.findMany({
      where: {
        companyId: scope.companyId,
        status: 'PENDING',
        fromDate: { gte: new Date(filters.dateFrom) },
        toDate: { lte: new Date(filters.dateTo + 'T23:59:59.999Z') },
      },
      select: { employeeId: true, leaveTypeId: true, days: true },
    }),
    // 5. Holidays in range
    tenantDb.holidayCalendar.findMany({
      where: {
        companyId: scope.companyId,
        date: {
          gte: new Date(filters.dateFrom),
          lte: new Date(filters.dateTo + 'T23:59:59.999Z'),
        },
      },
      select: { name: true, date: true, type: true },
    }),
    // 6. Default roster
    tenantDb.roster.findFirst({
      where: { companyId: scope.companyId, isDefault: true },
      select: { name: true, pattern: true, weekOff1: true, weekOff2: true },
    }),
    // 7. Attendance rules (cached)
    getCachedAttendanceRules(scope.companyId),
    // 8. Payroll run for the period month
    tenantDb.payrollRun.findFirst({
      where: {
        companyId: scope.companyId,
        month: new Date(filters.dateFrom).getMonth() + 1,
        year: new Date(filters.dateFrom).getFullYear(),
      },
      select: {
        id: true,
        status: true,
        lockedBy: true,
        lockedAt: true,
        month: true,
        year: true,
      },
    }),
    // 9. Audit logs for attendance changes (limit 5000)
    tenantDb.auditLog.findMany({
      where: {
        companyId: scope.companyId,
        entityType: 'AttendanceRecord',
        changedAt: {
          gte: new Date(filters.dateFrom),
          lte: new Date(filters.dateTo + 'T23:59:59.999Z'),
        },
      },
      select: {
        entityId: true,
        action: true,
        changes: true,
        changedBy: true,
        changedAt: true,
      },
      orderBy: { changedAt: 'desc' },
      take: 5000,
    }),
    // 10. Total employee count
    tenantDb.employee.count({
      where: {
        companyId: scope.companyId,
        status: { in: ['ACTIVE', 'PROBATION', 'CONFIRMED', 'ON_NOTICE'] },
      },
    }),
    // 11. Filtered employee count
    tenantDb.employee.count({
      where: {
        companyId: scope.companyId,
        status: {
          in: filters.includeInactive
            ? ['ACTIVE', 'PROBATION', 'CONFIRMED', 'ON_NOTICE', 'SUSPENDED']
            : ['ACTIVE', 'PROBATION', 'CONFIRMED', 'ON_NOTICE'],
        },
        ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
        ...(filters.designationId ? { designationId: filters.designationId } : {}),
        ...(filters.shiftId ? { shiftId: filters.shiftId } : {}),
      },
    }),
  ]);

  // Overtime rules (may not exist for every company)
  let overtimeRules: Record<string, unknown> | null = null;
  try {
    const otRule = await tenantDb.overtimeRule.findFirst({
      where: { companyId: scope.companyId },
    });
    if (otRule) overtimeRules = otRule as any;
  } catch {
    /* OvertimeRule may not exist */
  }

  // 4. Flatten records
  const records: FlatRecord[] = (rawRecords as any[]).map(flattenRecord);

  // 5. Build indexes
  const { byEmployee, byDate, byEmployeeDate, employees } = buildIndexes(records);

  // 6. Build reference data maps

  // Leave balances map: employeeId -> LeaveBalanceInfo[]
  const leaveBalances = new Map<string, LeaveBalanceInfo[]>();
  for (const lb of rawLeaveBalances as any[]) {
    const empId: string = lb.employeeId;
    const info: LeaveBalanceInfo = {
      leaveTypeId: lb.leaveType?.id ?? lb.leaveTypeId ?? '',
      leaveTypeName: lb.leaveType?.name ?? '',
      leaveTypeCode: lb.leaveType?.code ?? '',
      category: lb.leaveType?.category ?? '',
      annualEntitlement: Number(lb.leaveType?.annualEntitlement ?? 0),
      balance: Number(lb.balance ?? 0),
      taken: Number(lb.taken ?? 0),
      accrued: Number(lb.accrued ?? 0),
    };
    const arr = leaveBalances.get(empId) ?? [];
    arr.push(info);
    leaveBalances.set(empId, arr);
  }

  // Pending leave requests map: employeeId -> { leaveTypeId -> count }
  const pendingLeaveRequests = new Map<string, Record<string, number>>();
  for (const lr of rawLeaveRequests as any[]) {
    const empId: string = lr.employeeId;
    const byType = pendingLeaveRequests.get(empId) ?? {};
    byType[lr.leaveTypeId] = (byType[lr.leaveTypeId] ?? 0) + Number(lr.days ?? 1);
    pendingLeaveRequests.set(empId, byType);
  }

  // Holidays map: dateStr -> HolidayInfo
  const holidays = new Map<string, HolidayInfo>();
  const holidayList: HolidayInfo[] = [];
  const holidayDates = new Set<string>();
  for (const h of rawHolidays as any[]) {
    const dateStr = new Date(h.date).toISOString().slice(0, 10);
    const info: HolidayInfo = { date: dateStr, name: h.name, type: h.type };
    holidays.set(dateStr, info);
    holidayList.push(info);
    holidayDates.add(dateStr);
  }
  holidayList.sort((a, b) => a.date.localeCompare(b.date));

  // Overrides
  const overrides: OverrideInfo[] = (rawOverrides as any[]).map(
    (o: any): OverrideInfo => ({
      id: o.id,
      attendanceRecordId: o.attendanceRecordId,
      employeeId: o.attendanceRecord?.employeeId ?? '',
      issueType: o.issueType ?? '',
      status: o.status ?? '',
      correctedPunchIn: o.correctedPunchIn ? new Date(o.correctedPunchIn) : null,
      correctedPunchOut: o.correctedPunchOut ? new Date(o.correctedPunchOut) : null,
      reason: o.reason ?? '',
    }),
  );

  // 7. Build employee summaries
  const employeeSummaries = buildEmployeeSummaries(byEmployee, leaveBalances);

  // 8. Build KPI aggregations
  const statusCounts = buildStatusCounts(records);
  const deptBreakdown = buildDeptBreakdown(records);
  const shiftBreakdown = buildShiftBreakdown(records);

  // 9. Build weekend dates Set
  const weekendDates = new Set<string>();
  const roster = rawRoster
    ? {
        name: rawRoster.name ?? '',
        pattern: rawRoster.pattern ?? '',
        weekOff1: rawRoster.weekOff1 ?? null,
        weekOff2: rawRoster.weekOff2 ?? null,
      }
    : null;

  if (roster) {
    const dayMap: Record<string, number> = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
    };
    const off1 = roster.weekOff1 ? dayMap[roster.weekOff1] : undefined;
    const off2 = roster.weekOff2 ? dayMap[roster.weekOff2] : undefined;
    for (const dateStr of allDates) {
      const dow = new Date(dateStr).getUTCDay();
      if (dow === off1 || dow === off2) weekendDates.add(dateStr);
    }
  }

  // 10. Build audit entries
  // Build a record-id -> employee info lookup from the flat records
  const recordEmpMap = new Map<string, { empCode: string; empName: string; department: string; dateStr: string }>();
  for (const rec of records) {
    recordEmpMap.set(rec.id, {
      empCode: rec.empCode,
      empName: rec.empName,
      department: rec.department,
      dateStr: rec.dateStr,
    });
  }

  // Batch-fetch user names for audit log changedBy
  const changedByIds = [
    ...new Set((rawAuditLogs as any[]).map((a: any) => a.changedBy).filter(Boolean)),
  ];
  const users =
    changedByIds.length > 0
      ? await tenantDb.user.findMany({
          where: { id: { in: changedByIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
  const userMap = new Map<string, string>(
    (users as any[]).map((u: any) => [
      u.id as string,
      [u.firstName, u.lastName].filter(Boolean).join(' '),
    ]),
  );

  const PAYROLL_IMPACTING_FIELDS = new Set([
    'status',
    'workedHours',
    'overtimeHours',
    'lopDays',
    'paidDays',
    'appliedLateDeduction',
    'appliedEarlyExitDeduction',
  ]);

  const auditEntries: AuditEntry[] = [];
  for (const log of rawAuditLogs as any[]) {
    const empInfo = recordEmpMap.get(log.entityId);
    const changedByName = userMap.get(log.changedBy) ?? log.changedBy ?? '';
    const changes = (log.changes ?? {}) as Record<string, any>;

    if (typeof changes === 'object' && !Array.isArray(changes)) {
      const keys = Object.keys(changes);
      if (keys.length === 0) {
        // No field-level changes — emit a single row for the action
        auditEntries.push({
          changedAt: new Date(log.changedAt),
          attendanceDate: empInfo?.dateStr ?? '',
          empCode: empInfo?.empCode ?? '',
          empName: empInfo?.empName ?? '',
          department: empInfo?.department ?? '',
          action: log.action ?? '',
          fieldChanged: '',
          oldValue: '',
          newValue: '',
          changedByName,
          payrollImpacted: false,
        });
      } else {
        for (const field of keys) {
          const change = changes[field];
          const oldValue = change?.from !== undefined ? String(change.from) : '';
          const newValue = change?.to !== undefined ? String(change.to) : '';
          auditEntries.push({
            changedAt: new Date(log.changedAt),
            attendanceDate: empInfo?.dateStr ?? '',
            empCode: empInfo?.empCode ?? '',
            empName: empInfo?.empName ?? '',
            department: empInfo?.department ?? '',
            action: log.action ?? '',
            fieldChanged: field,
            oldValue,
            newValue,
            changedByName,
            payrollImpacted: PAYROLL_IMPACTING_FIELDS.has(field),
          });
        }
      }
    }
  }

  logger.info(
    `Attendance report dataset: ${records.length} records, ${employees.size} employees`,
  );

  // 11. Assemble and return ReportDataset
  return {
    records,
    byEmployee,
    byDate,
    byEmployeeDate,
    employees,
    employeeSummaries,
    statusCounts,
    deptBreakdown,
    shiftBreakdown,
    overrides,
    holidays,
    holidayList,
    leaveBalances,
    pendingLeaveRequests,
    roster,
    attendanceRules: attendanceRules as unknown as Record<string, unknown>,
    overtimeRules,
    payrollRun: rawPayrollRun
      ? {
          id: rawPayrollRun.id,
          status: rawPayrollRun.status,
          lockedBy: rawPayrollRun.lockedBy ?? null,
          lockedAt: rawPayrollRun.lockedAt ? new Date(rawPayrollRun.lockedAt) : null,
          month: rawPayrollRun.month,
          year: rawPayrollRun.year,
        }
      : null,
    auditEntries,
    companyName,
    companyTimezone,
    totalEmployees: totalEmployeeCount,
    filteredEmployees: filteredEmployeeCount,
    filters,
    scope,
    mode,
    generatedAt: new Date(),
    generatedBy: generatedBy ?? 'System',
    dayCount,
    dateRange: { from: dateFrom, to: dateTo },
    allDates,
    weekendDates,
    holidayDates,
  };
}
