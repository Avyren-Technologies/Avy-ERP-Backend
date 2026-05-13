import type { ReportSheet, SheetColumn } from '../../excel-exporter';
import type { ReportDataset } from './types';

// ─── Column layout ───

const columns: SheetColumn[] = [
  { header: 'Shift Name',      key: 'shiftName',          width: 18 },
  { header: 'Timing',          key: 'shiftTiming',        width: 14 },
  { header: 'Type',            key: 'shiftType',          width: 10 },
  { header: 'Cross-Day',       key: 'isCrossDay',         width: 8  },
  { header: 'Employees',       key: 'assignedEmployees',  width: 10, format: 'number'     },
  { header: 'Records',         key: 'totalRecords',       width: 8,  format: 'number'     },
  { header: 'Avg Worked Hrs',  key: 'avgWorkedHours',     width: 10, format: 'number'     },
  { header: 'Late Count',      key: 'lateCount',          width: 10, format: 'number'     },
  { header: 'Late %',          key: 'latePct',            width: 8,  format: 'percentage' },
  { header: 'OT Hours',        key: 'otHoursTotal',       width: 10, format: 'number'     },
  { header: 'Avg OT Hrs',      key: 'avgOTHours',         width: 10, format: 'number'     },
  { header: 'Attendance %',    key: 'attendancePct',      width: 10, format: 'percentage' },
];

// ─── Main builder ───

export function buildShiftSummary(dataset: ReportDataset): ReportSheet {
  const rows = dataset.shiftBreakdown.map(s => ({
    shiftName:         s.shiftName,
    shiftTiming:       s.shiftTiming,
    shiftType:         s.shiftType,
    isCrossDay:        s.isCrossDay ? 'Y' : 'N',
    assignedEmployees: s.assignedEmployees,
    totalRecords:      s.totalRecords,
    avgWorkedHours:    Math.round(s.avgWorkedHours * 10) / 10,
    lateCount:         s.lateCount,
    latePct:           s.latePct / 100,       // percentage format expects decimal (0.15 = 15%)
    otHoursTotal:      Math.round(s.otHoursTotal * 10) / 10,
    avgOTHours:        Math.round(s.avgOTHours * 10) / 10,
    attendancePct:     s.attendancePct / 100, // percentage format expects decimal
  }));

  return {
    name: 'Shift Summary',
    columns,
    rows,
    freezeRow: 6,
  };
}
