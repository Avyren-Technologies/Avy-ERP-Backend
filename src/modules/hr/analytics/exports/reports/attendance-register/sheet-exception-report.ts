import type { ReportSheet, SheetColumn } from '../../excel-exporter';
import type { ReportDataset, ExceptionEntry, ExceptionSeverity } from './types';
import { STATUS_CODES } from './types';

// ─── Column layout ───
const columns: SheetColumn[] = [
  { header: 'Severity',       key: 'severity',       width: 10, conditionalFormat: 'severity' },
  { header: 'Category',       key: 'category',       width: 20 },
  { header: 'Exception Type', key: 'type',           width: 22 },
  { header: 'Date',           key: 'date',           width: 12 },
  { header: 'Emp ID',         key: 'empCode',        width: 12 },
  { header: 'Employee Name',  key: 'empName',        width: 20 },
  { header: 'Department',     key: 'department',     width: 16 },
  { header: 'Details',        key: 'details',        width: 35 },
  { header: 'Current Status', key: 'currentStatus',  width: 12, conditionalFormat: 'attendance-status' },
  { header: 'Resolution',     key: 'resolution',     width: 14 },
];

// ─── Severity sort order ───
const SEVERITY_ORDER: Record<ExceptionSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

// ─── Statuses that don't require punch data ───
const NO_PUNCH_STATUSES = new Set(['HOLIDAY', 'WEEK_OFF', 'ON_LEAVE', 'ABSENT']);
const NON_WORK_STATUSES = new Set(['ABSENT', 'ON_LEAVE', 'HOLIDAY', 'WEEK_OFF']);

