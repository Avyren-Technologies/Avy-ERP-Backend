import { platformPrisma } from '../../config/database';
import { logger } from '../../config/logger';
import { ApiError } from '../../shared/errors/api-error';

class DeviceService {
  /**
   * List all biometric devices belonging to a company.
   * Optionally filter by locationId. Includes location relation for display.
   */
  async listDevices(companyId: string, locationId?: string | undefined) {
    const where: { companyId: string; locationId?: string } = { companyId };
    if (locationId) where.locationId = locationId;

    return platformPrisma.biometricDevice.findMany({
      where,
      orderBy: { deviceName: 'asc' },
      include: {
        location: { select: { id: true, name: true, code: true } },
      },
    });
  }

  /**
   * Get a single device by ID, verifying company ownership. Includes location.
   */
  async getDevice(companyId: string, id: string) {
    const device = await platformPrisma.biometricDevice.findUnique({
      where: { id },
      include: {
        location: { select: { id: true, name: true, code: true } },
      },
    });

    if (!device || device.companyId !== companyId) {
      throw ApiError.notFound('Device not found');
    }

    return device;
  }

  /**
   * List all unassigned (unclaimed) devices — super admin only.
   */
  async listUnassignedDevices() {
    return platformPrisma.biometricDevice.findMany({
      where: { companyId: null },
      orderBy: { registeredAt: 'desc' },
    });
  }

  /**
   * Count unassigned devices — super admin only.
   */
  async countUnassigned() {
    const count = await platformPrisma.biometricDevice.count({
      where: { companyId: null },
    });
    return { count };
  }

  /**
   * Assign an unassigned device to a company. Backfills companyId on existing punch logs.
   */
  async assignDevice(
    deviceId: string,
    data: { companyId: string; deviceName: string; locationId?: string | undefined; timezone?: string | undefined },
    assignedBy: string,
  ) {
    const device = await platformPrisma.biometricDevice.findUnique({
      where: { id: deviceId },
    });

    if (!device) {
      throw ApiError.notFound('Device not found');
    }

    if (device.companyId) {
      throw ApiError.conflict('Device is already assigned to a company');
    }

    // Validate the target company exists
    const company = await platformPrisma.company.findUnique({
      where: { id: data.companyId },
      select: { id: true },
    });
    if (!company) {
      throw ApiError.badRequest('Company not found');
    }

    // Validate location belongs to this company (if provided)
    if (data.locationId) {
      const location = await platformPrisma.location.findFirst({
        where: { id: data.locationId, companyId: data.companyId },
        select: { id: true },
      });
      if (!location) {
        throw ApiError.badRequest('Location not found or does not belong to this company');
      }
    }

    const updated = await platformPrisma.biometricDevice.update({
      where: { id: deviceId },
      data: {
        companyId: data.companyId,
        deviceName: data.deviceName,
        locationId: data.locationId ?? null,
        timezone: data.timezone ?? device.timezone,
        isActive: true,
        claimStatus: 'CLAIMED',
        claimedBy: assignedBy,
        claimedAt: new Date(),
        assignedAt: new Date(),
      },
    });

    // Backfill companyId on existing punch logs for this device
    const backfilled = await platformPrisma.biometricPunchLog.updateMany({
      where: { deviceId, companyId: null },
      data: { companyId: data.companyId },
    });

    logger.info(
      `[DeviceService] Device ${device.serialNumber} assigned to company ${data.companyId} by ${assignedBy}. Backfilled ${backfilled.count} punch logs.`,
    );

    return updated;
  }

  /**
   * Claim a device by serial number — company admin flow.
   */
  async claimDevice(
    companyId: string,
    serialNumber: string,
    data: { deviceName: string; locationId?: string | undefined; timezone?: string | undefined },
    claimedBy: string,
  ) {
    const device = await platformPrisma.biometricDevice.findUnique({
      where: { serialNumber },
    });

    if (!device) {
      throw ApiError.notFound('Device not found. Ensure the device has connected to the server at least once.');
    }

    if (device.companyId) {
      throw ApiError.conflict('Device is already assigned to a company');
    }

    const assignData: { companyId: string; deviceName: string; locationId?: string; timezone?: string } = {
      companyId,
      deviceName: data.deviceName,
    };
    if (data.locationId !== undefined) assignData.locationId = data.locationId;
    if (data.timezone !== undefined) assignData.timezone = data.timezone;

    return this.assignDevice(device.id, assignData, claimedBy);
  }

  /**
   * Update device settings. Verifies company ownership.
   */
  async updateDevice(
    companyId: string,
    id: string,
    data: { deviceName?: string | undefined; locationId?: string | null | undefined; timezone?: string | undefined; isActive?: boolean | undefined },
  ) {
    const device = await platformPrisma.biometricDevice.findUnique({
      where: { id },
    });

    if (!device || device.companyId !== companyId) {
      throw ApiError.notFound('Device not found');
    }

    // Validate location belongs to this company (if changing location)
    if (data.locationId && data.locationId !== device.locationId) {
      const location = await platformPrisma.location.findFirst({
        where: { id: data.locationId, companyId },
        select: { id: true },
      });
      if (!location) {
        throw ApiError.badRequest('Location not found or does not belong to this company');
      }
    }

    return platformPrisma.biometricDevice.update({
      where: { id },
      data: {
        ...(data.deviceName !== undefined && { deviceName: data.deviceName }),
        ...(data.locationId !== undefined && { locationId: data.locationId }),
        ...(data.timezone !== undefined && { timezone: data.timezone }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  /**
   * Deactivate a device. Verifies company ownership.
   */
  async deactivateDevice(companyId: string, id: string) {
    const device = await platformPrisma.biometricDevice.findUnique({
      where: { id },
    });

    if (!device || device.companyId !== companyId) {
      throw ApiError.notFound('Device not found');
    }

    return platformPrisma.biometricDevice.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Get device stats for a company, optionally scoped to a location.
   * Returns total, online (heartbeat within 2 min), offline.
   */
  async getDeviceStats(companyId: string, locationId?: string | undefined) {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const baseWhere: { companyId: string; locationId?: string } = { companyId };
    if (locationId) baseWhere.locationId = locationId;

    const [total, online] = await Promise.all([
      platformPrisma.biometricDevice.count({ where: baseWhere }),
      platformPrisma.biometricDevice.count({
        where: {
          ...baseWhere,
          isActive: true,
          lastHeartbeatAt: { gte: twoMinutesAgo },
        },
      }),
    ]);

    return { total, online, offline: total - online };
  }
}

export const deviceService = new DeviceService();
