import { Request, Response } from 'express';
import { essService } from './ess.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import {
  essConfigSchema,
  createWorkflowSchema,
  updateWorkflowSchema,
  processApprovalSchema,
  createNotificationTemplateSchema,
  updateNotificationTemplateSchema,
  createNotificationRuleSchema,
  updateNotificationRuleSchema,
  createITDeclarationSchema,
  updateITDeclarationSchema,
  applyLeaveSchema,
  regularizeAttendanceSchema,
  createDelegateSchema,
} from './ess.validators';

export class ESSController {
  // ── ESS Config ────────────────────────────────────────────────────

  getESSConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const config = await essService.getESSConfig(companyId);
    res.json(createSuccessResponse(config, 'ESS config retrieved'));
  });

  updateESSConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = essConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const config = await essService.updateESSConfig(companyId, parsed.data);
    res.json(createSuccessResponse(config, 'ESS config updated'));
  });

  // ── Approval Workflows ────────────────────────────────────────────

  listWorkflows = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const workflows = await essService.listWorkflows(companyId);
    res.json(createSuccessResponse(workflows, 'Approval workflows retrieved'));
  });

  getWorkflow = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const workflow = await essService.getWorkflow(companyId, req.params.id!);
    res.json(createSuccessResponse(workflow, 'Approval workflow retrieved'));
  });

  createWorkflow = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createWorkflowSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const workflow = await essService.createWorkflow(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(workflow, 'Approval workflow created'));
  });

  updateWorkflow = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateWorkflowSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const workflow = await essService.updateWorkflow(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(workflow, 'Approval workflow updated'));
  });

  deleteWorkflow = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await essService.deleteWorkflow(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Approval workflow deleted'));
  });

  // ── Approval Requests ─────────────────────────────────────────────

  listRequests = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.status) opts.status = req.query.status as string;
    if (req.query.entityType) opts.entityType = req.query.entityType as string;

    const result = await essService.listRequests(companyId, opts);
    res.json(createPaginatedResponse(result.requests, result.page, result.limit, result.total, 'Approval requests retrieved'));
  });

  getPendingRequests = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const requests = await essService.getPendingForUser(companyId, userId);
    res.json(createSuccessResponse(requests, 'Pending approval requests retrieved'));
  });

  getRequest = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const request = await essService.getRequest(companyId, req.params.id!);
    res.json(createSuccessResponse(request, 'Approval request retrieved'));
  });

  approveRequest = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const parsed = processApprovalSchema.safeParse({ ...req.body, action: 'approve' });
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const result = await essService.approveStep(companyId, req.params.id!, userId, parsed.data.note);
    res.json(createSuccessResponse(result, 'Approval step processed'));
  });

  rejectRequest = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const parsed = processApprovalSchema.safeParse({ ...req.body, action: 'reject' });
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    if (!parsed.data.note) {
      throw ApiError.badRequest('A note is required when rejecting');
    }

    const result = await essService.rejectRequest(companyId, req.params.id!, userId, parsed.data.note);
    res.json(createSuccessResponse(result, 'Request rejected'));
  });

  // ── Notification Templates ────────────────────────────────────────

  listTemplates = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const result = await essService.listTemplates(companyId, { page, limit });
    res.json(createPaginatedResponse(result.templates, result.page, result.limit, result.total, 'Notification templates retrieved'));
  });

  getTemplate = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const template = await essService.getTemplate(companyId, req.params.id!);
    res.json(createSuccessResponse(template, 'Notification template retrieved'));
  });

  createTemplate = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createNotificationTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const template = await essService.createTemplate(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(template, 'Notification template created'));
  });

  updateTemplate = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateNotificationTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const template = await essService.updateTemplate(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(template, 'Notification template updated'));
  });

  deleteTemplate = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await essService.deleteTemplate(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Notification template deleted'));
  });

  // ── Notification Rules ────────────────────────────────────────────

  listRules = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const result = await essService.listRules(companyId, { page, limit });
    res.json(createPaginatedResponse(result.rules, result.page, result.limit, result.total, 'Notification rules retrieved'));
  });

  getRuleById = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const rule = await essService.getRule(companyId, req.params.id!);
    res.json(createSuccessResponse(rule, 'Notification rule retrieved'));
  });

  createRule = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createNotificationRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const rule = await essService.createRule(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(rule, 'Notification rule created'));
  });

  updateRule = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateNotificationRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const rule = await essService.updateRule(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(rule, 'Notification rule updated'));
  });

  deleteRule = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await essService.deleteRule(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Notification rule deleted'));
  });

  // ── IT Declarations ───────────────────────────────────────────────

  listDeclarations = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.employeeId) opts.employeeId = req.query.employeeId as string;
    if (req.query.financialYear) opts.financialYear = req.query.financialYear as string;
    if (req.query.status) opts.status = req.query.status as string;

    const result = await essService.listDeclarations(companyId, opts);
    res.json(createPaginatedResponse(result.declarations, result.page, result.limit, result.total, 'IT declarations retrieved'));
  });

  getDeclaration = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const declaration = await essService.getDeclaration(companyId, req.params.id!);
    res.json(createSuccessResponse(declaration, 'IT declaration retrieved'));
  });

  createDeclaration = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createITDeclarationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const declaration = await essService.createDeclaration(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(declaration, 'IT declaration created'));
  });

  updateDeclaration = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateITDeclarationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const declaration = await essService.updateDeclaration(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(declaration, 'IT declaration updated'));
  });

  submitDeclaration = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const declaration = await essService.submitDeclaration(companyId, req.params.id!);
    res.json(createSuccessResponse(declaration, 'IT declaration submitted'));
  });

  verifyDeclaration = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const declaration = await essService.verifyDeclaration(companyId, req.params.id!, userId);
    res.json(createSuccessResponse(declaration, 'IT declaration verified'));
  });

  lockDeclaration = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const declaration = await essService.lockDeclaration(companyId, req.params.id!);
    res.json(createSuccessResponse(declaration, 'IT declaration locked'));
  });

  // ── Manager Delegates ────────────────────────────────────────────

  listDelegates = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const managerId = req.query.managerId as string | undefined;
    const delegates = await essService.listDelegates(companyId, managerId);
    res.json(createSuccessResponse(delegates, 'Delegates retrieved'));
  });

  createDelegate = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createDelegateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const delegate = await essService.createDelegate(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(delegate, 'Delegate created'));
  });

  revokeDelegate = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await essService.revokeDelegate(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Delegate revoked'));
  });

  // ── ESS Self-Service ──────────────────────────────────────────────

  getMyProfile = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    // Derive employeeId from authenticated user
    const employeeId = req.query.employeeId as string;
    if (!employeeId) throw ApiError.badRequest('Employee ID is required');

    const profile = await essService.getMyProfile(companyId, employeeId);
    res.json(createSuccessResponse(profile, 'Profile retrieved'));
  });

  getMyPayslips = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = req.query.employeeId as string;
    if (!employeeId) throw ApiError.badRequest('Employee ID is required');

    const payslips = await essService.getMyPayslips(companyId, employeeId);
    res.json(createSuccessResponse(payslips, 'Payslips retrieved'));
  });

  getMyLeaveBalance = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = req.query.employeeId as string;
    if (!employeeId) throw ApiError.badRequest('Employee ID is required');

    const balances = await essService.getMyLeaveBalance(companyId, employeeId);
    res.json(createSuccessResponse(balances, 'Leave balances retrieved'));
  });

  getMyAttendance = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = req.query.employeeId as string;
    if (!employeeId) throw ApiError.badRequest('Employee ID is required');

    const month = parseInt(req.query.month as string, 10) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string, 10) || new Date().getFullYear();

    const records = await essService.getMyAttendance(companyId, employeeId, month, year);
    res.json(createSuccessResponse(records, 'Attendance records retrieved'));
  });

  getMyDeclarations = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = req.query.employeeId as string;
    if (!employeeId) throw ApiError.badRequest('Employee ID is required');

    const declarations = await essService.getMyDeclarations(companyId, employeeId);
    res.json(createSuccessResponse(declarations, 'IT declarations retrieved'));
  });

  applyLeave = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = req.body.employeeId as string;
    if (!employeeId) throw ApiError.badRequest('Employee ID is required');

    const parsed = applyLeaveSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const leaveRequest = await essService.applyLeave(companyId, employeeId, parsed.data);
    res.status(201).json(createSuccessResponse(leaveRequest, 'Leave application submitted'));
  });

  regularizeAttendance = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = req.body.employeeId as string;
    if (!employeeId) throw ApiError.badRequest('Employee ID is required');

    const parsed = regularizeAttendanceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const override = await essService.regularizeAttendance(companyId, employeeId, parsed.data);
    res.status(201).json(createSuccessResponse(override, 'Attendance regularization submitted'));
  });

  // ── MSS Manager Self-Service ──────────────────────────────────────

  getTeamMembers = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const managerId = req.query.managerId as string;
    if (!managerId) throw ApiError.badRequest('Manager ID is required');

    const members = await essService.getTeamMembers(companyId, managerId);
    res.json(createSuccessResponse(members, 'Team members retrieved'));
  });

  getPendingManagerApprovals = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const managerId = req.query.managerId as string;
    if (!managerId) throw ApiError.badRequest('Manager ID is required');

    const approvals = await essService.getPendingApprovals(companyId, managerId);
    res.json(createSuccessResponse(approvals, 'Pending approvals retrieved'));
  });

  getTeamAttendance = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const managerId = req.query.managerId as string;
    if (!managerId) throw ApiError.badRequest('Manager ID is required');

    const date: string = (req.query.date as string) || new Date().toISOString().split('T')[0]!;

    const records = await essService.getTeamAttendance(companyId, managerId, date);
    res.json(createSuccessResponse(records, 'Team attendance retrieved'));
  });

  getTeamLeaveCalendar = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const managerId = req.query.managerId as string;
    if (!managerId) throw ApiError.badRequest('Manager ID is required');

    const month = parseInt(req.query.month as string, 10) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string, 10) || new Date().getFullYear();

    const calendar = await essService.getTeamLeaveCalendar(companyId, managerId, month, year);
    res.json(createSuccessResponse(calendar, 'Team leave calendar retrieved'));
  });
}

export const essController = new ESSController();
