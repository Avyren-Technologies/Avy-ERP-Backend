import { DateTime } from 'luxon';
import type { ReportSheet, SheetColumn } from '../../excel-exporter';
import type { ReportDataset, FlatRecord } from './types';
import { STATUS_CODES, SOURCE_LABELS, GEO_LABELS, STATUS_LEGEND } from './types';

const columns: SheetColumn[] = [
  // Employee Info
  { header: 'Emp ID', key: 'empCode', width: 12 },
  { header: 'Name', key: 'empName', width: 22 },
  { header: 'Department', key: 'department', width: 18 },
  { header: 'Designation', key: 'designation', width: 16 },
  { header: 'Location', key: 'location', width: 16 },
  { header: 'Reporting Manager', key: 'reportingManager', width: 18 },
  { header: 'Emp Type', key: 'employeeType', width: 14 },
  { header: 'DOJ', key: 'doj', width: 12, format: 'date' },
  // Date & Shift
  { header: 'Date', key: 'date', width: 12 },
  { header: 'Day', key: 'day', width: 5 },
  { header: 'Shift', key: 'shiftName', width: 14 },
  { header: 'Shift Start', key: 'shiftStart', width: 8 },
  { header: 'Shift End', key: 'shiftEnd', width: 8 },
  { header: 'Cross-Day', key: 'crossDay', width: 6 },
  // Punch
  { header: 'Punch In', key: 'punchIn', width: 10 },
  { header: 'Punch Out', key: 'punchOut', width: 10 },
  { header: 'Source', key: 'source', width: 10 },
  { header: 'Geo Status', key: 'geoStatus', width: 10 },
  // Hours
  { header: 'Worked Hrs', key: 'workedHours', width: 8, format: 'number' },
  { header: 'Break (hrs)', key: 'breakHours', width: 8, format: 'number' },
  { header: 'OT Hours', key: 'otHours', width: 8, format: 'number' },
  // Status
  { header: 'Status', key: 'status', width: 8, conditionalFormat: 'attendance-status' },
  { header: '1st Half', key: 'firstHalf', width: 8, conditionalFormat: 'attendance-status' },
  { header: '2nd Half', key: 'secondHalf', width: 8, conditionalFormat: 'attendance-status' },
  { header: 'Leave Type', key: 'leaveType', width: 8 },
  // Flags
  { header: 'Late (min)', key: 'lateMinutes', width: 8, format: 'number' },
  { header: 'Early Exit (min)', key: 'earlyMinutes', width: 8, format: 'number' },
  { header: 'Regularized', key: 'regularized', width: 6 },
  // Context
  { header: 'Status Reason', key: 'statusReason', width: 30 },
  { header: 'Remarks', key: 'remarks', width: 20 },
];

function buildRow(rec: FlatRecord, tz: string): Record<string, unknown> {
  const formatTime = (d: Date | null) => {
    if (!d) return '';
    return DateTime.fromJSDate(d).setZone(tz).toFormat('HH:mm');
  };

  const formatDate = (d: Date) => {
    return DateTime.fromJSDate(d).setZone(tz).toFormat('dd-MMM');
  };

  // Get leave type from halves
  const leaveHalf = rec.halves.find(h => h.status === 'ON_LEAVE');
  const leaveTypeCode = leaveHalf?.leaveTypeCode ?? '';

  // Use leave type code in status if on leave
  const statusCode = rec.status === 'ON_LEAVE' && leaveTypeCode
    ? leaveTypeCode
    : (STATUS_CODES[rec.status] ?? rec.status);

  const firstHalf = rec.halves.find(h => h.half === 'FIRST_HALF');
  const secondHalf = rec.halves.find(h => h.half === 'SECOND_HALF');

  const fhStatus = firstHalf
    ? (firstHalf.status === 'ON_LEAVE' && firstHalf.leaveTypeCode ? firstHalf.leaveTypeCode : (STATUS_CODES[firstHalf.status] ?? firstHalf.status))
    : '';
  const shStatus = secondHalf
    ? (secondHalf.status === 'ON_LEAVE' && secondHalf.leaveTypeCode ? secondHalf.leaveTypeCode : (STATUS_CODES[secondHalf.status] ?? secondHalf.status))
    : '';

  return {
    empCode: rec.shiftSequence > 1 ? '' : rec.empCode,
    empName: rec.shiftSequence > 1 ? `  Session ${rec.shiftSequence}` : rec.empName,
    department: rec.shiftSequence > 1 ? '' : rec.department,
    designation: rec.shiftSequence > 1 ? '' : rec.designation,
    location: rec.shiftSequence > 1 ? '' : rec.location,
    reportingManager: rec.shiftSequence > 1 ? '' : rec.reportingManager,
    employeeType: rec.shiftSequence > 1 ? '' : rec.employeeType,
    doj: rec.shiftSequence > 1 ? '' : (rec.joiningDate ? DateTime.fromJSDate(rec.joiningDate).setZone(tz).toFormat('dd-MMM-yyyy') : ''),
    date: formatDate(rec.date),
    day: rec.dayOfWeek,
    shiftName: rec.shiftName,
    shiftStart: rec.shiftStart,
    shiftEnd: rec.shiftEnd,
    crossDay: rec.shiftIsCrossDay ? 'Y' : 'N',
    punchIn: formatTime(rec.punchIn),
    punchOut: formatTime(rec.punchOut),
    source: SOURCE_LABELS[rec.source] ?? rec.source,
    geoStatus: rec.geoStatus ? (GEO_LABELS[rec.geoStatus] ?? rec.geoStatus) : '',
    workedHours: rec.workedHours > 0 ? Math.round(rec.workedHours * 10) / 10 : '',
    breakHours: rec.appliedBreakDeductionMinutes > 0 ? Math.round((rec.appliedBreakDeductionMinutes / 60) * 10) / 10 : '',
    otHours: rec.overtimeHours > 0 ? Math.round(rec.overtimeHours * 10) / 10 : '',
    status: statusCode,
    firstHalf: fhStatus,
    secondHalf: shStatus,
    leaveType: leaveTypeCode,
    lateMinutes: rec.lateMinutes > 0 ? rec.lateMinutes : '',
    earlyMinutes: rec.earlyMinutes > 0 ? rec.earlyMinutes : '',
    regularized: rec.isRegularized ? 'Y' : '',
    statusReason: rec.finalStatusReason ?? '',
    remarks: rec.remarks ?? '',
  };
}

export function buildDetailedRegister(dataset: ReportDataset): ReportSheet {
  const tz = dataset.companyTimezone;
  return {
    name: 'Detailed Register',
    columns,
    rows: dataset.records.map(r => buildRow(r, tz)),
    freezeRow: 6,
    legendText: STATUS_LEGEND,
  };
}
