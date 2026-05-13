import { z } from 'zod';

// ── Enums ─────────────────────────────────────────────────────────────

const MachinePriorityEnum = z.enum(['HIGH', 'MEDIUM', 'LOW']);
const MachineStatusEnum = z.enum(['RUNNING', 'IDLE', 'MAINTENANCE', 'DECOMMISSIONED']);

// ── Machine ───────────────────────────────────────────────────────────

export const createMachineSchema = z.object({
  assetCode: z.string().min(1, 'Asset code is required').optional(),
  assetName: z.string().min(1, 'Asset name is required'),
  machineCode: z.string().optional(),
  serialNumber: z.string().optional(),
  categoryId: z.string().optional(),
  typeId: z.string().optional(),
  zoneId: z.string().optional(),
  departmentId: z.string().optional(),
  lineWorkCenter: z.string().optional(),
  priority: MachinePriorityEnum.optional(),
  capacity: z.string().optional(),
  powerRating: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  yearOfManufacture: z.number().int().positive('Year must be positive').optional(),
  lastMaintenanceDate: z.string().datetime().optional(),
  nextMaintenanceDate: z.string().datetime().optional(),
  maintenanceFrequency: z.string().optional(),
  lastCalibrationDate: z.string().datetime().optional(),
  nextCalibrationDate: z.string().datetime().optional(),
  calibrationFrequency: z.string().optional(),
  vendorId: z.string().optional(),
  warrantyExpiry: z.string().datetime().optional(),
  amcStartDate: z.string().datetime().optional(),
  amcEndDate: z.string().datetime().optional(),
  amcVendorId: z.string().optional(),
  status: MachineStatusEnum.optional(),
  idleReason: z.string().optional(),
  locationId: z.string().optional(),
});

export const updateMachineSchema = z.object({
  assetCode: z.string().min(1, 'Asset code is required').optional(),
  assetName: z.string().min(1, 'Asset name is required').optional(),
  machineCode: z.string().nullable().optional(),
  serialNumber: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  typeId: z.string().nullable().optional(),
  zoneId: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  lineWorkCenter: z.string().nullable().optional(),
  priority: MachinePriorityEnum.optional(),
  capacity: z.string().nullable().optional(),
  powerRating: z.string().nullable().optional(),
  make: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  yearOfManufacture: z.number().int().positive('Year must be positive').nullable().optional(),
  lastMaintenanceDate: z.string().datetime().nullable().optional(),
  nextMaintenanceDate: z.string().datetime().nullable().optional(),
  maintenanceFrequency: z.string().nullable().optional(),
  lastCalibrationDate: z.string().datetime().nullable().optional(),
  nextCalibrationDate: z.string().datetime().nullable().optional(),
  calibrationFrequency: z.string().nullable().optional(),
  vendorId: z.string().nullable().optional(),
  warrantyExpiry: z.string().datetime().nullable().optional(),
  amcStartDate: z.string().datetime().nullable().optional(),
  amcEndDate: z.string().datetime().nullable().optional(),
  amcVendorId: z.string().nullable().optional(),
  status: MachineStatusEnum.optional(),
  idleReason: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
});

export const listMachinesSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  search: z.string().optional(),
  status: MachineStatusEnum.optional(),
  categoryId: z.string().optional(),
  typeId: z.string().optional(),
  zoneId: z.string().optional(),
  locationId: z.string().optional(),
  priority: MachinePriorityEnum.optional(),
});

// ── Machine Category ──────────────────────────────────────────────────

export const createMachineCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
});

export const updateMachineCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').optional(),
});

// ── Machine Type ──────────────────────────────────────────────────────

export const createMachineTypeSchema = z.object({
  name: z.string().min(1, 'Type name is required'),
});

export const updateMachineTypeSchema = z.object({
  name: z.string().min(1, 'Type name is required').optional(),
});

// ── Machine Zone ──────────────────────────────────────────────────────

export const createMachineZoneSchema = z.object({
  name: z.string().min(1, 'Zone name is required'),
  code: z.string().optional(),
  locationId: z.string().optional(),
});

export const updateMachineZoneSchema = z.object({
  name: z.string().min(1, 'Zone name is required').optional(),
  code: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
});

// ── Inferred types ────────────────────────────────────────────────────

export type CreateMachineInput = z.infer<typeof createMachineSchema>;
export type UpdateMachineInput = z.infer<typeof updateMachineSchema>;
export type ListMachinesInput = z.infer<typeof listMachinesSchema>;
export type CreateMachineCategoryInput = z.infer<typeof createMachineCategorySchema>;
export type UpdateMachineCategoryInput = z.infer<typeof updateMachineCategorySchema>;
export type CreateMachineTypeInput = z.infer<typeof createMachineTypeSchema>;
export type UpdateMachineTypeInput = z.infer<typeof updateMachineTypeSchema>;
export type CreateMachineZoneInput = z.infer<typeof createMachineZoneSchema>;
export type UpdateMachineZoneInput = z.infer<typeof updateMachineZoneSchema>;
