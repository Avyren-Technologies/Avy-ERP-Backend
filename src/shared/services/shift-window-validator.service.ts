/**
 * Shift Window Validator Service
 *
 * Centralizes check-in time window validation, replacing duplicated logic in
 * ESS controller and Admin attendance service. Respects attendanceMode and
 * leaveCheckInMode from AttendanceRule.
 *
 * Resolution:
 *   attendanceMode controls overall strictness of time enforcement.
 *   leaveCheckInMode controls how approved leave affects the window.
 */

import { logger } from '../../config/logger';
import { getCachedAttendanceRules } from '../utils/config-cache';
import { platformPrisma } from '../../config/database';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ShiftWindowInput {
  companyId: string;
  employeeId: string;
  shiftId: string | null;
  /** Current time in company timezone */
  nowCT: { hour: number; minute: number };
  attendanceMode: string;
  leaveCheckInMode: string;
  /** Today's date (UTC midnight of company date) for leave lookup */
  today: Date;
}

export interface ShiftWindowResult {
  allowed: boolean;
  reason?: string | undefined;
  warning?: string | undefined;
  hasApprovedLeave: boolean;
  leaveType?: 'FULL_DAY' | 'HALF_DAY_MORNING' | 'HALF_DAY_AFTERNOON' | undefined;
  leaveRequestId?: string | undefined;
}

// ─── Main Function ──────────────────────────────────────────────────────────

