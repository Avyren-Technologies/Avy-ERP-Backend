import { Request, Response } from 'express';
import { partService } from './part.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import {
  createPartSchema,
  updatePartSchema,
  listPartsSchema,
  createPartCategorySchema,
  updatePartCategorySchema,
  createProductModelSchema,
  updateProductModelSchema,
  createUomSchema,
  updateUomSchema,
} from './part.validators';

export class PartController {
  // ── Parts ───────────────────────────────────────────────────────────

  listParts = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = listPartsSchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const { page, limit } = getPaginationParams(req.query);
    const result = await partService.listParts(companyId, {
      page,
      limit,
      search: parsed.data.search,
      status: parsed.data.status,
      categoryId: parsed.data.categoryId,
      locationId: parsed.data.locationId,
      partType: parsed.data.partType,
    });

    res.json(createPaginatedResponse(result.parts, result.page, result.limit, result.total, 'Parts retrieved'));
  });

  getPart = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const part = await partService.getPart(companyId, req.params.id!);
    res.json(createSuccessResponse(part, 'Part retrieved'));
  });

  createPart = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) throw ApiError.badRequest('Company ID is required');

    const parsed = createPartSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const part = await partService.createPart(companyId, parsed.data, userId);
    res.status(201).json(createSuccessResponse(part, 'Part created'));
  });

  updatePart = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) throw ApiError.badRequest('Company ID is required');

    const parsed = updatePartSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const part = await partService.updatePart(companyId, req.params.id!, parsed.data, userId);
    res.json(createSuccessResponse(part, 'Part updated'));
  });

  deletePart = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) throw ApiError.badRequest('Company ID is required');

    const result = await partService.deletePart(companyId, req.params.id!, userId);
    res.json(createSuccessResponse(result, 'Part deleted'));
  });

  // ── Part Categories ─────────────────────────────────────────────────

  listCategories = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const categories = await partService.listCategories(companyId);
    res.json(createSuccessResponse(categories, 'Part categories retrieved'));
  });

  createCategory = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createPartCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const category = await partService.createCategory(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(category, 'Part category created'));
  });

  updateCategory = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updatePartCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const category = await partService.updateCategory(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(category, 'Part category updated'));
  });

  deleteCategory = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await partService.deleteCategory(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Part category deleted'));
  });

  // ── Product Models ──────────────────────────────────────────────────

  listProductModels = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const models = await partService.listProductModels(companyId);
    res.json(createSuccessResponse(models, 'Product models retrieved'));
  });

  createProductModel = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createProductModelSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const model = await partService.createProductModel(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(model, 'Product model created'));
  });

  updateProductModel = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateProductModelSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const model = await partService.updateProductModel(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(model, 'Product model updated'));
  });

  deleteProductModel = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await partService.deleteProductModel(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Product model deleted'));
  });

  // ── Units of Measure ────────────────────────────────────────────────

  listUoms = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const uoms = await partService.listUoms(companyId);
    res.json(createSuccessResponse(uoms, 'Units of measure retrieved'));
  });

  createUom = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createUomSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const uom = await partService.createUom(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(uom, 'Unit of measure created'));
  });

  updateUom = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateUomSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const uom = await partService.updateUom(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(uom, 'Unit of measure updated'));
  });

  deleteUom = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await partService.deleteUom(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Unit of measure deleted'));
  });
}

export const partController = new PartController();