// ─── Main builder ───
export function buildExceptionReport(dataset: ReportDataset): ReportSheet {
  const exceptions: ExceptionEntry[] = [];

  // ── 1. Punch Exceptions (MEDIUM) ────────────────────────────────────────
  for (const rec of dataset.records) {
    if (NO_PUNCH_STATUSES.has(rec.status)) continue;
    const missingIn  = rec.punchIn === null;
    const missingOut = rec.punchOut === null;
    if (!missingIn && !missingOut) continue;

    const type    = missingIn && missingOut ? 'Missing IN & OUT Punch'
      : missingIn  ? 'Missing IN Punch'
      : 'Missing OUT Punch';
    const details = missingIn && missingOut ? 'Both punch-in and punch-out are missing'
      : missingIn  ? 'Punch-in record is missing'
      : 'Punch-out record is missing';

    exceptions.push({
      severity:      'MEDIUM',
      category:      'Punch Exceptions',
      type,
      date:          rec.dateStr,
      empCode:       rec.empCode,
      empName:       rec.empName,
      department:    rec.department,
      details,
      currentStatus: STATUS_CODES[rec.status] ?? rec.status,
      resolution:    'Regularize',
    });
  }

  // ── 2. Late Coming (LOW / MEDIUM) ───────────────────────────────────────
  for (const rec of dataset.records) {
    if (!rec.isLate) continue;
    const severity: ExceptionSeverity = rec.lateMinutes <= 30 ? 'LOW' : 'MEDIUM';
    exceptions.push({
      severity,
      category:      'Punctuality',
      type:          'Late Coming',
      date:          rec.dateStr,
      empCode:       rec.empCode,
      empName:       rec.empName,
      department:    rec.department,
      details:       `Late by ${rec.lateMinutes} min`,
      currentStatus: STATUS_CODES[rec.status] ?? rec.status,
      resolution:    'Monitor',
    });
  }

  // ── 3. Early Exit (MEDIUM) ──────────────────────────────────────────────
  for (const rec of dataset.records) {
    if (!rec.isEarlyExit) continue;
    exceptions.push({
      severity:      'MEDIUM',
      category:      'Punctuality',
      type:          'Early Exit',
      date:          rec.dateStr,
      empCode:       rec.empCode,
      empName:       rec.empName,
      department:    rec.department,
      details:       `Early exit by ${rec.earlyMinutes} min`,
      currentStatus: STATUS_CODES[rec.status] ?? rec.status,
      resolution:    'Monitor',
    });
  }

  // ── 4. Short Hours (MEDIUM) ─────────────────────────────────────────────
  for (const rec of dataset.records) {
    if (NON_WORK_STATUSES.has(rec.status)) continue;
    if (!(rec.workedHours > 0 && rec.workedHours < 4)) continue;
    exceptions.push({
      severity:      'MEDIUM',
      category:      'Working Hours',
      type:          'Short Hours',
      date:          rec.dateStr,
      empCode:       rec.empCode,
      empName:       rec.empName,
      department:    rec.department,
      details:       `Only ${rec.workedHours}h worked (below half-day threshold)`,
      currentStatus: STATUS_CODES[rec.status] ?? rec.status,
      resolution:    'Review',
    });
  }

  // ── 5. Pending Regularization (HIGH) ────────────────────────────────────
  // Build a lookup from attendanceRecordId → FlatRecord for quick joins
  const recordById = new Map<string, (typeof dataset.records)[0]>();
  for (const rec of dataset.records) {
    recordById.set(rec.id, rec);
  }

  for (const override of dataset.overrides) {
    if (override.status !== 'PENDING') continue;
    const rec = recordById.get(override.attendanceRecordId);
    exceptions.push({
      severity:      'HIGH',
      category:      'Regularization',
      type:          'Pending Regularization',
      date:          rec?.dateStr ?? '',
      empCode:       rec?.empCode ?? override.employeeId,
      empName:       rec?.empName ?? '',
      department:    rec?.department ?? '',
      details:       `${override.issueType} — pending approval`,
      currentStatus: rec ? (STATUS_CODES[rec.status] ?? rec.status) : '',
      resolution:    'Approve/Reject',
    });
  }

  // ── 6. Rejected Regularization (MEDIUM) ─────────────────────────────────
  for (const override of dataset.overrides) {
    if (override.status !== 'REJECTED') continue;
    const rec = recordById.get(override.attendanceRecordId);
    exceptions.push({
      severity:      'MEDIUM',
      category:      'Regularization',
      type:          'Rejected Regularization',
      date:          rec?.dateStr ?? '',
      empCode:       rec?.empCode ?? override.employeeId,
      empName:       rec?.empName ?? '',
      department:    rec?.department ?? '',
      details:       `${override.issueType} — rejected`,
      currentStatus: rec ? (STATUS_CODES[rec.status] ?? rec.status) : '',
      resolution:    'Re-submit',
    });
  }

  // ── 7. Modified After Payroll Lock (CRITICAL) ────────────────────────────
  if (dataset.payrollRun?.lockedAt) {
    const lockedAt = dataset.payrollRun.lockedAt;
    const lockedAtStr = lockedAt.toISOString().replace('T', ' ').substring(0, 16);
    for (const rec of dataset.records) {
      if (rec.updatedAt > lockedAt) {
        exceptions.push({
          severity:      'CRITICAL',
          category:      'Payroll Integrity',
          type:          'Modified After Payroll Lock',
          date:          rec.dateStr,
          empCode:       rec.empCode,
          empName:       rec.empName,
          department:    rec.department,
          details:       `Record modified after payroll lock (locked: ${lockedAtStr})`,
          currentStatus: STATUS_CODES[rec.status] ?? rec.status,
          resolution:    'Investigate',
        });
      }
    }
  }

  // ── 8. Consecutive Absence (HIGH) ────────────────────────────────────────
  for (const [, empRecords] of dataset.byEmployee) {
    // Sort by date ascending
    const sorted = [...empRecords].sort((a, b) => a.dateStr.localeCompare(b.dateStr));

    let seqStart = -1;
    let seqCount = 0;

    const flushSequence = (endIdx: number) => {
      if (seqCount >= 3 && seqStart !== -1) {
        const startRec = sorted[seqStart];
        const endRec   = sorted[endIdx - 1];
        if (!startRec || !endRec) return;
        exceptions.push({
          severity:      'HIGH',
          category:      'Absenteeism',
          type:          'Consecutive Absence',
          date:          startRec.dateStr,
          empCode:       startRec.empCode,
          empName:       startRec.empName,
          department:    startRec.department,
          details:       `${seqCount} consecutive absences: ${startRec.dateStr} to ${endRec.dateStr}`,
          currentStatus: STATUS_CODES['ABSENT'] ?? 'A',
          resolution:    'Escalate',
        });
      }
    };

    for (let i = 0; i < sorted.length; i++) {
      const rec = sorted[i];
      if (!rec) continue;
      // Skip weekends and holidays — they don't break or extend an absence run
      if (dataset.weekendDates.has(rec.dateStr) || dataset.holidayDates.has(rec.dateStr)) continue;

      if (rec.status === 'ABSENT') {
        if (seqStart === -1) seqStart = i;
        seqCount++;
      } else {
        flushSequence(i);
        seqStart = -1;
        seqCount = 0;
      }
    }
    // Flush at end of records
    flushSequence(sorted.length);
  }

  // ── 9. Habitual Late (MEDIUM) ────────────────────────────────────────────
  const lateCountByEmployee = new Map<string, { count: number; rec: (typeof dataset.records)[0] }>();
  for (const rec of dataset.records) {
    if (!rec.isLate) continue;
    const existing = lateCountByEmployee.get(rec.employeeId);
    if (existing) {
      existing.count++;
    } else {
      lateCountByEmployee.set(rec.employeeId, { count: 1, rec });
    }
  }
  for (const [, { count, rec }] of lateCountByEmployee) {
    if (count <= 3) continue;
    exceptions.push({
      severity:      'MEDIUM',
      category:      'Habitual Violations',
      type:          'Habitual Late',
      date:          dataset.filters.dateFrom,
      empCode:       rec.empCode,
      empName:       rec.empName,
      department:    rec.department,
      details:       `${count} late marks in period`,
      currentStatus: '',
      resolution:    'Counsel',
    });
  }

  // ── 10. Frequent Missing Punch (MEDIUM) ──────────────────────────────────
  const missingPunchCountByEmployee = new Map<string, { count: number; rec: (typeof dataset.records)[0] }>();
  for (const rec of dataset.records) {
    if (rec.status !== 'INCOMPLETE') continue;
    const existing = missingPunchCountByEmployee.get(rec.employeeId);
    if (existing) {
      existing.count++;
    } else {
      missingPunchCountByEmployee.set(rec.employeeId, { count: 1, rec });
    }
  }
  for (const [, { count, rec }] of missingPunchCountByEmployee) {
    if (count <= 2) continue;
    exceptions.push({
      severity:      'MEDIUM',
      category:      'Habitual Violations',
      type:          'Frequent Missing Punch',
      date:          dataset.filters.dateFrom,
      empCode:       rec.empCode,
      empName:       rec.empName,
      department:    rec.department,
      details:       `${count} missing punch records`,
      currentStatus: '',
      resolution:    'Regularize',
    });
  }

  // ── 11. Low Attendance (HIGH) ────────────────────────────────────────────
  for (const [, summary] of dataset.employeeSummaries) {
    const denominator = summary.presentDays + summary.absentDays + summary.lopDays + summary.halfDays;
    if (denominator === 0) continue;
    const pct = ((summary.presentDays + summary.halfDays * 0.5) / denominator) * 100;
    if (pct >= 75) continue;
    exceptions.push({
      severity:      'HIGH',
      category:      'Attendance Rate',
      type:          'Low Attendance',
      date:          dataset.filters.dateFrom,
      empCode:       summary.empCode,
      empName:       summary.empName,
      department:    summary.department,
      details:       `Attendance: ${pct.toFixed(1)}% (below 75% threshold)`,
      currentStatus: '',
      resolution:    'HR Review',
    });
  }

  // ── Sort: CRITICAL → HIGH → MEDIUM → LOW, then by date ──────────────────
  exceptions.sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]) ||
      a.date.localeCompare(b.date),
  );

  return {
    name:      'Exception Report',
    columns,
    rows:      exceptions as unknown as Record<string, unknown>[],
    freezeRow: 6,
  };
}
