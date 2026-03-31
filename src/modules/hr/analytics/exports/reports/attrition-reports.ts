// ─── Attrition Reports: R23 Attrition, R24 Full & Final Settlement ───
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
// R23: Attrition Report (4 sheets)
// ═══════════════════════════════════════════════════════════════
export async function generateAttritionReport(
  tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const dateFrom = new Date(filters.dateFrom);
  const dateTo = new Date(filters.dateTo);

  const exitRequests = await tenantDb.exitRequest.findMany({
    where: {
      companyId: scope.companyId,
      createdAt: { gte: dateFrom, lte: dateTo },
    },
    include: {
      employee: {
        select: {
          employeeId: true,
          firstName: true,
          lastName: true,
          joiningDate: true,
          annualCtc: true,
          gender: true,
          department: { select: { name: true } },
          designation: { select: { name: true } },
          grade: { select: { name: true } },
          location: { select: { name: true } },
        },
      },
      exitInterview: { select: { primaryReason: true, secondaryReasons: true, overallRating: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Total headcount for attrition rate
  const totalActive = await tenantDb.employee.count({
    where: { companyId: scope.companyId, status: { notIn: ['EXITED'] } },
  });
  const avgHeadcount = totalActive + exitRequests.length / 2; // approximate

  // ── Summary Sheet ──
  const summarySheet: ReportSheet = {
    name: 'Summary',
    columns: [
      { header: 'Metric', key: 'metric', width: 35 },
      { header: 'Value', key: 'value', width: 20 },
    ],
    rows: [
      { metric: 'Total Separations (period)', value: exitRequests.length },
      { metric: 'Current Active Headcount', value: totalActive },
      { metric: 'Annualized Attrition Rate', value: `${avgHeadcount > 0 ? ((exitRequests.length / avgHeadcount) * 100).toFixed(1) : 0}%` },
      { metric: 'Voluntary Exits', value: exitRequests.filter((e: any) => e.separationType === 'RESIGNATION').length },
      { metric: 'Involuntary Exits', value: exitRequests.filter((e: any) => e.separationType === 'TERMINATION').length },
      { metric: 'Retirements', value: exitRequests.filter((e: any) => e.separationType === 'RETIREMENT').length },
      { metric: 'Other Separations', value: exitRequests.filter((e: any) => !['RESIGNATION', 'TERMINATION', 'RETIREMENT'].includes(e.separationType)).length },
    ],
  };

  // ── By Department Sheet ──
  const deptAttrition: Record<string, { count: number; voluntary: number; involuntary: number }> = {};
  for (const ex of exitRequests) {
    const dept = ex.employee?.department?.name ?? 'Unassigned';
    if (!deptAttrition[dept]) deptAttrition[dept] = { count: 0, voluntary: 0, involuntary: 0 };
    deptAttrition[dept].count++;
    if (ex.separationType === 'RESIGNATION') deptAttrition[dept].voluntary++;
    else if (ex.separationType === 'TERMINATION') deptAttrition[dept].involuntary++;
  }

  const deptSheet: ReportSheet = {
    name: 'By Department',
    columns: [
      { header: 'Department', key: 'department', width: 25 },
      { header: 'Total Exits', key: 'count', width: 14, format: 'number' },
      { header: 'Voluntary', key: 'voluntary', width: 14, format: 'number' },
      { header: 'Involuntary', key: 'involuntary', width: 14, format: 'number' },
      { header: '% of Total', key: 'percentage', width: 14, format: 'percentage' },
    ],
    rows: Object.entries(deptAttrition)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([dept, data]) => ({
        department: dept,
        ...data,
        percentage: exitRequests.length > 0 ? data.count / exitRequests.length : 0,
      })),
    totalsRow: {
      department: 'Total',
      count: exitRequests.length,
      voluntary: Object.values(deptAttrition).reduce((s, d) => s + d.voluntary, 0),
      involuntary: Object.values(deptAttrition).reduce((s, d) => s + d.involuntary, 0),
      percentage: 1,
    },
  };

  // ── By Reason Sheet (from exit interviews) ──
  const reasonCounts: Record<string, number> = {};
  for (const ex of exitRequests) {
    const reason = ex.exitInterview?.primaryReason ?? ex.separationType ?? 'Unknown';
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  }

  const reasonSheet: ReportSheet = {
    name: 'By Reason',
    columns: [
      { header: 'Reason', key: 'reason', width: 30 },
      { header: 'Count', key: 'count', width: 14, format: 'number' },
      { header: '% of Total', key: 'percentage', width: 14, format: 'percentage' },
    ],
    rows: Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => ({
        reason,
        count,
        percentage: exitRequests.length > 0 ? count / exitRequests.length : 0,
      })),
    totalsRow: {
      reason: 'Total',
      count: exitRequests.length,
      percentage: 1,
    },
  };

  // ── Detail Sheet ──
  const now = new Date();
  const detailSheet: ReportSheet = {
    name: 'Detail',
    columns: [
      { header: 'Emp ID', key: 'empId', width: 14 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Department', key: 'department', width: 18 },
      { header: 'Designation', key: 'designation', width: 18 },
      { header: 'Grade', key: 'grade', width: 12 },
      { header: 'Gender', key: 'gender', width: 10 },
      { header: 'Separation Type', key: 'separationType', width: 18 },
      { header: 'Tenure (years)', key: 'tenure', width: 14, format: 'number' },
      { header: 'Annual CTC', key: 'ctc', width: 16, format: 'currency' },
      { header: 'Resignation Date', key: 'resignationDate', width: 16, format: 'date' },
      { header: 'Last Working Date', key: 'lastWorkingDate', width: 16, format: 'date' },
      { header: 'Exit Reason', key: 'exitReason', width: 22 },
      { header: 'Status', key: 'status', width: 14, conditionalFormat: 'status' },
    ],
    rows: exitRequests.map((ex: any) => {
      const joiningDate = ex.employee?.joiningDate ? new Date(ex.employee.joiningDate) : now;
      const lwd = ex.lastWorkingDate ? new Date(ex.lastWorkingDate) : now;
      const tenure = (lwd.getTime() - joiningDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      return {
        empId: ex.employee?.employeeId ?? '',
        name: ex.employee ? `${ex.employee.firstName} ${ex.employee.lastName}` : '',
        department: ex.employee?.department?.name ?? '',
        designation: ex.employee?.designation?.name ?? '',
        grade: ex.employee?.grade?.name ?? '',
        gender: ex.employee?.gender ?? '',
        separationType: ex.separationType,
        tenure: Math.round(tenure * 10) / 10,
        ctc: dec(ex.employee?.annualCtc),
        resignationDate: formatDate(ex.resignationDate),
        lastWorkingDate: formatDate(ex.lastWorkingDate),
        exitReason: ex.exitInterview?.primaryReason ?? '',
        status: ex.status,
      };
    }),
  };

  return generateExcelReport({
    companyName,
    reportTitle: 'Attrition Report',
    period: `${filters.dateFrom} to ${filters.dateTo}`,
    sheets: [summarySheet, deptSheet, reasonSheet, detailSheet],
  });
}

// ═══════════════════════════════════════════════════════════════
// R24: Full & Final Settlement Report
// ═══════════════════════════════════════════════════════════════
export async function generateFnFSettlementReport(
  tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const settlements = await tenantDb.fnFSettlement.findMany({
    where: {
      exitRequest: { companyId: scope.companyId },
    },
    include: {
      employee: {
        select: {
          employeeId: true,
          firstName: true,
          lastName: true,
          department: { select: { name: true } },
          joiningDate: true,
          lastWorkingDate: true,
        },
      },
      exitRequest: { select: { separationType: true, lastWorkingDate: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const pending = settlements.filter((s: any) => ['DRAFT', 'PENDING', 'APPROVED'].includes(s.status));
  const completed = settlements.filter((s: any) => ['PAID', 'COMPLETED'].includes(s.status));

  // ── Summary Sheet ──
  const summarySheet: ReportSheet = {
    name: 'Summary',
    columns: [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 20 },
    ],
    rows: [
      { metric: 'Total F&F Cases', value: settlements.length },
      { metric: 'Pending Settlement', value: pending.length },
      { metric: 'Completed Settlement', value: completed.length },
      { metric: 'Total Payable (pending)', value: pending.reduce((s: number, f: any) => s + Math.max(0, dec(f.totalAmount)), 0) },
      { metric: 'Total Paid (completed)', value: completed.reduce((s: number, f: any) => s + dec(f.totalAmount), 0) },
      { metric: 'Total Gratuity Liability', value: settlements.reduce((s: number, f: any) => s + dec(f.gratuityAmount), 0) },
      { metric: 'Total Leave Encashment', value: settlements.reduce((s: number, f: any) => s + dec(f.leaveEncashment), 0) },
      { metric: 'Total Loan Recovery', value: settlements.reduce((s: number, f: any) => s + dec(f.loanRecovery), 0) },
    ],
  };

  const fnfColumns: SheetColumn[] = [
    { header: 'Emp ID', key: 'empId', width: 14 },
    { header: 'Name', key: 'name', width: 22 },
    { header: 'Department', key: 'department', width: 18 },
    { header: 'Separation Type', key: 'separationType', width: 16 },
    { header: 'Last Working Date', key: 'lastWorkingDate', width: 16, format: 'date' },
    { header: 'Salary (worked days)', key: 'salaryForWorkedDays', width: 18, format: 'currency' },
    { header: 'Leave Encashment', key: 'leaveEncashment', width: 16, format: 'currency' },
    { header: 'Gratuity', key: 'gratuity', width: 14, format: 'currency' },
    { header: 'Bonus Pro-rata', key: 'bonusProRata', width: 16, format: 'currency' },
    { header: 'Notice Pay', key: 'noticePay', width: 14, format: 'currency', conditionalFormat: 'red-if-negative' },
    { header: 'Loan Recovery', key: 'loanRecovery', width: 14, format: 'currency' },
    { header: 'TDS on F&F', key: 'tds', width: 14, format: 'currency' },
    { header: 'Other Deductions', key: 'otherDeductions', width: 16, format: 'currency' },
    { header: 'Total Amount', key: 'totalAmount', width: 16, format: 'currency', conditionalFormat: 'red-if-negative' },
    { header: 'Status', key: 'status', width: 14, conditionalFormat: 'status' },
  ];

  const mapFnF = (f: any) => ({
    empId: f.employee?.employeeId ?? '',
    name: f.employee ? `${f.employee.firstName} ${f.employee.lastName}` : '',
    department: f.employee?.department?.name ?? '',
    separationType: f.exitRequest?.separationType ?? '',
    lastWorkingDate: formatDate(f.exitRequest?.lastWorkingDate),
    salaryForWorkedDays: dec(f.salaryForWorkedDays),
    leaveEncashment: dec(f.leaveEncashment),
    gratuity: dec(f.gratuityAmount),
    bonusProRata: dec(f.bonusProRata),
    noticePay: dec(f.noticePay),
    loanRecovery: dec(f.loanRecovery),
    tds: dec(f.tdsOnFnF),
    otherDeductions: dec(f.otherDeductions),
    totalAmount: dec(f.totalAmount),
    status: f.status,
  });

  // ── Pending Sheet ──
  const pendingSheet: ReportSheet = {
    name: 'Pending',
    columns: fnfColumns,
    rows: pending.map(mapFnF),
    totalsRow: {
      empId: 'Total',
      name: `${pending.length} cases`,
      department: '',
      separationType: '',
      lastWorkingDate: '',
      salaryForWorkedDays: pending.reduce((s: number, f: any) => s + dec(f.salaryForWorkedDays), 0),
      leaveEncashment: pending.reduce((s: number, f: any) => s + dec(f.leaveEncashment), 0),
      gratuity: pending.reduce((s: number, f: any) => s + dec(f.gratuityAmount), 0),
      bonusProRata: pending.reduce((s: number, f: any) => s + dec(f.bonusProRata), 0),
      noticePay: pending.reduce((s: number, f: any) => s + dec(f.noticePay), 0),
      loanRecovery: pending.reduce((s: number, f: any) => s + dec(f.loanRecovery), 0),
      tds: pending.reduce((s: number, f: any) => s + dec(f.tdsOnFnF), 0),
      otherDeductions: pending.reduce((s: number, f: any) => s + dec(f.otherDeductions), 0),
      totalAmount: pending.reduce((s: number, f: any) => s + dec(f.totalAmount), 0),
      status: '',
    },
  };

  // ── Completed Sheet ──
  const completedSheet: ReportSheet = {
    name: 'Completed',
    columns: fnfColumns,
    rows: completed.map(mapFnF),
    totalsRow: {
      empId: 'Total',
      name: `${completed.length} cases`,
      department: '',
      separationType: '',
      lastWorkingDate: '',
      salaryForWorkedDays: completed.reduce((s: number, f: any) => s + dec(f.salaryForWorkedDays), 0),
      leaveEncashment: completed.reduce((s: number, f: any) => s + dec(f.leaveEncashment), 0),
      gratuity: completed.reduce((s: number, f: any) => s + dec(f.gratuityAmount), 0),
      bonusProRata: completed.reduce((s: number, f: any) => s + dec(f.bonusProRata), 0),
      noticePay: completed.reduce((s: number, f: any) => s + dec(f.noticePay), 0),
      loanRecovery: completed.reduce((s: number, f: any) => s + dec(f.loanRecovery), 0),
      tds: completed.reduce((s: number, f: any) => s + dec(f.tdsOnFnF), 0),
      otherDeductions: completed.reduce((s: number, f: any) => s + dec(f.otherDeductions), 0),
      totalAmount: completed.reduce((s: number, f: any) => s + dec(f.totalAmount), 0),
      status: '',
    },
  };

  return generateExcelReport({
    companyName,
    reportTitle: 'Full & Final Settlement Report',
    period: `${filters.dateFrom} to ${filters.dateTo}`,
    sheets: [summarySheet, pendingSheet, completedSheet],
  });
}
