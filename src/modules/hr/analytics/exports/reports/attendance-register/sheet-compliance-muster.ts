import { ReportSheet, SheetColumn } from '../../excel-exporter';
import { ReportDataset, STATUS_CODES, STATUS_LEGEND, MONTH_NAMES } from './types';

// ─── Build a single muster roll sheet for a specific set of dates ───

function buildMusterSheet(
  dataset: ReportDataset,
  monthDates: string[],
  sheetName: string,
): ReportSheet {
  const columns: SheetColumn[] = [
    { header: 'Sl. No', key: 'slNo', width: 5, format: 'number' },
    { header: 'Employee Name', key: 'empName', width: 22 },
    { header: 'Father/Mother', key: 'fatherMotherName', width: 20 },
    { header: 'Emp No', key: 'empCode', width: 12 },
    { header: 'Department', key: 'department', width: 16 },
    { header: 'Designation', key: 'designation', width: 14 },
    { header: 'DOJ', key: 'doj', width: 12, format: 'date' },
    { header: 'Shift', key: 'shiftName', width: 14 },
    // Day columns — one column per date in this month
    ...monthDates.map(dateStr => ({
      header: new Date(dateStr).getUTCDate().toString(),
      key: dateStr,
      width: 4,
      conditionalFormat: 'attendance-status' as const,
    })),
    // Summary totals
    { header: 'Present', key: 'presentCount', width: 6, format: 'number' as const },
    { header: 'Absent', key: 'absentCount', width: 6, format: 'number' as const },
    { header: 'Leave', key: 'leaveCount', width: 6, format: 'number' as const },
    { header: 'Half Day', key: 'halfDayCount', width: 6, format: 'number' as const },
    { header: 'Worked Hrs', key: 'workedHours', width: 8, format: 'number' as const },
    { header: 'OT Hrs', key: 'otHours', width: 7, format: 'number' as const },
    { header: 'Weekly Off', key: 'weekOffCount', width: 6, format: 'number' as const },
    { header: 'Holiday', key: 'holidayCount', width: 6, format: 'number' as const },
    { header: 'Paid Days', key: 'paidDays', width: 7, format: 'number' as const },
    { header: 'H Worked', key: 'holidayWorked', width: 6, format: 'number' as const },
    { header: 'W Worked', key: 'weekOffWorked', width: 6, format: 'number' as const },
  ];

  let slNo = 0;
  const rows: Record<string, unknown>[] = [];

  for (const [empId, empInfo] of dataset.employees) {
    slNo++;
    const row: Record<string, unknown> = {
      slNo,
      empName: empInfo.empName,
      fatherMotherName: empInfo.fatherMotherName ?? '',
      empCode: empInfo.empCode,
      department: empInfo.department,
      designation: empInfo.designation,
      doj:
        empInfo.joiningDate?.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }) ?? '',
      shiftName: empInfo.shiftName,
    };

    let presentCount = 0;
    let absentCount = 0;
    let leaveCount = 0;
    let halfDayCount = 0;
    let workedHours = 0;
    let otHours = 0;
    let weekOffCount = 0;
    let holidayCount = 0;
    let holidayWorked = 0;
    let weekOffWorked = 0;

    for (const dateStr of monthDates) {
      const records = dataset.byEmployeeDate.get(`${empId}:${dateStr}`);
      const rec = records?.[0]; // Primary session

      if (!rec) {
        row[dateStr] = '-';
        continue;
      }

      // Use leave type code if on leave, otherwise map status to code
      let code: string;
      if (rec.status === 'ON_LEAVE') {
        const leaveHalf = rec.halves.find(h => h.status === 'ON_LEAVE');
        code = leaveHalf?.leaveTypeCode ?? 'LV';
      } else {
        code = STATUS_CODES[rec.status] ?? rec.status;
      }
      row[dateStr] = code;

      // Accumulate status counters
      switch (rec.status) {
        case 'PRESENT':
        case 'LATE':
        case 'EARLY_EXIT':
        case 'REGULARIZED':
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
        case 'HOLIDAY':
          holidayCount++;
          if (rec.workedHours > 0) holidayWorked++;
          break;
        case 'WEEK_OFF':
          weekOffCount++;
          if (rec.workedHours > 0) weekOffWorked++;
          break;
      }

      // Sum all sessions' hours for this employee-date
      const allSessions = records ?? [];
      for (const s of allSessions) {
        workedHours += s.workedHours;
        otHours += s.overtimeHours;
      }
    }

    row.presentCount = presentCount;
    row.absentCount = absentCount;
    row.leaveCount = leaveCount;
    row.halfDayCount = halfDayCount;
    row.workedHours = Math.round(workedHours * 10) / 10;
    row.otHours = Math.round(otHours * 10) / 10;
    row.weekOffCount = weekOffCount;
    row.holidayCount = holidayCount;
    // Use paid leave from employee summary (not all leave is paid)
    const empSummary = dataset.employeeSummaries.get(empId);
    const paidLeave = empSummary?.paidLeaveDays ?? leaveCount; // fallback to all leave if no summary
    row.paidDays =
      Math.round(
        (presentCount + halfDayCount * 0.5 + paidLeave + holidayCount + weekOffCount) * 10,
      ) / 10;
    row.holidayWorked = holidayWorked;
    row.weekOffWorked = weekOffWorked;

    rows.push(row);
  }

  return {
    name: sheetName,
    columns,
    rows,
    freezeRow: 6,
    legendText: STATUS_LEGEND,
  };
}

// ─── Group a sorted date array by calendar month ───

function groupDatesByMonth(dates: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const dateStr of dates) {
    // dateStr is yyyy-MM-dd — first 7 chars = "yyyy-MM"
    const monthKey = dateStr.slice(0, 7);
    const bucket = groups.get(monthKey);
    if (bucket) {
      bucket.push(dateStr);
    } else {
      groups.set(monthKey, [dateStr]);
    }
  }
  return groups;
}

// ─── Format "yyyy-MM" → "May 2026" ───

function formatMonthLabel(monthKey: string): string {
  const parts = monthKey.split('-');
  const year = parts[0] ?? '';
  const month = parts[1] ?? '1';
  return `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
}

// ─── Public API ───

export function buildComplianceMusterRoll(dataset: ReportDataset): ReportSheet[] {
  if (dataset.mode === 'daily' || dataset.mode === 'weekly') {
    return [];
  }

  if (dataset.mode === 'monthly') {
    return [buildMusterSheet(dataset, dataset.allDates, 'Muster Roll')];
  }

  // multi-month: one sheet per calendar month
  const monthGroups = groupDatesByMonth(dataset.allDates);
  const sheets: ReportSheet[] = [];

  for (const [monthKey, monthDates] of monthGroups) {
    const sheetName = `Muster Roll - ${formatMonthLabel(monthKey)}`;
    sheets.push(buildMusterSheet(dataset, monthDates, sheetName));
  }

  return sheets;
}
