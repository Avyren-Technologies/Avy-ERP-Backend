import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/error.middleware';
import { createSuccessResponse } from '../../shared/utils';
import { ApiError } from '../../shared/errors/api-error';
import { platformPrisma } from '../../config/database';
import { deviceService } from './device.service';
import { mappingService } from './mapping.service';
import {
  assignDeviceSchema,
  claimDeviceSchema,
  updateDeviceSchema,
  createMappingSchema,
  attendanceQuerySchema,
} from './biometric.validators';

class BiometricController {
  // ── Device endpoints ──────────────────────────────────────────────

  listDevices = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user!.companyId!;
    const locationId = req.query.locationId as string | undefined;
    const devices = await deviceService.listDevices(companyId, locationId);
    res.json(createSuccessResponse(devices, 'Devices retrieved'));
  });

  getDevice = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user!.companyId!;
    const { id } = req.params as { id: string };
    const device = await deviceService.getDevice(companyId, id);
    res.json(createSuccessResponse(device, 'Device retrieved'));
  });

  getDeviceStats = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user!.companyId!;
    const locationId = req.query.locationId as string | undefined;
    const stats = await deviceService.getDeviceStats(companyId, locationId);
    res.json(createSuccessResponse(stats, 'Device stats retrieved'));
  });

  listUnassignedDevices = asyncHandler(async (_req: Request, res: Response) => {
    const devices = await deviceService.listUnassignedDevices();
    res.json(createSuccessResponse(devices, 'Unassigned devices retrieved'));
  });

  countUnassigned = asyncHandler(async (_req: Request, res: Response) => {
    const result = await deviceService.countUnassigned();
    res.json(createSuccessResponse(result, 'Unassigned device count retrieved'));
  });

  assignDevice = asyncHandler(async (req: Request, res: Response) => {
    const parsed = assignDeviceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const { id } = req.params as { id: string };
    const device = await deviceService.assignDevice(
      id,
      parsed.data,
      req.user!.id,
    );
    res.json(createSuccessResponse(device, 'Device assigned successfully'));
  });

  claimDevice = asyncHandler(async (req: Request, res: Response) => {
    const parsed = claimDeviceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const companyId = req.user!.companyId!;
    const { serialNumber, deviceName, locationId, timezone } = parsed.data;
    const claimData: { deviceName: string; locationId?: string; timezone?: string } = { deviceName };
    if (locationId !== undefined) claimData.locationId = locationId;
    if (timezone !== undefined) claimData.timezone = timezone;

    const device = await deviceService.claimDevice(
      companyId,
      serialNumber,
      claimData,
      req.user!.id,
    );
    res.json(createSuccessResponse(device, 'Device claimed successfully'));
  });

  updateDevice = asyncHandler(async (req: Request, res: Response) => {
    const parsed = updateDeviceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const companyId = req.user!.companyId!;
    const { id } = req.params as { id: string };
    const device = await deviceService.updateDevice(companyId, id, parsed.data);
    res.json(createSuccessResponse(device, 'Device updated successfully'));
  });

  deactivateDevice = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user!.companyId!;
    const { id } = req.params as { id: string };
    const device = await deviceService.deactivateDevice(companyId, id);
    res.json(createSuccessResponse(device, 'Device deactivated'));
  });

  // ── Mapping endpoints ─────────────────────────────────────────────

  listMappings = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user!.companyId!;
    const mappings = await mappingService.listMappings(companyId);
    res.json(createSuccessResponse(mappings, 'Mappings retrieved'));
  });

  createMapping = asyncHandler(async (req: Request, res: Response) => {
    const parsed = createMappingSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const companyId = req.user!.companyId!;
    const mapping = await mappingService.createMapping(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(mapping, 'Mapping created successfully'));
  });

  deleteMapping = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user!.companyId!;
    const { id } = req.params as { id: string };
    const result = await mappingService.deleteMapping(companyId, id);
    res.json(createSuccessResponse(result, 'Mapping deleted'));
  });

  getUnmappedPunches = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user!.companyId!;
    const unmapped = await mappingService.getUnmappedPunches(companyId);
    res.json(createSuccessResponse(unmapped, 'Unmapped punches retrieved'));
  });

  // ── Punch log endpoint ────────────────────────────────────────────

  listPunchLogs = asyncHandler(async (req: Request, res: Response) => {
    const parsed = attendanceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const companyId = req.user!.companyId!;
    const { from, to, employeeId, deviceSn, status, page, limit } = parsed.data;

    const where: Record<string, unknown> = { companyId };
    if (from || to) {
      const punchTimeFilter: Record<string, Date> = {};
      if (from) punchTimeFilter.gte = new Date(from);
      if (to) punchTimeFilter.lte = new Date(to);
      where.punchTime = punchTimeFilter;
    }
    if (employeeId) where.employeeId = employeeId;
    if (deviceSn) where.serialNumber = deviceSn;
    if (status) where.processingStatus = status;

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      platformPrisma.biometricPunchLog.findMany({
        where,
        orderBy: { punchTime: 'desc' },
        skip,
        take: limit,
      }),
      platformPrisma.biometricPunchLog.count({ where }),
    ]);

    res.json({
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  });
}

export const biometricController = new BiometricController();
