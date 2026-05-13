import { Request, Response } from 'express';
import { machineService } from './machine.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import {
  createMachineSchema,
  updateMachineSchema,
  listMachinesSchema,
  createMachineCategorySchema,
  updateMachineCategorySchema,
  createMachineTypeSchema,
  updateMachineTypeSchema,
  createMachineZoneSchema,
  updateMachineZoneSchema,
} from './machine.validators';

export class MachineController {
  // ── Machines ────────────────────────────────────────────────────────

  listMachines = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = listMachinesSchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const { page, limit } = getPaginationParams(req.query);
    const result = await machineService.listMachines(companyId, {
      page,
      limit,
      search: parsed.data.search,
      status: parsed.data.status,
      categoryId: parsed.data.categoryId,
      typeId: parsed.data.typeId,
      zoneId: parsed.data.zoneId,
      locationId: parsed.data.locationId,
      priority: parsed.data.priority,
    });

    res.json(createPaginatedResponse(result.machines, result.page, result.limit, result.total, 'Machines retrieved'));
  });

  getMachine = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const machine = await machineService.getMachine(companyId, req.params.id!);
    res.json(createSuccessResponse(machine, 'Machine retrieved'));
  });

  createMachine = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) throw ApiError.badRequest('Company ID is required');

    const parsed = createMachineSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const machine = await machineService.createMachine(companyId, parsed.data, userId);
    res.status(201).json(createSuccessResponse(machine, 'Machine created'));
  });

  updateMachine = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateMachineSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const machine = await machineService.updateMachine(companyId, req.params.id!, parsed.data, userId);
    res.json(createSuccessResponse(machine, 'Machine updated'));
  });

  deleteMachine = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) throw ApiError.badRequest('Company ID is required');

    const result = await machineService.deleteMachine(companyId, req.params.id!, userId);
    res.json(createSuccessResponse(result, 'Machine deleted'));
  });

  // ── Machine Categories ──────────────────────────────────────────────

  listCategories = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const categories = await machineService.listCategories(companyId);
    res.json(createSuccessResponse(categories, 'Machine categories retrieved'));
  });

  createCategory = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createMachineCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const category = await machineService.createCategory(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(category, 'Machine category created'));
  });

  updateCategory = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateMachineCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const category = await machineService.updateCategory(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(category, 'Machine category updated'));
  });

  deleteCategory = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await machineService.deleteCategory(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Machine category deleted'));
  });

  // ── Machine Types ───────────────────────────────────────────────────

  listTypes = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const types = await machineService.listTypes(companyId);
    res.json(createSuccessResponse(types, 'Machine types retrieved'));
  });

  createType = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createMachineTypeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const type = await machineService.createType(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(type, 'Machine type created'));
  });

  updateType = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateMachineTypeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const type = await machineService.updateType(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(type, 'Machine type updated'));
  });

  deleteType = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await machineService.deleteType(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Machine type deleted'));
  });

  // ── Machine Zones ───────────────────────────────────────────────────

  listZones = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const locationId = req.query.locationId as string | undefined;
    const zones = await machineService.listZones(companyId, locationId);
    res.json(createSuccessResponse(zones, 'Machine zones retrieved'));
  });

  createZone = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createMachineZoneSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const zone = await machineService.createZone(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(zone, 'Machine zone created'));
  });

  updateZone = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateMachineZoneSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const zone = await machineService.updateZone(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(zone, 'Machine zone updated'));
  });

  deleteZone = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await machineService.deleteZone(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Machine zone deleted'));
  });
}

export const machineController = new MachineController();
