import { Request, Response } from 'express';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { createSuccessResponse, createPaginatedResponse } from '../../../shared/utils';
import { visitService } from './visit.service';
import type { CreateVisitInput } from './visit.types';
import {
  createVisitSchema,
  updateVisitSchema,
  checkInSchema,
  checkOutSchema,
  extendVisitSchema,
  approveRejectSchema,
  visitListQuerySchema,
  completeInductionSchema,
} from './visit.validators';

class VisitController {

  createVisit = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');
    const parsed = createVisitSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));
    const result = await visitService.createVisit(companyId, parsed.data, req.user!.employeeId ?? req.user!.id);
    res.status(201).json(createSuccessResponse(result, 'Visit pre-registration created'));
  });

  listVisits = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');
    const parsed = visitListQuerySchema.safeParse(req.query);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));
    const { data, total } = await visitService.listVisits(companyId, parsed.data);
    res.json(createPaginatedResponse(data, parsed.data.page, parsed.data.limit, total));
  });

  getVisitById = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');
    const id = req.params.id;
    if (!id) throw ApiError.badRequest('Visit ID is required');
    const result = await visitService.getVisitById(companyId, id);
    res.json(createSuccessResponse(result, 'Visit retrieved'));
  });

  getVisitByCode = asyncHandler(async (req: Request, res: Response) => {
    const visitCode = req.params.visitCode;
    if (!visitCode) throw ApiError.badRequest('Visit code is required');
    const result = await visitService.getVisitByCode(visitCode);
    res.json(createSuccessResponse(result, 'Visit retrieved'));
  });

  updateVisit = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');
    const id = req.params.id;
    if (!id) throw ApiError.badRequest('Visit ID is required');
    const parsed = updateVisitSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));
    const result = await visitService.updateVisit(companyId, id, parsed.data as Partial<CreateVisitInput>, req.user!.employeeId ?? req.user!.id);
    res.json(createSuccessResponse(result, 'Visit updated'));
  });

  cancelVisit = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');
    const id = req.params.id;
    if (!id) throw ApiError.badRequest('Visit ID is required');
    const result = await visitService.cancelVisit(companyId, id, req.user!.employeeId ?? req.user!.id);
    res.json(createSuccessResponse(result, 'Visit cancelled'));
  });

  checkIn = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');
    const id = req.params.id;
    if (!id) throw ApiError.badRequest('Visit ID is required');
    const parsed = checkInSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));
    const result = await visitService.checkIn(companyId, id, parsed.data, req.user!.employeeId ?? req.user!.id);
    res.json(createSuccessResponse(result, 'Visitor checked in'));
  });

  checkOut = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');
    const id = req.params.id;
    if (!id) throw ApiError.badRequest('Visit ID is required');
    const parsed = checkOutSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));
    const result = await visitService.checkOut(companyId, id, parsed.data, req.user!.employeeId ?? req.user!.id);
    res.json(createSuccessResponse(result, 'Visitor checked out'));
  });

  approve = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');
    const id = req.params.id;
    if (!id) throw ApiError.badRequest('Visit ID is required');
    const parsed = approveRejectSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));
    const result = await visitService.approveVisit(companyId, id, req.user!.employeeId ?? req.user!.id, parsed.data.notes);
    res.json(createSuccessResponse(result, 'Visit approved'));
  });

  reject = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');
    const id = req.params.id;
    if (!id) throw ApiError.badRequest('Visit ID is required');
    const parsed = approveRejectSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));
    const result = await visitService.rejectVisit(companyId, id, req.user!.employeeId ?? req.user!.id, parsed.data.notes);
    res.json(createSuccessResponse(result, 'Visit rejected'));
  });

  extend = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');
    const id = req.params.id;
    if (!id) throw ApiError.badRequest('Visit ID is required');
    const parsed = extendVisitSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));
    const result = await visitService.extendVisit(companyId, id, parsed.data, req.user!.employeeId ?? req.user!.id);
    res.json(createSuccessResponse(result, 'Visit extended'));
  });

  completeInduction = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');
    const id = req.params.id;
    if (!id) throw ApiError.badRequest('Visit ID is required');
    const parsed = completeInductionSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));
    const result = await visitService.completeInduction(companyId, id, parsed.data.score, parsed.data.passed);
    res.json(createSuccessResponse(result, 'Induction recorded'));
  });
}

export const visitController = new VisitController();
