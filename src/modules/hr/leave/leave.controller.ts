import { Request, Response } from 'express';
import { leaveService } from './leave.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import {
  createLeaveTypeSchema,
  updateLeaveTypeSchema,
  createLeavePolicySchema,
  updateLeavePolicySchema,
  adjustBalanceSchema,
  initializeBalancesSchema,
  createLeaveRequestSchema,
  approveRequestSchema,
  rejectRequestSchema,
  accrueBalancesSchema,
  carryForwardSchema,
  partialCancelRequestSchema,
} from './leave.validators';

export class LeaveController {
  // ── Leave Types ─────────────────────────────────────────────────────

  listLeaveTypes = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: { page: number; limit: number; search?: string } = { page, limit };
    if (req.query.search) opts.search = req.query.search as string;

    const result = await leaveService.listLeaveTypes(companyId, opts);
    res.json(createPaginatedResponse(result.leaveTypes, result.page, result.limit, result.total, 'Leave types retrieved'));
  });

  getLeaveType = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const leaveType = await leaveService.getLeaveType(companyId, req.params.id!);
    res.json(createSuccessResponse(leaveType, 'Leave type retrieved'));
  });

  createLeaveType = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createLeaveTypeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const leaveType = await leaveService.createLeaveType(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(leaveType, 'Leave type created'));
  });

  updateLeaveType = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateLeaveTypeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const leaveType = await leaveService.updateLeaveType(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(leaveType, 'Leave type updated'));
  });

  deleteLeaveType = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await leaveService.deleteLeaveType(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Leave type deleted'));
  });

  // ── Leave Policies ──────────────────────────────────────────────────

  listPolicies = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: { page: number; limit: number; leaveTypeId?: string } = { page, limit };
    if (req.query.leaveTypeId) opts.leaveTypeId = req.query.leaveTypeId as string;

    const result = await leaveService.listPolicies(companyId, opts);
    res.json(createPaginatedResponse(result.policies, result.page, result.limit, result.total, 'Leave policies retrieved'));
  });

  createPolicy = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createLeavePolicySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const policy = await leaveService.createPolicy(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(policy, 'Leave policy created'));
  });

  updatePolicy = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateLeavePolicySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const policy = await leaveService.updatePolicy(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(policy, 'Leave policy updated'));
  });

  deletePolicy = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await leaveService.deletePolicy(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Leave policy deleted'));
  });

  // ── Leave Balances ──────────────────────────────────────────────────

  listBalances = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: { page: number; limit: number; employeeId?: string; year?: number } = { page, limit };
    if (req.query.employeeId) opts.employeeId = req.query.employeeId as string;
    if (req.query.year) opts.year = parseInt(req.query.year as string, 10);

    const result = await leaveService.listBalances(companyId, opts);
    res.json(createPaginatedResponse(result.balances, result.page, result.limit, result.total, 'Leave balances retrieved'));
  });

  adjustBalance = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = adjustBalanceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const result = await leaveService.adjustBalance(companyId, parsed.data);
    res.json(createSuccessResponse(result, 'Leave balance adjusted'));
  });

  initializeBalances = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = initializeBalancesSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const result = await leaveService.initializeBalances(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(result, 'Leave balances initialized'));
  });

  // ── Leave Requests ──────────────────────────────────────────────────

  listRequests = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: { page: number; limit: number; employeeId?: string; status?: string; fromDate?: string; toDate?: string } = { page, limit };
    if (req.query.employeeId) opts.employeeId = req.query.employeeId as string;
    if (req.query.status) opts.status = req.query.status as string;
    if (req.query.fromDate) opts.fromDate = req.query.fromDate as string;
    if (req.query.toDate) opts.toDate = req.query.toDate as string;

    const result = await leaveService.listRequests(companyId, opts);
    res.json(createPaginatedResponse(result.requests, result.page, result.limit, result.total, 'Leave requests retrieved'));
  });

  getRequest = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const request = await leaveService.getRequest(companyId, req.params.id!);
    res.json(createSuccessResponse(request, 'Leave request retrieved'));
  });

  createRequest = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createLeaveRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const request = await leaveService.createRequest(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(request, 'Leave request created'));
  });

  approveRequest = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = approveRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const result = await leaveService.approveRequest(companyId, req.params.id!, userId);
    res.json(createSuccessResponse(result, 'Leave request approved'));
  });

  rejectRequest = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = rejectRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const result = await leaveService.rejectRequest(companyId, req.params.id!, userId, parsed.data.note);
    res.json(createSuccessResponse(result, 'Leave request rejected'));
  });

  cancelRequest = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await leaveService.cancelRequest(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Leave request cancelled'));
  });

  // ── Partial Cancel ──────────────────────────────────────────────────

  partialCancelRequest = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = partialCancelRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const result = await leaveService.partialCancelRequest(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(result, 'Leave request partially cancelled'));
  });

  // ── Accrual & Carry-Forward ────────────────────────────────────────

  accrueBalances = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = accrueBalancesSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const result = await leaveService.accrueBalances(companyId, parsed.data.month, parsed.data.year, parsed.data.dayOfMonth);
    res.json(createSuccessResponse(result, 'Leave balances accrued'));
  });

  carryForwardBalances = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = carryForwardSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const result = await leaveService.carryForwardBalances(companyId, parsed.data.fromYear, parsed.data.toYear);
    res.json(createSuccessResponse(result, 'Leave balances carried forward'));
  });

  // ── Summary ─────────────────────────────────────────────────────────

  getLeaveSummary = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const summary = await leaveService.getLeaveSummary(companyId);
    res.json(createSuccessResponse(summary, 'Leave summary retrieved'));
  });
}

export const leaveController = new LeaveController();
