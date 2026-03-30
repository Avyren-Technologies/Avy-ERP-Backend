/**
 * Punch Validator Service
 *
 * Validates and resolves punch sequences based on the configured PunchMode.
 * This is a pure function — no DB or cache access required.
 *
 * Three modes:
 *   FIRST_LAST  — First punch = IN, last punch = OUT, ignore middle punches
 *   EVERY_PAIR  — Alternating IN/OUT pairs, sum all durations
 *   SHIFT_BASED — Match punches to assigned shift window (closest to start = IN, closest to end = OUT)
 *
 * Invalid sequences are NOT rejected — they are flagged for regularization.
 * The system should be forgiving of biometric/device errors (Appendix B.2).
 *
 * Per design spec Appendix B.2.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PunchEntry {
  time: Date;
  direction?: 'IN' | 'OUT' | 'UNKNOWN';
}

export interface PunchValidationResult {
  valid: boolean;
  resolvedIn: Date | null;
  resolvedOut: Date | null;
  totalWorkedMinutes?: number | undefined;
  reason?: string | undefined;
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Calculate the difference between two dates in minutes.
 */
function diffMinutes(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (1000 * 60);
}

/**
 * Sort punches by time in ascending order. Returns a new array (does not mutate).
 */
function sortByTime(punches: PunchEntry[]): PunchEntry[] {
  return [...punches].sort((a, b) => a.time.getTime() - b.time.getTime());
}

// ─── Mode Handlers ──────────────────────────────────────────────────────────

/**
 * FIRST_LAST: first punch = IN, last punch = OUT, ignore everything in between.
 */
function resolveFirstLast(sorted: PunchEntry[]): PunchValidationResult {
  if (sorted.length === 0) {
    return { valid: true, resolvedIn: null, resolvedOut: null };
  }

  const resolvedIn = sorted[0]!.time;

  if (sorted.length === 1) {
    // Only one punch — IN exists but OUT is missing (INCOMPLETE)
    return {
      valid: true,
      resolvedIn,
      resolvedOut: null,
      reason: 'Single punch recorded — punch-out missing',
    };
  }

  const resolvedOut = sorted[sorted.length - 1]!.time;
  const totalWorkedMinutes = diffMinutes(resolvedIn, resolvedOut);

  return {
    valid: true,
    resolvedIn,
    resolvedOut,
    totalWorkedMinutes: Math.max(0, totalWorkedMinutes),
  };
}

/**
 * EVERY_PAIR: alternating IN/OUT pairs, sum all pair durations.
 * If the sequence is invalid (e.g., two consecutive INs), flag for regularization
 * but still attempt to compute as much as possible.
 */
function resolveEveryPair(sorted: PunchEntry[]): PunchValidationResult {
  if (sorted.length === 0) {
    return { valid: true, resolvedIn: null, resolvedOut: null };
  }

  if (sorted.length === 1) {
    return {
      valid: true,
      resolvedIn: sorted[0]!.time,
      resolvedOut: null,
      reason: 'Single punch recorded — punch-out missing',
    };
  }

  // Try to form IN/OUT pairs. If directions are specified, validate alternation.
  // If directions are UNKNOWN, assume alternating starting with IN.
  const hasExplicitDirections = sorted.some(
    (p) => p.direction === 'IN' || p.direction === 'OUT',
  );

  let totalWorkedMinutes = 0;
  let sequenceValid = true;
  let pairCount = 0;

  if (hasExplicitDirections) {
    // Validate the explicit sequence
    let expectingIn = true;
    let currentIn: Date | null = null;

    for (const punch of sorted) {
      if (expectingIn) {
        if (punch.direction === 'OUT') {
          // OUT without preceding IN — sequence error
          sequenceValid = false;
          continue;
        }
        currentIn = punch.time;
        expectingIn = false;
      } else {
        if (punch.direction === 'IN') {
          // Two consecutive INs — sequence error, treat previous IN as orphaned
          sequenceValid = false;
          currentIn = punch.time;
          continue;
        }
        // Valid OUT after IN
        if (currentIn) {
          const mins = diffMinutes(currentIn, punch.time);
          if (mins > 0) {
            totalWorkedMinutes += mins;
            pairCount++;
          }
        }
        currentIn = null;
        expectingIn = true;
      }
    }

    // If we end with an unmatched IN, the last punch-out is missing
    if (currentIn && !expectingIn) {
      // Unmatched IN at end
      sequenceValid = false;
    }
  } else {
    // No explicit directions — assume alternating IN, OUT, IN, OUT, ...
    for (let i = 0; i + 1 < sorted.length; i += 2) {
      const punchIn = sorted[i]!;
      const punchOut = sorted[i + 1]!;
      const mins = diffMinutes(punchIn.time, punchOut.time);
      if (mins > 0) {
        totalWorkedMinutes += mins;
        pairCount++;
      }
    }

    // Odd number of punches means the last one is an unmatched IN
    if (sorted.length % 2 !== 0) {
      sequenceValid = false;
    }
  }

  const resolvedIn = sorted[0]!.time;
  const resolvedOut = sorted[sorted.length - 1]!.time;

  return {
    valid: sequenceValid,
    resolvedIn,
    resolvedOut: pairCount > 0 ? resolvedOut : null,
    totalWorkedMinutes: Math.max(0, totalWorkedMinutes),
    reason: sequenceValid
      ? undefined
      : 'Invalid punch sequence detected — flagged for regularization',
  };
}