export async function validateShiftWindow(input: ShiftWindowInput): Promise<ShiftWindowResult> {
  const { companyId, employeeId, shiftId, nowCT, attendanceMode, leaveCheckInMode, today } = input;

  // 1. FULLY_FLEXIBLE mode — no time restrictions at all
  if (attendanceMode === 'FULLY_FLEXIBLE') {
    return { allowed: true, hasApprovedLeave: false };
  }

  // 2. No shift — behavior depends on mode
  if (!shiftId) {
    if (attendanceMode === 'EMPLOYEE_CHOICE') {
      // EMPLOYEE_CHOICE with no shift selected (unassigned employee) — allow, auto-map at checkout
      return { allowed: true, hasApprovedLeave: false };
    }
    // Other modes: no shift = nothing to enforce
    return { allowed: true, hasApprovedLeave: false };
  }

  // 3. Fetch shift data
  const shift = await platformPrisma.companyShift.findUnique({
    where: { id: shiftId },
    select: {
      startTime: true,
      endTime: true,
      name: true,
      isCrossDay: true,
      maxLateCheckInMinutes: true,
    },
  });

  if (!shift) {
    // Shift doesn't exist — allow (defensive)
    return { allowed: true, hasApprovedLeave: false };
  }

  // 4. SHIFT_RELAXED — only verify shift exists, no time window enforcement
  if (attendanceMode === 'SHIFT_RELAXED') {
    return { allowed: true, hasApprovedLeave: false };
  }

  // 5. SHIFT_STRICT — apply time window with leave awareness
  const rules = await getCachedAttendanceRules(companyId);
  const maxLateCheckIn = shift.maxLateCheckInMinutes ?? rules.maxLateCheckInMinutes ?? 240;

  // Parse shift times
  const [shiftHour = 0, shiftMin = 0] = (shift.startTime || '00:00').split(':').map(Number);
  const [endHour = 0, endMin = 0] = (shift.endTime || '23:59').split(':').map(Number);
  const nowMinutes = nowCT.hour * 60 + nowCT.minute;
  const shiftStartMinutes = (shiftHour ?? 0) * 60 + (shiftMin ?? 0);
  const shiftEndMinutes = (endHour ?? 0) * 60 + (endMin ?? 0);

  const earlyWindowMinutes = 60;

  // 6. Check for approved leave if leaveCheckInMode is not STRICT
  let leaveInfo: ShiftWindowResult['leaveType'] | undefined;
  let leaveRequestId: string | undefined;
  let hasApprovedLeave = false;

  if (leaveCheckInMode !== 'STRICT') {
    const approvedLeave = await platformPrisma.leaveRequest.findFirst({
      where: {
        employeeId,
        status: 'APPROVED',
        fromDate: { lte: today },
        toDate: { gte: today },
      },
      select: { id: true, isHalfDay: true, halfDayType: true },
    });

    if (approvedLeave) {
      hasApprovedLeave = true;
      leaveRequestId = approvedLeave.id;

      if (!approvedLeave.isHalfDay) {
        leaveInfo = 'FULL_DAY';
      } else if (approvedLeave.halfDayType === 'FIRST_HALF') {
        leaveInfo = 'HALF_DAY_MORNING';
      } else {
        leaveInfo = 'HALF_DAY_AFTERNOON';
      }
    }
  }

  // 7. Full-day leave — always allow check-in with warning
  if (leaveInfo === 'FULL_DAY' && leaveCheckInMode !== 'STRICT') {
    return {
      allowed: true,
      warning: 'You have an approved full-day leave. Your attendance will auto-adjust your leave based on hours worked.',
      hasApprovedLeave: true,
      leaveType: 'FULL_DAY',
      leaveRequestId,
    };
  }

  // 8. Determine effective late window based on leaveCheckInMode
  let effectiveLateWindow = maxLateCheckIn;

  if (hasApprovedLeave) {
    switch (leaveCheckInMode) {
      case 'FULLY_FLEXIBLE':
        // Any approved leave → no time restriction
        return {
          allowed: true,
          hasApprovedLeave: true,
          leaveType: leaveInfo,
          leaveRequestId,
        };

      case 'ALLOW_TILL_SHIFT_END': {
        // Extend window to shift end
        const shiftDuration = shift.isCrossDay
          ? (shiftEndMinutes + 1440) - shiftStartMinutes
          : shiftEndMinutes - shiftStartMinutes;
        effectiveLateWindow = Math.max(effectiveLateWindow, shiftDuration);
        break;
      }

      case 'ALLOW_WITHIN_WINDOW':
        // Half-day morning leave → extend to shift end; otherwise normal
        if (leaveInfo === 'HALF_DAY_MORNING') {
          const shiftDuration = shift.isCrossDay
            ? (shiftEndMinutes + 1440) - shiftStartMinutes
            : shiftEndMinutes - shiftStartMinutes;
          effectiveLateWindow = Math.max(effectiveLateWindow, shiftDuration);
        }
        // HALF_DAY_AFTERNOON — keep normal window (they should check in on time)
        break;

      default:
        // STRICT — use normal window
        break;
    }
  }

  // 9. Cap late window at shift duration for non-cross-day shifts
  if (!shift.isCrossDay && shiftEndMinutes > shiftStartMinutes) {
    const shiftDuration = shiftEndMinutes - shiftStartMinutes;
    effectiveLateWindow = Math.min(effectiveLateWindow, shiftDuration);
  }

  const earliestMinutes = shiftStartMinutes - earlyWindowMinutes;
  const latestMinutes = shiftStartMinutes + effectiveLateWindow;

  // 10. Check if current time is within the window
  let isWithinWindow: boolean;

  if (shift.isCrossDay) {
    // Cross-day (night) shift: window wraps around midnight
    const crossDayEndMinutes = shiftEndMinutes + 1440;
    const shiftDuration = crossDayEndMinutes - shiftStartMinutes;
    const effectiveLatest = shiftStartMinutes + Math.min(effectiveLateWindow, shiftDuration);

    if (effectiveLatest >= 1440) {
      isWithinWindow = nowMinutes >= earliestMinutes || nowMinutes <= (effectiveLatest - 1440);
    } else {
      isWithinWindow = nowMinutes >= earliestMinutes && nowMinutes <= effectiveLatest;
    }
  } else {
    isWithinWindow = nowMinutes >= earliestMinutes && nowMinutes <= latestMinutes;
  }

  if (!isWithinWindow) {
    const earlyTime = `${String(Math.floor(Math.max(0, earliestMinutes) / 60)).padStart(2, '0')}:${String(Math.max(0, earliestMinutes) % 60).padStart(2, '0')}`;
    const lateTime = `${String(Math.floor(latestMinutes / 60) % 24).padStart(2, '0')}:${String(latestMinutes % 60).padStart(2, '0')}`;
    const isEmployeeChoice = attendanceMode === 'EMPLOYEE_CHOICE';
    const reason = isEmployeeChoice
      ? `You cannot start "${shift.name}" at this time. This shift runs ${shift.startTime} – ${shift.endTime}. ` +
        `Allowed check-in window is ${earlyTime} – ${lateTime}. Please select a different shift or check in during the allowed window.`
      : `Check-in not allowed at this time. Your shift "${shift.name}" is ${shift.startTime} – ${shift.endTime}. ` +
        `You can check in from ${earlyTime} (1 hour before shift start) until the shift ends.`;

    logger.info(`Shift window validation failed for employee ${employeeId}: ${reason}`);

    return {
      allowed: false,
      reason,
      hasApprovedLeave,
      leaveType: leaveInfo,
      leaveRequestId,
    };
  }

  return {
    allowed: true,
    hasApprovedLeave,
    leaveType: leaveInfo,
    leaveRequestId,
    ...(hasApprovedLeave && leaveInfo === 'HALF_DAY_MORNING' && {
      warning: 'You have an approved half-day morning leave. Late check-in window has been extended.',
    }),
  };
}
