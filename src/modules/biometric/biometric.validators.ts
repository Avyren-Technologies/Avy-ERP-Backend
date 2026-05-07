import { z } from 'zod';

// Transform empty strings to undefined/null so the service never receives ""
const optionalLocationId = z.string().transform(v => v || undefined).optional();
const nullableLocationId = z.string().nullable().transform(v => v === '' ? null : v).optional();

export const assignDeviceSchema = z.object({
  companyId: z.string().min(1, 'companyId is required'),
  deviceName: z.string().min(1, 'deviceName is required').max(100, 'deviceName must be 100 characters or less'),
  locationId: optionalLocationId,
  timezone: z.string().transform(v => v || undefined).optional(),
});

export const claimDeviceSchema = z.object({
  serialNumber: z.string().min(1, 'serialNumber is required'),
  deviceName: z.string().min(1, 'deviceName is required').max(100, 'deviceName must be 100 characters or less'),
  locationId: optionalLocationId,
  timezone: z.string().transform(v => v || undefined).optional(),
});

export const updateDeviceSchema = z.object({
  deviceName: z.string().max(100, 'deviceName must be 100 characters or less').optional(),
  locationId: nullableLocationId,
  timezone: z.string().transform(v => v || undefined).optional(),
  isActive: z.boolean().optional(),
});

export const createMappingSchema = z.object({
  employeeId: z.string().min(1, 'employeeId is required'),
  deviceSerialNumber: z.string().min(1, 'deviceSerialNumber is required'),
  deviceUserId: z.string().min(1, 'deviceUserId is required'),
});

export const attendanceQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  employeeId: z.string().optional(),
  deviceSn: z.string().optional(),
  status: z.enum(['PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
