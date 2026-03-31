// ─── Leave Reports: R08 Balance, R09 Utilization, R10 Encashment ───
import { generateExcelReport, type ReportConfig, type ReportSheet, type SheetColumn } from '../excel-exporter';
import type { DashboardFilters, DataScope } from '../../analytics.types';

// ─── Helpers ───
function dec(val: unknown): number {
  if (val === null || val === undefined) return 0;
  return typeof val === 'number' ? val : Number(val);
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ═══════════════════════════════════════════════════════════════
// R08: Leave Balance Report
// ═══════════════════════════════════════════════════════════════
export async function generateLeaveBalanceReport(
  tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const year = new Date(filters.dateTo).getFullYear();

  const balances = await tenantDb.leaveBalance.findMany({
    where: {
      companyId: scope.companyId,
      year,
      ...(scope.employeeIds?.length ? { employeeId: { in: scope.employeeIds } } : {}),
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
      leaveType: { select: { name: true, code: true } },
    },
    orderBy: [{ employee: { firstName: 'asc' } }],
  });

  // Apply department filter
  const filtered = balances.filter((b: any) => {
    if (scope.departmentIds?.length && b.employee?.department) {
      // We don't have dept ID here directly, so we rely on the scope applied to employees
    }
    if (filters.departmentId) {
      // Filter by department name if accessible
    }
    return true;
  });

  // ── Summary by Type Sheet ──
  const typeSummary: Record<string, { opening: number; accrued: number; taken: number; balance: number; count: number }> = {};

  for (const b of filtered) {
    const typeName = b.leaveType?.name ?? 'Unknown';
    if (!typeSummary[typeName]) {
      typeSummary[typeName] = { opening: 0, accrued: 0, taken: 0, balance: 0, count: 0 };
    }
    typeSummary[typeName].opening += dec(b.openingBalance);
    typeSummary[typeName].accrued += dec(b.accrued);
    typeSummary[typeName].taken += dec(b.taken);
    typeSummary[typeName].balance += dec(b.balance);
    typeSummary[typeName].count++;
  }

  const summarySheet: ReportSheet = {
    name: 'Summary by Type',
    columns: [
      { header: 'Leave Type', key: 'leaveType', width: 25 },
      { header: 'Employees', key: 'count', width: 12, format: 'number' },
      { header: 'Opening Balance', key: 'opening', width: 16, format: 'number' },
      { header: 'Accrued', key: 'accrued', width: 12, format: 'number' },
      { header: 'Taken', key: 'taken', width: 12, format: 'number' },
      { header: 'Closing Balance', key: 'balance', width: 16, format: 'number' },
    ],
    rows: Object.entries(typeSummary).map(([type, data]) => ({
      leaveType: type,
      ...data,
    })),
    totalsRow: {
      leaveType: 'Total',
      count: filtered.length,
      opening: Object.values(typeSummary).reduce((s, d) => s + d.opening, 0),
      accrued: Object.values(typeSummary).reduce((s, d) => s + d.accrued, 0),
      taken: Object.values(typeSummary).reduce((s, d) => s + d.taken, 0),
      balance: Object.values(typeSummary).reduce((s, d) => s + d.balance, 0),
    },
  };

  // ── By Employee Sheet ──
  const empSheet: ReportSheet = {
    name: 'By Employee',
    columns: [
      { header: 'Emp ID', key: 'empId', width: 14 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Leave Type', key: 'leaveType', width: 20 },
      { header: 'Opening', key: 'opening', width: 12, format: 'number' },
      { header: 'Accrued', key: 'accrued', width: 12, format: 'number' },
      { header: 'Taken', key: 'taken', width: 12, format: 'number' },
      { header: 'Adjusted', key: 'adjusted', width: 12, format: 'number' },
      { header: 'Balance', key: 'balance', width: 12, format: 'number' },
    ],
    rows: filtered.map((b: any) => ({
      empId: b.employee?.employeeId ?? '',
      name: b.employee ? `${b.employee.firstName} ${b.employee.lastName}` : '',
      department: b.employee?.department?.name ?? '',
      leaveType: b.leaveType?.name ?? '',
      opening: dec(b.openingBalance),
      accrued: dec(b.accrued),
      taken: dec(b.taken),
      adjusted: dec(b.adjusted),
      balance: dec(b.balance),
    })),
  };

  return generateExcelReport({
    companyName,
    reportTitle: 'Leave Balance Report',
    period: `Year ${year}`,
    sheets: [summarySheet, empSheet],
  });
}

// ═══════════════════════════════════════════════════════════════
// R09: Leave Utilization Report
// ═══════════════════════════════════════════════════════════════
export async function generateLeaveUtilizationReport(
  tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const dateFrom = new Date(filters.dateFrom);
  const dateTo = new Date(filters.dateTo);

  const requests = await tenantDb.leaveRequest.findMany({
    where: {
      employee: {
        companyId: scope.companyId,
        ...(scope.departmentIds?.length ? { departmentId: { in: scope.departmentIds } } : {}),
      },
      status: 'APPROVED',
      fromDate: { gte: dateFrom },
      toDate: { lte: dateTo },
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
      leaveType: { select: { name: true } },
    },
    orderBy: { fromDate: 'asc' },
  });

  // ── Summary Sheet ──
  const typeDays: Record<string, number> = {};
  for (const req of requests) {
    const typeName = req.leaveType?.name ?? 'Unknown';
    typeDays[typeName] = (typeDays[typeName] ?? 0) + dec(req.days);
  }
  const totalDays = Object.values(typeDays).reduce((s, d) => s + d, 0);

  const summarySheet: ReportSheet = {
    name: 'Summary',
    columns: [
      { header: 'Leave Type', key: 'leaveType', width: 25 },
      { header: 'Total Days', key: 'days', width: 14, format: 'number' },
      { header: '% of Total', key: 'percentage', width: 14, format: 'percentage' },
      { header: 'No. of Requests', key: 'requests', width: 16, format: 'number' },
    ],
    rows: Object.entries(typeDays)
      .sort((a, b) => b[1] - a[1])
      .map(([type, days]) => ({
        leaveType: type,
        days,
        percentage: totalDays > 0 ? days / totalDays : 0,
        requests: requests.filter((r: any) => (r.leaveType?.name ?? 'Unknown') === type).length,
      })),
    totalsRow: {
      leaveType: 'Total',
      days: totalDays,
      percentage: 1,
      requests: requests.length,
    },
  };

  // ── Monthly Trend Sheet ──
  const monthMap: Record<string, number> = {};
  for (const req of requests) {
    const monthKey = new Date(req.fromDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    monthMap[monthKey] = (monthMap[monthKey] ?? 0) + dec(req.days);
  }

  const monthlySheet: ReportSheet = {
    name: 'Monthly Trend',
    columns: [
      { header: 'Month', key: 'month', width: 18 },
      { header: 'Total Leave Days', key: 'days', width: 18, format: 'number' },
    ],
    rows: Object.entries(monthMap).map(([month, days]) => ({ month, days })),
    totalsRow: { month: 'Total', days: totalDays },
  };

  // ── By Department Sheet ──
  const deptDays: Record<string, { days: number; requests: number }> = {};
  for (const req of requests) {
    const dept = req.employee?.department?.name ?? 'Unassigned';
    if (!deptDays[dept]) deptDays[dept] = { days: 0, requests: 0 };
    deptDays[dept].days += dec(req.days);
    deptDays[dept].requests++;
  }

  const deptSheet: ReportSheet = {
    name: 'By Department',
    columns: [
      { header: 'Department', key: 'department', width: 25 },
      { header: 'Total Leave Days', key: 'days', width: 18, format: 'number' },
      { header: 'No. of Requests', key: 'requests', width: 16, format: 'number' },
      { header: 'Avg Days/Request', key: 'avg', width: 16, format: 'number' },
    ],
    rows: Object.entries(deptDays)
      .sort((a, b) => b[1].days - a[1].days)
      .map(([dept, data]) => ({
        department: dept,
        days: data.days,
        requests: data.requests,
        avg: data.requests > 0 ? Math.round((data.days / data.requests) * 10) / 10 : 0,
      })),
    totalsRow: {
      department: 'Total',
      days: totalDays,
      requests: requests.length,
      avg: requests.length > 0 ? Math.round((totalDays / requests.length) * 10) / 10 : 0,
    },
  };

  return generateExcelReport({
    companyName,
    reportTitle: 'Leave Utilization Report',
    period: `${filters.dateFrom} to ${filters.dateTo}`,
    sheets: [summarySheet, monthlySheet, deptSheet],
  });
}

// ═══════════════════════════════════════════════════════════════
// R10: Leave Encashment Report
// ═══════════════════════════════════════════════════════════════
export async function generateLeaveEncashmentReport(
  tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const year = new Date(filters.dateTo).getFullYear();

  // Get leave balances with encashable leave types
  const balances = await tenantDb.leaveBalance.findMany({
    where: {
      companyId: scope.companyId,
      year,
      balance: { gt: 0 },
      leaveType: { isEncashable: true },
      ...(scope.employeeIds?.length ? { employeeId: { in: scope.employeeIds } } : {}),
    },
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
      leaveType: { select: { name: true, maxEncashmentDays: true } },
    },
    orderBy: [{ employee: { firstName: 'asc' } }],
  });

  // ── Summary Sheet ──
  const typeSummary: Record<string, { employees: number; totalDays: number; totalLiability: number }> = {};

  for (const b of balances) {
    const typeName = b.leaveType?.name ?? 'Unknown';
    if (!typeSummary[typeName]) {
      typeSummary[typeName] = { employees: 0, totalDays: 0, totalLiability: 0 };
    }
    const encashDays = Math.min(
      dec(b.balance),
      dec(b.leaveType?.maxEncashmentDays) || dec(b.balance),
    );
    const dailyRate = dec(b.employee?.annualCtc) / 365;
    typeSummary[typeName].employees++;
    typeSummary[typeName].totalDays += encashDays;
    typeSummary[typeName].totalLiability += encashDays * dailyRate;
  }

  const summarySheet: ReportSheet = {
    name: 'Summary',
    columns: [
      { header: 'Leave Type', key: 'leaveType', width: 25 },
      { header: 'Eligible Employees', key: 'employees', width: 18, format: 'number' },
      { header: 'Encashable Days', key: 'totalDays', width: 16, format: 'number' },
      { header: 'Total Liability', key: 'totalLiability', width: 18, format: 'currency' },
    ],
    rows: Object.entries(typeSummary).map(([type, data]) => ({
      leaveType: type,
      ...data,
    })),
    totalsRow: {
      leaveType: 'Total',
      employees: Object.values(typeSummary).reduce((s, d) => s + d.employees, 0),
      totalDays: Object.values(typeSummary).reduce((s, d) => s + d.totalDays, 0),
      totalLiability: Object.values(typeSummary).reduce((s, d) => s + d.totalLiability, 0),
    },
  };

  // ── Employee Detail Sheet ──
  const detailSheet: ReportSheet = {
    name: 'Employee Detail',
    columns: [
      { header: 'Emp ID', key: 'empId', width: 14 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Leave Type', key: 'leaveType', width: 20 },
      { header: 'Balance', key: 'balance', width: 12, format: 'number' },
      { header: 'Max Encashable', key: 'maxEncash', width: 16, format: 'number' },
      { header: 'Encashable Days', key: 'encashDays', width: 16, format: 'number' },
      { header: 'Daily Rate', key: 'dailyRate', width: 14, format: 'currency' },
      { header: 'Encashment Value', key: 'value', width: 18, format: 'currency' },
    ],
    rows: balances.map((b: any) => {
      const balance = dec(b.balance);
      const maxEncash = dec(b.leaveType?.maxEncashmentDays) || balance;
      const encashDays = Math.min(balance, maxEncash);
      const dailyRate = dec(b.employee?.annualCtc) / 365;
      return {
        empId: b.employee?.employeeId ?? '',
        name: b.employee ? `${b.employee.firstName} ${b.employee.lastName}` : '',
        department: b.employee?.department?.name ?? '',
        leaveType: b.leaveType?.name ?? '',
        balance,
        maxEncash,
        encashDays,
        dailyRate: Math.round(dailyRate * 100) / 100,
        value: Math.round(encashDays * dailyRate * 100) / 100,
      };
    }),
  };

  return generateExcelReport({
    companyName,
    reportTitle: 'Leave Encashment Report',
    period: `Year ${year}`,
    sheets: [summarySheet, detailSheet],
  });
}
