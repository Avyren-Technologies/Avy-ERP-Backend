import { Request, Response } from 'express';
import { recurringPassService } from './recurring-pass.service';
import { createSuccessResponse, createPaginatedResponse } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import {
  createRecurringPassSchema,
  updateRecurringPassSchema,
  revokePassSchema,
  recurringPassListQuerySchema,
} from './recurring-pass.validators';

class RecurringPassController {

  list = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = recurringPassListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const { data, total } = await recurringPassService.list(companyId, parsed.data);
    res.json(createPaginatedResponse(data, parsed.data.page, parsed.data.limit, total, 'Recurring passes retrieved'));
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createRecurringPassSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const pass = await recurringPassService.create(companyId, parsed.data, req.user!.id);
    res.status(201).json(createSuccessResponse(pass, 'Recurring pass created'));
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const pass = await recurringPassService.getById(companyId, req.params.id!);
    res.json(createSuccessResponse(pass, 'Recurring pass retrieved'));
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateRecurringPassSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const pass = await recurringPassService.update(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(pass, 'Recurring pass updated'));
  });

  revoke = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = revokePassSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const pass = await recurringPassService.revoke(companyId, req.params.id!, parsed.data.reason, req.user!.id);
    res.json(createSuccessResponse(pass, 'Recurring pass revoked'));
  });

  checkIn = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { gateId } = req.body;
    if (!gateId) throw ApiError.badRequest('Gate ID is required');

    const visit = await recurringPassService.checkInViaPass(companyId, req.params.id!, gateId, req.user!.id);
    res.status(201).json(createSuccessResponse(visit, 'Checked in via recurring pass'));
  });
}

export const recurringPassController = new RecurringPassController();
