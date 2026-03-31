// ─── Compliance Report: R25 Compliance Summary ───
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
// R25: Compliance Summary Report
// ═══════════════════════════════════════════════════════════════
export async function generateComplianceSummaryReport(
  tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const dateFrom = new Date(filters.dateFrom);
  const dateTo = new Date(filters.dateTo);

  // Fetch statutory filings
  const filings = await tenantDb.statutoryFiling.findMany({
    where: {
      companyId: scope.companyId,
      year: { gte: dateFrom.getFullYear(), lte: dateTo.getFullYear() },
    },
    orderBy: [{ year: 'desc' }, { month: 'desc' }, { type: 'asc' }],
  });

  // Fetch grievance cases
  const grievances = await tenantDb.grievanceCase.findMany({
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
          department: { select: { name: true } },
        },
      },
      category: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Fetch employee documents for document compliance
  const employees = await tenantDb.employee.findMany({
    where: {
      companyId: scope.companyId,
      status: { notIn: ['EXITED'] },
    },
    select: {
      employeeId: true,
      firstName: true,
      lastName: true,
      panNumber: true,
      aadhaarNumber: true,
      uan: true,
      esiIpNumber: true,
      department: { select: { name: true } },
      documents: { select: { documentType: true, status: true } },
    },
  });

  // ── Score Sheet ──
  const filedCount = filings.filter((f: any) => f.status === 'FILED').length;
  const totalFilings = filings.length;
  const filingScore = totalFilings > 0 ? (filedCount / totalFilings) * 100 : 100;

  const resolvedGrievances = grievances.filter((g: any) => g.status === 'RESOLVED' || g.status === 'CLOSED').length;
  const grievanceScore = grievances.length > 0 ? (resolvedGrievances / grievances.length) * 100 : 100;

  // Document compliance: check key IDs
  const docCompliant = employees.filter(
    (e: any) => e.panNumber && e.aadhaarNumber,
  ).length;
  const docScore = employees.length > 0 ? (docCompliant / employees.length) * 100 : 100;

  const overallScore = Math.round((filingScore + grievanceScore + docScore) / 3);

  const scoreSheet: ReportSheet = {
    name: 'Score',
    columns: [
      { header: 'Compliance Area', key: 'area', width: 30 },
      { header: 'Score', key: 'score', width: 12, format: 'number' },
      { header: 'Status', key: 'status', width: 16, conditionalFormat: 'status' },
      { header: 'Details', key: 'details', width: 40 },
    ],
    rows: [
      {
        area: 'Statutory Filings',
        score: Math.round(filingScore),
        status: filingScore >= 90 ? 'COMPLIANT' : filingScore >= 70 ? 'PENDING' : 'NON_COMPLIANT',
        details: `${filedCount} of ${totalFilings} filings completed`,
      },
      {
        area: 'Grievance Resolution',
        score: Math.round(grievanceScore),
        status: grievanceScore >= 90 ? 'COMPLIANT' : grievanceScore >= 70 ? 'PENDING' : 'NON_COMPLIANT',
        details: `${resolvedGrievances} of ${grievances.length} grievances resolved`,
      },
      {
        area: 'Document Compliance',
        score: Math.round(docScore),
        status: docScore >= 90 ? 'COMPLIANT' : docScore >= 70 ? 'PENDING' : 'NON_COMPLIANT',
        details: `${docCompliant} of ${employees.length} employees have complete IDs`,
      },
      {
        area: 'Overall Compliance Score',
        score: overallScore,
        status: overallScore >= 90 ? 'COMPLIANT' : overallScore >= 70 ? 'PENDING' : 'NON_COMPLIANT',
        details: 'Weighted average of all compliance areas',
      },
    ],
  };

  // ── Filings Sheet ──
  const filingsSheet: ReportSheet = {
    name: 'Filings',
    columns: [
      { header: 'Filing Type', key: 'type', width: 22 },
      { header: 'Month', key: 'month', width: 10, format: 'number' },
      { header: 'Year', key: 'year', width: 10, format: 'number' },
      { header: 'Amount', key: 'amount', width: 16, format: 'currency' },
      { header: 'Due Date', key: 'dueDate', width: 14, format: 'date' },
      { header: 'Filed Date', key: 'filedAt', width: 14, format: 'date' },
      { header: 'Status', key: 'status', width: 14, conditionalFormat: 'status' },
      { header: 'Overdue', key: 'overdue', width: 10 },
    ],
    rows: filings.map((f: any) => {
      const isOverdue =
        f.status !== 'FILED' && f.dueDate && new Date(f.dueDate) < new Date();
      return {
        type: f.type,
        month: f.month ?? '',
        year: f.year,
        amount: dec(f.amount),
        dueDate: formatDate(f.dueDate),
        filedAt: formatDate(f.filedAt),
        status: f.status,
        overdue: isOverdue ? 'Yes' : 'No',
      };
    }),
  };

  // ── Grievances Sheet ──
  const grievancesSheet: ReportSheet = {
    name: 'Grievances',
    columns: [
      { header: 'Emp ID', key: 'empId', width: 14 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Department', key: 'department', width: 18 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Description', key: 'description', width: 35 },
      { header: 'Anonymous', key: 'isAnonymous', width: 12 },
      { header: 'Status', key: 'status', width: 14, conditionalFormat: 'status' },
      { header: 'Resolution', key: 'resolution', width: 30 },
      { header: 'Created', key: 'createdAt', width: 14, format: 'date' },
      { header: 'Resolved', key: 'resolvedAt', width: 14, format: 'date' },
    ],
    rows: grievances.map((g: any) => ({
      empId: g.isAnonymous ? 'ANONYMOUS' : g.employee?.employeeId ?? '',
      name: g.isAnonymous ? 'Anonymous' : g.employee ? `${g.employee.firstName} ${g.employee.lastName}` : '',
      department: g.employee?.department?.name ?? '',
      category: g.category?.name ?? '',
      description: (g.description ?? '').substring(0, 100),
      isAnonymous: g.isAnonymous ? 'Yes' : 'No',
      status: g.status,
      resolution: g.resolution ?? '',
      createdAt: formatDate(g.createdAt),
      resolvedAt: formatDate(g.resolvedAt),
    })),
  };

  // ── Document Status Sheet ──
  const docStatusRows = employees
    .filter((e: any) => !e.panNumber || !e.aadhaarNumber || !e.uan)
    .map((e: any) => ({
      empId: e.employeeId,
      name: `${e.firstName} ${e.lastName}`,
      department: e.department?.name ?? '',
      pan: e.panNumber ? 'Present' : 'Missing',
      aadhaar: e.aadhaarNumber ? 'Present' : 'Missing',
      uan: e.uan ? 'Present' : 'Missing',
      esi: e.esiIpNumber ? 'Present' : 'Missing',
      missingCount: [!e.panNumber, !e.aadhaarNumber, !e.uan, !e.esiIpNumber].filter(Boolean).length,
    }));

  const docStatusSheet: ReportSheet = {
    name: 'Document Status',
    columns: [
      { header: 'Emp ID', key: 'empId', width: 14 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Department', key: 'department', width: 18 },
      { header: 'PAN', key: 'pan', width: 12, conditionalFormat: 'status' },
      { header: 'Aadhaar', key: 'aadhaar', width: 12, conditionalFormat: 'status' },
      { header: 'UAN', key: 'uan', width: 12, conditionalFormat: 'status' },
      { header: 'ESI IP', key: 'esi', width: 12, conditionalFormat: 'status' },
      { header: 'Missing Documents', key: 'missingCount', width: 18, format: 'number' },
    ],
    rows: docStatusRows.sort((a, b) => b.missingCount - a.missingCount),
    totalsRow: {
      empId: 'Total',
      name: `${docStatusRows.length} employees with gaps`,
      department: '',
      pan: `${docStatusRows.filter((r) => r.pan === 'Missing').length} missing`,
      aadhaar: `${docStatusRows.filter((r) => r.aadhaar === 'Missing').length} missing`,
      uan: `${docStatusRows.filter((r) => r.uan === 'Missing').length} missing`,
      esi: `${docStatusRows.filter((r) => r.esi === 'Missing').length} missing`,
      missingCount: docStatusRows.reduce((s, r) => s + r.missingCount, 0),
    },
  };

  return generateExcelReport({
    companyName,
    reportTitle: 'Compliance Summary Report',
    period: `${filters.dateFrom} to ${filters.dateTo}`,
    sheets: [scoreSheet, filingsSheet, grievancesSheet, docStatusSheet],
  });
}
