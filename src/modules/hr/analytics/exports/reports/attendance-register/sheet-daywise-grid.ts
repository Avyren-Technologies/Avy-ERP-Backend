import type { ReportSheet, SheetColumn } from '../../excel-exporter';
import type { ReportDataset, FlatRecord } from './types';
import { STATUS_CODES, STATUS_LEGEND, MONTH_NAMES } from './types';

// ─── Helpers ───

type Row = Record<string, unknown>;

/**
 * Derive the display code for a single attendance record.
 * For ON_LEAVE, prefer the leave type code from halves (CL/SL/PL/CO) if available.
 */
function getDisplayCode(record: FlatRecord): string {
  if (record.status === 'ON_LEAVE') {
    // Look for a leave type code in either half
    for (const half of record.halves) {
      if (half.leaveTypeCode) {
        return half.leaveTypeCode.toUpperCase();
      }
    }
    return STATUS_CODES['ON_LEAVE'] ?? 'LV';
  }
  return STATUS_CODES[record.status] ?? record.status;
}

/**
 * Build the list of months spanning dateFrom..dateTo (inclusive).
 */
function buildMonthList(
  dateFrom: string,
  dateTo: string,
): { year: number; month: number; label: string }[] {
  const months: { year: number; month: number; label: string }[] = [];

  const from = new Date(dateFrom);
  const to = new Date(dateTo);

  let year = from.getUTCFullYear();
  let month = from.getUTCMonth(); // 0-based

  const toYear = to.getUTCFullYear();
  const toMonth = to.getUTCMonth();

  while (year < toYear || (year === toYear && month <= toMonth)) {
    months.push({
      year,
      month, // 0-based
      label: `${MONTH_NAMES[month]} ${year}`,
    });
    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
  }

  return months;
}

// ─── Main builder ───

