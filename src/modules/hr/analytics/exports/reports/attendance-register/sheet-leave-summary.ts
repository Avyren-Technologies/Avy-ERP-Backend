import type { ReportSheet, SheetColumn } from '../../excel-exporter';
import type { ReportDataset } from './types';

// ─── Column layout ───
const columns: SheetColumn[] = [
  { header: 'Emp ID',      key: 'empCode',           width: 12 },
  { header: 'Employee Name', key: 'empName',          width: 22 },
  { header: 'Department',  key: 'department',         width: 16 },
  { header: 'Leave Type',  key: 'leaveTypeName',      width: 16 },
  { header: 'Code',        key: 'leaveTypeCode',      width: 6  },
  { header: 'Category',    key: 'category',           width: 12 },
  { header: 'Entitlement', key: 'annualEntitlement',  width: 10, format: 'number' },
  { header: 'Opening',     key: 'openingBalance',     width: 8,  format: 'number' },
  { header: 'Accrued',     key: 'accrued',            width: 8,  format: 'number' },
  { header: 'Availed',     key: 'taken',              width: 8,  format: 'number' },
  { header: 'Pending',     key: 'pendingApproval',    width: 8,  format: 'number' },
  { header: 'Closing',     key: 'closingBalance',     width: 8,  format: 'number' },
];

// ─── Main builder ───
export function buildLeaveSummary(dataset: ReportDataset): ReportSheet | null {
  if (dataset.mode === 'daily') return null;

  const rows: Record<string, unknown>[] = [];

  // Sort employees by empCode
  const sortedEmployees = [...dataset.employees.entries()].sort((a, b) =>
    a[1].empCode.localeCompare(b[1].empCode),
  );

  for (const [empId, empInfo] of sortedEmployees) {
    const balances = dataset.leaveBalances.get(empId);
    if (!balances || balances.length === 0) continue;

    for (const bal of balances) {
      rows.push({
        empCode:           empInfo.empCode,
        empName:           empInfo.empName,
        department:        empInfo.department,
        leaveTypeName:     bal.leaveTypeName,
        leaveTypeCode:     bal.leaveTypeCode,
        category:          bal.category,
        annualEntitlement: bal.annualEntitlement,
        openingBalance:    Math.round((bal.balance + bal.taken) * 10) / 10,
        accrued:           Math.round(bal.accrued * 10) / 10,
        taken:             Math.round(bal.taken * 10) / 10,
        pendingApproval:   dataset.pendingLeaveRequests.get(empId)?.[bal.leaveTypeId] ?? 0,
        closingBalance:    Math.round(bal.balance * 10) / 10,
      });
    }
  }

  return {
    name: 'Leave Summary',
    columns,
    rows,
    freezeRow: 6,
  };
}
