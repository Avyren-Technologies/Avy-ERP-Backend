import crypto from 'crypto';
import { DateTime } from 'luxon';
import { platformPrisma } from '../../config/database';
import { logger } from '../../config/logger';

export interface ParsedPunchLine {
  deviceUserId: string;
  punchTime: DateTime;
  statusCode: number;
  verifyType: number;
  workCode: string;
}

class AdmsService {
  /**
   * Handle device handshake (GET /iclock/cdata?SN=xxx)
   * Auto-registers unknown devices. Always returns config text.
   */
  async handleHandshake(serialNumber: string): Promise<string> {
    if (!serialNumber) {
      logger.warn('[ADMS] Handshake received with empty serial number');
      return this.buildHandshakeResponse();
    }

    try {
      let device = await platformPrisma.biometricDevice.findUnique({
        where: { serialNumber },
      });

      if (!device) {
        logger.info(`[ADMS] Auto-registering unknown device: ${serialNumber}`);
        device = await platformPrisma.biometricDevice.create({
          data: {
            serialNumber,
            isActive: false,
            claimStatus: 'UNCLAIMED',
            deviceName: `Unassigned - ${serialNumber}`,
          },
        });
      }

      await platformPrisma.biometricDevice.update({
        where: { id: device.id },
        data: {
          lastHeartbeatAt: new Date(),
          heartbeatCount: { increment: 1 },
        },
      });

      logger.debug(`[ADMS] Handshake OK for device ${serialNumber} (heartbeat #${device.heartbeatCount + 1})`);
    } catch (err) {
      logger.error(`[ADMS] Handshake DB error for ${serialNumber}:`, err);
    }

    return this.buildHandshakeResponse();
  }

  /**
   * Handle punch data push (POST /iclock/cdata?SN=xxx)
   */
  async handlePunchPush(
    serialNumber: string,
    body: string,
  ): Promise<{ stored: number; duplicates: number }> {
    if (!serialNumber || !body) {
      return { stored: 0, duplicates: 0 };
    }

    let device;
    try {
      device = await platformPrisma.biometricDevice.findUnique({
        where: { serialNumber },
      });

      if (!device) {
        logger.info(`[ADMS] Auto-registering device on punch push: ${serialNumber}`);
        device = await platformPrisma.biometricDevice.create({
          data: {
            serialNumber,
            isActive: false,
            claimStatus: 'UNCLAIMED',
            deviceName: `Unassigned - ${serialNumber}`,
          },
        });
      }

      await platformPrisma.biometricDevice.update({
        where: { id: device.id },
        data: {
          lastHeartbeatAt: new Date(),
          heartbeatCount: { increment: 1 },
        },
      });
    } catch (err) {
      logger.error(`[ADMS] Punch push DB error looking up device ${serialNumber}:`, err);
      return { stored: 0, duplicates: 0 };
    }

    const deviceTimezone = device.timezone || 'Asia/Kolkata';
    const lines = body.split('\n').filter((l) => l.trim().length > 0);
    let stored = 0;
    let duplicates = 0;

    for (const line of lines) {
      const parsed = this.parseAttlogLine(line, deviceTimezone);
      if (!parsed) {
        logger.debug(`[ADMS] Skipping unparseable ATTLOG line: ${line.substring(0, 80)}`);
        continue;
      }

      const dedupeHash = this.computeDedupeHash(
        serialNumber,
        parsed.deviceUserId,
        parsed.punchTime,
      );

      try {
        await platformPrisma.biometricPunchLog.create({
          data: {
            deviceId: device.id,
            ...(device.companyId ? { companyId: device.companyId } : {}),
            serialNumber,
            deviceUserId: parsed.deviceUserId,
            punchTime: parsed.punchTime.toJSDate(),
            statusCode: parsed.statusCode,
            verifyType: parsed.verifyType,
            rawPayload: line,
            dedupeHash,
            processingStatus: 'PENDING',
          },
        });
        stored++;
      } catch (err: any) {
        if (err?.code === 'P2002') {
          duplicates++;
        } else {
          logger.error(`[ADMS] Error storing punch log for device ${serialNumber}:`, err);
        }
      }
    }

    logger.info(
      `[ADMS] Punch push from ${serialNumber}: ${stored} stored, ${duplicates} duplicates, ${lines.length} total lines`,
    );

    return { stored, duplicates };
  }

  /**
   * Parse a single ATTLOG line from eSSL device.
   * Format: UserID\tTimestamp\tStatus\tVerifyType\tWorkCode
   * Example: 7\t2026-05-07 09:15:23\t0\t4\t0
   */
  parseAttlogLine(line: string, deviceTimezone: string): ParsedPunchLine | null {
    try {
      const parts = line.trim().split('\t');
      if (parts.length < 3) return null;

      const deviceUserId = parts[0]?.trim();
      const timestampStr = parts[1]?.trim();
      const statusCode = parseInt(parts[2]?.trim() || '0', 10);
      const verifyType = parseInt(parts[3]?.trim() || '0', 10);
      const workCode = parts[4]?.trim() || '0';

      if (!deviceUserId || !timestampStr) return null;

      const punchTime = DateTime.fromFormat(timestampStr, 'yyyy-MM-dd HH:mm:ss', {
        zone: deviceTimezone,
      });

      if (!punchTime.isValid) {
        logger.debug(`[ADMS] Invalid timestamp in ATTLOG line: ${timestampStr}`);
        return null;
      }

      // Convert to UTC
      const punchTimeUtc = punchTime.toUTC();

      // Sanity check: reject punches more than 24 hours in the future (clock drift)
      const nowUtc = DateTime.utc();
      if (punchTimeUtc > nowUtc.plus({ hours: 24 })) {
        logger.warn(`[ADMS] Punch timestamp too far in the future, possible clock drift: ${timestampStr}`);
        return null;
      }

      return {
        deviceUserId,
        punchTime: punchTimeUtc,
        statusCode: isNaN(statusCode) ? 0 : statusCode,
        verifyType: isNaN(verifyType) ? 0 : verifyType,
        workCode,
      };
    } catch {
      return null;
    }
  }

  /**
   * Compute SHA256 dedupe hash for a punch event.
   */
  computeDedupeHash(
    serialNumber: string,
    deviceUserId: string,
    punchTime: DateTime,
  ): string {
    const input = `${serialNumber}|${deviceUserId}|${punchTime.toISO()}`;
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  /**
   * Build the ADMS handshake config response text.
   */
  private buildHandshakeResponse(): string {
    return [
      'GET OPTION FROM:',
      'ATTLOGStamp=None',
      'OPERLOGStamp=9999',
      'ATTPHOTOStamp=None',
      'ErrorDelay=30',
      'Delay=10',
      'TransTimes=00:00;23:59',
      'TransInterval=1',
      'TransFlag=TransData AttLog',
      'TimeZone=5.5',
      'Realtime=1',
      'Encrypt=0',
      'ServerVer=2.4.1',
      'PushProtVer=2.4.1',
    ].join('\n');
  }
}

export const admsService = new AdmsService();
