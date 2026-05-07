import { platformPrisma } from '../../config/database';
import { logger } from '../../config/logger';
import { ApiError } from '../../shared/errors/api-error';

class MappingService {
  /**
   * List all employee-device mappings for a company, enriched with employee
   * details and device info (name, location).
   */
  async listMappings(companyId: string) {
    const mappings = await platformPrisma.employeeBiometricMapping.findMany({
      where: { companyId },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
            profilePhotoUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with device info (name + location) since mapping only stores serialNumber
    const serialNumbers = [...new Set(mappings.map(m => m.deviceSerialNumber))];
    const devices = serialNumbers.length > 0
      ? await platformPrisma.biometricDevice.findMany({
          where: { serialNumber: { in: serialNumbers } },
          select: { serialNumber: true, deviceName: true, location: { select: { id: true, name: true } } },
        })
      : [];
    const deviceMap = new Map(devices.map(d => [d.serialNumber, d]));

    return mappings.map(m => ({
      ...m,
      device: deviceMap.get(m.deviceSerialNumber) ?? null,
    }));
  }

  /**
   * Create a mapping between an employee and a device user ID.
   * Validates ownership, backfills existing punch logs, and re-queues failed punches.
   */
  async createMapping(
    companyId: string,
    data: { employeeId: string; deviceSerialNumber: string; deviceUserId: string },
  ) {
    // Validate employee belongs to this company
    const employee = await platformPrisma.employee.findFirst({
      where: { id: data.employeeId, companyId },
    });

    if (!employee) {
      throw ApiError.badRequest('Employee not found or does not belong to this company');
    }

    // Validate device exists and belongs to this company
    const device = await platformPrisma.biometricDevice.findUnique({
      where: { serialNumber: data.deviceSerialNumber },
    });

    if (!device || device.companyId !== companyId) {
      throw ApiError.badRequest('Device not found or does not belong to this company');
    }

    // Create the mapping
    let mapping;
    try {
      mapping = await platformPrisma.employeeBiometricMapping.create({
        data: {
          employeeId: data.employeeId,
          deviceSerialNumber: data.deviceSerialNumber,
          deviceUserId: data.deviceUserId,
          companyId,
        },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeId: true,
              profilePhotoUrl: true,
            },
          },
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw ApiError.conflict('This mapping already exists (duplicate device user ID or employee-device combination)');
      }
      throw err;
    }

    // Backfill: set employeeId on existing punch logs that match this device + deviceUserId
    const backfilled = await platformPrisma.biometricPunchLog.updateMany({
      where: {
        serialNumber: data.deviceSerialNumber,
        deviceUserId: data.deviceUserId,
        employeeId: null,
      },
      data: { employeeId: data.employeeId },
    });

    // Re-queue FAILED or IGNORED punch logs as PENDING for reprocessing
    const requeued = await platformPrisma.biometricPunchLog.updateMany({
      where: {
        serialNumber: data.deviceSerialNumber,
        deviceUserId: data.deviceUserId,
        employeeId: data.employeeId,
        processingStatus: { in: ['FAILED', 'IGNORED'] },
      },
      data: { processingStatus: 'PENDING', retryCount: 0 },
    });

    logger.info(
      `[MappingService] Created mapping: employee=${data.employeeId} device=${data.deviceSerialNumber} userId=${data.deviceUserId}. Backfilled ${backfilled.count} logs, re-queued ${requeued.count}.`,
    );

    return mapping;
  }

  /**
   * Delete a mapping. Verifies company ownership.
   */
  async deleteMapping(companyId: string, mappingId: string) {
    const mapping = await platformPrisma.employeeBiometricMapping.findUnique({
      where: { id: mappingId },
    });

    if (!mapping || mapping.companyId !== companyId) {
      throw ApiError.notFound('Mapping not found');
    }

    await platformPrisma.employeeBiometricMapping.delete({
      where: { id: mappingId },
    });

    return { deleted: true };
  }

  /**
   * Get unmapped punch log combinations: groups of [serialNumber, deviceUserId]
   * where no mapping exists, with punch counts.
   */
  async getUnmappedPunches(companyId: string) {
    // Get all existing mappings for this company
    const mappings = await platformPrisma.employeeBiometricMapping.findMany({
      where: { companyId },
      select: { deviceSerialNumber: true, deviceUserId: true },
    });

    // Build a set of already-mapped combinations for filtering
    const mappedSet = new Set(
      mappings.map((m) => `${m.deviceSerialNumber}|${m.deviceUserId}`),
    );

    // Group punch logs by [serialNumber, deviceUserId] where employeeId is null
    const groups = await platformPrisma.biometricPunchLog.groupBy({
      by: ['serialNumber', 'deviceUserId'],
      where: {
        companyId,
        employeeId: null,
      },
      _count: { id: true },
      _max: { punchTime: true },
    });

    // Filter out already-mapped combinations
    return groups
      .filter((g) => !mappedSet.has(`${g.serialNumber}|${g.deviceUserId}`))
      .map((g) => ({
        serialNumber: g.serialNumber,
        deviceUserId: g.deviceUserId,
        punchCount: g._count.id,
        lastPunchTime: g._max.punchTime,
      }));
  }
}

export const mappingService = new MappingService();
