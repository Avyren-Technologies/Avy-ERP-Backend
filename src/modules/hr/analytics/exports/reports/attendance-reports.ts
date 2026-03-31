// ─── Attendance Reports: R04 Register, R05 Late Coming, R06 Overtime, R07 Absenteeism ───
import { generateExcelReport, type ReportConfig, type ReportSheet, type SheetColumn } from '../excel-exporter';
import type { DashboardFilters, DataScope } from '../../analytics.types';

// ─── Helpers ───
function formatDate(d: Date | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function dec(val: unknown): number {
  if (val === null || val === undefined) return 0;
  return typeof val === 'number' ? val : Number(val);
}

function buildAttendanceWhere(filters: DashboardFilters, scope: DataScope) {
  const where: Record<string, unknown> = {
    employee: { companyId: scope.companyId },
    date: { gte: new Date(filters.dateFrom), lte: new Date(filters.dateTo) },
  };
  if (scope.departmentIds?.length) {
    (where.employee as Record<string, unknown>).departmentId = { in: scope.departmentIds };
  }
  if (scope.locationIds?.length) {
    where.locationId = { in: scope.locationIds };
  }
  if (scope.employeeIds?.length) {
    where.employeeId = { in: scope.employeeIds };
  }
  if (filters.departmentId) {
    (where.employee as Record<string, unknown>).departmentId = filters.departmentId;
  }
  return where;
}

// Status code map for day-wise grid
const STATUS_CODES: Record<string, string> = {
  PRESENT: 'P',
  ABSENT: 'A',
  HALF_DAY: 'HD',
  LATE: 'L',
  EARLY_EXIT: 'EE',
  INCOMPLETE: 'I',
  ON_LEAVE: 'LV',
  HOLIDAY: 'H',
  WEEK_OFF: 'W',
  REGULARIZED: 'R',
};

// ═══════════════════════════════════════════════════════════════
// R04: Attendance Register
// ═══════════════════════════════════════════════════════════════
export async function generateAttendanceRegister(
  tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const where = buildAttendanceWhere(filters, scope);

  const records = await tenantDb.attendanceRecord.findMany({
    where,
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
    orderBy: [{ employeeId: 'asc' }, { date: 'asc' }],
  });

  // ── Summary Sheet: status counts by department ──
  const deptStatusMap: Record<string, Record<string, number>> = {};
  const overallStatus: Record<string, number> = {};

  for (const rec of records) {
    const dept = rec.employee?.department?.name ?? 'Unassigned';
    if (!deptStatusMap[dept]) deptStatusMap[dept] = {};
    deptStatusMap[dept][rec.status] = (deptStatusMap[dept][rec.status] ?? 0) + 1;
    overallStatus[rec.status] = (overallStatus[rec.status] ?? 0) + 1;
  }

  const allStatuses: string[] = Array.from(new Set<string>(records.map((r: any) => r.status as string))).sort();

  const summaryColumns: SheetColumn[] = [
    { header: 'Department', key: 'department', width: 25 },
    ...allStatuses.map((s) => ({
      header: s,
      key: s,
      width: 12,
      format: 'number' as const,
    })),
    { header: 'Total Records', key: 'total', width: 14, format: 'number' as const },
  ];

  const summaryRows = Object.entries(deptStatusMap).map(([dept, statuses]) => {
    const row: Record<string, unknown> = { department: dept };
    let total = 0;
    for (const s of allStatuses) {
      row[s] = statuses[s] ?? 0;
      total += statuses[s] ?? 0;
    }
    row.total = total;
    return row;
  });

  const totalsRow: Record<string, unknown> = { department: 'Total' };
  let grandTotal = 0;
  for (const s of allStatuses) {
    totalsRow[s] = overallStatus[s] ?? 0;
    grandTotal += overallStatus[s] ?? 0;
  }
  totalsRow.total = grandTotal;

  const summarySheet: ReportSheet = {
    name: 'Summary',
    columns: summaryColumns,
    rows: summaryRows,
    totalsRow,
  };

  // ── Day-wise Grid: employee × days with P/A/L/H/W status codes ──
  const dateFrom = new Date(filters.dateFrom);
  const dateTo = new Date(filters.dateTo);
  const days: Date[] = [];
  for (let d = new Date(dateFrom); d <= dateTo; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }

  // Group records by employee
  const empMap: Record<string, { name: string; dept: string; empId: string; dates: Record<string, string> }> = {};
  for (const rec of records) {
    const key = rec.employeeId;
    if (!empMap[key]) {
      empMap[key] = {
        name: rec.employee ? `${rec.employee.firstName} ${rec.employee.lastName}` : key,
        dept: rec.employee?.department?.name ?? '',
        empId: rec.employee?.employeeId ?? key,
        dates: {},
      };
    }
    const dateKey = new Date(rec.date).toISOString().slice(0, 10);
    empMap[key].dates[dateKey] = STATUS_CODES[rec.status] ?? rec.status;
  }

  const gridColumns: SheetColumn[] = [
    { header: 'Emp ID', key: 'empId', width: 14 },
    { header: 'Name', key: 'name', width: 22 },
    { header: 'Department', key: 'dept', width: 18 },
    ...days.map((d) => ({
      header: d.getDate().toString(),
      key: d.toISOString().slice(0, 10),
      width: 5,
    })),
    { header: 'Present', key: 'presentCount', width: 10, format: 'number' as const },
    { header: 'Absent', key: 'absentCount', width: 10, format: 'number' as const },
  ];

  const gridRows = Object.values(empMap).map((emp) => {
    const row: Record<string, unknown> = {
      empId: emp.empId,
      name: emp.name,
      dept: emp.dept,
    };
    let presentCount = 0;
    let absentCount = 0;
    for (const d of days) {
      const dateKey = d.toISOString().slice(0, 10);
      const code = emp.dates[dateKey] ?? '-';
      row[dateKey] = code;
      if (code === 'P' || code === 'L' || code === 'R') presentCount++;
      if (code === 'A') absentCount++;
    }
    row.presentCount = presentCount;
    row.absentCount = absentCount;
    return row;
  });

  const gridSheet: ReportSheet = {
    name: 'Day-wise Grid',
    columns: gridColumns,
    rows: gridRows,
    freezeRow: 6,
  };

  return generateExcelReport({
    companyName,
    reportTitle: 'Attendance Register',
    period: `${filters.dateFrom} to ${filters.dateTo}`,
    sheets: [summarySheet, gridSheet],
  });
}

// ═══════════════════════════════════════════════════════════════
// R05: Late Coming Report
// ═══════════════════════════════════════════════════════════════
export async function generateLateComingReport(
  tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const where = {
    ...buildAttendanceWhere(filters, scope),
    isLate: true,
  };

  const records = await tenantDb.attendanceRecord.findMany({
    where,
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
    orderBy: [{ date: 'desc' }],
  });

  // ── Summary Sheet: late count by department ──
  const deptLate: Record<string, { count: number; totalMinutes: number }> = {};
  for (const rec of records) {
    const dept = rec.employee?.department?.name ?? 'Unassigned';
    if (!deptLate[dept]) deptLate[dept] = { count: 0, totalMinutes: 0 };
    deptLate[dept].count++;
    deptLate[dept].totalMinutes += rec.lateMinutes ?? 0;
  }

  const summarySheet: ReportSheet = {
    name: 'Summary',
    columns: [
      { header: 'Department', key: 'department', width: 25 },
      { header: 'Late Instances', key: 'count', width: 16, format: 'number' },
      { header: 'Total Late Minutes', key: 'totalMinutes', width: 18, format: 'number' },
      { header: 'Avg Late (mins)', key: 'avgMinutes', width: 16, format: 'number' },
    ],
    rows: Object.entries(deptLate)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([dept, data]) => ({
        department: dept,
        count: data.count,
        totalMinutes: data.totalMinutes,
        avgMinutes: data.count > 0 ? Math.round(data.totalMinutes / data.count) : 0,
      })),
    totalsRow: {
      department: 'Total',
      count: records.length,
      totalMinutes: records.reduce((s: number, r: any) => s + (r.lateMinutes ?? 0), 0),
      avgMinutes:
        records.length > 0
          ? Math.round(records.reduce((s: number, r: any) => s + (r.lateMinutes ?? 0), 0) / records.length)
          : 0,
    },
  };

  // ── Detail Sheet ──
  const detailSheet: ReportSheet = {
    name: 'Detail',
    columns: [
      { header: 'Date', key: 'date', width: 14, format: 'date' },
      { header: 'Emp ID', key: 'empId', width: 14 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Punch In', key: 'punchIn', width: 16 },
      { header: 'Late By (mins)', key: 'lateMinutes', width: 16, format: 'number' },
    ],
    rows: records.map((r: any) => ({
      date: formatDate(r.date),
      empId: r.employee?.employeeId ?? '',
      name: r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : '',
      department: r.employee?.department?.name ?? '',
      punchIn: r.punchIn ? new Date(r.punchIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '',
      lateMinutes: r.lateMinutes ?? 0,
    })),
  };

  // ── Frequency Sheet: employees sorted by late frequency ──
  const empFreq: Record<string, { name: string; dept: string; empId: string; count: number; totalMins: number }> = {};
  for (const rec of records) {
    const key = rec.employeeId;
    if (!empFreq[key]) {
      empFreq[key] = {
        name: rec.employee ? `${rec.employee.firstName} ${rec.employee.lastName}` : key,
        dept: rec.employee?.department?.name ?? '',
        empId: rec.employee?.employeeId ?? key,
        count: 0,
        totalMins: 0,
      };
    }
    empFreq[key].count++;
    empFreq[key].totalMins += rec.lateMinutes ?? 0;
  }

  const frequencySheet: ReportSheet = {
    name: 'Frequency',
    columns: [
      { header: 'Emp ID', key: 'empId', width: 14 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Department', key: 'dept', width: 20 },
      { header: 'Late Count', key: 'count', width: 14, format: 'number' },
      { header: 'Total Late Mins', key: 'totalMins', width: 16, format: 'number' },
      { header: 'Avg Late (mins)', key: 'avgMins', width: 16, format: 'number' },
    ],
    rows: Object.values(empFreq)
      .sort((a, b) => b.count - a.count)
      .map((e) => ({
        ...e,
        avgMins: e.count > 0 ? Math.round(e.totalMins / e.count) : 0,
      })),
  };

  return generateExcelReport({
    companyName,
    reportTitle: 'Late Coming Report',
    period: `${filters.dateFrom} to ${filters.dateTo}`,
    sheets: [summarySheet, detailSheet, frequencySheet],
  });
}

// ═══════════════════════════════════════════════════════════════
// R06: Overtime Report
// ═══════════════════════════════════════════════════════════════
export async function generateOvertimeReport(
  tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const where = {
    ...buildAttendanceWhere(filters, scope),
    overtimeHours: { gt: 0 },
  };

  const records = await tenantDb.attendanceRecord.findMany({
    where,
    include: {
      employee: {
        select: {
          employeeId: true,
          firstName: true,
          lastName: true,
          department: { select: { name: true } },
          annualCtc: true,
        },
      },
    },
    orderBy: [{ date: 'desc' }],
  });

  // ── Summary Sheet ──
  const deptOT: Record<string, { count: number; totalHours: number }> = {};
  for (const rec of records) {
    const dept = rec.employee?.department?.name ?? 'Unassigned';
    if (!deptOT[dept]) deptOT[dept] = { count: 0, totalHours: 0 };
    deptOT[dept].count++;
    deptOT[dept].totalHours += dec(rec.overtimeHours);
  }

  const totalHours = records.reduce((s: number, r: any) => s + dec(r.overtimeHours), 0);

  const summarySheet: ReportSheet = {
    name: 'Summary',
    columns: [
      { header: 'Department', key: 'department', width: 25 },
      { header: 'OT Instances', key: 'count', width: 16, format: 'number' },
      { header: 'Total OT Hours', key: 'totalHours', width: 16, format: 'number' },
      { header: 'Avg OT Hours', key: 'avgHours', width: 16, format: 'number' },
    ],
    rows: Object.entries(deptOT)
      .sort((a, b) => b[1].totalHours - a[1].totalHours)
      .map(([dept, data]) => ({
        department: dept,
        count: data.count,
        totalHours: Math.round(data.totalHours * 10) / 10,
        avgHours: data.count > 0 ? Math.round((data.totalHours / data.count) * 10) / 10 : 0,
      })),
    totalsRow: {
      department: 'Total',
      count: records.length,
      totalHours: Math.round(totalHours * 10) / 10,
      avgHours: records.length > 0 ? Math.round((totalHours / records.length) * 10) / 10 : 0,
    },
  };

  // ── Detail Sheet ──
  const detailSheet: ReportSheet = {
    name: 'Detail',
    columns: [
      { header: 'Date', key: 'date', width: 14, format: 'date' },
      { header: 'Emp ID', key: 'empId', width: 14 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Worked Hours', key: 'workedHours', width: 14, format: 'number' },
      { header: 'OT Hours', key: 'otHours', width: 12, format: 'number' },
    ],
    rows: records.map((r: any) => ({
      date: formatDate(r.date),
      empId: r.employee?.employeeId ?? '',
      name: r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : '',
      department: r.employee?.department?.name ?? '',
      workedHours: dec(r.workedHours),
      otHours: dec(r.overtimeHours),
    })),
  };

  // ── Cost Analysis Sheet ──
  const empOTCost: Record<
    string,
    { name: string; dept: string; empId: string; totalHours: number; annualCtc: number }
  > = {};
  for (const rec of records) {
    const key = rec.employeeId;
    if (!empOTCost[key]) {
      empOTCost[key] = {
        name: rec.employee ? `${rec.employee.firstName} ${rec.employee.lastName}` : key,
        dept: rec.employee?.department?.name ?? '',
        empId: rec.employee?.employeeId ?? key,
        totalHours: 0,
        annualCtc: dec(rec.employee?.annualCtc),
      };
    }
    empOTCost[key].totalHours += dec(rec.overtimeHours);
  }

  const costSheet: ReportSheet = {
    name: 'Cost Analysis',
    columns: [
      { header: 'Emp ID', key: 'empId', width: 14 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Department', key: 'dept', width: 20 },
      { header: 'Total OT Hours', key: 'totalHours', width: 16, format: 'number' },
      { header: 'Hourly Rate (est)', key: 'hourlyRate', width: 16, format: 'currency' },
      { header: 'OT Cost (1.5x)', key: 'otCost', width: 16, format: 'currency' },
    ],
    rows: Object.values(empOTCost)
      .sort((a, b) => b.totalHours - a.totalHours)
      .map((e) => {
        // Estimate: annualCTC / 12 / 26 / 8 = hourly rate
        const hourlyRate = e.annualCtc > 0 ? e.annualCtc / 12 / 26 / 8 : 0;
        return {
          empId: e.empId,
          name: e.name,
          dept: e.dept,
          totalHours: Math.round(e.totalHours * 10) / 10,
          hourlyRate: Math.round(hourlyRate * 100) / 100,
          otCost: Math.round(hourlyRate * 1.5 * e.totalHours * 100) / 100,
        };
      }),
    totalsRow: {
      empId: 'Total',
      name: '',
      dept: '',
      totalHours: Math.round(Object.values(empOTCost).reduce((s, e) => s + e.totalHours, 0) * 10) / 10,
      hourlyRate: '',
      otCost: Object.values(empOTCost).reduce((s, e) => {
        const hourlyRate = e.annualCtc > 0 ? e.annualCtc / 12 / 26 / 8 : 0;
        return s + Math.round(hourlyRate * 1.5 * e.totalHours * 100) / 100;
      }, 0),
    },
  };

  return generateExcelReport({
    companyName,
    reportTitle: 'Overtime Report',
    period: `${filters.dateFrom} to ${filters.dateTo}`,
    sheets: [summarySheet, detailSheet, costSheet],
  });
}

// ═══════════════════════════════════════════════════════════════
// R07: Absenteeism Report
// ═══════════════════════════════════════════════════════════════
export async function generateAbsenteeismReport(
  tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const where = {
    ...buildAttendanceWhere(filters, scope),
    status: 'ABSENT',
  };

  const records = await tenantDb.attendanceRecord.findMany({
    where,
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
    orderBy: [{ date: 'desc' }],
  });

  // Total working days in period (approx)
  const totalEmployees = await tenantDb.employee.count({
    where: { companyId: scope.companyId, status: { notIn: ['EXITED'] } },
  });

  const dateFrom = new Date(filters.dateFrom);
  const dateTo = new Date(filters.dateTo);
  const totalDays = Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const workingDays = Math.round(totalDays * (5 / 7)); // approximate

  // ── Summary Sheet ──
  const deptAbsent: Record<string, number> = {};
  for (const rec of records) {
    const dept = rec.employee?.department?.name ?? 'Unassigned';
    deptAbsent[dept] = (deptAbsent[dept] ?? 0) + 1;
  }

  const summarySheet: ReportSheet = {
    name: 'Summary',
    columns: [
      { header: 'Department', key: 'department', width: 25 },
      { header: 'Absent Days', key: 'absentDays', width: 16, format: 'number' },
      { header: 'Absenteeism Rate', key: 'rate', width: 18, format: 'percentage' },
    ],
    rows: Object.entries(deptAbsent)
      .sort((a, b) => b[1] - a[1])
      .map(([dept, count]) => ({
        department: dept,
        absentDays: count,
        rate: totalEmployees > 0 && workingDays > 0 ? count / (totalEmployees * workingDays) : 0,
      })),
    totalsRow: {
      department: 'Overall',
      absentDays: records.length,
      rate: totalEmployees > 0 && workingDays > 0 ? records.length / (totalEmployees * workingDays) : 0,
    },
  };

  // ── Detail Sheet ──
  const detailSheet: ReportSheet = {
    name: 'Detail',
    columns: [
      { header: 'Date', key: 'date', width: 14, format: 'date' },
      { header: 'Emp ID', key: 'empId', width: 14 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Remarks', key: 'remarks', width: 30 },
    ],
    rows: records.map((r: any) => ({
      date: formatDate(r.date),
      empId: r.employee?.employeeId ?? '',
      name: r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : '',
      department: r.employee?.department?.name ?? '',
      remarks: r.remarks ?? '',
    })),
  };

  // ── Frequent Absentees Sheet ──
  const empAbsent: Record<string, { name: string; dept: string; empId: string; count: number }> = {};
  for (const rec of records) {
    const key = rec.employeeId;
    if (!empAbsent[key]) {
      empAbsent[key] = {
        name: rec.employee ? `${rec.employee.firstName} ${rec.employee.lastName}` : key,
        dept: rec.employee?.department?.name ?? '',
        empId: rec.employee?.employeeId ?? key,
        count: 0,
      };
    }
    empAbsent[key].count++;
  }

  const frequentSheet: ReportSheet = {
    name: 'Frequent Absentees',
    columns: [
      { header: 'Emp ID', key: 'empId', width: 14 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Department', key: 'dept', width: 20 },
      { header: 'Absent Days', key: 'count', width: 14, format: 'number' },
      { header: 'Absent Rate', key: 'rate', width: 14, format: 'percentage' },
    ],
    rows: Object.values(empAbsent)
      .sort((a, b) => b.count - a.count)
      .slice(0, 50) // top 50 frequent absentees
      .map((e) => ({
        ...e,
        rate: workingDays > 0 ? e.count / workingDays : 0,
      })),
  };

  return generateExcelReport({
    companyName,
    reportTitle: 'Absenteeism Report',
    period: `${filters.dateFrom} to ${filters.dateTo}`,
    sheets: [summarySheet, detailSheet, frequentSheet],
  });
}
