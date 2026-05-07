import { DateTime } from 'luxon';
import { platformPrisma } from '../../config/database';
import { logger } from '../../config/logger';
import { emitAttendancePunch, emitUnassignedPunch } from '../../lib/socket';
import { attendanceService } from '../hr/attendance/attendance.service';
import { getCachedAttendanceRules } from '../../shared/utils/config-cache';

/** Map statusCode → human-readable punch type */
function punchTypeLabel(statusCode: number): string {
  switch (statusCode) {
    case 0: return 'Check In';
    case 1: return 'Check Out';
    case 4: return 'OT In';
    case 5: return 'OT Out';
    default: return `Unknown (${statusCode})`;
  }
}

/** Map verifyType → human-readable verify method */
function verifyTypeLabel(verifyType: number): string {
  switch (verifyType) {
    case 1: return 'Fingerprint';
    case 4: return 'Face';
    case 15: return 'RFID';
    case 20: return 'PIN';
    default: return `Other (${verifyType})`;
  }
}

/** Shape of a punch log row with its device relation included. */
interface PunchWithDevice {
  id: string;
  serialNumber: string;
  deviceUserId: string;
  punchTime: Date;
  statusCode: number;
  verifyType: number;
  employeeId: string | null;
  companyId: string | null;
  device: {
    deviceName: string;
    companyId: string | null;
    timezone: string | null;
    locationId: string | null;
    location: { name: string } | null;
  };
}

/** Minimal device shape for helper methods. */
interface DeviceInfo {
  deviceName: string;
  companyId: string | null;
  timezone: string | null;
  locationId: string | null;
  location: { name: string } | null;
}

class PunchProcessorService {
  private isProcessing = false;

