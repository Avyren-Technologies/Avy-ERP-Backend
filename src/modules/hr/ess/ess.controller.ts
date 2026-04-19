import { Request, Response } from 'express';
import { DateTime } from 'luxon';
import { essService } from './ess.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { platformPrisma } from '../../../config/database';
import {
  getCachedAttendanceRules,
  getCachedCompanySettings,
} from '../../../shared/utils/config-cache';
import { nowInCompanyTimezone } from '../../../shared/utils/timezone';
import { resolvePolicy, type EvaluationContext } from '../../../shared/services/policy-resolver.service';
import {
  resolveAttendanceStatus,
  type AttendanceRulesInput,
  type ShiftInfo,
} from '../../../shared/services/attendance-status-resolver.service';
import { TRIGGER_EVENTS } from '../../../shared/constants/trigger-events';
import { notificationService } from '../../../core/notifications/notification.service';
import { logger } from '../../../config/logger';
import { essOvertimeService } from './ess-overtime.service';
import {
  claimOvertimeSchema,
  myOvertimeListSchema,
  myOvertimeSummarySchema,
} from './ess-overtime.validators';
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
  updateProfileSchema,
  shiftSwapSchema,
  wfhRequestSchema,
  uploadDocumentSchema,
  policyDocumentSchema,
  essExpenseClaimSchema,
  essLoanApplicationSchema,
  fileGrievanceSchema,
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

  // ── Approval Workflow Config (trigger events + approver roles) ────

  getWorkflowConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const tenantId = req.user?.tenantId;

    // Build dynamic approver roles from actual RBAC roles that have approve permissions
    let dynamicRoles: Array<{ value: string; label: string; description: string }> = [];
    if (tenantId) {
      const { rbacService } = await import('../../../core/rbac/rbac.service');
      const allRoles = await rbacService.listRoles(tenantId);
      const { expandPermissionsWithInheritance } = await import('../../../shared/constants/permissions');

      dynamicRoles = allRoles
        .filter((role) => {
          const expanded = expandPermissionsWithInheritance(role.permissions);
          // Role must have at least one approve-level permission (hr:approve, *, hr:*, hr:configure)
          return expanded.some((p) =>
            p === '*' || p.endsWith(':approve') || p.endsWith(':configure') || p.endsWith(':*'),
          );
        })
        .map((role) => ({
          value: role.id,
          label: role.name,
          description: `Assigned role: ${role.name}`,
        }));
    }

    res.json(createSuccessResponse(
      { triggerEvents: TRIGGER_EVENTS, approverRoles: dynamicRoles },
      'Workflow configuration retrieved',
    ));
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

    // Non-HR users can only see their own declarations
    const permissions = req.user?.permissions ?? [];
    const isHr = permissions.includes('*') || permissions.includes('hr:*')
      || permissions.includes('hr:configure') || permissions.includes('hr:approve');
    if (!isHr) {
      const employeeId = await this.resolveEmployeeId(req);
      if (!employeeId) {
        res.json(createPaginatedResponse([], 1, limit, 0, 'IT declarations retrieved'));
        return;
      }
      opts.employeeId = employeeId;
    }

    const result = await essService.listDeclarations(companyId, opts);
    res.json(createPaginatedResponse(result.declarations, result.page, result.limit, result.total, 'IT declarations retrieved'));
  });

  getDeclaration = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const declaration = await essService.getDeclaration(companyId, req.params.id!);

    // Non-HR users can only view their own declarations
    const permissions = req.user?.permissions ?? [];
    const isHr = permissions.includes('*') || permissions.includes('hr:*')
      || permissions.includes('hr:configure') || permissions.includes('hr:approve');
    if (!isHr) {
      const employeeId = await this.resolveEmployeeId(req);
      if (declaration.employeeId !== employeeId) {
        throw ApiError.forbidden('You can only view your own declarations');
      }
    }

    res.json(createSuccessResponse(declaration, 'IT declaration retrieved'));
  });

  createDeclaration = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createITDeclarationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    // Non-HR users can only create declarations for themselves
    const permissions = req.user?.permissions ?? [];
    const isHr = permissions.includes('*') || permissions.includes('hr:*')
      || permissions.includes('hr:configure') || permissions.includes('hr:approve');
    if (!isHr) {
      const employeeId = await this.resolveEmployeeId(req);
      if (!employeeId) throw ApiError.badRequest('Employee profile not found');
      parsed.data.employeeId = employeeId;
    }

    // After auto-set, employeeId must be present
    if (!parsed.data.employeeId) {
      throw ApiError.badRequest('Employee ID is required');
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

    // Non-HR users can only update their own declarations
    const permissions = req.user?.permissions ?? [];
    const isHr = permissions.includes('*') || permissions.includes('hr:*')
      || permissions.includes('hr:configure') || permissions.includes('hr:approve');
    if (!isHr) {
      const existing = await essService.getDeclaration(companyId, req.params.id!);
      const employeeId = await this.resolveEmployeeId(req);
      if (existing.employeeId !== employeeId) {
        throw ApiError.forbidden('You can only update your own declarations');
      }
    }

    const declaration = await essService.updateDeclaration(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(declaration, 'IT declaration updated'));
  });

  submitDeclaration = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    // Non-HR users can only submit their own declarations
    const permissions = req.user?.permissions ?? [];
    const isHr = permissions.includes('*') || permissions.includes('hr:*')
      || permissions.includes('hr:configure') || permissions.includes('hr:approve');
    if (!isHr) {
      const existing = await essService.getDeclaration(companyId, req.params.id!);
      const employeeId = await this.resolveEmployeeId(req);
      if (existing.employeeId !== employeeId) {
        throw ApiError.forbidden('You can only submit your own declarations');
      }
    }

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

  /** Resolve employeeId from authenticated user's JWT or DB lookup.
   *  Performs DB lookup as fallback if JWT doesn't contain employeeId (e.g., employee
   *  was linked after last login). Auto-links user→employee by email match if found. */
  private async resolveEmployeeId(req: Request): Promise<string | null> {
    // 1. From JWT token (set during login if user was already linked)
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

  /** Resolve managerId from authenticated user's employee link. */
  private async resolveManagerId(req: Request): Promise<string | null> {
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

  getPayslipDetail = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const payslipId = req.params.id;
    if (!payslipId) throw ApiError.badRequest('Payslip ID is required');

    const employeeId = await this.resolveEmployeeId(req);
    if (!employeeId) {
      res.json(createSuccessResponse(null, ESSController.NOT_LINKED_MSG));
      return;
    }
    const detail = await essService.getPayslipDetail(companyId, employeeId, payslipId);
    res.json(createSuccessResponse(detail, 'Payslip detail retrieved'));
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
    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings.timezone ?? 'Asia/Kolkata';
    const nowTz = DateTime.now().setZone(companyTimezone);
    const month = parseInt(req.query.month as string, 10) || nowTz.month;
    const year = parseInt(req.query.year as string, 10) || nowTz.year;

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

    const parsed = fileGrievanceSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));

    const grievance = await essService.fileGrievance(employeeId, companyId, parsed.data);
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

  // ── Profile Edit & Payslip PDF ──────────────────────────────────

  updateMyProfile = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const profile = await essService.updateMyProfile(userId, companyId, parsed.data);
    res.json(createSuccessResponse(profile, 'Profile updated'));
  });

  downloadPayslipPdf = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const payslipId = req.params.id;
    if (!payslipId) throw ApiError.badRequest('Payslip ID is required');

    const buffer = await essService.generatePayslipPdf(userId, companyId, payslipId);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="payslip-${payslipId}.pdf"`,
      'Content-Length': String(buffer.length),
    });
    res.send(buffer);
  });

  // ── Shift Swap ──────────────────────────────────────────────────────

  getMyShiftSwaps = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const swaps = await essService.getMyShiftSwaps(companyId, userId);
    res.json(createSuccessResponse(swaps, 'Shift swap requests retrieved'));
  });

  createShiftSwap = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const parsed = shiftSwapSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const swap = await essService.createShiftSwap(companyId, userId, parsed.data);
    res.status(201).json(createSuccessResponse(swap, 'Shift swap request created'));
  });

  cancelShiftSwap = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const swap = await essService.cancelShiftSwap(companyId, userId, req.params.id!);
    res.json(createSuccessResponse(swap, 'Shift swap request cancelled'));
  });

  // ── Shift Swap — Admin / Manager ─────────────────────────────────

  listShiftSwaps = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req);
    const status = req.query.status as string | undefined;
    const result = await essService.listShiftSwaps(companyId, { page, limit, ...(status ? { status } : {}) });
    res.json(createPaginatedResponse(result.data, result.meta.page, result.meta.limit, result.meta.total, 'Shift swap requests retrieved'));
  });

  adminApproveShiftSwap = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const swap = await essService.adminApproveShiftSwap(companyId, req.params.id!, userId);
    res.json(createSuccessResponse(swap, 'Shift swap request approved'));
  });

  adminRejectShiftSwap = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const swap = await essService.adminRejectShiftSwap(companyId, req.params.id!);
    res.json(createSuccessResponse(swap, 'Shift swap request rejected'));
  });

  // ── WFH Requests ──────────────────────────────────────────────────

  getMyWfhRequests = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const requests = await essService.getMyWfhRequests(companyId, userId);
    res.json(createSuccessResponse(requests, 'WFH requests retrieved'));
  });

  createWfhRequest = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const parsed = wfhRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const wfh = await essService.createWfhRequest(companyId, userId, parsed.data);
    res.status(201).json(createSuccessResponse(wfh, 'WFH request created'));
  });

  cancelWfhRequest = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const wfh = await essService.cancelWfhRequest(companyId, userId, req.params.id!);
    res.json(createSuccessResponse(wfh, 'WFH request cancelled'));
  });

  // ── Employee Documents ─────────────────────────────────────────────

  getMyDocuments = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const documents = await essService.getMyDocuments(companyId, userId);
    res.json(createSuccessResponse(documents, 'Documents retrieved'));
  });

  uploadMyDocument = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const parsed = uploadDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const document = await essService.uploadMyDocument(companyId, userId, parsed.data);
    res.status(201).json(createSuccessResponse(document, 'Document uploaded'));
  });

  deleteMyDocument = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const result = await essService.deleteMyDocument(companyId, userId, req.params.id!);
    res.json(createSuccessResponse(result, 'Document deleted'));
  });

  // ── Policy Documents ───────────────────────────────────────────────

  getPolicyDocuments = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const documents = await essService.getPolicyDocuments(companyId);
    res.json(createSuccessResponse(documents, 'Policy documents retrieved'));
  });

  createPolicyDocument = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = policyDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const document = await essService.createPolicyDocument(companyId, parsed.data, req.user?.id);
    res.status(201).json(createSuccessResponse(document, 'Policy document created'));
  });

  deletePolicyDocument = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await essService.deletePolicyDocument(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Policy document deleted'));
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

    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings.timezone ?? 'Asia/Kolkata';
    const nowTz = DateTime.now().setZone(companyTimezone);
    const month = parseInt(req.query.month as string, 10) || nowTz.month;
    const year = parseInt(req.query.year as string, 10) || nowTz.year;

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

    // Use company timezone for correct attendance date
    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings.timezone ?? 'Asia/Kolkata';
    const nowCT = nowInCompanyTimezone(companyTimezone);
    const today = new Date(nowCT.toFormat('yyyy-MM-dd') + 'T00:00:00.000Z');

    const shiftInclude = {
      shift: {
        include: { breaks: { select: { id: true, name: true, startTime: true, duration: true, type: true, isPaid: true } } },
      },
      location: {
        include: { geofences: { where: { isActive: true } } },
      },
    } as const;

    let record = await platformPrisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
      include: shiftInclude,
    });

    // For cross-day (night) shifts: if no record today, check yesterday's record
    // (employee may have checked in yesterday and not yet checked out)
    if (!record || (!record.punchIn)) {
      const yesterdayDT = nowCT.minus({ days: 1 });
      const yesterday = new Date(yesterdayDT.toFormat('yyyy-MM-dd') + 'T00:00:00.000Z');
      const yesterdayRecord = await platformPrisma.attendanceRecord.findUnique({
        where: { employeeId_date: { employeeId, date: yesterday } },
        include: shiftInclude,
      });
      if (yesterdayRecord?.punchIn && !yesterdayRecord.punchOut) {
        record = yesterdayRecord;
      }
    }

    if (!record || !record.punchIn) {
      // Return the employee's current shift info + resolved policy + location/geofences
      const employee = await platformPrisma.employee.findUnique({
        where: { id: employeeId },
        select: { shiftId: true, locationId: true, geofenceId: true },
      });
      let currentShift = null;
      let resolvedPolicy = null;
      let employeeLocation = null;
      let assignedGeofence = null;

      if (employee?.shiftId) {
        currentShift = await platformPrisma.companyShift.findUnique({
          where: { id: employee.shiftId },
          include: { breaks: { select: { id: true, name: true, startTime: true, duration: true, type: true, isPaid: true } } },
        });
      }

      // Resolve effective policy: shift overrides → attendance rules → system defaults
      try {
        const policyResult = await resolvePolicy(companyId, {
          employeeId,
          shiftId: employee?.shiftId ?? null,
          locationId: employee?.locationId ?? null,
          date: today,
          isHoliday: false,
          isWeekOff: false,
        });
        resolvedPolicy = policyResult.policy;
      } catch {
        // Non-fatal — frontend can still work without resolved policy
      }

      // Include employee's assigned geofence (if individually assigned)
      if (employee?.geofenceId) {
        assignedGeofence = await platformPrisma.geofence.findUnique({
          where: { id: employee.geofenceId },
        });
      }

      // Include employee's location with active geofences
      if (employee?.locationId) {
        employeeLocation = await platformPrisma.location.findUnique({
          where: { id: employee.locationId },
          include: { geofences: { where: { isActive: true } } },
        });
      }

      res.json(createSuccessResponse({
        status: 'NOT_CHECKED_IN',
        record: null,
        currentShift,
        resolvedPolicy,
        location: employeeLocation,
        assignedGeofence,
      }, 'Not checked in today'));
      return;
    }

    let elapsedSeconds = 0;
    if (record.punchIn && !record.punchOut) {
      elapsedSeconds = Math.floor((Date.now() - new Date(record.punchIn).getTime()) / 1000);
    }

    // Resolve effective policy for the checked-in/out state too
    let resolvedPolicy = null;
    try {
      const policyResult = await resolvePolicy(companyId, {
        employeeId,
        shiftId: record.shiftId ?? null,
        locationId: record.locationId ?? null,
        date: today,
        isHoliday: false,
        isWeekOff: false,
      });
      resolvedPolicy = policyResult.policy;
    } catch {
      // Non-fatal
    }

    const status = record.punchOut ? 'CHECKED_OUT' : 'CHECKED_IN';
    res.json(createSuccessResponse({ status, record, elapsedSeconds, resolvedPolicy }, `Attendance status: ${status}`));
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

    // Use company timezone for all time operations
    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings.timezone ?? 'Asia/Kolkata';
    const nowCT = nowInCompanyTimezone(companyTimezone);
    // Attendance date in company timezone (stored as UTC midnight of that date)
    const todayStr = nowCT.toFormat('yyyy-MM-dd');
    const today = new Date(todayStr + 'T00:00:00.000Z');

    const now = new Date();

    // Prevent double check-in
    const existing = await platformPrisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });
    if (existing?.punchIn) {
      throw ApiError.badRequest('Already checked in today. Use check-out instead.');
    }

    // Geofence validation — check assigned geofence → all location geofences → legacy fields
    let geoStatus = 'NO_LOCATION';
    if (latitude != null && longitude != null) {
      // Get employee's assigned geofence and location
      const empGeo = await platformPrisma.employee.findUnique({
        where: { id: employeeId },
        select: { geofenceId: true, locationId: true },
      });
      const effectiveLocationId = locationId || empGeo?.locationId;

      if (empGeo?.geofenceId) {
        // 1. Check against specifically assigned geofence
        const geofence = await platformPrisma.geofence.findUnique({
          where: { id: empGeo.geofenceId },
        });
        if (geofence?.isActive) {
          const dist = calculateDistance(latitude, longitude, geofence.lat, geofence.lng);
          geoStatus = dist <= geofence.radius ? 'INSIDE_GEOFENCE' : 'OUTSIDE_GEOFENCE';
        }
      } else if (effectiveLocationId) {
        // 2. Check against ALL active geofences for the location
        const geofences = await platformPrisma.geofence.findMany({
          where: { locationId: effectiveLocationId, isActive: true },
        });
        if (geofences.length > 0) {
          const insideAny = geofences.some(
            gf => calculateDistance(latitude, longitude, gf.lat, gf.lng) <= gf.radius,
          );
          geoStatus = insideAny ? 'INSIDE_GEOFENCE' : 'OUTSIDE_GEOFENCE';
        } else {
          // 3. Fall back to legacy Location geo fields
          const location = await platformPrisma.location.findUnique({
            where: { id: effectiveLocationId },
          });
          if (location?.geoEnabled && location.geoLat && location.geoLng) {
            const dist = calculateDistance(
              latitude, longitude,
              parseFloat(location.geoLat), parseFloat(location.geoLng),
            );
            geoStatus = dist <= location.geoRadius ? 'INSIDE_GEOFENCE' : 'OUTSIDE_GEOFENCE';
          }
        }
      }
    }

    // ── Resolve effective policy for enforcement ──────────────────────
    const employeeForShift = await platformPrisma.employee.findUnique({
      where: { id: employeeId },
      select: { firstName: true, lastName: true, shiftId: true, locationId: true, location: { select: { name: true } } },
    });
    const effectiveShiftId = shiftId || employeeForShift?.shiftId;
    const effectiveLocationId2 = locationId || employeeForShift?.locationId;

    const holiday = await platformPrisma.holidayCalendar.findFirst({
      where: { companyId, date: today },
      select: { name: true },
    });
    const roster = await platformPrisma.roster.findFirst({
      where: { companyId, isDefault: true },
      select: { weekOff1: true, weekOff2: true },
    });
    const dayOfWeekNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dow = dayOfWeekNames[nowCT.weekday % 7];
    const isWeekOff = dow === roster?.weekOff1 || dow === roster?.weekOff2;

    const evaluationContext: EvaluationContext = {
      employeeId,
      shiftId: effectiveShiftId || null,
      locationId: effectiveLocationId2 || null,
      date: today,
      isHoliday: !!holiday,
      isWeekOff,
      ...(holiday?.name && { holidayName: holiday.name }),
      ...(roster && { rosterPattern: `${roster.weekOff1 ?? ''}${roster.weekOff2 ? '/' + roster.weekOff2 : ''}` }),
    };

    const { policy } = await resolvePolicy(companyId, evaluationContext);

    // ── Policy Enforcement: Selfie validation (A3) ──
    if (policy.selfieRequired && !parsed.data.photoUrl) {
      throw ApiError.badRequest('Selfie photo is required by company policy');
    }

    // ── Policy Enforcement: GPS validation (A4) ──
    if (policy.gpsRequired && (latitude == null || longitude == null)) {
      throw ApiError.badRequest('GPS location is required by company policy');
    }

    // ── Policy Enforcement: Geofence (A1+A2) ──
    if (policy.geofenceEnforcementMode !== 'OFF' && geoStatus === 'OUTSIDE_GEOFENCE') {
      if (policy.geofenceEnforcementMode === 'STRICT') {
        throw ApiError.forbidden('You must be inside the designated geofence area to check in');
      }
      if (policy.geofenceEnforcementMode === 'WARN') {
        notificationService.dispatch({
          companyId,
          triggerEvent: 'GEOFENCE_VIOLATION',
          entityType: 'AttendanceRecord',
          entityId: employeeId,
          tokens: {
            employee_name: `${employeeForShift?.firstName ?? ''} ${employeeForShift?.lastName ?? ''}`.trim() || 'Employee',
            date: new Date().toISOString().split('T')[0],
            action: 'check-in',
            location_name: employeeForShift?.location?.name ?? 'Unknown',
          },
          type: 'ATTENDANCE',
        }).catch((err: any) => logger.warn('Failed to dispatch geofence violation notification', err));
      }
    }

    // Shift time validation (if employee has a shift assigned)

    if (effectiveShiftId) {
      const shift = await platformPrisma.companyShift.findUnique({
        where: { id: effectiveShiftId },
        select: {
          startTime: true,
          endTime: true,
          name: true,
          isCrossDay: true,
          gracePeriodMinutes: true,
          maxLateCheckInMinutes: true,
        },
      });

      if (shift) {
        // Resolve max late check-in using policy hierarchy:
        // shift override -> attendance rules -> system defaults
        const rules = await getCachedAttendanceRules(companyId);
        const maxLateCheckIn = shift.maxLateCheckInMinutes
          ?? rules.maxLateCheckInMinutes
          ?? 240;

        // Parse shift start/end in company timezone
        const [shiftHour = 0, shiftMin = 0] = (shift.startTime || '00:00').split(':').map(Number);
        const [endHour = 0, endMin = 0] = (shift.endTime || '23:59').split(':').map(Number);
        // Current time in company timezone (minutes since midnight)
        const nowMinutes = nowCT.hour * 60 + nowCT.minute;
        const shiftStartMinutes = (shiftHour ?? 0) * 60 + (shiftMin ?? 0);
        const shiftEndMinutes = (endHour ?? 0) * 60 + (endMin ?? 0);

        // Early window: 60 minutes before shift start
        const earlyWindowMinutes = 60;
        // Late window: maxLateCheckIn minutes after shift start, but never past shift end
        let lateWindowMinutes = maxLateCheckIn;

        if (!shift.isCrossDay && shiftEndMinutes > shiftStartMinutes) {
          // For non-cross-day shifts, cap the late window at shift end time
          const shiftDuration = shiftEndMinutes - shiftStartMinutes;
          lateWindowMinutes = Math.min(lateWindowMinutes, shiftDuration);
        }

        const earliestMinutes = shiftStartMinutes - earlyWindowMinutes;
        const latestMinutes = shiftStartMinutes + lateWindowMinutes;

        let isWithinWindow: boolean;

        if (shift.isCrossDay) {
          // Cross-day (night) shift: e.g., 19:00 - 07:00
          // The check-in window wraps around midnight.
          // Also cap at shift end time (next day) to prevent check-in after shift ends
          const crossDayEndMinutes = shiftEndMinutes + 1440; // end time next day
          const shiftDuration = crossDayEndMinutes - shiftStartMinutes;
          const effectiveLatest = shiftStartMinutes + Math.min(lateWindowMinutes, shiftDuration);

          if (effectiveLatest >= 1440) {
            isWithinWindow = nowMinutes >= earliestMinutes || nowMinutes <= (effectiveLatest - 1440);
          } else {
            isWithinWindow = nowMinutes >= earliestMinutes && nowMinutes <= effectiveLatest;
          }
        } else {
          // Day shift: simple range check
          isWithinWindow = nowMinutes >= earliestMinutes && nowMinutes <= latestMinutes;
        }

        if (!isWithinWindow) {
          const earlyTime = `${String(Math.floor(Math.max(0, earliestMinutes) / 60)).padStart(2, '0')}:${String(Math.max(0, earliestMinutes) % 60).padStart(2, '0')}`;
          throw ApiError.badRequest(
            `Check-in not allowed at this time. Your shift "${shift.name}" is ${shift.startTime} – ${shift.endTime}. ` +
            `You can check in from ${earlyTime} (1 hour before shift start) until the shift ends.`
          );
        }
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
        shiftId: effectiveShiftId || null,
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
        ...(effectiveShiftId
          ? { shift: { connect: { id: effectiveShiftId } } }
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

    // Use company timezone for correct attendance date
    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings.timezone ?? 'Asia/Kolkata';
    const nowCT = nowInCompanyTimezone(companyTimezone);
    const todayStr = nowCT.toFormat('yyyy-MM-dd');
    const today = new Date(todayStr + 'T00:00:00.000Z');

    // Look for today's record first; for cross-day (night) shifts, also check
    // yesterday's record (employee checked in on day 1, checking out on day 2)
    let existing = await platformPrisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });
    let attendanceDate = today;

    if ((!existing || !existing.punchIn || existing.punchOut) && todayStr) {
      const yesterdayDT = nowCT.minus({ days: 1 });
      const yesterdayStr = yesterdayDT.toFormat('yyyy-MM-dd');
      const yesterday = new Date(yesterdayStr + 'T00:00:00.000Z');
      const yesterdayRecord = await platformPrisma.attendanceRecord.findUnique({
        where: { employeeId_date: { employeeId, date: yesterday } },
      });
      if (yesterdayRecord?.punchIn && !yesterdayRecord.punchOut) {
        existing = yesterdayRecord;
        attendanceDate = yesterday;
      }
    }

    if (!existing || !existing.punchIn) {
      throw ApiError.badRequest('You must check in before checking out.');
    }
    if (existing.punchOut) {
      throw ApiError.badRequest('Already checked out today.');
    }

    const now = new Date();

    const employee = await platformPrisma.employee.findUnique({
      where: { id: employeeId },
      select: { firstName: true, lastName: true, shiftId: true, locationId: true, location: { select: { name: true } } },
    });
    const effectiveShiftId = existing.shiftId ?? employee?.shiftId ?? null;
    const effectiveLocationId = existing.locationId ?? employee?.locationId ?? null;

    // Use the attendance date (may be yesterday for cross-day shifts) for context
    const holiday = await platformPrisma.holidayCalendar.findFirst({
      where: {
        companyId,
        date: attendanceDate,
      },
      select: { name: true },
    });
    const roster = await platformPrisma.roster.findFirst({
      where: { companyId, isDefault: true },
      select: { weekOff1: true, weekOff2: true },
    });
    const dayOfWeekNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dow = dayOfWeekNames[DateTime.fromJSDate(attendanceDate, { zone: companyTimezone }).weekday % 7];
    const isWeekOff = dow === roster?.weekOff1 || dow === roster?.weekOff2;

    const evaluationContext: EvaluationContext = {
      employeeId,
      shiftId: effectiveShiftId,
      locationId: effectiveLocationId,
      date: attendanceDate,
      isHoliday: !!holiday,
      isWeekOff,
      ...(holiday?.name && { holidayName: holiday.name }),
      ...(roster && { rosterPattern: `${roster.weekOff1 ?? ''}${roster.weekOff2 ? '/' + roster.weekOff2 : ''}` }),
    };

    const { policy, trace } = await resolvePolicy(companyId, evaluationContext);

    let shiftInfo: ShiftInfo | null = null;
    if (effectiveShiftId) {
      const shift = await platformPrisma.companyShift.findUnique({
        where: { id: effectiveShiftId },
        select: { startTime: true, endTime: true, isCrossDay: true },
      });
      if (shift) {
        shiftInfo = {
          startTime: shift.startTime,
          endTime: shift.endTime,
          isCrossDay: shift.isCrossDay,
        };
      }
    }

    const rules = await getCachedAttendanceRules(companyId);
    const rulesInput: AttendanceRulesInput = {
      lopAutoDeduct: rules.lopAutoDeduct,
      autoMarkAbsentIfNoPunch: rules.autoMarkAbsentIfNoPunch,
      autoHalfDayEnabled: rules.autoHalfDayEnabled,
      lateDeductionType: rules.lateDeductionType,
      lateDeductionValue: rules.lateDeductionValue ? Number(rules.lateDeductionValue) : null,
      earlyExitDeductionType: rules.earlyExitDeductionType,
      earlyExitDeductionValue: rules.earlyExitDeductionValue ? Number(rules.earlyExitDeductionValue) : null,
      ignoreLateOnLeaveDay: rules.ignoreLateOnLeaveDay,
      ignoreLateOnHoliday: rules.ignoreLateOnHoliday,
      ignoreLateOnWeekOff: rules.ignoreLateOnWeekOff,
    };

    const statusResult = resolveAttendanceStatus(
      existing.punchIn,
      now,
      shiftInfo,
      policy,
      evaluationContext,
      rulesInput,
      companyTimezone,
    );

    // Geofence validation for checkout — check assigned geofence → all location geofences → legacy fields
    let geoStatus = existing.geoStatus || 'NO_LOCATION';
    if (latitude != null && longitude != null) {
      const empGeo = await platformPrisma.employee.findUnique({
        where: { id: employeeId },
        select: { geofenceId: true, locationId: true },
      });
      const checkoutLocationId = existing.locationId ?? empGeo?.locationId;

      if (empGeo?.geofenceId) {
        // 1. Check against specifically assigned geofence
        const geofence = await platformPrisma.geofence.findUnique({
          where: { id: empGeo.geofenceId },
        });
        if (geofence?.isActive) {
          const dist = calculateDistance(latitude, longitude, geofence.lat, geofence.lng);
          if (dist > geofence.radius) {
            geoStatus = 'OUTSIDE_GEOFENCE';
          }
        }
      } else if (checkoutLocationId) {
        // 2. Check against ALL active geofences for the location
        const geofences = await platformPrisma.geofence.findMany({
          where: { locationId: checkoutLocationId, isActive: true },
        });
        if (geofences.length > 0) {
          const insideAny = geofences.some(
            gf => calculateDistance(latitude, longitude, gf.lat, gf.lng) <= gf.radius,
          );
          if (!insideAny) {
            geoStatus = 'OUTSIDE_GEOFENCE';
          }
        } else {
          // 3. Fall back to legacy Location geo fields
          const location = await platformPrisma.location.findUnique({
            where: { id: checkoutLocationId },
          });
          if (location?.geoEnabled && location.geoLat && location.geoLng) {
            const dist = calculateDistance(
              latitude, longitude,
              parseFloat(location.geoLat), parseFloat(location.geoLng),
            );
            if (dist > location.geoRadius) {
              geoStatus = 'OUTSIDE_GEOFENCE';
            }
          }
        }
      }
    }

    // ── Policy Enforcement: Selfie validation (A3) ──
    if (policy.selfieRequired && !parsed.data.photoUrl) {
      throw ApiError.badRequest('Selfie photo is required by company policy');
    }

    // ── Policy Enforcement: GPS validation (A4) ──
    if (policy.gpsRequired && (latitude == null || longitude == null)) {
      throw ApiError.badRequest('GPS location is required by company policy');
    }

    // ── Policy Enforcement: Geofence (A1+A2) ──
    if (policy.geofenceEnforcementMode !== 'OFF' && geoStatus === 'OUTSIDE_GEOFENCE') {
      if (policy.geofenceEnforcementMode === 'STRICT') {
        throw ApiError.forbidden('You must be inside the designated geofence area to check out');
      }
      if (policy.geofenceEnforcementMode === 'WARN') {
        notificationService.dispatch({
          companyId,
          triggerEvent: 'GEOFENCE_VIOLATION',
          entityType: 'AttendanceRecord',
          entityId: employeeId,
          tokens: {
            employee_name: `${employee?.firstName ?? ''} ${employee?.lastName ?? ''}`.trim() || 'Employee',
            date: new Date().toISOString().split('T')[0],
            action: 'check-out',
            location_name: employee?.location?.name ?? 'Unknown',
          },
          type: 'ATTENDANCE',
        }).catch((err: any) => logger.warn('Failed to dispatch geofence violation notification', err));
      }
    }

    const record = await platformPrisma.attendanceRecord.update({
      where: { id: existing.id },
      data: {
        punchOut: now,
        workedHours: statusResult.workedHours,
        status: statusResult.status as any,
        isLate: statusResult.isLate,
        lateMinutes: statusResult.lateMinutes || null,
        isEarlyExit: statusResult.isEarlyExit,
        earlyMinutes: statusResult.earlyMinutes || null,
        overtimeHours: statusResult.overtimeHours > 0 ? statusResult.overtimeHours : null,
        checkOutLatitude: latitude ?? null,
        checkOutLongitude: longitude ?? null,
        checkOutPhotoUrl: photoUrl ?? null,
        geoStatus,
        appliedGracePeriodMinutes: policy.gracePeriodMinutes,
        appliedFullDayThresholdHours: policy.fullDayThresholdHours,
        appliedHalfDayThresholdHours: policy.halfDayThresholdHours,
        appliedBreakDeductionMinutes: policy.breakDeductionMinutes,
        appliedPunchMode: policy.punchMode as any,
        appliedLateDeduction: statusResult.appliedLateDeduction,
        appliedEarlyExitDeduction: statusResult.appliedEarlyExitDeduction,
        resolutionTrace: trace,
        evaluationContext: {
          isHoliday: evaluationContext.isHoliday,
          isWeekOff: evaluationContext.isWeekOff,
          holidayName: evaluationContext.holidayName ?? null,
          rosterPattern: evaluationContext.rosterPattern ?? null,
        },
        finalStatusReason: statusResult.finalStatusReason,
      },
      include: { shift: true, location: true },
    });

    res.json(createSuccessResponse(record, 'Checked out successfully'));
  });

  // ── Holiday Calendar (ESS) ──────────────────────────────────────

  getMyHolidays = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
    const holidays = await essService.getMyHolidays(companyId, year);
    res.json(createSuccessResponse(holidays, 'Holidays retrieved'));
  });

  // ── Expense Claims (ESS) ──────────────────────────────────────────

  getMyExpenseClaims = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const options: { status?: string; page?: number; limit?: number } = {};
    if (req.query.status) options.status = req.query.status as string;
    if (req.query.page) options.page = Number(req.query.page);
    if (req.query.limit) options.limit = Number(req.query.limit);
    const result = await essService.getMyExpenseClaims(companyId, userId, options);
    res.json(createPaginatedResponse(result.claims, result.page, result.limit, result.total, 'Expense claims retrieved'));
  });

  getMyExpenseClaim = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const claim = await essService.getMyExpenseClaim(companyId, userId, req.params.id!);
    res.json(createSuccessResponse(claim, 'Expense claim retrieved'));
  });

  getExpenseCategories = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const categories = await essService.getExpenseCategories(companyId);
    res.json(createSuccessResponse(categories, 'Expense categories retrieved'));
  });

  getMyExpenseSummary = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const summary = await essService.getMyExpenseSummary(companyId, userId, req.query.financialYear as string | undefined);
    res.json(createSuccessResponse(summary, 'Expense summary retrieved'));
  });

  createMyExpenseClaim = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const parsed = essExpenseClaimSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const claim = await essService.createMyExpenseClaim(companyId, userId, parsed.data);
    res.status(201).json(createSuccessResponse(claim, 'Expense claim created'));
  });

  updateMyExpenseClaim = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const parsed = essExpenseClaimSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const claim = await essService.updateMyExpenseClaim(companyId, userId, req.params.id!, parsed.data as any);
    res.json(createSuccessResponse(claim, 'Expense claim updated'));
  });

  submitMyExpenseClaim = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const claim = await essService.submitMyExpenseClaim(companyId, userId, req.params.id!);
    res.json(createSuccessResponse(claim, 'Expense claim submitted'));
  });

  cancelMyExpenseClaim = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const claim = await essService.cancelMyExpenseClaim(companyId, userId, req.params.id!);
    res.json(createSuccessResponse(claim, 'Expense claim cancelled'));
  });

  // ── Loan Application (ESS) ────────────────────────────────────────

  getMyLoans = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const loans = await essService.getMyLoans(companyId, userId);
    res.json(createSuccessResponse(loans, 'Loans retrieved'));
  });

  getAvailableLoanPolicies = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const policies = await essService.getAvailableLoanPolicies(companyId);
    res.json(createSuccessResponse(policies, 'Loan policies retrieved'));
  });

  applyForLoan = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const parsed = essLoanApplicationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const loan = await essService.applyForLoan(companyId, userId, parsed.data);
    res.status(201).json(createSuccessResponse(loan, 'Loan application submitted'));
  });

  // ── Overtime (ESS) ────────────────────────────────────────────────

  getMyOvertimeRequests = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const employeeId = req.user?.employeeId;
    if (!companyId || !employeeId) throw ApiError.badRequest('Company and employee context required');

    const parsed = myOvertimeListSchema.safeParse(req.query);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));

    const result = await essOvertimeService.getMyOvertimeRequests(companyId, employeeId, parsed.data);
    res.json(createPaginatedResponse(result.data, result.meta.page, result.meta.limit, result.meta.total, 'Overtime requests retrieved'));
  });

  getMyOvertimeDetail = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const employeeId = req.user?.employeeId;
    if (!companyId || !employeeId) throw ApiError.badRequest('Company and employee context required');

    const id = req.params.id;
    if (!id) throw ApiError.badRequest('Overtime request ID is required');
    const result = await essOvertimeService.getMyOvertimeDetail(companyId, employeeId, id);
    res.json(createSuccessResponse(result, 'Overtime request detail retrieved'));
  });

  getMyOvertimeSummary = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const employeeId = req.user?.employeeId;
    if (!companyId || !employeeId) throw ApiError.badRequest('Company and employee context required');

    const parsed = myOvertimeSummarySchema.safeParse(req.query);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));

    const result = await essOvertimeService.getMyOvertimeSummary(companyId, employeeId, parsed.data);
    res.json(createSuccessResponse(result, 'Overtime summary retrieved'));
  });

  claimOvertime = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    const employeeId = req.user?.employeeId;
    if (!companyId || !userId || !employeeId) throw ApiError.badRequest('Company, user, and employee context required');

    const parsed = claimOvertimeSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));

    const result = await essOvertimeService.claimOvertime(companyId, userId, employeeId, parsed.data);
    res.json(createSuccessResponse(result, 'Overtime claim submitted successfully'));
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
