import type { z } from 'zod';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { getCachedAttendanceRules, getCachedCompanySettings } from '../../../shared/utils/config-cache';
import { adminMarkSchema, todayLogSchema } from './admin-attendance.validators';
import { resolvePolicy, type EvaluationContext } from '../../../shared/services/policy-resolver.service';
import {
  resolveAttendanceStatus,
  type AttendanceRulesInput,
  type ShiftInfo,
} from '../../../shared/services/attendance-status-resolver.service';
import { nowInCompanyTimezone } from '../../../shared/utils/timezone';
import { validateShiftWindow as validateShiftWindowShared } from '../../../shared/services/shift-window-validator.service';
import { adjustLeaveBasedOnAttendance } from '../../../shared/services/leave-auto-adjustment.service';
import { mapShiftToRecord } from '../../../shared/services/shift-mapping.service';
import { DateTime } from 'luxon';
import { logger } from '../../../config/logger';
import { attendanceService } from './attendance.service';

type AdminMarkInput = z.infer<typeof adminMarkSchema>;
type TodayLogInput = z.infer<typeof todayLogSchema>;
type MarkGeoRemarksInput = Pick<AdminMarkInput, 'latitude' | 'longitude' | 'photoUrl' | 'remarks'>;

class AdminAttendanceService {
  /**
   * Get employee details + today's attendance + shift + policy + location + geofences.
   */
  async getEmployeeStatus(companyId: string, employeeId: string) {
    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings.timezone ?? 'Asia/Kolkata';
    const nowCT = nowInCompanyTimezone(companyTimezone);
    const today = new Date(nowCT.toFormat('yyyy-MM-dd') + 'T00:00:00.000Z');

    const employee = await platformPrisma.employee.findUnique({
      where: { id: employeeId, companyId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeId: true,
        profilePhotoUrl: true,
        shiftId: true,
        locationId: true,
        geofenceId: true,
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, name: true } },
      },
    });

    if (!employee) {
      throw ApiError.notFound('Employee not found');
    }

    // Today's attendance record
    let todayRecord = await platformPrisma.attendanceRecord.findUnique({
      where: { employeeId_date_shiftSequence: { employeeId, date: today, shiftSequence: 1 } },
      select: {
        id: true,
        status: true,
        punchIn: true,
        punchOut: true,
        workedHours: true,
        geoStatus: true,
        source: true,
        remarks: true,
        isLate: true,
        lateMinutes: true,
      },
    });

    // Cross-day check: if no record today, check if yesterday's is still open
    if (!todayRecord || !todayRecord.punchIn) {
      const yesterday = new Date(nowCT.minus({ days: 1 }).toFormat('yyyy-MM-dd') + 'T00:00:00.000Z');
      const yesterdayRecord = await platformPrisma.attendanceRecord.findUnique({
        where: { employeeId_date_shiftSequence: { employeeId, date: yesterday, shiftSequence: 1 } },
        select: {
          id: true, status: true, punchIn: true, punchOut: true,
          workedHours: true, geoStatus: true, source: true, remarks: true,
          isLate: true, lateMinutes: true,
        },
      });
      if (yesterdayRecord?.punchIn && !yesterdayRecord.punchOut) {
        todayRecord = yesterdayRecord;
      }
    }

    // Shift info
    let shift = null;
    if (employee.shiftId) {
      shift = await platformPrisma.companyShift.findUnique({
        where: { id: employee.shiftId },
        select: {
          id: true, name: true, startTime: true, endTime: true,
          isCrossDay: true,
          breaks: { select: { id: true, name: true, startTime: true, duration: true, type: true, isPaid: true } },
        },
      });
    }

    // Resolve holiday/week-off context for today
    const evalCtx = await this.buildEvaluationContext(companyId, employeeId, employee.shiftId, employee.locationId, today, companyTimezone);

    // Resolved policy
    let resolvedPolicy = null;
    try {
      const policyResult = await resolvePolicy(companyId, evalCtx);
      resolvedPolicy = policyResult.policy;
    } catch {
      // Non-fatal — policy resolution may fail if no rules configured yet
    }

    // Location + geofences
    let location = null;
    if (employee.locationId) {
      location = await platformPrisma.location.findUnique({
        where: { id: employee.locationId },
        select: {
          id: true, name: true, geoEnabled: true,
          geofences: { where: { isActive: true }, select: { id: true, name: true, lat: true, lng: true, radius: true, isDefault: true } },
        },
      });
    }

    // Assigned geofence
    let assignedGeofence = null;
    if (employee.geofenceId) {
      assignedGeofence = await platformPrisma.geofence.findUnique({
        where: { id: employee.geofenceId },
        select: { id: true, name: true, lat: true, lng: true, radius: true, isDefault: true },
      });
    }

    // Derive attendance status from today's record
    let status: 'NOT_CHECKED_IN' | 'CHECKED_IN' | 'CHECKED_OUT' = 'NOT_CHECKED_IN';
    if (todayRecord?.punchIn && todayRecord?.punchOut) status = 'CHECKED_OUT';
    else if (todayRecord?.punchIn) status = 'CHECKED_IN';

    return {
      status,
      employee: {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        employeeCode: employee.employeeId,
        profilePhotoUrl: employee.profilePhotoUrl,
        departmentName: employee.department?.name ?? null,
        designationName: employee.designation?.name ?? null,
      },
      todayRecord,
      shift,
      resolvedPolicy,
      location,
      assignedGeofence,
    };
  }

  /**
   * Mark check-in or check-out for a single employee.
   */
  async markAttendance(companyId: string, data: AdminMarkInput, callerHasOverride: boolean) {
    const canSkip = callerHasOverride && data.skipValidation === true;

    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings.timezone ?? 'Asia/Kolkata';
    const nowCT = nowInCompanyTimezone(companyTimezone);
    const today = new Date(nowCT.toFormat('yyyy-MM-dd') + 'T00:00:00.000Z');
    const now = new Date();

    // Verify employee
    const employee = await platformPrisma.employee.findUnique({
      where: { id: data.employeeId, companyId },
      select: { id: true, shiftId: true, locationId: true, geofenceId: true, firstName: true, lastName: true },
    });
    if (!employee) throw ApiError.notFound('Employee not found');

    if (data.action === 'CHECK_IN') {
      return this.handleCheckIn(companyId, employee, data, today, now, nowCT, companyTimezone, canSkip);
    } else {
      return this.handleCheckOut(companyId, employee, data, today, now, nowCT, companyTimezone, canSkip);
    }
  }

  private async handleCheckIn(
    companyId: string,
    employee: { id: string; shiftId: string | null; locationId: string | null; geofenceId: string | null; firstName: string; lastName: string },
    data: MarkGeoRemarksInput,
    today: Date,
    now: Date,
    nowCT: ReturnType<typeof nowInCompanyTimezone>,
    companyTimezone: string,
    canSkip: boolean,
  ) {
    const rules = await getCachedAttendanceRules(companyId);

    // Multi-shift support: determine shiftSequence
    let shiftSequence = 1;
    if (rules.multipleShiftsPerDayEnabled) {
      const lastRecord = await platformPrisma.attendanceRecord.findFirst({
        where: { employeeId: employee.id, date: today },
        orderBy: { shiftSequence: 'desc' },
      });

      if (lastRecord) {
        if (!lastRecord.punchOut) {
          throw ApiError.badRequest('Employee must check out from current shift before starting a new one.');
        }
        shiftSequence = lastRecord.shiftSequence + 1;

        if (rules.maxShiftsPerDay && shiftSequence > rules.maxShiftsPerDay) {
          throw ApiError.badRequest(`Maximum ${rules.maxShiftsPerDay} shifts per day exceeded.`);
        }
        if (rules.minGapBetweenShiftsMinutes && lastRecord.punchOut) {
          const gapMinutes = (now.getTime() - lastRecord.punchOut.getTime()) / 60000;
          if (gapMinutes < rules.minGapBetweenShiftsMinutes) {
            throw ApiError.badRequest(`Minimum ${rules.minGapBetweenShiftsMinutes} minutes gap required between shifts.`);
          }
        }
      }
    } else {
      // Single-shift mode: prevent double check-in
      const existing = await platformPrisma.attendanceRecord.findUnique({
        where: { employeeId_date_shiftSequence: { employeeId: employee.id, date: today, shiftSequence: 1 } },
      });
      if (existing?.punchIn) {
        throw ApiError.badRequest('Employee already checked in today');
      }
    }

    // Geofence validation
    let geoStatus = 'NO_LOCATION';
    if (data.latitude != null && data.longitude != null) {
      geoStatus = await this.resolveGeoStatus(
        employee.id, employee.locationId, employee.geofenceId,
        data.latitude, data.longitude,
      );
    }

    // Shift time validation using shared validator (respects attendanceMode + leaveCheckInMode)
    if (!canSkip) {
      const windowResult = await validateShiftWindowShared({
        companyId,
        employeeId: employee.id,
        shiftId: employee.shiftId,
        nowCT: { hour: nowCT.hour, minute: nowCT.minute },
        attendanceMode: rules.attendanceMode,
        leaveCheckInMode: rules.leaveCheckInMode,
        today,
      });
      if (!windowResult.allowed) {
        throw ApiError.badRequest(windowResult.reason!);
      }
    }

    // Create record
    const record = await platformPrisma.attendanceRecord.create({
      data: {
        employeeId: employee.id,
        companyId,
        date: today,
        shiftSequence,
        punchIn: now,
        status: 'PRESENT',
        source: 'MANUAL',
        remarks: data.remarks ?? null,
        shiftId: employee.shiftId,
        locationId: employee.locationId,
        checkInLatitude: data.latitude ?? null,
        checkInLongitude: data.longitude ?? null,
        checkInPhotoUrl: data.photoUrl ?? null,
        geoStatus,
      },
    });

    return { record, status: 'CHECKED_IN' as const };
  }

  private async handleCheckOut(
    companyId: string,
    employee: { id: string; shiftId: string | null; locationId: string | null; geofenceId: string | null; firstName: string; lastName: string },
    data: MarkGeoRemarksInput,
    today: Date,
    now: Date,
    nowCT: ReturnType<typeof nowInCompanyTimezone>,
    companyTimezone: string,
    _canSkip: boolean,
  ) {
    // Find open (unchecked-out) record: today first, then yesterday (cross-day shifts)
    // Uses findFirst to support multi-shift (finds the latest open record)
    let record = await platformPrisma.attendanceRecord.findFirst({
      where: { employeeId: employee.id, date: today, punchOut: null, punchIn: { not: null } },
      orderBy: { shiftSequence: 'desc' },
    });

    if (!record) {
      const yesterday = new Date(nowCT.minus({ days: 1 }).toFormat('yyyy-MM-dd') + 'T00:00:00.000Z');
      const yesterdayRecord = await platformPrisma.attendanceRecord.findFirst({
        where: { employeeId: employee.id, date: yesterday, punchOut: null, punchIn: { not: null } },
        orderBy: { shiftSequence: 'desc' },
      });
      if (yesterdayRecord) {
        record = yesterdayRecord;
      }
    }

    if (!record?.punchIn) {
      throw ApiError.badRequest('Employee has not checked in today');
    }
    if (record.punchOut) {
      throw ApiError.badRequest('Employee already checked out today');
    }

    // Geofence for checkout
    let geoStatus = record.geoStatus ?? 'NO_LOCATION';
    if (data.latitude != null && data.longitude != null) {
      geoStatus = await this.resolveGeoStatus(
        employee.id, employee.locationId, employee.geofenceId,
        data.latitude, data.longitude,
      );
    }

    // Resolve policy and status (with proper holiday/week-off detection)
    const rules = await getCachedAttendanceRules(companyId);
    const evaluationContext = await this.buildEvaluationContext(
      companyId, employee.id, record.shiftId, record.locationId, record.date, companyTimezone,
    );

    const policyResult = await resolvePolicy(companyId, evaluationContext);

    let shiftInfo: ShiftInfo | null = null;
    if (record.shiftId) {
      const shift = await platformPrisma.companyShift.findUnique({
        where: { id: record.shiftId },
        select: { startTime: true, endTime: true, isCrossDay: true, name: true },
      });
      if (shift) {
        shiftInfo = {
          startTime: shift.startTime,
          endTime: shift.endTime,
          isCrossDay: shift.isCrossDay,
        };
      }
    }

    // Map AttendanceRule to AttendanceRulesInput (Decimal -> number conversion)
    const rulesInput: AttendanceRulesInput = {
      lopAutoDeduct: rules.lopAutoDeduct,
      autoMarkAbsentIfNoPunch: rules.autoMarkAbsentIfNoPunch,
      autoHalfDayEnabled: rules.autoHalfDayEnabled,
      lateDeductionType: rules.lateDeductionType,
      lateDeductionValue: rules.lateDeductionValue ? Number(rules.lateDeductionValue) : null,
      earlyExitDeductionType: rules.earlyExitDeductionType,
      earlyExitDeductionValue: rules.earlyExitDeductionValue ? Number(rules.earlyExitDeductionValue) : null,
      ignoreLateOnLeaveDay: rules.ignoreLateOnLeaveDay,
      ignoreLateOnHoliday: rules.ignoreLateOnHoliday,
      ignoreLateOnWeekOff: rules.ignoreLateOnWeekOff,
    };

    const statusResult = resolveAttendanceStatus(
      record.punchIn,
      now,
      shiftInfo,
      policyResult.policy,
      evaluationContext,
      rulesInput,
      companyTimezone,
    );

    // Update record
    const updated = await platformPrisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        punchOut: now,
        status: statusResult.status as any,
        workedHours: statusResult.workedHours,
        isLate: statusResult.isLate,
        lateMinutes: statusResult.lateMinutes,
        isEarlyExit: statusResult.isEarlyExit,
        earlyMinutes: statusResult.earlyMinutes,
        overtimeHours: statusResult.overtimeHours,
        checkOutLatitude: data.latitude ?? null,
        checkOutLongitude: data.longitude ?? null,
        checkOutPhotoUrl: data.photoUrl ?? null,
        geoStatus,
        remarks: data.remarks ? (record.remarks ? `${record.remarks}; ${data.remarks}` : data.remarks) : record.remarks,
        appliedGracePeriodMinutes: policyResult.policy.gracePeriodMinutes,
        appliedFullDayThresholdHours: policyResult.policy.fullDayThresholdHours,
        appliedHalfDayThresholdHours: policyResult.policy.halfDayThresholdHours,
        appliedBreakDeductionMinutes: policyResult.policy.breakDeductionMinutes,
        appliedPunchMode: policyResult.policy.punchMode as any,
        appliedLateDeduction: statusResult.appliedLateDeduction,
        appliedEarlyExitDeduction: statusResult.appliedEarlyExitDeduction,
        resolutionTrace: policyResult.trace as any,
        evaluationContext: evaluationContext as any,
        finalStatusReason: statusResult.finalStatusReason,
      },
    });

    // Auto shift mapping: if enabled and no shift assigned
    if (rules.autoShiftMappingEnabled && !updated.shiftId && record.punchIn) {
      const mappingResult = await mapShiftToRecord({
        companyId,
        employeeId: employee.id,
        punchIn: record.punchIn,
        punchOut: now,
        currentShiftId: null,
        minShiftMatchPercentage: rules.minShiftMatchPercentage,
        companyTimezone,
      });
      if (mappingResult.autoMapped && mappingResult.mappedShiftId) {
        await platformPrisma.attendanceRecord.update({
          where: { id: updated.id },
          data: { shiftId: mappingResult.mappedShiftId, isAutoMapped: true },
        });
        logger.info(`Admin: Auto-mapped shift for employee ${employee.id}: ${mappingResult.reason}`);
      }
    }

    // Leave auto-adjustment
    if (rules.leaveAutoAdjustmentEnabled) {
      const adjustResult = await adjustLeaveBasedOnAttendance({
        companyId,
        employeeId: employee.id,
        date: record.date,
        workedHours: statusResult.workedHours,
        fullDayThreshold: policyResult.policy.fullDayThresholdHours,
        halfDayThreshold: policyResult.policy.halfDayThresholdHours,
        leaveAutoAdjustmentEnabled: rules.leaveAutoAdjustmentEnabled,
      });
      if (adjustResult.action !== 'NO_LEAVE') {
        await platformPrisma.attendanceRecord.update({
          where: { id: updated.id },
          data: { remarks: [updated.remarks, `[Leave Adjustment: ${adjustResult.action}] ${adjustResult.reason}`].filter(Boolean).join(' | ') },
        });
      }
    }

    // Multi-shift OT aggregation: cap total daily OT across all shifts
    if (rules.multipleShiftsPerDayEnabled && statusResult.overtimeHours > 0) {
      await attendanceService.aggregateDailyOvertime(companyId, employee.id, record.date);
    }

    return { record: updated, status: 'CHECKED_OUT' as const };
  }

  /**
   * Bulk mark check-in or check-out. Admin only — always skips validation.
   */
  async bulkMark(
    companyId: string,
    data: { employeeIds: string[]; action: 'CHECK_IN' | 'CHECK_OUT'; remarks: string },
  ) {
    const results: Array<{ employeeId: string; employeeName: string; success: boolean; error?: string; record?: any }> = [];

    for (const employeeId of data.employeeIds) {
      try {
        const result = await this.markAttendance(
          companyId,
          { employeeId, action: data.action, remarks: data.remarks, skipValidation: true },
          true, // admin override
        );
        const emp = await platformPrisma.employee.findUnique({
          where: { id: employeeId },
          select: { firstName: true, lastName: true },
        });
        results.push({
          employeeId,
          employeeName: [emp?.firstName, emp?.lastName].filter(Boolean).join(' '),
          success: true,
          record: result.record,
        });
      } catch (err: any) {
        const emp = await platformPrisma.employee.findUnique({
          where: { id: employeeId },
          select: { firstName: true, lastName: true },
        });
        results.push({
          employeeId,
          employeeName: [emp?.firstName, emp?.lastName].filter(Boolean).join(' '),
          success: false,
          error: err.message || 'Unknown error',
        });
      }
    }

    return {
      results,
      summary: {
        total: data.employeeIds.length,
        succeeded: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
      },
    };
  }

  /**
   * Get today's manually-marked attendance records for the activity log.
   */
  async getTodayLog(companyId: string, options: TodayLogInput) {
    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings.timezone ?? 'Asia/Kolkata';
    const nowCT = nowInCompanyTimezone(companyTimezone);
    const today = new Date(nowCT.toFormat('yyyy-MM-dd') + 'T00:00:00.000Z');
    const offset = (options.page - 1) * options.limit;

    const where: any = {
      companyId,
      date: today,
      source: 'MANUAL',
    };

    if (options.search) {
      where.employee = {
        OR: [
          { firstName: { contains: options.search, mode: 'insensitive' } },
          { lastName: { contains: options.search, mode: 'insensitive' } },
          { employeeId: { contains: options.search, mode: 'insensitive' } },
        ],
      };
    }

    const [records, total] = await Promise.all([
      platformPrisma.attendanceRecord.findMany({
        where,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
        },
        skip: offset,
        take: options.limit,
        orderBy: { updatedAt: 'desc' },
      }),
      platformPrisma.attendanceRecord.count({ where }),
    ]);

    return { records, total, page: options.page, limit: options.limit };
  }

  // ── Private helpers ──

  private async resolveGeoStatus(
    _employeeId: string,
    locationId: string | null,
    geofenceId: string | null,
    latitude: number,
    longitude: number,
  ): Promise<string> {
    // 1. Check assigned geofence
    if (geofenceId) {
      const geofence = await platformPrisma.geofence.findUnique({ where: { id: geofenceId } });
      if (geofence?.isActive) {
        const dist = this.calculateDistance(latitude, longitude, geofence.lat, geofence.lng);
        return dist <= geofence.radius ? 'INSIDE_GEOFENCE' : 'OUTSIDE_GEOFENCE';
      }
    }

    // 2. Check location geofences
    if (locationId) {
      const geofences = await platformPrisma.geofence.findMany({
        where: { locationId, isActive: true },
      });
      if (geofences.length > 0) {
        const insideAny = geofences.some(
          (gf: { lat: number; lng: number; radius: number }) => this.calculateDistance(latitude, longitude, gf.lat, gf.lng) <= gf.radius,
        );
        return insideAny ? 'INSIDE_GEOFENCE' : 'OUTSIDE_GEOFENCE';
      }

      // 3. Legacy location geo fields
      const location = await platformPrisma.location.findUnique({ where: { id: locationId } });
      if (location?.geoEnabled && location.geoLat && location.geoLng) {
        const dist = this.calculateDistance(latitude, longitude, parseFloat(location.geoLat), parseFloat(location.geoLng));
        return dist <= location.geoRadius ? 'INSIDE_GEOFENCE' : 'OUTSIDE_GEOFENCE';
      }
    }

    return 'NO_LOCATION';
  }

  // validateShiftWindow is now handled by the shared shift-window-validator.service.ts

  /**
   * Build an EvaluationContext with proper holiday/week-off detection.
   * Mirrors the logic in attendance.service.ts check-in flow.
   */
  private async buildEvaluationContext(
    companyId: string,
    employeeId: string,
    shiftId: string | null,
    locationId: string | null,
    date: Date,
    companyTimezone: string,
  ): Promise<EvaluationContext> {
    // Check if date is a holiday
    const holiday = await platformPrisma.holidayCalendar.findFirst({
      where: { companyId, date },
      select: { name: true },
    });

    // Check if date is a week-off using default roster
    const roster = await platformPrisma.roster.findFirst({
      where: { companyId, isDefault: true },
      select: { weekOff1: true, weekOff2: true },
    });

    const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dtAtt = DateTime.fromJSDate(date).setZone(companyTimezone);
    const dow = dayOfWeek[dtAtt.weekday % 7];
    const isWeekOff = dow === roster?.weekOff1 || dow === roster?.weekOff2;

    return {
      employeeId,
      shiftId,
      locationId,
      date,
      isHoliday: !!holiday,
      isWeekOff,
      ...(holiday?.name && { holidayName: holiday.name }),
      ...(roster && { rosterPattern: `${roster.weekOff1 ?? ''}${roster.weekOff2 ? '/' + roster.weekOff2 : ''}` }),
    };
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

export const adminAttendanceService = new AdminAttendanceService();
