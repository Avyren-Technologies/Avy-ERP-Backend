import { Request, Response } from 'express';
import { groupVisitService } from './group-visit.service';
import { createSuccessResponse, createPaginatedResponse } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import {
  createGroupVisitSchema,
  updateGroupVisitSchema,
  batchCheckInSchema,
  batchCheckOutSchema,
  groupVisitListQuerySchema,
} from './group-visit.validators';

class GroupVisitController {

  list = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = groupVisitListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const { data, total } = await groupVisitService.list(companyId, parsed.data);
    res.json(createPaginatedResponse(data, parsed.data.page, parsed.data.limit, total, 'Group visits retrieved'));
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createGroupVisitSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const group = await groupVisitService.create(companyId, parsed.data, req.user!.id);
    res.status(201).json(createSuccessResponse(group, 'Group visit created'));
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const group = await groupVisitService.getById(companyId, req.params.id!);
    res.json(createSuccessResponse(group, 'Group visit retrieved'));
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateGroupVisitSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const group = await groupVisitService.update(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(group, 'Group visit updated'));
  });

  batchCheckIn = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = batchCheckInSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const visits = await groupVisitService.batchCheckIn(
      companyId,
      req.params.id!,
      parsed.data.memberIds,
      parsed.data.checkInGateId,
      req.user!.id,
    );
    res.status(201).json(createSuccessResponse(visits, `${visits.length} members checked in`));
  });

  batchCheckOut = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = batchCheckOutSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const group = await groupVisitService.batchCheckOut(
      companyId,
      req.params.id!,
      parsed.data.memberIds,
      parsed.data.checkOutGateId,
      parsed.data.checkOutMethod,
      req.user!.id,
    );
    res.json(createSuccessResponse(group, 'Batch check-out completed'));
  });
}

export const groupVisitController = new GroupVisitController();
