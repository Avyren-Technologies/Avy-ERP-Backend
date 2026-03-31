import { Request, Response } from 'express';
import { essService } from './ess.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { platformPrisma } from '../../../config/database';
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
  checkInSchema,
  checkOutSchema,
} from './ess.validators';

/** Haversine distance in metres between two lat/lng points. */
function calculateDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

    const config = await essService.updateESSConfig(companyId, parsed.data, req.user?.id);
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

  /** Resolve employeeId from authenticated user or optional query param (admin override).
   *  Performs DB lookup as fallback if JWT doesn't contain employeeId (e.g., employee
   *  was linked after last login). Auto-links user→employee by email match if found. */
  private async resolveEmployeeId(req: Request): Promise<string | null> {
    // 1. Explicit query param (admin viewing another employee's data)
    if (req.query.employeeId) return req.query.employeeId as string;

    // 2. From JWT token (set during login if user was already linked)
    if ((req.user as any)?.employeeId) return (req.user as any).employeeId;

    // 3. Fallback: look up User → Employee link from DB
    const userId = req.user?.id;
    const companyId = req.user?.companyId;
    if (!userId || !companyId) return null;

    const user = await platformPrisma.user.findUnique({
      where: { id: userId },
      select: { employeeId: true, email: true },
    });

    // 3a. User has employeeId in DB (linked after last login)
    if (user?.employeeId) return user.employeeId;

    // 3b. Try matching by email (user email = employee officialEmail or personalEmail)
    if (user?.email) {
      const employee = await platformPrisma.employee.findFirst({
        where: {
          companyId,
          status: { not: 'EXITED' },
          OR: [
            { officialEmail: user.email },
            { personalEmail: user.email },
          ],
        },
        select: { id: true },
      });
      if (employee) {
        // Auto-link for future requests (so this DB lookup only happens once)
        await platformPrisma.user.update({
          where: { id: userId },
          data: { employeeId: employee.id },
        });
        return employee.id;
      }
    }

    return null;
  }

  /** Resolve managerId from query param or authenticated user's employee link. */
  private async resolveManagerId(req: Request): Promise<string | null> {
    if (req.query.managerId) return req.query.managerId as string;
    return this.resolveEmployeeId(req);
  }

  private static readonly NOT_LINKED_MSG = 'No employee record linked to your account. Please contact HR.';

  getMyProfile = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = await this.resolveEmployeeId(req);
    if (!employeeId) {
      res.json(createSuccessResponse(null, ESSController.NOT_LINKED_MSG));
      return;
    }
    const profile = await essService.getMyProfile(companyId, employeeId);
    res.json(createSuccessResponse(profile, 'Profile retrieved'));
  });

  getMyPayslips = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = await this.resolveEmployeeId(req);
    if (!employeeId) {
      res.json(createSuccessResponse([], ESSController.NOT_LINKED_MSG));
      return;
    }
    const payslips = await essService.getMyPayslips(companyId, employeeId);
    res.json(createSuccessResponse(payslips, 'Payslips retrieved'));
  });

  getMyLeaveBalance = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = await this.resolveEmployeeId(req);
    if (!employeeId) {
      res.json(createSuccessResponse([], ESSController.NOT_LINKED_MSG));
      return;
    }
    const balances = await essService.getMyLeaveBalance(companyId, employeeId);
    res.json(createSuccessResponse(balances, 'Leave balances retrieved'));
  });

  getMyAttendance = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = await this.resolveEmployeeId(req);
    if (!employeeId) {
      res.json(createSuccessResponse([], ESSController.NOT_LINKED_MSG));
      return;
    }
    const month = parseInt(req.query.month as string, 10) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string, 10) || new Date().getFullYear();

    const records = await essService.getMyAttendance(companyId, employeeId, month, year);
    res.json(createSuccessResponse(records, 'Attendance records retrieved'));
  });

  getMyDeclarations = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = await this.resolveEmployeeId(req);
    if (!employeeId) {
      res.json(createSuccessResponse([], ESSController.NOT_LINKED_MSG));
      return;
    }
    const declarations = await essService.getMyDeclarations(companyId, employeeId);
    res.json(createSuccessResponse(declarations, 'IT declarations retrieved'));
  });

  applyLeave = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = await this.resolveEmployeeId(req);
    if (!employeeId) throw ApiError.badRequest(ESSController.NOT_LINKED_MSG);

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

    const employeeId = await this.resolveEmployeeId(req);
    if (!employeeId) throw ApiError.badRequest(ESSController.NOT_LINKED_MSG);

    const parsed = regularizeAttendanceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const override = await essService.regularizeAttendance(companyId, employeeId, parsed.data);
    res.status(201).json(createSuccessResponse(override, 'Attendance regularization submitted'));
  });

  // ── ESS: Goals, Grievances, Training, Assets, Form 16 ─────────────

  getMyGoals = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = await this.resolveEmployeeId(req);
    if (!employeeId) {
      res.json(createSuccessResponse([], ESSController.NOT_LINKED_MSG));
      return;
    }
    const goals = await essService.getMyGoals(employeeId, companyId);
    res.json(createSuccessResponse(goals, 'Goals retrieved'));
  });

  getMyGrievances = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = await this.resolveEmployeeId(req);
    if (!employeeId) {
      res.json(createSuccessResponse([], ESSController.NOT_LINKED_MSG));
      return;
    }
    const cases = await essService.getMyGrievances(employeeId, companyId);
    res.json(createSuccessResponse(cases, 'Grievances retrieved'));
  });

  fileGrievance = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = await this.resolveEmployeeId(req);
    if (!employeeId) throw ApiError.badRequest(ESSController.NOT_LINKED_MSG);

    const grievance = await essService.fileGrievance(employeeId, companyId, req.body);
    res.status(201).json(createSuccessResponse(grievance, 'Grievance filed'));
  });

  getMyTraining = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = await this.resolveEmployeeId(req);
    if (!employeeId) {
      res.json(createSuccessResponse([], ESSController.NOT_LINKED_MSG));
      return;
    }
    const training = await essService.getMyTraining(employeeId, companyId);
    res.json(createSuccessResponse(training, 'Training retrieved'));
  });

  getMyAssets = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = await this.resolveEmployeeId(req);
    if (!employeeId) {
      res.json(createSuccessResponse([], ESSController.NOT_LINKED_MSG));
      return;
    }
    const assets = await essService.getMyAssets(employeeId, companyId);
    res.json(createSuccessResponse(assets, 'Assets retrieved'));
  });

  getMyForm16 = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = await this.resolveEmployeeId(req);
    if (!employeeId) {
      res.json(createSuccessResponse(null, ESSController.NOT_LINKED_MSG));
      return;
    }
    const data = await essService.getMyForm16(employeeId, companyId);
    res.json(createSuccessResponse(data, 'Form 16 data retrieved'));
  });

  // ── MSS Manager Self-Service ──────────────────────────────────────

  getTeamMembers = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const managerId = await this.resolveManagerId(req);
    if (!managerId) {
      res.json(createSuccessResponse([], ESSController.NOT_LINKED_MSG));
      return;
    }

    const { page, limit } = getPaginationParams(req.query);
    const result = await essService.getTeamMembers(companyId, managerId, { page, limit });
    res.json(createPaginatedResponse(result.reportees, result.page, result.limit, result.total, 'Team members retrieved'));
  });

  getPendingManagerApprovals = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const managerId = await this.resolveManagerId(req);
    if (!managerId) {
      res.json(createSuccessResponse([], ESSController.NOT_LINKED_MSG));
      return;
    }

    const approvals = await essService.getPendingApprovals(companyId, managerId);
    res.json(createSuccessResponse(approvals, 'Pending approvals retrieved'));
  });

  getTeamAttendance = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const managerId = await this.resolveManagerId(req);
    if (!managerId) {
      res.json(createSuccessResponse([], ESSController.NOT_LINKED_MSG));
      return;
    }

    const date: string = (req.query.date as string) || new Date().toISOString().split('T')[0]!;

    const records = await essService.getTeamAttendance(companyId, managerId, date);
    res.json(createSuccessResponse(records, 'Team attendance retrieved'));
  });

  getTeamLeaveCalendar = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const managerId = await this.resolveManagerId(req);
    if (!managerId) {
      res.json(createSuccessResponse([], ESSController.NOT_LINKED_MSG));
      return;
    }

    const month = parseInt(req.query.month as string, 10) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string, 10) || new Date().getFullYear();

    const calendar = await essService.getTeamLeaveCalendar(companyId, managerId, month, year);
    res.json(createSuccessResponse(calendar, 'Team leave calendar retrieved'));
  });

  // ── Shift Check-In / Check-Out ──────────────────────────────────────

  getMyAttendanceStatus = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = await this.resolveEmployeeId(req);
    if (!employeeId) {
      res.json(createSuccessResponse({ status: 'NOT_LINKED', record: null }, ESSController.NOT_LINKED_MSG));
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const record = await platformPrisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
      include: { shift: true, location: true },
    });

    if (!record) {
      res.json(createSuccessResponse({ status: 'NOT_CHECKED_IN', record: null }, 'Not checked in today'));
      return;
    }

    let elapsedSeconds = 0;
    if (record.punchIn && !record.punchOut) {
      elapsedSeconds = Math.floor((Date.now() - new Date(record.punchIn).getTime()) / 1000);
    }

    const status = record.punchOut ? 'CHECKED_OUT' : 'CHECKED_IN';
    res.json(createSuccessResponse({ status, record, elapsedSeconds }, `Attendance status: ${status}`));
  });

  checkIn = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = await this.resolveEmployeeId(req);
    if (!employeeId) throw ApiError.badRequest(ESSController.NOT_LINKED_MSG);

    const parsed = checkInSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const { shiftId, locationId, latitude, longitude, photoUrl } = parsed.data;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Prevent double check-in
    const existing = await platformPrisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });
    if (existing?.punchIn) {
      throw ApiError.badRequest('Already checked in today. Use check-out instead.');
    }

    // Geofence validation
    let geoStatus = 'NO_LOCATION';
    if (latitude != null && longitude != null && locationId) {
      const location = await platformPrisma.location.findUnique({ where: { id: locationId } });
      if (location?.geoEnabled && location.geoLat && location.geoLng) {
        const dist = calculateDistance(
          latitude, longitude,
          parseFloat(location.geoLat), parseFloat(location.geoLng),
        );
        geoStatus = dist <= location.geoRadius ? 'INSIDE_GEOFENCE' : 'OUTSIDE_GEOFENCE';
      }
    } else if (latitude != null && longitude != null) {
      geoStatus = 'NO_LOCATION';
    }

    const now = new Date();

    // Shift time validation (if employee has a shift assigned)
    const employeeForShift = await platformPrisma.employee.findUnique({
      where: { id: employeeId },
      select: { shiftId: true },
    });

    if (employeeForShift?.shiftId || shiftId) {
      const targetShiftId = shiftId || employeeForShift?.shiftId;
      const shift = await platformPrisma.companyShift.findUnique({
        where: { id: targetShiftId! },
        select: { startTime: true, endTime: true, name: true },
      });

      if (shift) {
        // Get attendance rules for grace period
        const rules = await platformPrisma.attendanceRule.findUnique({
          where: { companyId },
          select: { gracePeriodMinutes: true },
        });
        const gracePeriod = rules?.gracePeriodMinutes ? Number(rules.gracePeriodMinutes) : 15;

        // Parse shift start time
        const [shiftHour, shiftMin] = (shift.startTime || '00:00').split(':').map(Number);
        const shiftStart = new Date(now);
        shiftStart.setHours(shiftHour ?? 0, shiftMin ?? 0, 0, 0);

        // Allow check-in only within: (shiftStart - 60 minutes) to (shiftStart + gracePeriod + 120 minutes)
        // This gives a 1-hour early window and 2-hour late window (after grace period)
        const earliestCheckIn = new Date(shiftStart.getTime() - 60 * 60 * 1000);
        const latestCheckIn = new Date(shiftStart.getTime() + (gracePeriod + 120) * 60 * 1000);

        // Handle overnight shifts (endTime < startTime means shift crosses midnight)
        const [toHour, toMin] = (shift.endTime || '23:59').split(':').map(Number);
        const isOvernightShift = (toHour ?? 0) < (shiftHour ?? 0);

        if (!isOvernightShift) {
          // Normal shift: validate check-in time
          if (now < earliestCheckIn || now > latestCheckIn) {
            throw ApiError.badRequest(
              `Check-in not allowed at this time. Your shift "${shift.name}" starts at ${shift.startTime}. ` +
              `You can check in between ${shift.startTime} (minus 1 hour) and up to 2 hours after shift start.`
            );
          }
        }
        // For overnight shifts, allow broader window (more complex to validate)
      }
    }

    const record = await platformPrisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId, date: today } },
      create: {
        employeeId,
        date: today,
        punchIn: now,
        status: 'PRESENT',
        source: 'MOBILE_GPS',
        companyId,
        shiftId: shiftId || null,
        locationId: locationId || null,
        checkInLatitude: latitude ?? null,
        checkInLongitude: longitude ?? null,
        checkInPhotoUrl: photoUrl ?? null,
        geoStatus,
      },
      update: {
        punchIn: now,
        status: 'PRESENT',
        source: 'MOBILE_GPS',
        ...(shiftId
          ? { shift: { connect: { id: shiftId } } }
          : { shift: { disconnect: true } }),
        ...(locationId
          ? { location: { connect: { id: locationId } } }
          : { location: { disconnect: true } }),
        checkInLatitude: latitude ?? null,
        checkInLongitude: longitude ?? null,
        checkInPhotoUrl: photoUrl ?? null,
        geoStatus,
      },
      include: { shift: true, location: true },
    });

    res.status(201).json(createSuccessResponse(record, 'Checked in successfully'));
  });

  checkOut = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = await this.resolveEmployeeId(req);
    if (!employeeId) throw ApiError.badRequest(ESSController.NOT_LINKED_MSG);

    const parsed = checkOutSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const { latitude, longitude, photoUrl } = parsed.data;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await platformPrisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });

    if (!existing || !existing.punchIn) {
      throw ApiError.badRequest('You must check in before checking out.');
    }
    if (existing.punchOut) {
      throw ApiError.badRequest('Already checked out today.');
    }

    const now = new Date();
    const diffMs = now.getTime() - new Date(existing.punchIn).getTime();
    const workedHours = parseFloat((diffMs / 3_600_000).toFixed(2));

    // Geofence validation for checkout
    let geoStatus = existing.geoStatus || 'NO_LOCATION';
    if (latitude != null && longitude != null && existing.locationId) {
      const location = await platformPrisma.location.findUnique({ where: { id: existing.locationId } });
      if (location?.geoEnabled && location.geoLat && location.geoLng) {
        const dist = calculateDistance(
          latitude, longitude,
          parseFloat(location.geoLat), parseFloat(location.geoLng),
        );
        // If they were inside on check-in but outside on check-out, mark as outside
        if (dist > location.geoRadius) {
          geoStatus = 'OUTSIDE_GEOFENCE';
        }
      }
    }

    const record = await platformPrisma.attendanceRecord.update({
      where: { id: existing.id },
      data: {
        punchOut: now,
        workedHours,
        checkOutLatitude: latitude ?? null,
        checkOutLongitude: longitude ?? null,
        checkOutPhotoUrl: photoUrl ?? null,
        geoStatus,
      },
      include: { shift: true, location: true },
    });

    res.json(createSuccessResponse(record, 'Checked out successfully'));
  });

  // ── Dashboard ─────────────────────────────────────────────────────

  getDashboard = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const employeeId = await this.resolveEmployeeId(req);
    const permissions = req.user?.permissions ?? [];

    const data = await essService.getDashboard(companyId, employeeId, userId, permissions);
    res.json(createSuccessResponse(data, 'Dashboard data retrieved'));
  });
}

export const essController = new ESSController();
