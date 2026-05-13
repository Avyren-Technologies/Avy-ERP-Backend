import type { ReportSheet, SheetColumn } from '../../excel-exporter';
import type { ReportDataset, EmployeeSummary, FlatRecord } from './types';

// ─── Column layout (machine-readable, no colors) ───
const columns: SheetColumn[] = [
  { header: 'Employee UUID',       key: 'employeeId',              width: 36 },
  { header: 'Emp Code',            key: 'empCode',                 width: 12 },
  { header: 'Employee Name',       key: 'empName',                 width: 22 },
  { header: 'Department',          key: 'department',              width: 18 },
  { header: 'Payroll Month',       key: 'payrollMonth',            width: 6,  format: 'number' },
  { header: 'Payroll Year',        key: 'payrollYear',             width: 6,  format: 'number' },
  { header: 'Payroll Cycle ID',    key: 'payrollCycleId',          width: 36 },
  { header: 'Present Days',        key: 'presentDays',             width: 8,  format: 'number' },
  { header: 'Half Days',           key: 'halfDays',                width: 6,  format: 'number' },
  { header: 'Paid Leave',          key: 'paidLeaveDays',           width: 8,  format: 'number' },
  { header: 'Unpaid Leave',        key: 'unpaidLeaveDays',         width: 8,  format: 'number' },
  { header: 'LOP Days',            key: 'lopDays',                 width: 6,  format: 'number' },
  { header: 'Holiday Days',        key: 'holidayDays',             width: 6,  format: 'number' },
  { header: 'Week Off Days',       key: 'weekOffDays',             width: 6,  format: 'number' },
  { header: 'Paid Days',           key: 'paidDays',                width: 6,  format: 'number' },
  { header: 'Total Worked Hrs',    key: 'totalWorkedHours',        width: 10, format: 'number' },
  { header: 'OT Hours',            key: 'totalOTHours',            width: 8,  format: 'number' },
  { header: 'Holiday Worked',      key: 'holidayWorkedDays',       width: 8,  format: 'number' },
  { header: 'WeekOff Worked',      key: 'weekOffWorkedDays',       width: 8,  format: 'number' },
  { header: 'Late Count',          key: 'lateDays',                width: 8,  format: 'number' },
  { header: 'Late Penalty',        key: 'totalLateDeduction',      width: 8,  format: 'number' },
  { header: 'Early Exit Count',    key: 'earlyExitDays',           width: 8,  format: 'number' },
  { header: 'Early Exit Penalty',  key: 'totalEarlyExitDeduction', width: 8,  format: 'number' },
  { header: 'Night Shift Days',    key: 'nightShiftDays',          width: 8,  format: 'number' },
  { header: 'Payroll Lock Status', key: 'payrollLockStatus',       width: 16 },
];

// ─── Compute a mini-summary from a slice of records for one employee/month ───
function computeMiniSummary(records: FlatRecord[], baseSummary: EmployeeSummary): Partial<EmployeeSummary> {
  let presentDays = 0;
  let halfDays = 0;
  let lateDays = 0;
  let earlyExitDays = 0;
  let holidayDays = 0;
  let weekOffDays = 0;
  let lopDays = 0;
  let totalWorkedHours = 0;
  let totalOTHours = 0;
  let totalLateDeduction = 0;
  let totalEarlyExitDeduction = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  let holidayWorkedDays = 0;
  let weekOffWorkedDays = 0;
  let nightShiftDays = 0;

  for (const r of records) {
    const s = r.status.toUpperCase();

    if (s === 'PRESENT') {
      presentDays += 1;
    } else if (s === 'HALF_DAY') {
      halfDays += 1;
      presentDays += 0.5;
    } else if (s === 'HOLIDAY') {
      holidayDays += 1;
      // Worked on holiday
      if (r.workedHours > 0) {
        holidayWorkedDays += 1;
      }
    } else if (s === 'WEEK_OFF') {
      weekOffDays += 1;
      if (r.workedHours > 0) {
        weekOffWorkedDays += 1;
      }
    } else if (s === 'LOP') {
      lopDays += 1;
    } else if (s === 'ON_LEAVE') {
      // Determine paid vs unpaid from halves leaveTypeCode
      const isPaid = r.halves.some(h => h.leaveTypeCode && h.leaveTypeCode !== 'LOP');
      if (isPaid) {
        paidLeaveDays += 1;
      } else {
        unpaidLeaveDays += 1;
      }
    }

    if (r.isLate) {
      lateDays += 1;
      totalLateDeduction += r.appliedLateDeduction;
    }

    if (r.isEarlyExit) {
      earlyExitDays += 1;
      totalEarlyExitDeduction += r.appliedEarlyExitDeduction;
    }

    totalWorkedHours += r.workedHours;
    totalOTHours += r.overtimeHours;

    if (r.shiftType && r.shiftType.toUpperCase() === 'NIGHT') {
      nightShiftDays += 1;
    }
  }

  // Paid days: present + half days (0.5 each) + paid leave + holidays + week offs
  const paidDays = presentDays + paidLeaveDays + holidayDays + weekOffDays;

  return {
    presentDays,
    halfDays,
    lateDays,
    earlyExitDays,
    holidayDays,
    weekOffDays,
    lopDays,
    totalWorkedHours,
    totalOTHours,
    totalLateDeduction,
    totalEarlyExitDeduction,
    paidLeaveDays,
    unpaidLeaveDays,
    holidayWorkedDays,
    weekOffWorkedDays,
    nightShiftDays,
    paidDays,
  };
}