  /**
   * Fetch up to 500 pending punches and process them sequentially.
   * Uses an `isProcessing` guard to prevent overlapping runs within the same process.
   * Uses `FOR UPDATE SKIP LOCKED` for multi-instance safety.
   */
  async processPendingPunches(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Atomically claim a batch: mark PENDING → PROCESSING in one query.
      // FOR UPDATE SKIP LOCKED prevents TOCTOU races in multi-instance deployments.
      const claimed = await platformPrisma.$queryRawUnsafe<Array<{ id: string }>>(
        `UPDATE biometric_punch_logs
         SET "processingStatus" = 'PROCESSING'
         WHERE id IN (
           SELECT id FROM biometric_punch_logs
           WHERE "processingStatus" = 'PENDING' AND "retryCount" < 5
           ORDER BY "punchTime" ASC
           LIMIT 500
           FOR UPDATE SKIP LOCKED
         )
         RETURNING id`,
      );

      if (!claimed || claimed.length === 0) return;

      const claimedIds = claimed.map((r) => r.id);

      // Fetch full records with device relation
      const punches = await platformPrisma.biometricPunchLog.findMany({
        where: { id: { in: claimedIds } },
        orderBy: { punchTime: 'asc' },
        include: {
          device: {
            select: {
              deviceName: true,
              companyId: true,
              timezone: true,
              locationId: true,
              location: { select: { name: true } },
            },
          },
        },
      });

      if (punches.length === 0) return;

      logger.info(`Biometric punch processor: processing ${punches.length} punch(es)`);

      for (const punch of punches) {
        try {
          await this.processSinglePunch(punch);
        } catch (err: any) {
          logger.error(`Biometric punch processor: failed to process punch ${punch.id}`, {
            error: err.message,
          });
          await platformPrisma.biometricPunchLog.update({
            where: { id: punch.id },
            data: {
              processingStatus: 'FAILED',
              processingError: err.message?.substring(0, 2000) ?? 'Unknown error',
              retryCount: { increment: 1 },
            },
          });
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single punch log entry.
   *
   * Flow:
   * 1. Validate device assignment + resolve employee via mapping
   * 2. Verify employee is active and belongs to company
   * 3. Route to FIRST_LAST or EVERY_PAIR handler based on company punchMode
   * 4. Mark punch as PROCESSED, emit real-time Socket.IO event
   */
  private async processSinglePunch(punch: PunchWithDevice): Promise<void> {
    const device = punch.device;

    // ── Gate 1: Device must be assigned to a company ──
    if (!device.companyId) {
      await platformPrisma.biometricPunchLog.update({
        where: { id: punch.id },
        data: {
          processingStatus: 'IGNORED',
          processingError: 'Device not assigned to any company',
          processedAt: new Date(),
        },
      });
      emitUnassignedPunch({
        serialNumber: punch.serialNumber,
        deviceUserId: punch.deviceUserId,
        punchTime: punch.punchTime.toISOString(),
      });
      return;
    }

    const companyId = device.companyId;
    const timezone = device.timezone ?? 'Asia/Kolkata';

    // ── Gate 2: Resolve employee via mapping ──
    let employeeId = punch.employeeId;

    if (!employeeId) {
      const mapping = await platformPrisma.employeeBiometricMapping.findUnique({
        where: {
          deviceSerialNumber_deviceUserId: {
            deviceSerialNumber: punch.serialNumber,
            deviceUserId: punch.deviceUserId,
          },
        },
        select: { employeeId: true },
      });
      employeeId = mapping?.employeeId ?? null;
    }

    if (!employeeId) {
      await platformPrisma.biometricPunchLog.update({
        where: { id: punch.id },
        data: {
          processingStatus: 'IGNORED',
          processingError: 'No employee mapping found — will auto-process when mapping is created',
          processedAt: new Date(),
        },
      });
      emitAttendancePunch(companyId, {
        punchLogId: punch.id,
        deviceName: device.deviceName,
        locationName: device.location?.name ?? null,
        serialNumber: punch.serialNumber,
        deviceUserId: punch.deviceUserId,
        employeeName: null,
        employeeId: null,
        punchTime: punch.punchTime.toISOString(),
        punchType: punchTypeLabel(punch.statusCode),
        verifyType: verifyTypeLabel(punch.verifyType),
      });
      return;
    }

    // ── Gate 3: Verify employee still exists, is active, and belongs to this company ──
    const employee = await platformPrisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, firstName: true, lastName: true, status: true, companyId: true },
    });

    if (!employee || employee.companyId !== companyId) {
      await platformPrisma.biometricPunchLog.update({
        where: { id: punch.id },
        data: {
          processingStatus: 'FAILED',
          processingError: `Employee ${employeeId} not found or does not belong to company`,
          retryCount: { increment: 1 },
        },
      });
      return;
    }

    if (employee.status === 'EXITED') {
      await platformPrisma.biometricPunchLog.update({
        where: { id: punch.id },
        data: {
          processingStatus: 'IGNORED',
          processingError: `Employee ${employeeId} has exited — punch ignored`,
          processedAt: new Date(),
          employeeId,
        },
      });
      return;
    }

    const employeeName = [employee.firstName, employee.lastName].filter(Boolean).join(' ') || null;

    // ── Determine punch date in device timezone ──
    const punchDateTime = DateTime.fromJSDate(punch.punchTime).setZone(timezone);
    const punchDateStr = punchDateTime.toFormat('yyyy-MM-dd');
    const punchDate = new Date(punchDateStr);

    // Determine punch direction
    const isCheckIn = punch.statusCode === 0 || punch.statusCode === 4;
    const isCheckOut = punch.statusCode === 1 || punch.statusCode === 5;

    // ── Resolve company's punchMode ──
    const rules = await getCachedAttendanceRules(companyId);
    const punchMode = rules.punchMode ?? 'FIRST_LAST';

    let attendanceRecordId: string | null = null;

    try {
      if (punchMode === 'EVERY_PAIR') {
        attendanceRecordId = await this.processEveryPairPunch(
          companyId, employeeId, punchDate, punchDateStr, punch, device, isCheckIn, isCheckOut,
        );
      } else {
        // FIRST_LAST and SHIFT_BASED both use single-record-per-day model
        attendanceRecordId = await this.processFirstLastPunch(
          companyId, employeeId, punchDate, punchDateStr, punch, device, isCheckIn, isCheckOut,
        );
      }
    } catch (err: any) {
      // Log but don't fail the punch — raw data is preserved in BiometricPunchLog
      logger.warn(`Biometric punch processor: attendance record error for punch ${punch.id}`, {
        error: err.message,
        employeeId,
        punchDate: punchDateStr,
      });
    }

    // ── Mark punch as PROCESSED ──
    await platformPrisma.biometricPunchLog.update({
      where: { id: punch.id },
      data: {
        processingStatus: 'PROCESSED',
        processedAt: new Date(),
        employeeId,
        attendanceRecordId,
      },
    });

    // ── Emit real-time event ──
    emitAttendancePunch(companyId, {
      punchLogId: punch.id,
      deviceName: device.deviceName,
      locationName: device.location?.name ?? null,
      serialNumber: punch.serialNumber,
      deviceUserId: punch.deviceUserId,
      employeeName,
      employeeId,
      punchTime: punch.punchTime.toISOString(),
      punchType: punchTypeLabel(punch.statusCode),
      verifyType: verifyTypeLabel(punch.verifyType),
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // FIRST_LAST / SHIFT_BASED — single record per employee per day
  // ────────────────────────────────────────────────────────────────────

  /**
   * Standard mode: one attendance record per employee per day.
   * First check-in sets punchIn, last check-out sets punchOut.
   * All intermediate punches are ignored (FIRST_LAST semantics).
   */
  private async processFirstLastPunch(
    companyId: string,
    employeeId: string,
    punchDate: Date,
    punchDateStr: string,
    punch: PunchWithDevice,
    device: DeviceInfo,
    isCheckIn: boolean,
    isCheckOut: boolean,
  ): Promise<string | null> {
    const existingRecord = await platformPrisma.attendanceRecord.findFirst({
      where: { employeeId, companyId, date: punchDate },
      select: { id: true, punchIn: true, punchOut: true, source: true },
    });

    if (existingRecord) {
      if (existingRecord.source !== 'BIOMETRIC') {
        // Non-biometric record (manual, mobile, web) — only fill missing times, don't overwrite
        const updateData: Record<string, unknown> = {};
        if (isCheckIn && !existingRecord.punchIn) updateData.punchIn = punch.punchTime;
        if (isCheckOut && !existingRecord.punchOut) updateData.punchOut = punch.punchTime;

        if (Object.keys(updateData).length > 0) {
          await platformPrisma.attendanceRecord.update({
            where: { id: existingRecord.id },
            data: updateData,
          });
          logger.info(`Biometric punch filled missing ${Object.keys(updateData).join('+')} on non-biometric record ${existingRecord.id}`);
        }
        return existingRecord.id;
      }

      // Biometric record — safe to delete and re-create for full policy recalculation
      const newPunchIn = (isCheckIn && !existingRecord.punchIn) ? punch.punchTime : existingRecord.punchIn;
      const newPunchOut = isCheckOut ? punch.punchTime : existingRecord.punchOut;

      if (newPunchIn !== existingRecord.punchIn || newPunchOut !== existingRecord.punchOut) {
        await platformPrisma.attendanceRecord.delete({ where: { id: existingRecord.id } });

        const rebuilt = await attendanceService.createRecord(companyId, {
          employeeId,
          date: punchDateStr,
          source: 'BIOMETRIC',
          status: 'PRESENT',
          locationId: device.locationId ?? undefined,
          ...(newPunchIn ? { punchIn: newPunchIn instanceof Date ? newPunchIn.toISOString() : newPunchIn } : {}),
          ...(newPunchOut ? { punchOut: newPunchOut instanceof Date ? newPunchOut.toISOString() : newPunchOut } : {}),
        });
        return rebuilt.id;
      }
      return existingRecord.id;
    }

    // No existing record — create new via attendanceService (full policy evaluation)
    const record = await attendanceService.createRecord(companyId, {
      employeeId,
      date: punchDateStr,
      source: 'BIOMETRIC',
      status: 'PRESENT',
      locationId: device.locationId ?? undefined,
      ...(isCheckIn ? { punchIn: punch.punchTime.toISOString() } : {}),
      ...(isCheckOut ? { punchOut: punch.punchTime.toISOString() } : {}),
    });
    return record.id;
  }

  // ────────────────────────────────────────────────────────────────────
  // EVERY_PAIR — multiple sessions per day (factory, lunch breaks)
  // ────────────────────────────────────────────────────────────────────

  /**
   * EVERY_PAIR mode: each check-in/check-out pair creates a separate
   * attendance record with incrementing shiftSequence.
   *
   * Logic:
   * - CHECK_IN: always create a new record with punchIn only (new pair)
   * - CHECK_OUT: find the latest biometric record for this day that has
   *   punchIn but no punchOut, and attach the punchOut to it. If no open
   *   pair exists, create a standalone punchOut record.
   */
  private async processEveryPairPunch(
    companyId: string,
    employeeId: string,
    punchDate: Date,
    punchDateStr: string,
    punch: PunchWithDevice,
    device: DeviceInfo,
    isCheckIn: boolean,
    isCheckOut: boolean,
  ): Promise<string | null> {
    if (isCheckIn) {
      // New pair: find the next shiftSequence for today
      const maxSeq = await platformPrisma.attendanceRecord.aggregate({
        where: { employeeId, companyId, date: punchDate },
        _max: { shiftSequence: true },
      });
      const nextSeq = (maxSeq._max.shiftSequence ?? 0) + 1;

      // Create new record via attendanceService for full policy resolution
      // Note: for EVERY_PAIR, each segment is evaluated independently
      const record = await attendanceService.createRecord(companyId, {
        employeeId,
        date: punchDateStr,
        source: 'BIOMETRIC',
        status: 'PRESENT',
        locationId: device.locationId ?? undefined,
        punchIn: punch.punchTime.toISOString(),
        shiftSequence: nextSeq,
      });
      return record.id;
    }

    if (isCheckOut) {
      // Find the latest open pair (has punchIn, no punchOut) for today
      const openPair = await platformPrisma.attendanceRecord.findFirst({
        where: {
          employeeId,
          companyId,
          date: punchDate,
          source: 'BIOMETRIC',
          punchIn: { not: null },
          punchOut: null,
        },
        orderBy: { shiftSequence: 'desc' },
        select: { id: true, punchIn: true, shiftSequence: true },
      });

      if (openPair) {
        // Close the open pair: delete and re-create with punchOut for full recalc
        await platformPrisma.attendanceRecord.delete({ where: { id: openPair.id } });

        const rebuilt = await attendanceService.createRecord(companyId, {
          employeeId,
          date: punchDateStr,
          source: 'BIOMETRIC',
          status: 'PRESENT',
          locationId: device.locationId ?? undefined,
          punchIn: openPair.punchIn instanceof Date ? openPair.punchIn.toISOString() : openPair.punchIn,
          punchOut: punch.punchTime.toISOString(),
          shiftSequence: openPair.shiftSequence,
        });
        return rebuilt.id;
      }

      // No open pair — create standalone check-out (unusual, but preserve data)
      logger.warn(`Biometric EVERY_PAIR: check-out without matching check-in for employee ${employeeId} on ${punchDateStr}`);
      const maxSeq = await platformPrisma.attendanceRecord.aggregate({
        where: { employeeId, companyId, date: punchDate },
        _max: { shiftSequence: true },
      });
      const nextSeq = (maxSeq._max.shiftSequence ?? 0) + 1;

      const record = await attendanceService.createRecord(companyId, {
        employeeId,
        date: punchDateStr,
        source: 'BIOMETRIC',
        status: 'PRESENT',
        locationId: device.locationId ?? undefined,
        punchOut: punch.punchTime.toISOString(),
        shiftSequence: nextSeq,
      });
      return record.id;
    }

    // Neither check-in nor check-out (status code 255 = Other) — just store, don't create record
    logger.debug(`Biometric EVERY_PAIR: ignoring non-check-in/check-out punch (statusCode=${punch.statusCode})`);
    return null;
  }

  /**
   * Reset FAILED punches (under retry limit) back to PENDING for reprocessing.
   */
  async retryFailedPunches(): Promise<void> {
    const result = await platformPrisma.biometricPunchLog.updateMany({
      where: {
        processingStatus: 'FAILED',
        retryCount: { lt: 5 },
      },
      data: { processingStatus: 'PENDING' },
    });

    if (result.count > 0) {
      logger.info(`Biometric retry: reset ${result.count} failed punch(es) to PENDING`);
    }
  }
}

export const punchProcessorService = new PunchProcessorService();