export function buildDayWiseGrid(dataset: ReportDataset): ReportSheet[] {
  // ── Daily mode: a 1-column day grid is useless ─────────────────────────
  if (dataset.mode === 'daily') {
    return [];
  }

  // ── Multi-month mode: month summary columns ────────────────────────────
  if (dataset.mode === 'multi-month') {
    const months = buildMonthList(
      dataset.filters.dateFrom as string,
      dataset.filters.dateTo as string,
    );

    const columns: SheetColumn[] = [
      { header: 'Emp ID',  key: 'empCode',     width: 12 },
      { header: 'Name',    key: 'empName',      width: 22 },
      { header: 'Dept',    key: 'department',   width: 16 },
      // Per-month summary columns
      ...months.flatMap(m => [
        { header: `${m.label} P`,   key: `${m.label}_P`,   width: 6, format: 'number' as const },
        { header: `${m.label} A`,   key: `${m.label}_A`,   width: 6, format: 'number' as const },
        { header: `${m.label} LV`,  key: `${m.label}_LV`,  width: 6, format: 'number' as const },
        { header: `${m.label} Hrs`, key: `${m.label}_Hrs`, width: 7, format: 'number' as const },
      ]),
      // Totals
      { header: 'Total P',   key: 'totalP',   width: 7, format: 'number' as const },
      { header: 'Total A',   key: 'totalA',   width: 7, format: 'number' as const },
      { header: 'Total Hrs', key: 'totalHrs', width: 8, format: 'number' as const },
    ];

    const rows: Row[] = [];

    for (const [empId, empRecords] of dataset.byEmployee) {
      const empInfo = dataset.employees.get(empId);
      if (!empInfo) continue;

      const row: Row = {
        empCode:    empInfo.empCode,
        empName:    empInfo.empName,
        department: empInfo.department,
      };

      let grandP   = 0;
      let grandA   = 0;
      let grandHrs = 0;

      for (const m of months) {
        const monthRecords = empRecords.filter(r => {
          const d = r.date instanceof Date ? r.date : new Date(r.date);
          return d.getUTCFullYear() === m.year && d.getUTCMonth() === m.month;
        });

        const mP = monthRecords.filter(
          r => r.status === 'PRESENT' || r.status === 'LATE' || r.status === 'REGULARIZED',
        ).length;
        const mA   = monthRecords.filter(r => r.status === 'ABSENT').length;
        const mLV  = monthRecords.filter(r => r.status === 'ON_LEAVE').length;
        const mHrs = monthRecords.reduce((sum, r) => sum + r.workedHours, 0);

        row[`${m.label}_P`]   = mP;
        row[`${m.label}_A`]   = mA;
        row[`${m.label}_LV`]  = mLV;
        row[`${m.label}_Hrs`] = Math.round(mHrs * 100) / 100;

        grandP   += mP;
        grandA   += mA;
        grandHrs += mHrs;
      }

      row['totalP']   = grandP;
      row['totalA']   = grandA;
      row['totalHrs'] = Math.round(grandHrs * 100) / 100;

      rows.push(row);
    }

    return [{
      name: 'Day-wise Grid',
      columns,
      rows,
      freezeRow: 6,
      legendText: STATUS_LEGEND,
    }];
  }

  // ── Weekly / Monthly mode: one column per day ──────────────────────────

  const columns: SheetColumn[] = [
    { header: 'Emp ID', key: 'empCode',   width: 12 },
    { header: 'Name',   key: 'empName',   width: 22 },
    { header: 'Dept',   key: 'department', width: 16 },
    // Day columns — one per date in range
    ...dataset.allDates.map(dateStr => {
      const d = new Date(dateStr);
      const dayNum = d.getUTCDate().toString();
      return {
        header: dayNum,
        key: dateStr,
        width: 5,
        conditionalFormat: 'attendance-status' as const,
      };
    }),
    // Summary columns
    { header: 'P',      key: 'presentCount', width: 5,  format: 'number' as const },
    { header: 'A',      key: 'absentCount',  width: 5,  format: 'number' as const },
    { header: 'LV',     key: 'leaveCount',   width: 5,  format: 'number' as const },
    { header: 'HD',     key: 'halfDayCount', width: 5,  format: 'number' as const },
    { header: 'L',      key: 'lateCount',    width: 5,  format: 'number' as const },
    { header: 'LOP',    key: 'lopCount',     width: 5,  format: 'number' as const },
    { header: 'H',      key: 'holidayCount', width: 5,  format: 'number' as const },
    { header: 'W',      key: 'weekOffCount', width: 5,  format: 'number' as const },
    { header: 'OT Hrs', key: 'otHours',      width: 7,  format: 'number' as const },
    { header: 'Worked', key: 'totalWorked',  width: 7,  format: 'number' as const },
    { header: 'Paid',   key: 'paidDays',     width: 6,  format: 'number' as const },
  ];

  const rows: Row[] = [];

  for (const [empId, empRecords] of dataset.byEmployee) {
    const empInfo = dataset.employees.get(empId);
    if (!empInfo) continue;

    const row: Row = {
      empCode:    empInfo.empCode,
      empName:    empInfo.empName,
      department: empInfo.department,
    };

    // Tally counters
    let presentCount = 0;
    let absentCount  = 0;
    let leaveCount   = 0;
    let halfDayCount = 0;
    let lateCount    = 0;
    let lopCount     = 0;
    let holidayCount = 0;
    let weekOffCount = 0;
    let otHours      = 0;
    let totalWorked  = 0;

    for (const dateStr of dataset.allDates) {
      const dayRecords = dataset.byEmployeeDate.get(`${empId}:${dateStr}`);

      if (!dayRecords || dayRecords.length === 0) {
        row[dateStr] = '-';
        continue;
      }

      // Use the first (primary) record for the day (length already checked above)
      const record = dayRecords[0]!;
      const code = getDisplayCode(record);
      row[dateStr] = code;

      // Tally
      switch (record.status) {
        case 'PRESENT':
          presentCount++;
          break;
        case 'ABSENT':
          absentCount++;
          break;
        case 'ON_LEAVE':
          leaveCount++;
          break;
        case 'HALF_DAY':
          halfDayCount++;
          break;
        case 'LATE':
          lateCount++;
          presentCount++; // Late is still present
          break;
        case 'REGULARIZED':
          presentCount++;
          break;
        case 'LOP':
          lopCount++;
          break;
        case 'HOLIDAY':
          holidayCount++;
          break;
        case 'WEEK_OFF':
          weekOffCount++;
          break;
        default:
          break;
      }

      otHours     += record.overtimeHours;
      totalWorked += record.workedHours;
    }

    const summary = dataset.employeeSummaries.get(empId);

    row['presentCount'] = presentCount;
    row['absentCount']  = absentCount;
    row['leaveCount']   = leaveCount;
    row['halfDayCount'] = halfDayCount;
    row['lateCount']    = lateCount;
    row['lopCount']     = lopCount;
    row['holidayCount'] = holidayCount;
    row['weekOffCount'] = weekOffCount;
    row['otHours']      = Math.round(otHours * 100) / 100;
    row['totalWorked']  = Math.round(totalWorked * 100) / 100;
    row['paidDays']     = summary?.paidDays ?? 0;

    rows.push(row);
  }

  return [{
    name: 'Day-wise Grid',
    columns,
    rows,
    freezeRow: 6,
    legendText: STATUS_LEGEND,
  }];
}
