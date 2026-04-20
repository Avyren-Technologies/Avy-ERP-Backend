/**
 * Leave Auto-Adjustment Service
 *
 * Called after check-out (status resolution complete) when:
 *   - Employee had an approved leave for the day
 *   - Employee actually worked that day
 *   - leaveAutoAdjustmentEnabled is true in AttendanceRule
 *
 * Adjustment logic:
 *   workedHours >= fullDayThreshold  → cancel leave, restore full balance
 *   workedHours >= halfDayThreshold  → convert to half-day, restore 0.5 balance
 *   workedHours <  halfDayThreshold  → keep leave, flag anomaly for review
 */

import { platformPrisma } from '../../config/database';
import { logger } from '../../config/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LeaveAdjustmentInput {
  companyId: string;
  employeeId: string;
  date: Date;
  workedHours: number;
  fullDayThreshold: number;
  halfDayThreshold: number;
  leaveAutoAdjustmentEnabled: boolean;
}

export interface LeaveAdjustmentResult {
  action: 'CANCELLED' | 'CONVERTED_TO_HALF_DAY' | 'KEPT' | 'NO_LEAVE';
  leaveRequestId?: string;
  reason: string;
}

// ─── Main Function ──────────────────────────────────────────────────────────

export async function adjustLeaveBasedOnAttendance(input: LeaveAdjustmentInput): Promise<LeaveAdjustmentResult> {
  const { companyId, employeeId, date, workedHours, fullDayThreshold, halfDayThreshold, leaveAutoAdjustmentEnabled } = input;

  // 1. Find approved leave for this employee on this date
  const approvedLeave = await platformPrisma.leaveRequest.findFirst({
    where: {
      employeeId,
      status: 'APPROVED',
      fromDate: { lte: date },
      toDate: { gte: date },
    },
    select: {
      id: true,
      leaveTypeId: true,
      isHalfDay: true,
      halfDayType: true,
      days: true,
      fromDate: true,
      toDate: true,
    },
  });

  if (!approvedLeave) {
    return { action: 'NO_LEAVE', reason: 'No approved leave found for this date' };
  }

  if (!leaveAutoAdjustmentEnabled) {
    return {
      action: 'KEPT',
      leaveRequestId: approvedLeave.id,
      reason: 'Leave auto-adjustment is disabled — leave kept as-is, flagged for review',
    };
  }

  // 2. Determine adjustment based on worked hours
  if (workedHours >= fullDayThreshold) {
    // Employee worked a full day — cancel the leave
    await platformPrisma.$transaction(async (tx) => {
      // Cancel the leave request
      await tx.leaveRequest.update({
        where: { id: approvedLeave.id },
        data: {
          status: 'CANCELLED',
        },
      });

      // Restore leave balance for the current year
      const leaveDays = approvedLeave.isHalfDay ? 0.5 : Number(approvedLeave.days);
      const year = date.getUTCFullYear();
      await tx.leaveBalance.updateMany({
        where: {
          employeeId,
          leaveTypeId: approvedLeave.leaveTypeId,
          year,
        },
        data: {
          taken: { decrement: leaveDays },
          balance: { increment: leaveDays },
        },
      });
    });

    logger.info(
      `Leave auto-cancelled for employee ${employeeId} on ${date.toISOString().split('T')[0]} — worked ${workedHours.toFixed(1)}h (>= ${fullDayThreshold}h threshold)`,
    );

    return {
      action: 'CANCELLED',
      leaveRequestId: approvedLeave.id,
      reason: `Leave cancelled — employee worked ${workedHours.toFixed(1)} hours (full day threshold: ${fullDayThreshold}h)`,
    };
  }

  if (workedHours >= halfDayThreshold) {
    // Employee worked half a day — convert full-day leave to half-day
    if (!approvedLeave.isHalfDay) {
      await platformPrisma.$transaction(async (tx) => {
        // Convert to half-day leave
        await tx.leaveRequest.update({
          where: { id: approvedLeave.id },
          data: {
            isHalfDay: true,
            halfDayType: 'FIRST_HALF', // They worked second half
            days: 0.5,
          },
        });

        // Restore 0.5 day balance
        const restoreDays = Number(approvedLeave.days) - 0.5;
        if (restoreDays > 0) {
          const year = date.getUTCFullYear();
          await tx.leaveBalance.updateMany({
            where: {
              employeeId,
              leaveTypeId: approvedLeave.leaveTypeId,
              year,
            },
            data: {
              taken: { decrement: restoreDays },
              balance: { increment: restoreDays },
            },
          });
        }
      });

      logger.info(
        `Leave auto-converted to half-day for employee ${employeeId} on ${date.toISOString().split('T')[0]} — worked ${workedHours.toFixed(1)}h`,
      );

      return {
        action: 'CONVERTED_TO_HALF_DAY',
        leaveRequestId: approvedLeave.id,
        reason: `Leave converted to half-day — employee worked ${workedHours.toFixed(1)} hours (half day threshold: ${halfDayThreshold}h)`,
      };
    }

    // Already a half-day leave — keep as-is
    return {
      action: 'KEPT',
      leaveRequestId: approvedLeave.id,
      reason: 'Half-day leave already in place, no adjustment needed',
    };
  }

  // 3. Worked less than half-day threshold — keep leave, flag for review
  logger.info(
    `Leave kept for employee ${employeeId} on ${date.toISOString().split('T')[0]} — worked only ${workedHours.toFixed(1)}h (below half-day threshold ${halfDayThreshold}h), flagged as anomaly`,
  );

  return {
    action: 'KEPT',
    leaveRequestId: approvedLeave.id,
    reason: `Leave kept — employee worked only ${workedHours.toFixed(1)} hours (below half-day threshold). Flagged for review.`,
  };
}