// ─── Main builder ───
export function buildPayrollHandoff(dataset: ReportDataset): ReportSheet | null {
  if (dataset.mode === 'daily' || dataset.mode === 'weekly') return null;

  const rows: Record<string, unknown>[] = [];

  if (dataset.mode === 'monthly') {
    // One row per employee
    for (const s of dataset.employeeSummaries.values()) {
      rows.push({
        employeeId:             s.employeeId,
        empCode:                s.empCode,
        empName:                s.empName,
        department:             s.department,
        payrollMonth:           new Date(dataset.filters.dateFrom).getMonth() + 1,
        payrollYear:            new Date(dataset.filters.dateFrom).getFullYear(),
        payrollCycleId:         dataset.payrollRun?.id ?? '',
        presentDays:            s.presentDays,
        halfDays:               s.halfDays,
        paidLeaveDays:          s.paidLeaveDays,
        unpaidLeaveDays:        s.unpaidLeaveDays,
        lopDays:                s.lopDays,
        holidayDays:            s.holidayDays,
        weekOffDays:            s.weekOffDays,
        paidDays:               Math.round(s.paidDays * 10) / 10,
        totalWorkedHours:       Math.round(s.totalWorkedHours * 10) / 10,
        totalOTHours:           Math.round(s.totalOTHours * 10) / 10,
        holidayWorkedDays:      s.holidayWorkedDays,
        weekOffWorkedDays:      s.weekOffWorkedDays,
        lateDays:               s.lateDays,
        totalLateDeduction:     Math.round(s.totalLateDeduction * 100) / 100,
        earlyExitDays:          s.earlyExitDays,
        totalEarlyExitDeduction: Math.round(s.totalEarlyExitDeduction * 100) / 100,
        nightShiftDays:         s.nightShiftDays,
        payrollLockStatus:      dataset.payrollRun?.status ?? 'NO_PAYROLL_RUN',
      });
    }
  } else {
    // multi-month: one row per employee per month
    const from = new Date(dataset.filters.dateFrom);
    const to   = new Date(dataset.filters.dateTo);

    // Build list of (year, month) pairs spanning [dateFrom, dateTo]
    const months: Array<{ year: number; month: number; start: Date; end: Date }> = [];
    const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    while (cursor <= to) {
      const year  = cursor.getFullYear();
      const month = cursor.getMonth(); // 0-based
      const start = new Date(year, month, 1);
      const end   = new Date(year, month + 1, 0); // last day of month
      months.push({ year, month, start, end });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    for (const s of dataset.employeeSummaries.values()) {
      const empRecords = dataset.byEmployee.get(s.employeeId) ?? [];

      for (const { year, month, start, end } of months) {
        // Clamp boundaries to the actual report date range
        const rangeStart = start < from ? from : start;
        const rangeEnd   = end   > to   ? to   : end;

        // Filter records for this employee in this month window
        const monthRecords = empRecords.filter(r => {
          const d = new Date(r.date);
          return d >= rangeStart && d <= rangeEnd;
        });

        if (monthRecords.length === 0) continue;

        const mini = computeMiniSummary(monthRecords, s);

        rows.push({
          employeeId:             s.employeeId,
          empCode:                s.empCode,
          empName:                s.empName,
          department:             s.department,
          payrollMonth:           month + 1, // 1-based
          payrollYear:            year,
          payrollCycleId:         dataset.payrollRunsByMonth.get(`${year}-${String(month + 1).padStart(2, '0')}`)?.id ?? '',
          presentDays:            mini.presentDays ?? 0,
          halfDays:               mini.halfDays ?? 0,
          paidLeaveDays:          mini.paidLeaveDays ?? 0,
          unpaidLeaveDays:        mini.unpaidLeaveDays ?? 0,
          lopDays:                mini.lopDays ?? 0,
          holidayDays:            mini.holidayDays ?? 0,
          weekOffDays:            mini.weekOffDays ?? 0,
          paidDays:               Math.round((mini.paidDays ?? 0) * 10) / 10,
          totalWorkedHours:       Math.round((mini.totalWorkedHours ?? 0) * 10) / 10,
          totalOTHours:           Math.round((mini.totalOTHours ?? 0) * 10) / 10,
          holidayWorkedDays:      mini.holidayWorkedDays ?? 0,
          weekOffWorkedDays:      mini.weekOffWorkedDays ?? 0,
          lateDays:               mini.lateDays ?? 0,
          totalLateDeduction:     Math.round((mini.totalLateDeduction ?? 0) * 100) / 100,
          earlyExitDays:          mini.earlyExitDays ?? 0,
          totalEarlyExitDeduction: Math.round((mini.totalEarlyExitDeduction ?? 0) * 100) / 100,
          nightShiftDays:         mini.nightShiftDays ?? 0,
          payrollLockStatus:      dataset.payrollRunsByMonth.get(`${year}-${String(month + 1).padStart(2, '0')}`)?.status ?? 'NO_PAYROLL_RUN',
        });
      }
    }
  }

  return {
    name: 'Payroll Handoff',
    columns,
    rows,
  };
}
