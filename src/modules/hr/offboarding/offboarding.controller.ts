import { Request, Response } from 'express';
import { offboardingService } from './offboarding.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import {
  createExitRequestSchema,
  updateExitRequestSchema,
  updateClearanceSchema,
  exitInterviewSchema,
  computeFnFSchema,
  approveFnFSchema,
} from './offboarding.validators';

export class OffboardingController {
  // ── Exit Requests ─────────────────────────────────────────────────

  listExitRequests = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const status = req.query.status as string | undefined;
    const result = await offboardingService.listExitRequests(companyId, { page, limit, status });
    res.json(createPaginatedResponse(result.exitRequests, result.page, result.limit, result.total, 'Exit requests retrieved'));
  });

  getExitRequest = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const exitRequest = await offboardingService.getExitRequest(companyId, req.params.id!);
    res.json(createSuccessResponse(exitRequest, 'Exit request retrieved'));
  });

  createExitRequest = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createExitRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const exitRequest = await offboardingService.createExitRequest(companyId, parsed.data, req.user?.id);
    res.status(201).json(createSuccessResponse(exitRequest, 'Exit request created'));
  });

  updateExitRequest = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateExitRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const exitRequest = await offboardingService.updateExitRequest(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(exitRequest, 'Exit request updated'));
  });

  // ── Clearances ────────────────────────────────────────────────────

  listClearances = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const clearances = await offboardingService.listClearances(companyId, req.params.id!);
    res.json(createSuccessResponse(clearances, 'Clearances retrieved'));
  });

  updateClearance = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateClearanceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const clearance = await offboardingService.updateClearance(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(clearance, 'Clearance updated'));
  });

  // ── Exit Interview ────────────────────────────────────────────────

  createExitInterview = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = exitInterviewSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const interview = await offboardingService.createExitInterview(companyId, req.params.id!, parsed.data);
    res.status(201).json(createSuccessResponse(interview, 'Exit interview recorded'));
  });

  getExitInterview = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const interview = await offboardingService.getExitInterview(companyId, req.params.id!);
    res.json(createSuccessResponse(interview, 'Exit interview retrieved'));
  });

  // ── F&F Settlement ────────────────────────────────────────────────

  computeFnF = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = computeFnFSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const settlement = await offboardingService.computeFnF(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(settlement, 'F&F settlement computed'));
  });

  listFnFSettlements = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const status = req.query.status as string | undefined;
    const result = await offboardingService.listFnFSettlements(companyId, { page, limit, status });
    res.json(createPaginatedResponse(result.settlements, result.page, result.limit, result.total, 'F&F settlements retrieved'));
  });

  getFnFSettlement = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const settlement = await offboardingService.getFnFSettlement(companyId, req.params.id!);
    res.json(createSuccessResponse(settlement, 'F&F settlement retrieved'));
  });

  approveFnF = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = approveFnFSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const settlement = await offboardingService.approveFnF(companyId, req.params.id!, parsed.data.approvedBy);
    res.json(createSuccessResponse(settlement, 'F&F settlement approved'));
  });

  payFnF = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const settlement = await offboardingService.payFnF(companyId, req.params.id!);
    res.json(createSuccessResponse(settlement, 'F&F settlement marked as paid'));
  });
}

export const offboardingController = new OffboardingController();
