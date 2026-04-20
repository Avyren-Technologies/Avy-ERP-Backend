/**
 * Auto Shift Mapping Service
 *
 * Given an employee's actual work times (punchIn, punchOut), finds the best
 * matching shift from the company's shift catalog using BEST_FIT_HOURS strategy
 * (maximum overlap between worked time and shift window).
 *
 * This runs AFTER check-out (or via cron for incomplete records).
 * It does NOT determine attendance status — only which shift to associate.
 */

import { platformPrisma } from '../../config/database';
import { logger } from '../../config/logger';
import { DateTime } from 'luxon';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ShiftMappingInput {
  companyId: string;
  employeeId: string;
  punchIn: Date;
  punchOut: Date;
  currentShiftId: string | null;
  minShiftMatchPercentage: number;
  companyTimezone: string;
}

export interface ShiftCandidate {
  shiftId: string;
  name: string;
  overlapMinutes: number;
  shiftDurationMinutes: number;
  matchPercentage: number;
}

export interface ShiftMappingResult {
  mappedShiftId: string | null;
  strategy: 'BEST_FIT_HOURS';
  matchPercentage: number;
  allCandidates: ShiftCandidate[];
  autoMapped: boolean;
  reason: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseTimeToMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Calculate overlap in minutes between a worked period and a shift window.
 * Handles cross-day shifts (e.g., 22:00-06:00).
 */
function calculateOverlap(
  workStartMin: number,
  workEndMin: number,
  shiftStartMin: number,
  shiftEndMin: number,
  isCrossDay: boolean,
): number {
  if (isCrossDay) {
    // Cross-day shift spans midnight. Normalize to a 0-2880 range.
    // Shift: shiftStart..1440 + 0..shiftEnd (on next day)
    const shiftDuration = (1440 - shiftStartMin) + shiftEndMin;

    // Normalize work times relative to shift start
    let normWorkStart = workStartMin - shiftStartMin;
    let normWorkEnd = workEndMin - shiftStartMin;

    if (normWorkStart < 0) normWorkStart += 1440;
    if (normWorkEnd < 0) normWorkEnd += 1440;
    if (normWorkEnd < normWorkStart) normWorkEnd += 1440;

    const overlapStart = Math.max(0, normWorkStart);
    const overlapEnd = Math.min(shiftDuration, normWorkEnd);

    return Math.max(0, overlapEnd - overlapStart);
  }

  // Non-cross-day: simple overlap
  const overlapStart = Math.max(workStartMin, shiftStartMin);
  const overlapEnd = Math.min(workEndMin, shiftEndMin);
  return Math.max(0, overlapEnd - overlapStart);
}

// ─── Main Function ──────────────────────────────────────────────────────────

export async function mapShiftToRecord(input: ShiftMappingInput): Promise<ShiftMappingResult> {
  const { companyId, punchIn, punchOut, currentShiftId, minShiftMatchPercentage, companyTimezone } = input;

  // Fetch all active shifts for the company
  const shifts = await platformPrisma.companyShift.findMany({
    where: { companyId },
    select: { id: true, name: true, startTime: true, endTime: true, isCrossDay: true },
  });

  if (shifts.length === 0) {
    return {
      mappedShiftId: currentShiftId,
      strategy: 'BEST_FIT_HOURS',
      matchPercentage: 0,
      allCandidates: [],
      autoMapped: false,
      reason: 'No shifts configured for company',
    };
  }

  // Convert punch times to minutes-since-midnight in company timezone
  const punchInDT = DateTime.fromJSDate(punchIn, { zone: companyTimezone });
  const punchOutDT = DateTime.fromJSDate(punchOut, { zone: companyTimezone });
  const workStartMin = punchInDT.hour * 60 + punchInDT.minute;
  const workEndMin = punchOutDT.hour * 60 + punchOutDT.minute;

  // Calculate overlap for each shift
  const candidates: ShiftCandidate[] = shifts.map((shift) => {
    const shiftStartMin = parseTimeToMinutes(shift.startTime);
    const shiftEndMin = parseTimeToMinutes(shift.endTime);
    const shiftDurationMinutes = shift.isCrossDay
      ? (1440 - shiftStartMin) + shiftEndMin
      : shiftEndMin - shiftStartMin;

    const overlapMinutes = calculateOverlap(workStartMin, workEndMin, shiftStartMin, shiftEndMin, shift.isCrossDay);
    const matchPercentage = shiftDurationMinutes > 0 ? (overlapMinutes / shiftDurationMinutes) * 100 : 0;

    return {
      shiftId: shift.id,
      name: shift.name,
      overlapMinutes,
      shiftDurationMinutes,
      matchPercentage: Math.round(matchPercentage * 100) / 100,
    };
  });

  // Sort by match percentage descending
  candidates.sort((a, b) => b.matchPercentage - a.matchPercentage);

  const best = candidates[0];

  if (!best || best.matchPercentage < minShiftMatchPercentage) {
    logger.info(
      `Auto shift mapping: no shift meets ${minShiftMatchPercentage}% threshold for employee ${input.employeeId}. ` +
      `Best: ${best?.name ?? 'none'} at ${best?.matchPercentage ?? 0}%`,
    );
    return {
      mappedShiftId: currentShiftId,
      strategy: 'BEST_FIT_HOURS',
      matchPercentage: best?.matchPercentage ?? 0,
      allCandidates: candidates,
      autoMapped: false,
      reason: `No shift meets minimum ${minShiftMatchPercentage}% overlap threshold. Best: ${best?.name ?? 'N/A'} (${best?.matchPercentage ?? 0}%)`,
    };
  }

  logger.info(
    `Auto shift mapping: employee ${input.employeeId} mapped to "${best.name}" (${best.matchPercentage}% overlap)`,
  );

  return {
    mappedShiftId: best.shiftId,
    strategy: 'BEST_FIT_HOURS',
    matchPercentage: best.matchPercentage,
    allCandidates: candidates,
    autoMapped: true,
    reason: `Mapped to "${best.name}" with ${best.matchPercentage}% overlap (${best.overlapMinutes} min of ${best.shiftDurationMinutes} min)`,
  };
}
