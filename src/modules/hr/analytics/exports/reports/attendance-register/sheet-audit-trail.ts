import type { ReportSheet, SheetColumn } from '../../excel-exporter';
import type { ReportDataset } from './types';

// ─── Column layout ───
const columns: SheetColumn[] = [
  { header: 'Date Modified',    key: 'changedAt',        width: 16 },
  { header: 'Attendance Date',  key: 'attendanceDate',   width: 12 },
  { header: 'Emp ID',           key: 'empCode',          width: 12 },
  { header: 'Employee Name',    key: 'empName',          width: 20 },
  { header: 'Department',       key: 'department',       width: 16 },
  { header: 'Action',           key: 'action',           width: 10 },
  { header: 'Field Changed',    key: 'fieldChanged',     width: 18 },
  { header: 'Old Value',        key: 'oldValue',         width: 20 },
  { header: 'New Value',        key: 'newValue',         width: 20 },
  { header: 'Changed By',       key: 'changedByName',    width: 18 },
  { header: 'Payroll Impacted', key: 'payrollImpacted',  width: 10 },
];

// ─── Main builder ───
export function buildAuditTrail(dataset: ReportDataset): ReportSheet | null {
  if (dataset.auditEntries.length === 0) return null;

  const rows = dataset.auditEntries.map(entry => ({
    changedAt: entry.changedAt.toLocaleString('en-IN', {
      day:    '2-digit',
      month:  'short',
      year:   'numeric',
      hour:   '2-digit',
      minute: '2-digit',
    }),
    attendanceDate:  entry.attendanceDate,
    empCode:         entry.empCode,
    empName:         entry.empName,
    department:      entry.department,
    action:          entry.action,
    fieldChanged:    entry.fieldChanged,
    oldValue:        entry.oldValue || '—',
    newValue:        entry.newValue || '—',
    changedByName:   entry.changedByName,
    payrollImpacted: entry.payrollImpacted ? 'Y' : 'N',
  }));

  return {
    name:      'Audit Trail',
    columns,
    rows:      rows as unknown as Record<string, unknown>[],
    freezeRow: 6,
  };
}
