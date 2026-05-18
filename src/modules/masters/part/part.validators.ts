import { z } from 'zod';

// ── Enums ─────────────────────────────────────────────────────────────

const PartTypeEnum = z.enum(['FINISH_PART', 'RAW_MATERIAL', 'SEMI_FINISHED', 'CONSUMABLE', 'SPARE']);
const PartStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'DISCONTINUED']);

// ── Part ──────────────────────────────────────────────────────────────

export const createPartSchema = z.object({
  partNumber: z.string().min(1, 'Part number is required').optional(),
  name: z.string().min(1, 'Part name is required'),
  engineeringPartNo: z.string().optional(),
  categoryId: z.string().optional(),
  productModelId: z.string().optional(),
  uomId: z.string().optional(),
  componentTypeId: z.string().optional(),
  partType: PartTypeEnum.optional(),
  revision: z.string().optional(),
  drawingReference: z.string().optional(),
  hsnCode: z.string().optional(),
  weight: z.number().positive('Weight must be positive').optional(),
  dimensions: z.string().optional(),
  isBatchTracked: z.boolean().optional(),
  isSerialTracked: z.boolean().optional(),
  isBomEnabled: z.boolean().optional(),
  isQcRequired: z.boolean().optional(),
  isInventoryItem: z.boolean().optional(),
  preferredVendorId: z.string().optional(),
  status: PartStatusEnum.optional(),
  locationId: z.string().optional(),
});

export const updatePartSchema = z.object({
  partNumber: z.string().min(1, 'Part number is required').optional(),
  name: z.string().min(1, 'Part name is required').optional(),
  engineeringPartNo: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  productModelId: z.string().nullable().optional(),
  uomId: z.string().nullable().optional(),
  componentTypeId: z.string().nullable().optional(),
  partType: PartTypeEnum.optional(),
  revision: z.string().nullable().optional(),
  drawingReference: z.string().nullable().optional(),
  hsnCode: z.string().nullable().optional(),
  weight: z.number().positive('Weight must be positive').nullable().optional(),
  dimensions: z.string().nullable().optional(),
  isBatchTracked: z.boolean().optional(),
  isSerialTracked: z.boolean().optional(),
  isBomEnabled: z.boolean().optional(),
  isQcRequired: z.boolean().optional(),
  isInventoryItem: z.boolean().optional(),
  preferredVendorId: z.string().nullable().optional(),
  status: PartStatusEnum.optional(),
  locationId: z.string().nullable().optional(),
});

export const listPartsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  search: z.string().optional(),
  status: PartStatusEnum.optional(),
  categoryId: z.string().optional(),
  locationId: z.string().optional(),
  partType: PartTypeEnum.optional(),
});

// ── Part Category ─────────────────────────────────────────────────────

export const createPartCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
});

export const updatePartCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').optional(),
  code: z.string().nullable().optional(),
});

// ── Product Model ─────────────────────────────────────────────────────

export const createProductModelSchema = z.object({
  name: z.string().min(1, 'Product model name is required'),
});

export const updateProductModelSchema = z.object({
  name: z.string().min(1, 'Product model name is required').optional(),
  code: z.string().nullable().optional(),
});

// ── Unit of Measure ───────────────────────────────────────────────────

export const createUomSchema = z.object({
  name: z.string().min(1, 'UOM name is required'),
  abbreviation: z.string().min(1, 'Abbreviation is required'),
});

export const updateUomSchema = z.object({
  name: z.string().min(1, 'UOM name is required').optional(),
  abbreviation: z.string().min(1, 'Abbreviation is required').optional(),
});

// ── Part Component Type ──────────────────────────────────────────────

export const createPartComponentTypeSchema = z.object({
  name: z.string().min(1, 'Component type name is required'),
});

export const updatePartComponentTypeSchema = z.object({
  name: z.string().min(1, 'Component type name is required').optional(),
  code: z.string().nullable().optional(),
});

// ── Inferred types ────────────────────────────────────────────────────

export type CreatePartInput = z.infer<typeof createPartSchema>;
export type UpdatePartInput = z.infer<typeof updatePartSchema>;
export type ListPartsInput = z.infer<typeof listPartsSchema>;
export type CreatePartCategoryInput = z.infer<typeof createPartCategorySchema>;
export type UpdatePartCategoryInput = z.infer<typeof updatePartCategorySchema>;
export type CreateProductModelInput = z.infer<typeof createProductModelSchema>;
export type UpdateProductModelInput = z.infer<typeof updateProductModelSchema>;
export type CreateUomInput = z.infer<typeof createUomSchema>;
export type UpdateUomInput = z.infer<typeof updateUomSchema>;
export type CreatePartComponentTypeInput = z.infer<typeof createPartComponentTypeSchema>;
export type UpdatePartComponentTypeInput = z.infer<typeof updatePartComponentTypeSchema>;
