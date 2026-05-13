import { generateExcelReport } from '../../excel-exporter';
import type { DashboardFilters, DataScope } from '../../../analytics.types';
import type { ReportSheet } from '../../excel-exporter';
import { detectReportMode } from './types';
import { fetchReportDataset } from './fetch-dataset';
import { buildExecutiveSummary } from './sheet-executive-summary';
import { buildDetailedRegister } from './sheet-detailed-register';
import { buildDayWiseGrid } from './sheet-daywise-grid';
import { buildExceptionReport } from './sheet-exception-report';
import { buildPayrollHandoff } from './sheet-payroll-handoff';
import { buildComplianceMusterRoll } from './sheet-compliance-muster';
import { buildLeaveSummary } from './sheet-leave-summary';
import { buildShiftSummary } from './sheet-shift-summary';
import { buildAuditTrail } from './sheet-audit-trail';
import { buildProcessingMetadata } from './sheet-processing-metadata';

export async function generateAttendanceRegister(
  tenantDb: any,
  companyName: string,
  filters: DashboardFilters,
  scope: DataScope,
): Promise<Buffer> {
  const mode = detectReportMode(filters.dateFrom, filters.dateTo);

  // 1. Fetch and index all data
  const dataset = await fetchReportDataset(tenantDb, companyName, filters, scope, mode);

  // 2. Build sheets based on mode
  const sheets: ReportSheet[] = [];

  // Sheet 1: Executive Summary (always)
  sheets.push(buildExecutiveSummary(dataset));

  // Sheet 2: Detailed Register (always)
  sheets.push(buildDetailedRegister(dataset));

  // Sheet 3: Day-wise Grid (excluded for daily mode, returns [] for daily)
  const gridSheets = buildDayWiseGrid(dataset);
  sheets.push(...gridSheets);

  // Sheet 4: Exception Report (always)
  sheets.push(buildExceptionReport(dataset));

  // Sheet 5: Payroll Handoff (monthly/multi-month only, returns null otherwise)
  const payrollSheet = buildPayrollHandoff(dataset);
  if (payrollSheet) sheets.push(payrollSheet);

  // Sheet 6: Compliance Muster Roll (monthly/multi-month only, returns [] otherwise)
  const musterSheets = buildComplianceMusterRoll(dataset);
  sheets.push(...musterSheets);

  // Sheet 7: Leave Summary (excluded for daily, returns null)
  const leaveSheet = buildLeaveSummary(dataset);
  if (leaveSheet) sheets.push(leaveSheet);

  // Sheet 8: Shift Summary (always)
  sheets.push(buildShiftSummary(dataset));

  // Sheet 9: Audit Trail (returns null if no audit entries)
  const auditSheet = buildAuditTrail(dataset);
  if (auditSheet) sheets.push(auditSheet);

  // Sheet 10: Processing Metadata (always)
  sheets.push(buildProcessingMetadata(dataset));

  // 3. Generate Excel
  const periodLabel = mode === 'daily'
    ? filters.dateFrom
    : `${filters.dateFrom} to ${filters.dateTo}`;

  return generateExcelReport({
    companyName,
    reportTitle: 'Attendance Register',
    period: periodLabel,
    sheets,
  });
}