/**
 * SHIFT_BASED: match punches to the assigned shift window.
 * The punch closest to shift start = IN, the punch closest to shift end = OUT.
 *
 * If shift timing is not provided (shiftStart/shiftEnd are null), falls back
 * to FIRST_LAST behavior.
 *
 * @param sorted       - Punches sorted by time
 * @param shiftStart   - Optional shift start time for proximity matching
 * @param shiftEnd     - Optional shift end time for proximity matching
 */
function resolveShiftBased(
  sorted: PunchEntry[],
  shiftStart?: Date | null,
  shiftEnd?: Date | null,
): PunchValidationResult {
  if (sorted.length === 0) {
    return { valid: true, resolvedIn: null, resolvedOut: null };
  }

  if (sorted.length === 1) {
    return {
      valid: true,
      resolvedIn: sorted[0]!.time,
      resolvedOut: null,
      reason: 'Single punch recorded — punch-out missing',
    };
  }

  // If shift times are not available, fall back to FIRST_LAST
  if (!shiftStart || !shiftEnd) {
    return resolveFirstLast(sorted);
  }

  // Find punch closest to shift start (for IN)
  let closestInIdx = 0;
  let closestInDiff = Math.abs(sorted[0]!.time.getTime() - shiftStart.getTime());

  for (let i = 1; i < sorted.length; i++) {
    const diff = Math.abs(sorted[i]!.time.getTime() - shiftStart.getTime());
    if (diff < closestInDiff) {
      closestInDiff = diff;
      closestInIdx = i;
    }
  }

  // Find punch closest to shift end (for OUT), excluding the IN punch
  let closestOutIdx = -1;
  let closestOutDiff = Infinity;

  for (let i = 0; i < sorted.length; i++) {
    if (i === closestInIdx) continue;
    const diff = Math.abs(sorted[i]!.time.getTime() - shiftEnd.getTime());
    if (diff < closestOutDiff) {
      closestOutDiff = diff;
      closestOutIdx = i;
    }
  }

  const resolvedIn = sorted[closestInIdx]!.time;
  const resolvedOut = closestOutIdx >= 0 ? sorted[closestOutIdx]!.time : null;
  const totalWorkedMinutes = resolvedOut ? Math.max(0, diffMinutes(resolvedIn, resolvedOut)) : undefined;

  return {
    valid: true,
    resolvedIn,
    resolvedOut,
    totalWorkedMinutes,
  };
}

// ─── Main Validator ─────────────────────────────────────────────────────────

/**
 * Validate and resolve a punch sequence based on the configured punch mode.
 *
 * @param punches    - Raw punch entries (unsorted is fine)
 * @param mode       - PunchMode enum value ('FIRST_LAST' | 'EVERY_PAIR' | 'SHIFT_BASED')
 * @param shiftStart - Optional: shift start time (required for SHIFT_BASED mode)
 * @param shiftEnd   - Optional: shift end time (required for SHIFT_BASED mode)
 * @returns Validation result with resolved IN/OUT times and optional total worked minutes
 */
export function validatePunchSequence(
  punches: PunchEntry[],
  mode: string,
  shiftStart?: Date | null,
  shiftEnd?: Date | null,
): PunchValidationResult {
  // No punches at all
  if (!punches || punches.length === 0) {
    return { valid: true, resolvedIn: null, resolvedOut: null };
  }

  const sorted = sortByTime(punches);

  switch (mode) {
    case 'FIRST_LAST':
      return resolveFirstLast(sorted);

    case 'EVERY_PAIR':
      return resolveEveryPair(sorted);

    case 'SHIFT_BASED':
      return resolveShiftBased(sorted, shiftStart, shiftEnd);

    default:
      // Unknown mode — fall back to FIRST_LAST as safest default
      return resolveFirstLast(sorted);
  }
}
