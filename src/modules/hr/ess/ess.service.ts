import { MaritalStatus, Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { logger } from '../../../config/logger';
import { invalidateESSConfig, getCachedCompanySettings } from '../../../shared/utils/config-cache';
import { generateNextNumber } from '../../../shared/utils/number-series';
import { nowInCompanyTimezone } from '../../../shared/utils/timezone';
import { n } from '../../../shared/utils/prisma-helpers';
import type { NotificationPriority } from '@prisma/client';
import { notificationService } from '../../../core/notifications/notification.service';
import {
  getCurrentStepApproverIds,
  getRequesterUserId,
} from '../../../core/notifications/dispatch/approver-resolver';
import { invalidateRuleCache } from '../../../core/notifications/dispatch/rule-loader';
import { categoryForTrigger } from '../../../shared/constants/notification-categories';

/**
 * Mapping from ApprovalRequest.entityType to the notification trigger events
 * fired when the request is finalized. Used by `onApprovalComplete` to emit a
 * single notification per (entity, decision) in a central place so that every
 * entity type stays consistent.
 */
const TRIGGER_BY_ENTITY: Record<
  string,
  { approved: string; rejected: string; category: string; priority: NotificationPriority }
> = {
  LeaveRequest:       { approved: 'LEAVE_APPROVED',             rejected: 'LEAVE_REJECTED',             category: 'LEAVE',              priority: 'MEDIUM' },
  AttendanceOverride: { approved: 'ATTENDANCE_REGULARIZED',     rejected: 'ATTENDANCE_REGULARIZATION_REJECTED', category: 'ATTENDANCE',  priority: 'MEDIUM' },
  OvertimeRequest:    { approved: 'OVERTIME_CLAIM_APPROVED',    rejected: 'OVERTIME_CLAIM_REJECTED',    category: 'OVERTIME',           priority: 'MEDIUM' },
  ShiftSwapRequest:   { approved: 'SHIFT_SWAP_APPROVED',        rejected: 'SHIFT_SWAP_REJECTED',        category: 'SHIFT',              priority: 'MEDIUM' },
  WfhRequest:         { approved: 'WFH_APPROVED',               rejected: 'WFH_REJECTED',               category: 'WFH',                priority: 'MEDIUM' },
  ExpenseClaim:       { approved: 'REIMBURSEMENT_APPROVED',     rejected: 'REIMBURSEMENT_REJECTED',     category: 'REIMBURSEMENT',      priority: 'MEDIUM' },
  LoanRecord:         { approved: 'LOAN_APPROVED',              rejected: 'LOAN_REJECTED',              category: 'LOAN',               priority: 'HIGH'   },
  ExitRequest:        { approved: 'RESIGNATION_ACCEPTED',       rejected: 'RESIGNATION_REJECTED',       category: 'RESIGNATION',        priority: 'HIGH'   },
  EmployeeTransfer:   { approved: 'EMPLOYEE_TRANSFER_APPLIED',  rejected: 'EMPLOYEE_TRANSFER_REJECTED', category: 'EMPLOYEE_LIFECYCLE', priority: 'MEDIUM' },
  EmployeePromotion:  { approved: 'EMPLOYEE_PROMOTION_APPLIED', rejected: 'EMPLOYEE_PROMOTION_REJECTED',category: 'EMPLOYEE_LIFECYCLE', priority: 'HIGH'   },
  SalaryRevision:     { approved: 'SALARY_REVISION_APPROVED',   rejected: 'SALARY_REVISION_REJECTED',   category: 'PAYROLL',            priority: 'HIGH'   },
  PayrollRun:         { approved: 'PAYROLL_APPROVED',           rejected: 'PAYROLL_REJECTED',           category: 'PAYROLL',            priority: 'HIGH'   },
};

/** ESS my-profile JSON: never expose full bank account — last 4 digits only (digits after stripping non-numeric). */
function bankAccountLast4Only(raw: string | null | undefined): string | null {
  if (raw == null || String(raw).trim() === '') return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 0) return null;
  if (digits.length <= 4) return digits;
  return digits.slice(-4);
}

interface ListOptions {
  page?: number;
  limit?: number;
}

interface ApprovalRequestListOptions extends ListOptions {
  status?: string;
  entityType?: string;
}

interface ITDeclarationListOptions extends ListOptions {
  employeeId?: string;
  financialYear?: string;
  status?: string;
}

/** One-line message for dashboard widget logs (avoids multi-line Prisma stack for P1001). */
function formatDashboardWidgetError(reason: unknown): string {
  const anyErr = reason as { code?: string; message?: string };
  if (anyErr?.code === 'P1001') {
    return 'Database unreachable — start PostgreSQL or fix DATABASE_URL.';
  }
  const msg = typeof anyErr?.message === 'string' ? anyErr.message : String(reason);
  if (msg.includes("Can't reach database server")) {
    return 'Database unreachable — start PostgreSQL or fix DATABASE_URL.';
  }
  const first = msg
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  const line = first ?? msg;
  return line.length > 220 ? `${line.slice(0, 220)}…` : line;
}

export class ESSService {
  // ────────────────────────────────────────────────────────────────────
  // ESS Config (singleton upsert)
  // ────────────────────────────────────────────────────────────────────

  async getESSConfig(companyId: string) {
    let config = await platformPrisma.eSSConfig.findUnique({ where: { companyId } });

    if (!config) {
      logger.info(`ESSConfig missing for company ${companyId}, auto-seeding defaults`);
      config = await platformPrisma.eSSConfig.create({
        data: { companyId },
      });
    }

    return config;
  }

  async updateESSConfig(companyId: string, data: any, userId?: string) {
    const config = await platformPrisma.eSSConfig.upsert({
      where: { companyId },
      create: {
        companyId,
        ...data,
        updatedBy: userId ?? null,
      },
      update: {
        // Payroll & Tax
        ...(data.viewPayslips !== undefined && { viewPayslips: data.viewPayslips }),
        ...(data.downloadPayslips !== undefined && { downloadPayslips: data.downloadPayslips }),
        ...(data.downloadForm16 !== undefined && { downloadForm16: data.downloadForm16 }),
        ...(data.viewSalaryStructure !== undefined && { viewSalaryStructure: data.viewSalaryStructure }),
        ...(data.itDeclaration !== undefined && { itDeclaration: data.itDeclaration }),

        // Leave
        ...(data.leaveApplication !== undefined && { leaveApplication: data.leaveApplication }),
        ...(data.leaveBalanceView !== undefined && { leaveBalanceView: data.leaveBalanceView }),
        ...(data.leaveCancellation !== undefined && { leaveCancellation: data.leaveCancellation }),

        // Attendance
        ...(data.attendanceView !== undefined && { attendanceView: data.attendanceView }),
        ...(data.attendanceRegularization !== undefined && { attendanceRegularization: data.attendanceRegularization }),
        ...(data.viewShiftSchedule !== undefined && { viewShiftSchedule: data.viewShiftSchedule }),
        ...(data.shiftSwapRequest !== undefined && { shiftSwapRequest: data.shiftSwapRequest }),
        ...(data.wfhRequest !== undefined && { wfhRequest: data.wfhRequest }),

        // Profile & Documents
        ...(data.profileUpdate !== undefined && { profileUpdate: data.profileUpdate }),
        ...(data.documentUpload !== undefined && { documentUpload: data.documentUpload }),
        ...(data.employeeDirectory !== undefined && { employeeDirectory: data.employeeDirectory }),
        ...(data.viewOrgChart !== undefined && { viewOrgChart: data.viewOrgChart }),

        // Financial
        ...(data.reimbursementClaims !== undefined && { reimbursementClaims: data.reimbursementClaims }),
        ...(data.loanApplication !== undefined && { loanApplication: data.loanApplication }),
        ...(data.assetView !== undefined && { assetView: data.assetView }),

        // Performance & Development
        ...(data.performanceGoals !== undefined && { performanceGoals: data.performanceGoals }),
        ...(data.appraisalAccess !== undefined && { appraisalAccess: data.appraisalAccess }),
        ...(data.feedback360 !== undefined && { feedback360: data.feedback360 }),
        ...(data.trainingEnrollment !== undefined && { trainingEnrollment: data.trainingEnrollment }),

        // Support & Communication
        ...(data.helpDesk !== undefined && { helpDesk: data.helpDesk }),
        ...(data.grievanceSubmission !== undefined && { grievanceSubmission: data.grievanceSubmission }),
        ...(data.holidayCalendar !== undefined && { holidayCalendar: data.holidayCalendar }),
        ...(data.policyDocuments !== undefined && { policyDocuments: data.policyDocuments }),
        ...(data.announcementBoard !== undefined && { announcementBoard: data.announcementBoard }),

        // Manager Self-Service (MSS)
        ...(data.mssViewTeam !== undefined && { mssViewTeam: data.mssViewTeam }),
        ...(data.mssApproveLeave !== undefined && { mssApproveLeave: data.mssApproveLeave }),
        ...(data.mssApproveAttendance !== undefined && { mssApproveAttendance: data.mssApproveAttendance }),
        ...(data.mssViewTeamAttendance !== undefined && { mssViewTeamAttendance: data.mssViewTeamAttendance }),

        // Mobile Behavior
        ...(data.mobileOfflinePunch !== undefined && { mobileOfflinePunch: data.mobileOfflinePunch }),
        ...(data.mobileSyncRetryMinutes !== undefined && { mobileSyncRetryMinutes: data.mobileSyncRetryMinutes }),
        ...(data.mobileLocationAccuracy !== undefined && { mobileLocationAccuracy: data.mobileLocationAccuracy }),

        updatedBy: userId ?? null,
      },
    });

    await invalidateESSConfig(companyId);
    return config;
  }

  // ────────────────────────────────────────────────────────────────────
  // Approval Workflows
  // ────────────────────────────────────────────────────────────────────

  async listWorkflows(companyId: string) {
    const workflows = await platformPrisma.approvalWorkflow.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { requests: true } },
      },
    });

    return workflows;
  }

  async getWorkflow(companyId: string, id: string) {
    const workflow = await platformPrisma.approvalWorkflow.findUnique({
      where: { id },
      include: {
        _count: { select: { requests: true } },
      },
    });

    if (!workflow || workflow.companyId !== companyId) {
      throw ApiError.notFound('Approval workflow not found');
    }

    return workflow;
  }

  async createWorkflow(companyId: string, data: any) {
    // Validate unique triggerEvent per company
    const existing = await platformPrisma.approvalWorkflow.findUnique({
      where: { companyId_triggerEvent: { companyId, triggerEvent: data.triggerEvent } },
    });
    if (existing) {
      throw ApiError.conflict(`Workflow for trigger event "${data.triggerEvent}" already exists`);
    }

    return platformPrisma.approvalWorkflow.create({
      data: {
        companyId,
        name: data.name,
        triggerEvent: data.triggerEvent,
        steps: data.steps,
        isActive: data.isActive ?? true,
      },
    });
  }

  async updateWorkflow(companyId: string, id: string, data: any) {
    const workflow = await platformPrisma.approvalWorkflow.findUnique({ where: { id } });
    if (!workflow || workflow.companyId !== companyId) {
      throw ApiError.notFound('Approval workflow not found');
    }

    // If triggerEvent is changing, check uniqueness
    if (data.triggerEvent && data.triggerEvent !== workflow.triggerEvent) {
      const existing = await platformPrisma.approvalWorkflow.findUnique({
        where: { companyId_triggerEvent: { companyId, triggerEvent: data.triggerEvent } },
      });
      if (existing) {
        throw ApiError.conflict(`Workflow for trigger event "${data.triggerEvent}" already exists`);
      }
    }

    return platformPrisma.approvalWorkflow.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.triggerEvent !== undefined && { triggerEvent: data.triggerEvent }),
        ...(data.steps !== undefined && { steps: data.steps }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async deleteWorkflow(companyId: string, id: string) {
    const workflow = await platformPrisma.approvalWorkflow.findUnique({ where: { id } });
    if (!workflow || workflow.companyId !== companyId) {
      throw ApiError.notFound('Approval workflow not found');
    }

    // Check no active requests
    const activeRequests = await platformPrisma.approvalRequest.count({
      where: { workflowId: id, status: { in: ['PENDING', 'IN_PROGRESS'] } },
    });
    if (activeRequests > 0) {
      throw ApiError.badRequest(`Cannot delete: ${activeRequests} active approval request(s) use this workflow`);
    }

    await platformPrisma.approvalWorkflow.delete({ where: { id } });
    return { message: 'Approval workflow deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Approval Requests
  // ────────────────────────────────────────────────────────────────────

  async listRequests(companyId: string, options: ApprovalRequestListOptions = {}) {
    const { page = 1, limit = 25, status, entityType } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (status) where.status = status.toUpperCase();
    if (entityType) where.entityType = entityType;

    const [requests, total] = await Promise.all([
      platformPrisma.approvalRequest.findMany({
        where,
        include: {
          workflow: { select: { id: true, name: true, triggerEvent: true, steps: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.approvalRequest.count({ where }),
    ]);

    // Enrich with employee names from requesterId
    const enriched = await this.enrichRequestsWithEmployeeNames(requests);

    return { requests: enriched, total, page, limit };
  }

  async getRequest(companyId: string, id: string) {
    const request = await platformPrisma.approvalRequest.findUnique({
      where: { id },
      include: {
        workflow: { select: { id: true, name: true, triggerEvent: true, steps: true } },
      },
    });

    if (!request || request.companyId !== companyId) {
      throw ApiError.notFound('Approval request not found');
    }

    return request;
  }

  async getPendingForUser(companyId: string, userId: string) {
    // Get requests where user is directly responsible
    const directRequests = await platformPrisma.approvalRequest.findMany({
      where: {
        companyId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
      include: {
        workflow: { select: { id: true, name: true, triggerEvent: true, steps: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Also check if user is a delegate for any manager who has pending approvals
    const delegations = await platformPrisma.managerDelegate.findMany({
      where: {
        companyId,
        delegateId: userId,
        isActive: true,
        fromDate: { lte: new Date() },
        toDate: { gte: new Date() },
      },
      select: { managerId: true },
    });

    // Enrich with employee names
    const enriched = await this.enrichRequestsWithEmployeeNames(directRequests);

    // Mark requests with delegation info
    const delegateManagerIds = new Set(delegations.map(d => d.managerId));

    return enriched.map(req => ({
      ...req,
      isDelegated: false,
      delegatedFromManagerIds: delegateManagerIds.size > 0 ? Array.from(delegateManagerIds) : undefined,
    }));
  }

  /**
   * Batch-resolve employee names from requesterId for approval request cards.
   */
  private async enrichRequestsWithEmployeeNames(requests: any[]) {
    if (requests.length === 0) return requests;
    const requesterIds = [...new Set(requests.map(r => r.requesterId).filter(Boolean))];
    const employees = await platformPrisma.employee.findMany({
      where: { id: { in: requesterIds } },
      select: { id: true, firstName: true, lastName: true, employeeId: true },
    });
    const employeeMap = new Map(employees.map(e => [e.id, e]));
    return requests.map(req => {
      const emp = employeeMap.get(req.requesterId);
      const dataObj = req.data as Record<string, any> | null;
      const employeeName = emp
        ? `${emp.firstName ?? ''} ${emp.lastName ?? ''}`.trim()
        : dataObj?.employee_name ?? dataObj?.employeeName ?? 'Employee';
      return { ...req, employeeName, employee: emp ?? undefined };
    });
  }

  async approveStep(companyId: string, requestId: string, userId: string, note?: string) {
    // Use a transaction with optimistic concurrency to prevent two approvers
    // from simultaneously approving the same step.
    return platformPrisma.$transaction(async (tx) => {
      const request = await tx.approvalRequest.findUnique({
        where: { id: requestId },
        include: { workflow: true },
      });

      if (!request || request.companyId !== companyId) {
        throw ApiError.notFound('Approval request not found');
      }

      if (request.status !== 'PENDING' && request.status !== 'IN_PROGRESS') {
        throw ApiError.badRequest('Request is not in a pending state');
      }

      const steps = request.workflow.steps as any[];
      const currentStep = request.currentStep;
      const totalSteps = steps.length;

      // Role-based approval validation: check if the current step has an approverRole restriction
      const stepConfig = steps.find((s: any) => s.stepOrder === currentStep);
      if (stepConfig && stepConfig.approverRole) {
        await this.validateApproverRole(companyId, request.requesterId, userId, stepConfig.approverRole);
      }

      // Optimistic concurrency: ensure the step hasn't already been acted on by
      // another concurrent approver. We use currentStep + status as the concurrency guard.
      const guard = await tx.approvalRequest.updateMany({
        where: {
          id: requestId,
          currentStep,
          status: request.status,
        },
        data: { updatedAt: new Date() }, // Touch to acquire the row
      });

      if (guard.count === 0) {
        throw ApiError.conflict('This approval step has already been processed by another approver');
      }

      // Build step history entry
      const historyEntry = {
        step: currentStep,
        action: 'approve',
        by: userId,
        at: new Date().toISOString(),
        note: note ?? null,
      };

      const existingHistory = (request.stepHistory as any[]) ?? [];
      const updatedHistory = [...existingHistory, historyEntry];

      if (currentStep >= totalSteps) {
        // Last step — mark as APPROVED
        const updatedRequest = await tx.approvalRequest.update({
          where: { id: requestId },
          data: {
            status: 'APPROVED',
            stepHistory: updatedHistory,
          },
          include: {
            workflow: { select: { id: true, name: true, triggerEvent: true } },
          },
        });

        // Callback: update source entity status based on entityType
        await this.onApprovalComplete(companyId, request.entityType, request.entityId, 'APPROVED');

        return updatedRequest;
      }

      // Advance to next step
      return tx.approvalRequest.update({
        where: { id: requestId },
        data: {
          currentStep: currentStep + 1,
          status: 'IN_PROGRESS',
          stepHistory: updatedHistory,
        },
        include: {
          workflow: { select: { id: true, name: true, triggerEvent: true } },
        },
      });
    });
  }

  /**
   * Validates that the approver is assigned to the RBAC Role specified in the
   * current workflow step. The `approverRole` field stores a dynamic Role ID
   * (cuid) from the Roles & Permissions system.
   *
   * COMPANY_ADMIN users are always allowed to approve any step.
   */
  private async validateApproverRole(
    companyId: string,
    _requesterId: string,
    approverId: string,
    approverRole: string,
  ) {
    // Resolve the approver to a user record
    const approverUser = await platformPrisma.user.findFirst({
      where: {
        OR: [{ id: approverId }, { employee: { id: approverId } }],
        companyId,
      },
      select: {
        id: true,
        role: true,
        tenantUsers: {
          where: { isActive: true },
          select: { roleId: true },
        },
      },
    });

    if (!approverUser) {
      throw ApiError.badRequest('Approver user not found');
    }

    // COMPANY_ADMIN can always approve
    if (approverUser.role === 'COMPANY_ADMIN') return;

    // Check if the approver is assigned to the required RBAC role
    const hasRole = approverUser.tenantUsers.some((tu) => tu.roleId === approverRole);
    if (hasRole) return;

    // Fetch role name for a user-friendly error message
    const role = await platformPrisma.role.findUnique({
      where: { id: approverRole },
      select: { name: true },
    });
    const roleName = role?.name ?? approverRole;

    throw ApiError.badRequest(
      `This approval step requires the "${roleName}" role. You are not authorized to approve this request.`
    );
  }

  async rejectRequest(companyId: string, requestId: string, userId: string, note: string) {
    const request = await platformPrisma.approvalRequest.findUnique({
      where: { id: requestId },
    });

    if (!request || request.companyId !== companyId) {
      throw ApiError.notFound('Approval request not found');
    }

    if (request.status !== 'PENDING' && request.status !== 'IN_PROGRESS') {
      throw ApiError.badRequest('Request is not in a pending state');
    }

    const historyEntry = {
      step: request.currentStep,
      action: 'reject',
      by: userId,
      at: new Date().toISOString(),
      note,
    };

    const existingHistory = (request.stepHistory as any[]) ?? [];
    const updatedHistory = [...existingHistory, historyEntry];

    const updatedRequest = await platformPrisma.approvalRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        stepHistory: updatedHistory,
      },
      include: {
        workflow: { select: { id: true, name: true, triggerEvent: true } },
      },
    });

    // Callback: update source entity status based on entityType
    await this.onApprovalComplete(companyId, request.entityType, request.entityId, 'REJECTED');

    return updatedRequest;
  }

  /** Called when an approval request completes (final step approved or rejected).
   *  Also invoked by the SLA worker for auto-approve/auto-reject. */
  async onApprovalComplete(companyId: string, entityType: string, entityId: string, decision: 'APPROVED' | 'REJECTED') {
    try {
      switch (entityType) {
        case 'PayrollRun':
          if (decision === 'APPROVED') {
            await platformPrisma.payrollRun.update({
              where: { id: entityId },
              data: { status: 'APPROVED', approvedAt: new Date() },
            });
          }
          break;

        case 'SalaryRevision':
          await platformPrisma.salaryRevision.update({
            where: { id: entityId },
            data: {
              status: decision === 'APPROVED' ? 'APPROVED' : 'DRAFT',
              ...(decision === 'APPROVED' && { approvedAt: new Date() }),
            },
          });
          break;

        case 'ExitRequest':
          if (decision === 'APPROVED') {
            await platformPrisma.exitRequest.update({
              where: { id: entityId },
              data: { status: 'NOTICE_PERIOD' },
            });
          } else {
            // On rejection, revert employee status
            const exitReq = await platformPrisma.exitRequest.findUnique({
              where: { id: entityId },
              select: { employeeId: true },
            });
            if (exitReq) {
              await platformPrisma.employee.update({
                where: { id: exitReq.employeeId },
                data: { status: 'ACTIVE', lastWorkingDate: null, exitReason: null },
              });
            }
            await platformPrisma.exitRequest.update({
              where: { id: entityId },
              data: { status: 'INITIATED' },
            });
          }
          break;

        case 'EmployeeTransfer':
          if (decision === 'APPROVED') {
            // Apply the transfer to the employee
            const transfer = await platformPrisma.employeeTransfer.findUnique({
              where: { id: entityId },
            });
            if (transfer) {
              await platformPrisma.employeeTransfer.update({
                where: { id: entityId },
                data: { status: 'APPROVED' },
              });
              // Update employee's department/designation/location/manager
              const updateData: any = {};
              if (transfer.toDepartmentId) updateData.departmentId = transfer.toDepartmentId;
              if (transfer.toDesignationId) updateData.designationId = transfer.toDesignationId;
              if (transfer.toLocationId) updateData.locationId = transfer.toLocationId;
              if (transfer.toManagerId) updateData.reportingManagerId = transfer.toManagerId;
              if (Object.keys(updateData).length > 0) {
                await platformPrisma.employee.update({
                  where: { id: transfer.employeeId },
                  data: updateData,
                });
              }
            }
          } else {
            await platformPrisma.employeeTransfer.update({
              where: { id: entityId },
              data: { status: 'REJECTED' },
            });
          }
          break;

        case 'EmployeePromotion':
          if (decision === 'APPROVED') {
            await platformPrisma.employeeTransfer.update({
              where: { id: entityId },
              data: { status: 'APPROVED' },
            });
          } else {
            await platformPrisma.employeeTransfer.update({
              where: { id: entityId },
              data: { status: 'REJECTED' },
            });
          }
          break;

        case 'LeaveRequest': {
          // Use dynamic import to avoid circular dependencies
          const { leaveService } = await import('../leave/leave.service');
          if (decision === 'APPROVED') {
            // approveRequest handles: updating status, creating attendance records
            await leaveService.approveRequest(companyId, entityId, 'system');
          } else {
            // Rejection via workflow — refund balance
            await leaveService.rejectRequest(companyId, entityId, 'system', 'Rejected via approval workflow');
          }
          break;
        }

        case 'AttendanceOverride': {
          // Check if the override is still PENDING before processing
          // (processOverride also checks this, avoiding double-update)
          const overrideCheck = await platformPrisma.attendanceOverride.findUnique({
            where: { id: entityId },
            select: { companyId: true, status: true },
          });
          if (overrideCheck && overrideCheck.status === 'PENDING') {
            // Use dynamic import to avoid circular dependencies
            const { attendanceService } = await import('../attendance/attendance.service');
            // processOverride handles everything:
            // - Applying corrected punch times
            // - Recalculating worked hours
            // - Re-evaluating status (PRESENT/HALF_DAY)
            // - Handling ABSENT_OVERRIDE and LATE_OVERRIDE
            // - Setting isRegularized flag
            // - Updating override status to APPROVED/REJECTED
            await attendanceService.processOverride(overrideCheck.companyId, entityId, 'system', decision);
          }
          break;
        }

        case 'ShiftSwapRequest': {
          const swapReq = await platformPrisma.shiftSwapRequest.findUnique({
            where: { id: entityId },
          });
          if (swapReq) {
            if (decision === 'APPROVED') {
              // Apply the shift change to the employee
              await platformPrisma.employee.update({
                where: { id: swapReq.employeeId },
                data: { shiftId: swapReq.requestedShiftId },
              });
              await platformPrisma.shiftSwapRequest.update({
                where: { id: entityId },
                data: { status: 'APPROVED', approvedBy: 'system', approvedAt: new Date() },
              });
              // Update the shift on any existing attendance record for the swap date
              await platformPrisma.attendanceRecord.updateMany({
                where: {
                  employeeId: swapReq.employeeId,
                  date: swapReq.swapDate,
                },
                data: { shiftId: swapReq.requestedShiftId },
              });
            } else {
              await platformPrisma.shiftSwapRequest.update({
                where: { id: entityId },
                data: { status: 'REJECTED' },
              });
            }
          }
          break;
        }

        case 'ExpenseClaim': {
          const expenseClaim = await platformPrisma.expenseClaim.findUnique({
            where: { id: entityId },
          });
          if (expenseClaim) {
            if (decision === 'APPROVED') {
              await platformPrisma.expenseClaim.update({
                where: { id: entityId },
                data: {
                  status: 'APPROVED',
                  approvedBy: 'system',
                  approvedAt: new Date(),
                  approvedAmount: expenseClaim.amount, // Full approval by default via workflow
                },
              });
              // Also approve all line items if they exist
              await platformPrisma.expenseClaimItem.updateMany({
                where: { claimId: entityId },
                data: { isApproved: true },
              });
            } else {
              await platformPrisma.expenseClaim.update({
                where: { id: entityId },
                data: {
                  status: 'REJECTED',
                  rejectionReason: 'Rejected via approval workflow',
                },
              });
              // Mark all line items as rejected
              await platformPrisma.expenseClaimItem.updateMany({
                where: { claimId: entityId },
                data: { isApproved: false, rejectionReason: 'Claim rejected via approval workflow' },
              });
            }
          }
          break;
        }

        case 'WfhRequest':
          await platformPrisma.wfhRequest.update({
            where: { id: entityId },
            data: {
              status: decision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
              ...(decision === 'APPROVED' && { approvedAt: new Date() }),
            },
          });
          break;

        case 'LoanRecord':
          await platformPrisma.loanRecord.update({
            where: { id: entityId },
            data: {
              status: decision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
              ...(decision === 'APPROVED' && { approvedBy: 'system' }),
            },
          });
          break;

        case 'Visit': {
          const { visitService } = await import('../../visitors/core/visit.service');
          if (decision === 'APPROVED') {
            await visitService.approveVisit(companyId, entityId, 'system');
          } else {
            await visitService.rejectVisit(companyId, entityId, 'system', 'Approval workflow rejected');
          }
          break;
        }

        default:
          // Unknown entity type — log but don't fail
          break;
      }
    } catch (error) {
      // Log the callback error but don't fail the approval
      // The approval itself succeeded; entity update failure should be retryable
      logger.error(`Approval callback failed for ${entityType}/${entityId}:`, error);
    }

    // Universal post-switch dispatch — fires one notification to the
    // requester per (entityType, decision). Isolated in its own try/catch
    // so that a notification bug never blocks the approval callback or
    // leaks into other entity types. The business status updates in the
    // switch above have already committed by the time we get here.
    try {
      const trigger = TRIGGER_BY_ENTITY[entityType];
      if (trigger) {
        const approvalRequest = await platformPrisma.approvalRequest.findFirst({
          where: { entityType, entityId },
          select: { requesterId: true, data: true },
        });
        const requesterUserId = await getRequesterUserId({
          employeeId: approvalRequest?.requesterId,
          userId: approvalRequest?.requesterId,
        });
        if (requesterUserId) {
          const snapshotTokens =
            approvalRequest?.data && typeof approvalRequest.data === 'object'
              ? (approvalRequest.data as Record<string, unknown>)
              : {};
          await notificationService.dispatch({
            companyId,
            triggerEvent:
              decision === 'APPROVED' ? trigger.approved : trigger.rejected,
            entityType,
            entityId,
            explicitRecipients: [requesterUserId],
            tokens: snapshotTokens,
            priority: trigger.priority,
            type: trigger.category,
          });
        }
      }
    } catch (dispatchErr) {
      logger.error(`Approval dispatch failed for ${entityType}/${entityId} (non-fatal)`, {
        error: dispatchErr,
        decision,
      });
    }
  }

  /**
   * Validate that an active approval workflow exists for a trigger event.
   * Call this BEFORE creating the entity to avoid orphaned records.
   * Throws a user-friendly error if no workflow is configured.
   */
  async requireWorkflow(companyId: string, triggerEvent: string): Promise<void> {
    const workflow = await platformPrisma.approvalWorkflow.findUnique({
      where: { companyId_triggerEvent: { companyId, triggerEvent } },
    });

    if (!workflow || !workflow.isActive) {
      const { TRIGGER_EVENTS } = await import('../../../shared/constants/trigger-events');
      const eventLabel = TRIGGER_EVENTS.find(e => e.value === triggerEvent)?.label ?? triggerEvent;
      throw ApiError.badRequest(
        `No approval workflow is configured for "${eventLabel}". Please ask your Company Admin or HR to set up an approval workflow for this request type before proceeding.`,
      );
    }
  }

  async createRequest(companyId: string, data: {
    requesterId: string;
    entityType: string;
    entityId: string;
    triggerEvent: string;
    data?: any;
  }) {
    // Find matching workflow — requireWorkflow() should have been called before entity creation
    const workflow = await platformPrisma.approvalWorkflow.findUnique({
      where: { companyId_triggerEvent: { companyId, triggerEvent: data.triggerEvent } },
    });

    if (!workflow || !workflow.isActive) {
      const { TRIGGER_EVENTS } = await import('../../../shared/constants/trigger-events');
      const eventLabel = TRIGGER_EVENTS.find(e => e.value === data.triggerEvent)?.label ?? data.triggerEvent;
      throw ApiError.badRequest(
        `No approval workflow is configured for "${eventLabel}". Please ask your Company Admin or HR to set up an approval workflow for this request type before proceeding.`,
      );
    }

    const created = await platformPrisma.approvalRequest.create({
      data: {
        companyId,
        workflowId: workflow.id,
        requesterId: data.requesterId,
        entityType: data.entityType,
        entityId: data.entityId,
        currentStep: 1,
        status: 'PENDING',
        stepHistory: [],
        data: data.data ?? Prisma.JsonNull,
      },
    });

    // Non-blocking submission notification. Because every ESS submission
    // flows through this method, wiring the dispatch here covers all 13+
    // request types in one place (leave, shift change/swap, WFH, profile,
    // reimbursement, loan, IT declaration, travel, helpdesk, grievance,
    // overtime, training, attendance regularization, etc.).
    //
    // Token enrichment is intentionally minimal — rule templates are
    // responsible for reading from `data.data` (the submission payload
    // snapshot stored on ApprovalRequest) if they need entity fields.
    try {
      const approverIds = await getCurrentStepApproverIds(data.entityType, data.entityId);
      const requesterUserId = await getRequesterUserId({
        employeeId: data.requesterId,
        userId: data.requesterId,
      });
      await notificationService.dispatch({
        companyId,
        triggerEvent: data.triggerEvent,
        entityType: data.entityType,
        entityId: data.entityId,
        recipientContext: {
          ...(requesterUserId && { requesterId: requesterUserId }),
          approverIds,
        },
        tokens: (data.data && typeof data.data === 'object'
          ? (data.data as Record<string, unknown>)
          : {}),
        type: categoryForTrigger(data.triggerEvent),
      });
    } catch (err) {
      logger.warn('ESS submission dispatch failed (non-blocking)', {
        error: err,
        triggerEvent: data.triggerEvent,
        entityType: data.entityType,
        entityId: data.entityId,
      });
    }

    return created;
  }

  // ────────────────────────────────────────────────────────────────────
  // Auto-Escalation (intended for cron job invocation)
  // ────────────────────────────────────────────────────────────────────

  /**
   * Finds approval requests where the current step has been PENDING longer than
   * the step's configured `slaHours`. If the workflow step has `autoEscalate: true`,
   * advances the request to the next step. Can be called by a cron job.
   */
  async checkAndEscalateApprovals() {
    const now = new Date();

    // Find all pending/in-progress approval requests
    const pendingRequests = await platformPrisma.approvalRequest.findMany({
      where: {
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
      include: {
        workflow: true,
      },
    });

    let escalatedCount = 0;

    for (const request of pendingRequests) {
      try {
        const steps = request.workflow.steps as any[];
        const currentStepConfig = steps.find((s: any) => s.stepOrder === request.currentStep);

        if (!currentStepConfig || !currentStepConfig.slaHours || !currentStepConfig.autoEscalate) {
          continue; // No SLA or auto-escalation configured for this step
        }

        // Determine when the current step started
        const stepHistory = (request.stepHistory as any[]) ?? [];
        const lastStepEntry = stepHistory
          .filter((h: any) => h.step === request.currentStep - 1)
          .sort((a: any, b: any) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];

        const stepStartedAt = lastStepEntry ? new Date(lastStepEntry.at) : request.createdAt;
        const elapsedHours = (now.getTime() - stepStartedAt.getTime()) / (1000 * 60 * 60);

        if (elapsedHours < currentStepConfig.slaHours) {
          continue; // SLA not yet breached
        }

        // SLA breached — escalate to next step
        const totalSteps = steps.length;
        const historyEntry = {
          step: request.currentStep,
          action: 'auto_escalate',
          by: 'system',
          at: now.toISOString(),
          note: `Auto-escalated after ${Math.round(elapsedHours)}h (SLA: ${currentStepConfig.slaHours}h)`,
        };

        const updatedHistory = [...stepHistory, historyEntry];

        if (request.currentStep >= totalSteps) {
          // Last step breached — auto-approve the request
          await platformPrisma.approvalRequest.update({
            where: { id: request.id },
            data: {
              status: 'APPROVED',
              stepHistory: updatedHistory,
            },
          });

          await this.onApprovalComplete(request.companyId, request.entityType, request.entityId, 'APPROVED');

          logger.info(
            `Auto-escalation: request ${request.id} auto-approved (final step SLA breached after ${Math.round(elapsedHours)}h)`
          );
        } else {
          // Advance to next step
          await platformPrisma.approvalRequest.update({
            where: { id: request.id },
            data: {
              currentStep: request.currentStep + 1,
              status: 'IN_PROGRESS',
              stepHistory: updatedHistory,
            },
          });

          logger.info(
            `Auto-escalation: request ${request.id} advanced from step ${request.currentStep} to ${request.currentStep + 1} (SLA breached after ${Math.round(elapsedHours)}h)`
          );
        }

        escalatedCount++;
      } catch (error) {
        logger.error(`Auto-escalation failed for request ${request.id}:`, error);
      }
    }

    logger.info(`Auto-escalation check complete: ${escalatedCount} request(s) escalated out of ${pendingRequests.length} pending`);
    return { escalated: escalatedCount, checked: pendingRequests.length };
  }

  // ────────────────────────────────────────────────────────────────────
  // Manager Delegates
  // ────────────────────────────────────────────────────────────────────

  async getActiveDelegates(companyId: string, managerId: string): Promise<string[]> {
    const today = new Date();
    const delegates = await platformPrisma.managerDelegate.findMany({
      where: {
        companyId,
        managerId,
        isActive: true,
        fromDate: { lte: today },
        toDate: { gte: today },
      },
      select: { delegateId: true },
    });
    return delegates.map(d => d.delegateId);
  }

  async listDelegates(companyId: string, managerId?: string) {
    const where: any = { companyId };
    if (managerId) where.managerId = managerId;
    return platformPrisma.managerDelegate.findMany({
      where,
      include: {
        manager: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
        delegate: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
      },
      orderBy: { fromDate: 'desc' },
    });
  }

  async createDelegate(companyId: string, data: { managerId: string; delegateId: string; fromDate: string; toDate: string; reason?: string | undefined }) {
    // Validate manager and delegate exist and belong to company
    const [manager, delegate] = await Promise.all([
      platformPrisma.employee.findUnique({ where: { id: data.managerId }, select: { id: true, companyId: true } }),
      platformPrisma.employee.findUnique({ where: { id: data.delegateId }, select: { id: true, companyId: true } }),
    ]);
    if (!manager || manager.companyId !== companyId) {
      throw ApiError.badRequest('Manager not found in this company');
    }
    if (!delegate || delegate.companyId !== companyId) {
      throw ApiError.badRequest('Delegate not found in this company');
    }

    // Validate no overlap with existing active delegation for same manager
    const fromDate = new Date(data.fromDate);
    const toDate = new Date(data.toDate);
    const overlap = await platformPrisma.managerDelegate.findFirst({
      where: {
        companyId,
        managerId: data.managerId,
        isActive: true,
        fromDate: { lte: toDate },
        toDate: { gte: fromDate },
      },
    });
    if (overlap) {
      throw ApiError.badRequest('An active delegation already exists for this manager in the specified date range');
    }

    return platformPrisma.managerDelegate.create({
      data: {
        companyId,
        managerId: data.managerId,
        delegateId: data.delegateId,
        fromDate,
        toDate,
        reason: data.reason ?? null,
        isActive: true,
      },
      include: {
        manager: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
        delegate: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
      },
    });
  }

  async revokeDelegate(companyId: string, id: string) {
    const delegation = await platformPrisma.managerDelegate.findUnique({ where: { id } });
    if (!delegation || delegation.companyId !== companyId) {
      throw ApiError.notFound('Delegation not found');
    }
    return platformPrisma.managerDelegate.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Notification Templates
  // ────────────────────────────────────────────────────────────────────

  async listTemplates(companyId: string, options: ListOptions = {}) {
    const { page = 1, limit = 25 } = options;
    const offset = (page - 1) * limit;

    const where = { companyId };

    const [templates, total] = await Promise.all([
      platformPrisma.notificationTemplate.findMany({
        where,
        include: {
          _count: { select: { rules: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      platformPrisma.notificationTemplate.count({ where }),
    ]);

    return { templates, total, page, limit };
  }

  async getTemplate(companyId: string, id: string) {
    const template = await platformPrisma.notificationTemplate.findUnique({
      where: { id },
      include: { rules: true },
    });

    if (!template || template.companyId !== companyId) {
      throw ApiError.notFound('Notification template not found');
    }

    return template;
  }

  async createTemplate(companyId: string, data: any) {
    const created = await platformPrisma.notificationTemplate.create({
      data: {
        companyId,
        name: data.name,
        subject: n(data.subject),
        body: data.body,
        channel: data.channel,
        isActive: data.isActive ?? true,
      },
    });
    // Invalidate company-wide rule cache since rules reference templates.
    await invalidateRuleCache(companyId);
    return created;
  }

  async updateTemplate(companyId: string, id: string, data: any) {
    const template = await platformPrisma.notificationTemplate.findUnique({ where: { id } });
    if (!template || template.companyId !== companyId) {
      throw ApiError.notFound('Notification template not found');
    }

    const updated = await platformPrisma.notificationTemplate.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.subject !== undefined && { subject: n(data.subject) }),
        ...(data.body !== undefined && { body: data.body }),
        ...(data.channel !== undefined && { channel: data.channel }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
    await invalidateRuleCache(companyId);
    return updated;
  }

  async deleteTemplate(companyId: string, id: string) {
    const template = await platformPrisma.notificationTemplate.findUnique({ where: { id } });
    if (!template || template.companyId !== companyId) {
      throw ApiError.notFound('Notification template not found');
    }

    // Cascade delete will remove associated rules
    await platformPrisma.notificationTemplate.delete({ where: { id } });
    await invalidateRuleCache(companyId);
    return { message: 'Notification template deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Notification Rules
  // ────────────────────────────────────────────────────────────────────

  async listRules(companyId: string, options: ListOptions = {}) {
    const { page = 1, limit = 25 } = options;
    const offset = (page - 1) * limit;

    const where = { companyId };

    const [rules, total] = await Promise.all([
      platformPrisma.notificationRule.findMany({
        where,
        include: {
          template: { select: { id: true, name: true, channel: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { triggerEvent: 'asc' },
      }),
      platformPrisma.notificationRule.count({ where }),
    ]);

    return { rules, total, page, limit };
  }

  async getRule(companyId: string, id: string) {
    const rule = await platformPrisma.notificationRule.findUnique({
      where: { id },
      include: {
        template: { select: { id: true, name: true, subject: true, body: true, channel: true } },
      },
    });

    if (!rule || rule.companyId !== companyId) {
      throw ApiError.notFound('Notification rule not found');
    }

    return rule;
  }

  async createRule(companyId: string, data: any) {
    // Validate templateId belongs to company
    const template = await platformPrisma.notificationTemplate.findUnique({
      where: { id: data.templateId },
    });
    if (!template || template.companyId !== companyId) {
      throw ApiError.badRequest('Notification template not found in this company');
    }

    const created = await platformPrisma.notificationRule.create({
      data: {
        companyId,
        triggerEvent: data.triggerEvent,
        templateId: data.templateId,
        recipientRole: data.recipientRole,
        channel: data.channel,
        isActive: data.isActive ?? true,
      },
      include: {
        template: { select: { id: true, name: true, channel: true } },
      },
    });
    await invalidateRuleCache(companyId, created.triggerEvent);
    return created;
  }

  async updateRule(companyId: string, id: string, data: any) {
    const rule = await platformPrisma.notificationRule.findUnique({ where: { id } });
    if (!rule || rule.companyId !== companyId) {
      throw ApiError.notFound('Notification rule not found');
    }

    // Validate templateId if changing
    if (data.templateId && data.templateId !== rule.templateId) {
      const template = await platformPrisma.notificationTemplate.findUnique({
        where: { id: data.templateId },
      });
      if (!template || template.companyId !== companyId) {
        throw ApiError.badRequest('Notification template not found in this company');
      }
    }

    const updated = await platformPrisma.notificationRule.update({
      where: { id },
      data: {
        ...(data.triggerEvent !== undefined && { triggerEvent: data.triggerEvent }),
        ...(data.templateId !== undefined && { templateId: data.templateId }),
        ...(data.recipientRole !== undefined && { recipientRole: data.recipientRole }),
        ...(data.channel !== undefined && { channel: data.channel }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      include: {
        template: { select: { id: true, name: true, channel: true } },
      },
    });
    // Invalidate both the old and new trigger event keys in case it changed.
    await invalidateRuleCache(companyId, rule.triggerEvent);
    if (updated.triggerEvent !== rule.triggerEvent) {
      await invalidateRuleCache(companyId, updated.triggerEvent);
    }
    return updated;
  }

  async deleteRule(companyId: string, id: string) {
    const rule = await platformPrisma.notificationRule.findUnique({ where: { id } });
    if (!rule || rule.companyId !== companyId) {
      throw ApiError.notFound('Notification rule not found');
    }

    await platformPrisma.notificationRule.delete({ where: { id } });
    await invalidateRuleCache(companyId, rule.triggerEvent);
    return { message: 'Notification rule deleted' };
  }

  /**
   * @deprecated Use `notificationService.dispatch()` directly.
   *
   * Legacy shim — delegates to the unified dispatcher so existing callers
   * continue to work during migration. The body previously re-implemented
   * rule loading + token rendering + per-channel delivery, duplicating the
   * notification pipeline. Kept only for source-compatibility; remove all
   * call sites and delete this method in a future cleanup.
   */
  async triggerNotification(companyId: string, event: string, data: Record<string, unknown>) {
    logger.warn('ess.triggerNotification is deprecated — use notificationService.dispatch', { event });
    return notificationService.dispatch({
      companyId,
      triggerEvent: event,
      tokens: data,
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // IT Declarations
  // ────────────────────────────────────────────────────────────────────

  async listDeclarations(companyId: string, options: ITDeclarationListOptions = {}) {
    const { page = 1, limit = 25, employeeId, financialYear, status } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (employeeId) where.employeeId = employeeId;
    if (financialYear) where.financialYear = financialYear;
    if (status) where.status = status.toUpperCase();

    const [declarations, total] = await Promise.all([
      platformPrisma.iTDeclaration.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              employeeId: true,
              firstName: true,
              lastName: true,
              department: { select: { id: true, name: true } },
            },
          },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.iTDeclaration.count({ where }),
    ]);

    return { declarations, total, page, limit };
  }

  async getDeclaration(companyId: string, id: string) {
    const declaration = await platformPrisma.iTDeclaration.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            department: { select: { id: true, name: true } },
            designation: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!declaration || declaration.companyId !== companyId) {
      throw ApiError.notFound('IT declaration not found');
    }

    return declaration;
  }

  async createDeclaration(companyId: string, data: any) {
    // Validate employee belongs to company
    const employee = await platformPrisma.employee.findUnique({
      where: { id: data.employeeId },
      select: { id: true, companyId: true },
    });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.badRequest('Employee not found in this company');
    }

    // Check unique per employee + financial year
    const existing = await platformPrisma.iTDeclaration.findUnique({
      where: {
        employeeId_financialYear: {
          employeeId: data.employeeId,
          financialYear: data.financialYear,
        },
      },
    });
    if (existing) {
      throw ApiError.conflict(`IT declaration for employee in FY ${data.financialYear} already exists`);
    }

    return platformPrisma.iTDeclaration.create({
      data: {
        companyId,
        employeeId: data.employeeId,
        financialYear: data.financialYear,
        regime: data.regime ?? 'NEW',
        section80C: data.section80C ?? Prisma.JsonNull,
        section80CCD: data.section80CCD ?? Prisma.JsonNull,
        section80D: data.section80D ?? Prisma.JsonNull,
        section80E: data.section80E ?? Prisma.JsonNull,
        section80G: data.section80G ?? Prisma.JsonNull,
        section80GG: data.section80GG ?? Prisma.JsonNull,
        section80TTA: data.section80TTA ?? Prisma.JsonNull,
        hraExemption: data.hraExemption ?? Prisma.JsonNull,
        ltaExemption: data.ltaExemption ?? Prisma.JsonNull,
        homeLoanInterest: data.homeLoanInterest ?? Prisma.JsonNull,
        otherIncome: data.otherIncome ?? Prisma.JsonNull,
        status: 'DRAFT',
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async updateDeclaration(companyId: string, id: string, data: any) {
    const declaration = await platformPrisma.iTDeclaration.findUnique({ where: { id } });
    if (!declaration || declaration.companyId !== companyId) {
      throw ApiError.notFound('IT declaration not found');
    }

    if (declaration.status !== 'DRAFT') {
      throw ApiError.badRequest('Only DRAFT declarations can be updated');
    }

    return platformPrisma.iTDeclaration.update({
      where: { id },
      data: {
        ...(data.regime !== undefined && { regime: data.regime }),
        ...(data.section80C !== undefined && { section80C: data.section80C ?? Prisma.JsonNull }),
        ...(data.section80CCD !== undefined && { section80CCD: data.section80CCD ?? Prisma.JsonNull }),
        ...(data.section80D !== undefined && { section80D: data.section80D ?? Prisma.JsonNull }),
        ...(data.section80E !== undefined && { section80E: data.section80E ?? Prisma.JsonNull }),
        ...(data.section80G !== undefined && { section80G: data.section80G ?? Prisma.JsonNull }),
        ...(data.section80GG !== undefined && { section80GG: data.section80GG ?? Prisma.JsonNull }),
        ...(data.section80TTA !== undefined && { section80TTA: data.section80TTA ?? Prisma.JsonNull }),
        ...(data.hraExemption !== undefined && { hraExemption: data.hraExemption ?? Prisma.JsonNull }),
        ...(data.ltaExemption !== undefined && { ltaExemption: data.ltaExemption ?? Prisma.JsonNull }),
        ...(data.homeLoanInterest !== undefined && { homeLoanInterest: data.homeLoanInterest ?? Prisma.JsonNull }),
        ...(data.otherIncome !== undefined && { otherIncome: data.otherIncome ?? Prisma.JsonNull }),
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async submitDeclaration(companyId: string, id: string) {
    const declaration = await platformPrisma.iTDeclaration.findUnique({ where: { id } });
    if (!declaration || declaration.companyId !== companyId) {
      throw ApiError.notFound('IT declaration not found');
    }

    if (declaration.status !== 'DRAFT') {
      throw ApiError.badRequest('Only DRAFT declarations can be submitted');
    }

    return platformPrisma.iTDeclaration.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    });
  }

  async verifyDeclaration(companyId: string, id: string, userId: string) {
    const declaration = await platformPrisma.iTDeclaration.findUnique({ where: { id } });
    if (!declaration || declaration.companyId !== companyId) {
      throw ApiError.notFound('IT declaration not found');
    }

    if (declaration.status !== 'SUBMITTED') {
      throw ApiError.badRequest('Only SUBMITTED declarations can be verified');
    }

    return platformPrisma.iTDeclaration.update({
      where: { id },
      data: {
        status: 'VERIFIED',
        verifiedBy: userId,
        verifiedAt: new Date(),
      },
    });
  }

  async lockDeclaration(companyId: string, id: string) {
    const declaration = await platformPrisma.iTDeclaration.findUnique({ where: { id } });
    if (!declaration || declaration.companyId !== companyId) {
      throw ApiError.notFound('IT declaration not found');
    }

    if (declaration.status !== 'VERIFIED') {
      throw ApiError.badRequest('Only VERIFIED declarations can be locked');
    }

    return platformPrisma.iTDeclaration.update({
      where: { id },
      data: {
        status: 'LOCKED',
      },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // ESS Self-Service (Employee-facing)
  // ────────────────────────────────────────────────────────────────────

  async getMyProfile(companyId: string, employeeId: string) {
    const employee = await platformPrisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, name: true } },
        grade: { select: { id: true, name: true, code: true } },
        employeeType: { select: { id: true, name: true } },
        shift: { select: { id: true, name: true, startTime: true, endTime: true } },
        location: { select: { id: true, name: true } },
        costCentre: { select: { id: true, name: true, code: true } },
        reportingManager: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
          },
        },
        functionalManager: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!employee || employee.companyId !== companyId) {
      throw ApiError.notFound('Employee not found');
    }

    // ESS my-profile: full read for self-service; bank account is last-4 only in JSON
    return {
      id: employee.id,
      employeeId: employee.employeeId,
      firstName: employee.firstName,
      middleName: employee.middleName,
      lastName: employee.lastName,
      dateOfBirth: employee.dateOfBirth,
      gender: employee.gender,
      maritalStatus: employee.maritalStatus,
      bloodGroup: employee.bloodGroup,
      nationality: employee.nationality,
      fatherMotherName: employee.fatherMotherName,
      personalMobile: employee.personalMobile,
      alternativeMobile: employee.alternativeMobile,
      personalEmail: employee.personalEmail,
      officialEmail: employee.officialEmail,
      profilePhotoUrl: employee.profilePhotoUrl,
      currentAddress: employee.currentAddress,
      permanentAddress: employee.permanentAddress,
      emergencyContactName: employee.emergencyContactName,
      emergencyContactRelation: employee.emergencyContactRelation,
      emergencyContactMobile: employee.emergencyContactMobile,
      joiningDate: employee.joiningDate,
      probationEndDate: employee.probationEndDate,
      confirmationDate: employee.confirmationDate,
      noticePeriodDays: employee.noticePeriodDays,
      department: employee.department,
      designation: employee.designation,
      grade: employee.grade,
      employeeType: employee.employeeType,
      shift: employee.shift,
      location: employee.location,
      costCentre: employee.costCentre,
      reportingManager: employee.reportingManager,
      functionalManager: employee.functionalManager,
      status: employee.status,
      workType: employee.workType,
      bankName: employee.bankName,
      bankAccountNumber: bankAccountLast4Only(employee.bankAccountNumber),
      bankIfscCode: employee.bankIfscCode,
      bankBranch: employee.bankBranch,
      accountType: employee.accountType,
      panNumber: employee.panNumber,
      aadhaarNumber: employee.aadhaarNumber,
      uan: employee.uan,
      esiIpNumber: employee.esiIpNumber,
    };
  }

  async getMyPayslips(companyId: string, employeeId: string) {
    const payslips = await platformPrisma.payslip.findMany({
      where: { companyId, employeeId },
      include: {
        payrollRun: {
          select: { id: true, month: true, year: true, status: true },
        },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    return payslips;
  }

  async getMyLeaveBalance(companyId: string, employeeId: string) {
    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings?.timezone ?? 'Asia/Kolkata';
    const currentYear = DateTime.now().setZone(companyTimezone).year;
    const balances = await platformPrisma.leaveBalance.findMany({
      where: { companyId, employeeId, year: currentYear },
      include: {
        leaveType: {
          select: { id: true, name: true, code: true, category: true },
        },
      },
    });

    return balances;
  }

  async getMyAttendance(companyId: string, employeeId: string, month: number, year: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Last day of month

    const records = await platformPrisma.attendanceRecord.findMany({
      where: {
        companyId,
        employeeId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        shift: { select: { id: true, name: true, startTime: true, endTime: true } },
      },
      orderBy: { date: 'asc' },
    });

    return records;
  }

  async getMyDeclarations(companyId: string, employeeId: string) {
    const declarations = await platformPrisma.iTDeclaration.findMany({
      where: { companyId, employeeId },
      orderBy: { financialYear: 'desc' },
    });

    return declarations;
  }

  async applyLeave(companyId: string, employeeId: string, data: any) {
    // Verify employee
    const employee = await platformPrisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, companyId: true, employeeId: true, firstName: true, lastName: true },
    });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.notFound('Employee not found');
    }

    // Validate approval workflow exists BEFORE creating the leave request
    await this.requireWorkflow(companyId, 'LEAVE_APPLICATION');

    // Create leave request
    const leaveRequest = await platformPrisma.leaveRequest.create({
      data: {
        companyId,
        employeeId,
        leaveTypeId: data.leaveTypeId,
        fromDate: new Date(data.fromDate),
        toDate: new Date(data.toDate),
        days: data.days,
        isHalfDay: data.isHalfDay ?? false,
        halfDayType: n(data.halfDayType),
        reason: data.reason,
        status: 'PENDING',
      },
    });

    // Deduct leave balance immediately on application
    await this.deductLeaveBalance(companyId, employeeId, data.leaveTypeId, Number(data.days), new Date(data.fromDate), new Date(data.toDate));

    // Create approval request — workflow is guaranteed to exist. The
    // createRequest helper itself emits the LEAVE_APPLICATION notification
    // via the unified dispatcher, so no separate triggerNotification call
    // is needed here.
    await this.createRequest(companyId, {
      requesterId: employeeId,
      entityType: 'LeaveRequest',
      entityId: leaveRequest.id,
      triggerEvent: 'LEAVE_APPLICATION',
      data: {
        employee_name: `${employee.firstName ?? ''} ${employee.lastName ?? ''}`.trim(),
        employeeId: employee.employeeId,
        leaveTypeId: data.leaveTypeId,
        fromDate: data.fromDate,
        toDate: data.toDate,
        from_date: data.fromDate,
        to_date: data.toDate,
        days: data.days,
        leave_days: data.days,
        reason: data.reason,
      },
    });

    return leaveRequest;
  }

  /**
   * Deduct leave balance when a leave application is submitted.
   * Handles cross-year leave requests by splitting days between years.
   * Balance is refunded if the request is later rejected via `leaveService.rejectRequest`.
   */
  private async deductLeaveBalance(
    companyId: string,
    employeeId: string,
    leaveTypeId: string,
    days: number,
    fromDate: Date,
    toDate: Date,
  ): Promise<void> {
    const fromYear = fromDate.getFullYear();
    const toYear = toDate.getFullYear();

    if (fromYear !== toYear) {
      // Cross-year: split deduction between both years
      const yearEnd = new Date(fromYear, 11, 31);
      yearEnd.setHours(0, 0, 0, 0);
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);
      const daysInFromYear = Math.round(
        (yearEnd.getTime() - from.getTime()) / (1000 * 3600 * 24) + 1,
      );
      const daysInToYear = days - daysInFromYear;

      const operations: any[] = [];

      if (daysInFromYear > 0) {
        const bal = await platformPrisma.leaveBalance.findUnique({
          where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year: fromYear } },
        });
        if (bal) {
          operations.push(
            platformPrisma.leaveBalance.update({
              where: { id: bal.id },
              data: { taken: { increment: daysInFromYear }, balance: { decrement: daysInFromYear } },
            }),
          );
        }
      }

      if (daysInToYear > 0) {
        const bal = await platformPrisma.leaveBalance.findUnique({
          where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year: toYear } },
        });
        if (bal) {
          operations.push(
            platformPrisma.leaveBalance.update({
              where: { id: bal.id },
              data: { taken: { increment: daysInToYear }, balance: { decrement: daysInToYear } },
            }),
          );
        }
      }

      if (operations.length > 0) {
        await platformPrisma.$transaction(operations);
      }
    } else {
      // Same-year deduction
      const balance = await platformPrisma.leaveBalance.findUnique({
        where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year: fromYear } },
      });
      if (balance) {
        await platformPrisma.leaveBalance.update({
          where: { id: balance.id },
          data: { taken: { increment: days }, balance: { decrement: days } },
        });
      }
    }
  }

  async regularizeAttendance(companyId: string, employeeId: string, data: any) {
    // 1. Verify employee belongs to company
    const employee = await platformPrisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, companyId: true, employeeId: true },
    });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.notFound('Employee not found');
    }

    // 2. Check ESSConfig.attendanceRegularization is enabled
    const essConfig = await this.getESSConfig(companyId);
    if (!essConfig.attendanceRegularization) {
      throw ApiError.badRequest('Attendance regularization is not enabled for your company');
    }

    // 3. Find attendance record for the date (must belong to this employee)
    const record = await platformPrisma.attendanceRecord.findUnique({
      where: { id: data.attendanceRecordId },
    });
    if (!record || record.companyId !== companyId || record.employeeId !== employeeId) {
      throw ApiError.badRequest('Attendance record not found or does not belong to this employee');
    }

    // 4. Check payroll lock (payrollRun for that month must be DRAFT or not exist)
    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings?.timezone ?? 'Asia/Kolkata';
    const dtRecord = DateTime.fromJSDate(new Date(record.date)).setZone(companyTimezone);
    const recordMonth = dtRecord.month;
    const recordYear = dtRecord.year;

    const payrollRun = await platformPrisma.payrollRun.findUnique({
      where: { companyId_month_year: { companyId, month: recordMonth, year: recordYear } },
    });

    if (payrollRun && payrollRun.status !== 'DRAFT') {
      throw ApiError.badRequest(
        `Cannot regularize: attendance for ${recordMonth}/${recordYear} is locked for payroll processing (status: ${payrollRun.status})`
      );
    }

    // 5. Validate approval workflow exists BEFORE creating the override
    await this.requireWorkflow(companyId, 'ATTENDANCE_REGULARIZATION');

    // 6. Create AttendanceOverride with requestedBy = employeeId, status = PENDING
    const override = await platformPrisma.attendanceOverride.create({
      data: {
        companyId,
        attendanceRecordId: data.attendanceRecordId,
        issueType: data.issueType,
        correctedPunchIn: data.correctedPunchIn ? new Date(data.correctedPunchIn) : null,
        correctedPunchOut: data.correctedPunchOut ? new Date(data.correctedPunchOut) : null,
        reason: data.reason,
        requestedBy: employeeId,
        status: 'PENDING',
      },
    });

    // 7. Wire into approval workflow — workflow is guaranteed to exist
    await this.createRequest(companyId, {
      requesterId: employeeId,
      entityType: 'AttendanceOverride',
      entityId: override.id,
      triggerEvent: 'ATTENDANCE_REGULARIZATION',
      data: {
        employeeId: employee.employeeId,
        issueType: data.issueType,
        reason: data.reason,
      },
    });

    // 8. Return the override
    return override;
  }

  // ────────────────────────────────────────────────────────────────────
  // MSS Manager Self-Service
  // ────────────────────────────────────────────────────────────────────

  async getTeamMembers(companyId: string, managerId: string, options: ListOptions = {}) {
    const { page = 1, limit = 25 } = options;
    const offset = (page - 1) * limit;

    const where: Prisma.EmployeeWhereInput = {
      companyId,
      reportingManagerId: managerId,
      status: { in: ['ACTIVE', 'PROBATION', 'CONFIRMED'] },
    };

    const [reportees, total] = await Promise.all([
      platformPrisma.employee.findMany({
        where,
        select: {
          id: true,
          employeeId: true,
          firstName: true,
          lastName: true,
          profilePhotoUrl: true,
          department: { select: { id: true, name: true } },
          designation: { select: { id: true, name: true } },
          status: true,
          joiningDate: true,
        },
        skip: offset,
        take: limit,
        orderBy: { firstName: 'asc' },
      }),
      platformPrisma.employee.count({ where }),
    ]);

    return { reportees, total, page, limit };
  }

  async getPendingApprovals(companyId: string, managerId: string) {
    // Get reportees
    const reporteeIds = await platformPrisma.employee.findMany({
      where: { companyId, reportingManagerId: managerId },
      select: { id: true },
    });
    const ids = reporteeIds.map((r) => r.id);

    if (ids.length === 0) return { leaveRequests: [], overrides: [] };

    // Get pending leave requests from reportees
    const leaveRequests = await platformPrisma.leaveRequest.findMany({
      where: {
        companyId,
        employeeId: { in: ids },
        status: 'PENDING',
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
          },
        },
        leaveType: {
          select: { id: true, name: true, code: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get pending attendance overrides from reportees
    const overrides = await platformPrisma.attendanceOverride.findMany({
      where: {
        companyId,
        status: 'PENDING',
        attendanceRecord: {
          employeeId: { in: ids },
        },
      },
      include: {
        attendanceRecord: {
          include: {
            employee: {
              select: {
                id: true,
                employeeId: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { leaveRequests, overrides };
  }

  async getTeamAttendance(companyId: string, managerId: string, date: string) {
    // Get reportees
    const reporteeIds = await platformPrisma.employee.findMany({
      where: { companyId, reportingManagerId: managerId },
      select: { id: true },
    });
    const ids = reporteeIds.map((r) => r.id);

    if (ids.length === 0) return [];

    const targetDate = new Date(date);

    const records = await platformPrisma.attendanceRecord.findMany({
      where: {
        companyId,
        employeeId: { in: ids },
        date: targetDate,
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            department: { select: { id: true, name: true } },
          },
        },
        shift: { select: { id: true, name: true, startTime: true, endTime: true } },
      },
      orderBy: { employee: { firstName: 'asc' } },
    });

    return records;
  }

  async getTeamLeaveCalendar(companyId: string, managerId: string, month: number, year: number) {
    // Get reportees
    const reporteeIds = await platformPrisma.employee.findMany({
      where: { companyId, reportingManagerId: managerId },
      select: { id: true },
    });
    const ids = reporteeIds.map((r) => r.id);

    if (ids.length === 0) return [];

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const leaveRequests = await platformPrisma.leaveRequest.findMany({
      where: {
        companyId,
        employeeId: { in: ids },
        status: { in: ['APPROVED', 'PENDING'] },
        OR: [
          { fromDate: { gte: startDate, lte: endDate } },
          { toDate: { gte: startDate, lte: endDate } },
          {
            AND: [
              { fromDate: { lte: startDate } },
              { toDate: { gte: endDate } },
            ],
          },
        ],
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
          },
        },
        leaveType: {
          select: { id: true, name: true, code: true },
        },
      },
      orderBy: { fromDate: 'asc' },
    });

    return leaveRequests;
  }

  // ── My Goals ──
  async getMyGoals(employeeId: string, companyId: string) {
    if (!employeeId) throw ApiError.badRequest('Employee ID required');

    const goals = await platformPrisma.goal.findMany({
      where: { employeeId, companyId },
      include: {
        cycle: { select: { id: true, name: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return goals;
  }

  // ── My Grievances ──
  async getMyGrievances(employeeId: string, companyId: string) {
    if (!employeeId) throw ApiError.badRequest('Employee ID required');

    const cases = await platformPrisma.grievanceCase.findMany({
      where: { employeeId, companyId },
      include: {
        category: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return cases;
  }

  // ── File Grievance ──
  async fileGrievance(employeeId: string, companyId: string, data: {
    categoryId: string;
    description: string;
    isAnonymous?: boolean;
  }) {
    if (!employeeId) throw ApiError.badRequest('Employee ID required');

    const grievance = await platformPrisma.grievanceCase.create({
      data: {
        companyId,
        employeeId,
        categoryId: data.categoryId,
        description: data.description,
        isAnonymous: data.isAnonymous ?? false,
        status: 'OPEN',
      },
      include: {
        category: { select: { id: true, name: true } },
      },
    });
    return grievance;
  }

  // ── My Training ──
  async getMyTraining(employeeId: string, companyId: string) {
    if (!employeeId) throw ApiError.badRequest('Employee ID required');

    const nominations = await platformPrisma.trainingNomination.findMany({
      where: { employeeId, companyId },
      include: {
        training: { select: { id: true, name: true, type: true, mode: true, duration: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return nominations;
  }

  // ── My Assets ──
  async getMyAssets(employeeId: string, companyId: string) {
    if (!employeeId) throw ApiError.badRequest('Employee ID required');

    const assignments = await platformPrisma.assetAssignment.findMany({
      where: { employeeId, companyId, returnDate: null },
      include: {
        asset: {
          select: {
            id: true, name: true, serialNumber: true,
            condition: true, status: true, purchaseDate: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { issueDate: 'desc' },
    });
    return assignments;
  }

  // ── My Form 16 ──
  async getMyForm16(employeeId: string, companyId: string) {
    if (!employeeId) throw ApiError.badRequest('Employee ID required');

    // Fetch generated Form 16 statutory filings for this company
    const filings = await platformPrisma.statutoryFiling.findMany({
      where: { companyId, type: 'FORM_16' },
      orderBy: { year: 'desc' },
      select: {
        id: true,
        year: true,
        status: true,
        details: true,
        createdAt: true,
      },
    });

    // Extract this employee's Form 16 record from each filing's details
    // The employee's data is embedded in the filing details during generation
    const form16Records = filings
      .map((filing) => {
        const details = filing.details as any;
        const records = details?.records ?? details?.employees ?? [];
        // Match by employee internal ID (records store employeeId as the display ID)
        const empRecord = Array.isArray(records)
          ? records.find((r: any) => r.employeeId === employeeId || r.internalId === employeeId)
          : null;
        if (!empRecord) return null;
        return {
          filingId: filing.id,
          financialYear: details?.financialYear ?? `${filing.year}-${String(filing.year + 1).slice(2)}`,
          assessmentYear: details?.assessmentYear ?? `${filing.year + 1}-${String(filing.year + 2).slice(2)}`,
          status: filing.status,
          generatedAt: filing.createdAt,
          ...empRecord,
        };
      })
      .filter(Boolean);

    // Also return payslip TDS summary grouped by financial year for reference
    const payslips = await platformPrisma.payslip.findMany({
      where: { employeeId, companyId },
      select: {
        id: true,
        month: true,
        year: true,
        grossEarnings: true,
        totalDeductions: true,
        netPay: true,
        tdsAmount: true,
        createdAt: true,
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    return { form16Records, payslips };
  }

  // ────────────────────────────────────────────────────────────────────
  // Dashboard (unified payload)
  // ────────────────────────────────────────────────────────────────────

  /**
   * Extract the value from a Promise.allSettled result.
   * Returns null (and logs a warning) if the promise rejected.
   */
  private settledValue<T>(result: PromiseSettledResult<T>, label: string): T | null {
    if (result.status === 'fulfilled') return result.value;
    logger.warn(`Dashboard widget "${label}" failed: ${formatDashboardWidgetError(result.reason)}`);
    return null;
  }

  /**
   * Unified dashboard endpoint — returns all widget data in a single API call.
   * Uses Promise.allSettled so one failing query never breaks the entire dashboard.
   */
  async getDashboard(
    companyId: string,
    employeeId: string | null,
    _userId: string,
    permissions: string[],
  ) {
    const hasPerm = (p: string) => permissions.includes(p) || permissions.includes('*') || permissions.includes('hr:*');

    // If no employee linked, return a minimal shell so the frontend still renders
    if (!employeeId) {
      return {
        attendanceStatus: { status: 'NOT_LINKED' as const, record: null, elapsedSeconds: 0 },
        leaveBalance: [],
        upcomingHolidays: [],
        announcements: [], // TODO: populate once Announcement model exists
        recentAttendance: [],
        currentShift: null,
        myGoals: null,
        pendingApprovals: null,
        teamSummary: null,
        shiftCalendar: null,
        weeklyChart: null,
        leaveDonut: null,
        monthlyTrend: null,
      };
    }

    const isManager = hasPerm('hr:approve');

    const [
      attendanceStatus,
      leaveBalance,
      upcomingHolidays,
      recentAttendance,
      currentShift,
      myGoals,
      pendingApprovals,
      teamSummary,
      shiftCalendar,
      weeklyChart,
      leaveDonut,
      monthlyTrend,
    ] = await Promise.allSettled([
      this.getDashboardAttendanceStatus(companyId, employeeId),
      this.getDashboardLeaveBalance(companyId, employeeId),
      this.getDashboardUpcomingHolidays(companyId, 5),
      this.getDashboardRecentAttendance(companyId, employeeId, 7),
      this.getDashboardCurrentShift(companyId, employeeId),
      this.getDashboardGoalsSummary(companyId, employeeId),
      isManager ? this.getDashboardPendingApprovals(companyId, employeeId) : Promise.resolve(null),
      isManager ? this.getDashboardTeamSummary(companyId, employeeId) : Promise.resolve(null),
      this.getDashboardShiftCalendar(companyId, employeeId, 14),
      this.getDashboardWeeklyChart(companyId, employeeId, 4),
      this.getDashboardLeaveDonut(companyId, employeeId),
      this.getDashboardMonthlyTrend(companyId, employeeId, 6),
    ]);

    return {
      attendanceStatus: this.settledValue(attendanceStatus, 'attendanceStatus'),
      leaveBalance: this.settledValue(leaveBalance, 'leaveBalance'),
      upcomingHolidays: this.settledValue(upcomingHolidays, 'upcomingHolidays'),
      announcements: [] as any[], // TODO: populate once Announcement model exists
      recentAttendance: this.settledValue(recentAttendance, 'recentAttendance'),
      currentShift: this.settledValue(currentShift, 'currentShift'),
      myGoals: this.settledValue(myGoals, 'myGoals'),
      pendingApprovals: this.settledValue(pendingApprovals, 'pendingApprovals'),
      teamSummary: this.settledValue(teamSummary, 'teamSummary'),
      shiftCalendar: this.settledValue(shiftCalendar, 'shiftCalendar'),
      weeklyChart: this.settledValue(weeklyChart, 'weeklyChart'),
      leaveDonut: this.settledValue(leaveDonut, 'leaveDonut'),
      monthlyTrend: this.settledValue(monthlyTrend, 'monthlyTrend'),
    };
  }

  // ── Dashboard helper: Attendance Status ──

  private async getDashboardAttendanceStatus(companyId: string, employeeId: string) {
    // Use company timezone for correct attendance date
    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings.timezone ?? 'Asia/Kolkata';
    const nowCT = nowInCompanyTimezone(companyTimezone);
    const todayStr = nowCT.toFormat('yyyy-MM-dd');
    const today = new Date(todayStr + 'T00:00:00.000Z');

    let record = await platformPrisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
      include: {
        shift: { select: { id: true, name: true, startTime: true, endTime: true } },
        location: { select: { id: true, name: true } },
      },
    });

    // For cross-day (night) shifts: check yesterday's record if still checked in
    if (!record || !record.punchIn) {
      const yesterdayDT = nowCT.minus({ days: 1 });
      const yesterday = new Date(yesterdayDT.toFormat('yyyy-MM-dd') + 'T00:00:00.000Z');
      const yesterdayRecord = await platformPrisma.attendanceRecord.findUnique({
        where: { employeeId_date: { employeeId, date: yesterday } },
        include: {
          shift: { select: { id: true, name: true, startTime: true, endTime: true } },
          location: { select: { id: true, name: true } },
        },
      });
      if (yesterdayRecord?.punchIn && !yesterdayRecord.punchOut) {
        record = yesterdayRecord;
      }
    }

    if (!record || !record.punchIn) {
      return { status: 'NOT_CHECKED_IN' as const, record: null, elapsedSeconds: 0 };
    }

    let elapsedSeconds = 0;
    if (record.punchIn && !record.punchOut) {
      elapsedSeconds = Math.floor((Date.now() - new Date(record.punchIn).getTime()) / 1000);
    }

    const status = record.punchOut ? ('CHECKED_OUT' as const) : ('CHECKED_IN' as const);
    return { status, record, elapsedSeconds };
  }

  // ── Dashboard helper: Leave Balance Summary ──

  private async getDashboardLeaveBalance(companyId: string, employeeId: string) {
    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings?.timezone ?? 'Asia/Kolkata';
    const currentYear = DateTime.now().setZone(companyTimezone).year;

    const balances = await platformPrisma.leaveBalance.findMany({
      where: { companyId, employeeId, year: currentYear },
      include: {
        leaveType: { select: { id: true, name: true, code: true, category: true } },
      },
      orderBy: { leaveType: { name: 'asc' } },
      take: 4, // Top 4 leave types (Casual, Earned, Sick, etc.)
    });

    return balances.map((b) => ({
      id: b.id,
      leaveTypeId: b.leaveTypeId,
      leaveTypeName: b.leaveType.name,
      leaveTypeCode: b.leaveType.code,
      category: b.leaveType.category,
      openingBalance: Number(b.openingBalance),
      accrued: Number(b.accrued),
      taken: Number(b.taken),
      adjusted: Number(b.adjusted),
      balance: Number(b.balance),
    }));
  }

  // ── Dashboard helper: Upcoming Holidays ──

  private async getDashboardUpcomingHolidays(companyId: string, count: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const holidays = await platformPrisma.holidayCalendar.findMany({
      where: {
        companyId,
        date: { gte: today },
      },
      select: {
        id: true,
        name: true,
        date: true,
        type: true,
        isOptional: true,
      },
      orderBy: { date: 'asc' },
      take: count,
    });

    return holidays;
  }

  // ── Dashboard helper: Recent Attendance (last N days) ──

  private async getDashboardRecentAttendance(companyId: string, employeeId: string, days: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - days);

    const records = await platformPrisma.attendanceRecord.findMany({
      where: {
        companyId,
        employeeId,
        date: { gte: startDate, lte: today },
      },
      select: {
        id: true,
        date: true,
        status: true,
        punchIn: true,
        punchOut: true,
        workedHours: true,
        isLate: true,
        isEarlyExit: true,
      },
      orderBy: { date: 'desc' },
    });

    return records.map((r) => ({
      id: r.id,
      date: r.date,
      status: r.status,
      punchIn: r.punchIn,
      punchOut: r.punchOut,
      workedHours: r.workedHours ? Number(r.workedHours) : null,
      isLate: r.isLate,
      isEarlyExit: r.isEarlyExit,
    }));
  }

  // ── Dashboard helper: Current Shift ──

  private async getDashboardCurrentShift(_companyId: string, employeeId: string) {
    const employee = await platformPrisma.employee.findUnique({
      where: { id: employeeId },
      select: { shiftId: true, locationId: true, geofenceId: true },
    });

    if (!employee?.shiftId) return null;

    const shift = await platformPrisma.companyShift.findUnique({
      where: { id: employee.shiftId },
      select: {
        id: true,
        name: true,
        shiftType: true,
        startTime: true,
        endTime: true,
        isCrossDay: true,
        breaks: {
          select: { id: true, name: true, startTime: true, duration: true, type: true, isPaid: true },
          orderBy: { startTime: 'asc' },
        },
      },
    });

    // Include employee's location and assigned geofence for dashboard display
    let location = null;
    let assignedGeofence = null;

    if (employee.locationId) {
      location = await platformPrisma.location.findUnique({
        where: { id: employee.locationId },
        select: {
          id: true,
          name: true,
          geoEnabled: true,
          geofences: { where: { isActive: true }, select: { id: true, name: true, lat: true, lng: true, radius: true, isDefault: true } },
        },
      });
    }

    if (employee.geofenceId) {
      assignedGeofence = await platformPrisma.geofence.findUnique({
        where: { id: employee.geofenceId },
        select: { id: true, name: true, lat: true, lng: true, radius: true, isDefault: true },
      });
    }

    return { ...shift, location, assignedGeofence };
  }

  // ── Dashboard helper: Goals Summary ──

  private async getDashboardGoalsSummary(companyId: string, employeeId: string) {
    const goals = await platformPrisma.goal.findMany({
      where: { companyId, employeeId, status: { in: ['ACTIVE', 'DRAFT'] } },
      select: {
        id: true,
        title: true,
        status: true,
        weightage: true,
        targetValue: true,
        achievedValue: true,
        cycle: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const activeGoals = goals.filter((g) => g.status === 'ACTIVE');
    const averageCompletion =
      activeGoals.length > 0
        ? activeGoals.reduce((sum, g) => {
            const target = Number(g.targetValue ?? 0);
            const achieved = Number(g.achievedValue ?? 0);
            return sum + (target > 0 ? (achieved / target) * 100 : 0);
          }, 0) / activeGoals.length
        : 0;

    return {
      totalActive: activeGoals.length,
      totalDraft: goals.length - activeGoals.length,
      averageCompletion: Math.round(averageCompletion * 100) / 100,
      topGoals: goals.slice(0, 3).map((g) => ({
        id: g.id,
        title: g.title,
        status: g.status,
        targetValue: g.targetValue ? Number(g.targetValue) : null,
        achievedValue: g.achievedValue ? Number(g.achievedValue) : null,
        progress:
          g.targetValue && Number(g.targetValue) > 0
            ? Math.round((Number(g.achievedValue ?? 0) / Number(g.targetValue)) * 10000) / 100
            : 0,
        cycleName: g.cycle.name,
      })),
    };
  }

  // ── Dashboard helper: Pending Approvals (manager) ──

  private async getDashboardPendingApprovals(companyId: string, managerId: string) {
    // Reuse existing method — returns { leaveRequests, overrides }
    const approvals = await this.getPendingApprovals(companyId, managerId);
    return {
      leaveRequestCount: approvals.leaveRequests.length,
      attendanceOverrideCount: approvals.overrides.length,
      totalCount: approvals.leaveRequests.length + approvals.overrides.length,
      recentLeaveRequests: approvals.leaveRequests.slice(0, 3),
      recentOverrides: approvals.overrides.slice(0, 3),
    };
  }

  // ── Dashboard helper: Team Summary (manager) ──

  private async getDashboardTeamSummary(companyId: string, managerId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get all reportees
    const reportees = await platformPrisma.employee.findMany({
      where: {
        companyId,
        reportingManagerId: managerId,
        status: { in: ['ACTIVE', 'PROBATION', 'CONFIRMED'] },
      },
      select: { id: true },
    });

    const totalMembers = reportees.length;
    if (totalMembers === 0) {
      return { totalMembers: 0, presentToday: 0, absentToday: 0, onLeaveToday: 0, notCheckedIn: 0 };
    }

    const ids = reportees.map((r) => r.id);

    // Count attendance statuses for today
    const [attendanceRecords, leaveRequests] = await Promise.all([
      platformPrisma.attendanceRecord.findMany({
        where: { companyId, employeeId: { in: ids }, date: today },
        select: { employeeId: true, status: true, punchIn: true },
      }),
      platformPrisma.leaveRequest.count({
        where: {
          companyId,
          employeeId: { in: ids },
          status: 'APPROVED',
          fromDate: { lte: today },
          toDate: { gte: today },
        },
      }),
    ]);

    const presentToday = attendanceRecords.filter((r) => r.punchIn != null).length;
    const checkedInIds = new Set(attendanceRecords.filter((r) => r.punchIn != null).map((r) => r.employeeId));
    const notCheckedIn = totalMembers - checkedInIds.size;

    return {
      totalMembers,
      presentToday,
      onLeaveToday: leaveRequests,
      absentToday: Math.max(0, totalMembers - presentToday - leaveRequests),
      notCheckedIn,
    };
  }

  // ── Dashboard helper: Shift Calendar (next N days) ──

  private async getDashboardShiftCalendar(companyId: string, employeeId: string, days: number = 14) {
    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

    // Get company timezone
    const companySettings = await getCachedCompanySettings(companyId);
    const tz = companySettings.timezone ?? 'Asia/Kolkata';
    const now = nowInCompanyTimezone(tz);
    const todayStr = now.toFormat('yyyy-MM-dd');

    // Get employee with default shift
    const employee = await platformPrisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        shiftId: true,
        employeeTypeId: true,
        shift: {
          select: { id: true, name: true, shiftType: true, startTime: true, endTime: true },
        },
      },
    });

    const defaultShift = employee?.shift ?? null;

    // Build date range
    const startDate = now.startOf('day');
    const endDate = startDate.plus({ days: days - 1 });
    const startJs = startDate.toJSDate();
    const endJs = endDate.toJSDate();

    // Fetch holidays in range
    const holidays = await platformPrisma.holidayCalendar.findMany({
      where: {
        companyId,
        date: { gte: startJs, lte: endJs },
      },
      select: { date: true, name: true },
    });
    const holidayMap = new Map(
      holidays.map((h) => [DateTime.fromJSDate(h.date).toFormat('yyyy-MM-dd'), h.name]),
    );

    // Fetch default roster for week-off determination
    const roster = await platformPrisma.roster.findFirst({
      where: { companyId, isDefault: true },
      select: { weekOff1: true, weekOff2: true },
    });

    // Fetch active shift rotation assignment for this employee
    const rotationAssignment = await platformPrisma.shiftRotationAssignment.findFirst({
      where: {
        companyId,
        employeeId,
        schedule: {
          isActive: true,
          effectiveFrom: { lte: endJs },
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gte: startJs } },
          ],
        },
      },
      include: {
        schedule: {
          select: {
            id: true,
            rotationPattern: true,
            shifts: true,
            effectiveFrom: true,
          },
        },
      },
    });

    // Build calendar entries
    const calendar: Array<{
      date: string;
      dayName: string;
      shiftName: string | null;
      shiftType: string | null;
      startTime: string | null;
      endTime: string | null;
      isHoliday: boolean;
      holidayName?: string;
      isWeekOff: boolean;
      isToday: boolean;
    }> = [];

    // Pre-fetch rotation shifts if applicable
    let rotationShiftsMap: Map<string, { name: string; shiftType: string; startTime: string; endTime: string }> | null = null;
    if (rotationAssignment) {
      const shiftsJson = rotationAssignment.schedule.shifts as Array<{ shiftId: string; weekNumber: number }>;
      const shiftIds = [...new Set(shiftsJson.map((s) => s.shiftId))];
      const shifts = await platformPrisma.companyShift.findMany({
        where: { id: { in: shiftIds } },
        select: { id: true, name: true, shiftType: true, startTime: true, endTime: true },
      });
      rotationShiftsMap = new Map(shifts.map((s) => [s.id, s]));
    }

    const FULL_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (let i = 0; i < days; i++) {
      const dt = startDate.plus({ days: i });
      const dateStr = dt.toFormat('yyyy-MM-dd');
      const dayOfWeek = dt.weekday % 7; // 0=Sun..6=Sat (JS convention)
      const dayName = DAY_NAMES[dayOfWeek]!;
      const fullDayName = FULL_DAY_NAMES[dayOfWeek]!;

      const isHoliday = holidayMap.has(dateStr);
      const holidayName = holidayMap.get(dateStr);
      const isWeekOff = fullDayName === roster?.weekOff1 || fullDayName === roster?.weekOff2;
      const isToday = dateStr === todayStr;

      // Determine shift for this day
      let shiftName: string | null = null;
      let shiftType: string | null = null;
      let shiftStartTime: string | null = null;
      let shiftEndTime: string | null = null;

      if (rotationAssignment && rotationShiftsMap) {
        // Determine which shift based on rotation pattern
        const schedule = rotationAssignment.schedule;
        const effectiveFrom = DateTime.fromJSDate(schedule.effectiveFrom).startOf('day');
        const daysSinceStart = Math.floor(dt.diff(effectiveFrom, 'days').days);
        const shiftsJson = schedule.shifts as Array<{ shiftId: string; weekNumber: number }>;

        if (shiftsJson.length > 0) {
          let rotationIndex: number;
          if (schedule.rotationPattern === 'WEEKLY') {
            const weeksSinceStart = Math.floor(daysSinceStart / 7);
            rotationIndex = weeksSinceStart % shiftsJson.length;
          } else if (schedule.rotationPattern === 'FORTNIGHTLY') {
            const fortnightsSinceStart = Math.floor(daysSinceStart / 14);
            rotationIndex = fortnightsSinceStart % shiftsJson.length;
          } else if (schedule.rotationPattern === 'MONTHLY') {
            const monthsSinceStart = Math.floor(dt.diff(effectiveFrom, 'months').months);
            rotationIndex = monthsSinceStart % shiftsJson.length;
          } else {
            // CUSTOM — use weekNumber to match
            const weeksSinceStart = Math.floor(daysSinceStart / 7);
            rotationIndex = weeksSinceStart % shiftsJson.length;
          }

          const rotationEntry = shiftsJson[rotationIndex];
          if (rotationEntry) {
            const shift = rotationShiftsMap.get(rotationEntry.shiftId);
            if (shift) {
              shiftName = shift.name;
              shiftType = shift.shiftType;
              shiftStartTime = shift.startTime;
              shiftEndTime = shift.endTime;
            }
          }
        }
      }

      // Fallback to default shift if no rotation shift resolved
      if (!shiftName && defaultShift) {
        shiftName = defaultShift.name;
        shiftType = defaultShift.shiftType;
        shiftStartTime = defaultShift.startTime;
        shiftEndTime = defaultShift.endTime;
      }

      calendar.push({
        date: dateStr,
        dayName,
        shiftName,
        shiftType,
        startTime: shiftStartTime,
        endTime: shiftEndTime,
        isHoliday,
        ...(holidayName && { holidayName }),
        isWeekOff,
        isToday,
      });
    }

    return calendar;
  }

  // ── Dashboard helper: Weekly Attendance Chart (last N weeks) ──

  private async getDashboardWeeklyChart(companyId: string, employeeId: string, weeks: number = 4) {
    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

    // Get company timezone
    const companySettings = await getCachedCompanySettings(companyId);
    const tz = companySettings.timezone ?? 'Asia/Kolkata';
    const now = nowInCompanyTimezone(tz);

    const totalDays = weeks * 7;
    const endDate = now.startOf('day');
    const startDate = endDate.minus({ days: totalDays - 1 });
    const startJs = startDate.toJSDate();
    const endJs = endDate.toJSDate();

    // Fetch attendance records for the range
    const records = await platformPrisma.attendanceRecord.findMany({
      where: {
        companyId,
        employeeId,
        date: { gte: startJs, lte: endJs },
      },
      select: {
        date: true,
        workedHours: true,
        status: true,
      },
      orderBy: { date: 'asc' },
    });

    const recordMap = new Map(
      records.map((r) => [DateTime.fromJSDate(r.date).toFormat('yyyy-MM-dd'), r]),
    );

    // Fetch holidays in range
    const holidays = await platformPrisma.holidayCalendar.findMany({
      where: {
        companyId,
        date: { gte: startJs, lte: endJs },
      },
      select: { date: true },
    });
    const holidaySet = new Set(
      holidays.map((h) => DateTime.fromJSDate(h.date).toFormat('yyyy-MM-dd')),
    );

    // Fetch default roster for week-off determination
    const roster = await platformPrisma.roster.findFirst({
      where: { companyId, isDefault: true },
      select: { weekOff1: true, weekOff2: true },
    });

    const FULL_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const chart: Array<{
      date: string;
      dayName: string;
      hoursWorked: number;
      status: string;
      isHoliday: boolean;
      isWeekOff: boolean;
    }> = [];

    for (let i = 0; i < totalDays; i++) {
      const dt = startDate.plus({ days: i });
      const dateStr = dt.toFormat('yyyy-MM-dd');
      const dayOfWeek = dt.weekday % 7; // 0=Sun..6=Sat (JS convention)
      const dayName = DAY_NAMES[dayOfWeek]!;
      const fullDayName = FULL_DAY_NAMES[dayOfWeek]!;

      const record = recordMap.get(dateStr);
      const isHoliday = holidaySet.has(dateStr);
      const isWeekOff = fullDayName === roster?.weekOff1 || fullDayName === roster?.weekOff2;

      chart.push({
        date: dateStr,
        dayName,
        hoursWorked: record?.workedHours ? Number(record.workedHours) : 0,
        status: record?.status ?? (isHoliday ? 'HOLIDAY' : isWeekOff ? 'WEEK_OFF' : 'NO_RECORD'),
        isHoliday,
        isWeekOff,
      });
    }

    return chart;
  }

  // ── Dashboard helper: Leave Donut Chart (current year) ──

  private async getDashboardLeaveDonut(companyId: string, employeeId: string) {
    const CATEGORY_COLORS: Record<string, string> = {
      PAID: '#6366F1',        // indigo-500 (primary)
      UNPAID: '#F59E0B',      // amber-500
      COMPENSATORY: '#8B5CF6', // violet-500 (accent)
      STATUTORY: '#10B981',    // emerald-500
    };

    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings?.timezone ?? 'Asia/Kolkata';
    const currentYear = DateTime.now().setZone(companyTimezone).year;

    const balances = await platformPrisma.leaveBalance.findMany({
      where: { companyId, employeeId, year: currentYear },
      include: {
        leaveType: { select: { category: true } },
      },
    });

    // Group by category
    const grouped = new Map<string, { totalEntitled: number; used: number; remaining: number }>();

    for (const b of balances) {
      const category = b.leaveType.category;
      const existing = grouped.get(category) ?? { totalEntitled: 0, used: 0, remaining: 0 };

      const entitled = Number(b.openingBalance) + Number(b.accrued) + Number(b.adjusted);
      const used = Number(b.taken);
      const remaining = Number(b.balance);

      existing.totalEntitled += entitled;
      existing.used += used;
      existing.remaining += remaining;
      grouped.set(category, existing);
    }

    const donut: Array<{
      category: string;
      totalEntitled: number;
      used: number;
      remaining: number;
      color: string;
    }> = [];

    for (const [category, data] of grouped) {
      donut.push({
        category,
        totalEntitled: Math.round(data.totalEntitled * 10) / 10,
        used: Math.round(data.used * 10) / 10,
        remaining: Math.round(data.remaining * 10) / 10,
        color: CATEGORY_COLORS[category] ?? '#94A3B8', // slate-400 fallback
      });
    }

    // Sort by a consistent order: PAID, UNPAID, COMPENSATORY, STATUTORY
    const ORDER = ['PAID', 'UNPAID', 'COMPENSATORY', 'STATUTORY'];
    donut.sort((a, b) => {
      const aIdx = ORDER.indexOf(a.category);
      const bIdx = ORDER.indexOf(b.category);
      return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
    });

    return donut;
  }

  // ── Dashboard helper: Monthly Attendance Trend (last N months) ──

  private async getDashboardMonthlyTrend(companyId: string, employeeId: string, months: number = 6) {
    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

    // Get company timezone
    const companySettings = await getCachedCompanySettings(companyId);
    const tz = companySettings.timezone ?? 'Asia/Kolkata';
    const now = nowInCompanyTimezone(tz);

    const trend: Array<{
      month: string;
      year: number;
      workingDays: number;
      presentDays: number;
      absentDays: number;
      lateDays: number;
      attendancePercentage: number;
    }> = [];

    // Process each month from (months-1) months ago to current month
    for (let i = months - 1; i >= 0; i--) {
      const monthDt = now.minus({ months: i }).startOf('month');
      const monthEnd = monthDt.endOf('month').startOf('day');
      const monthStartJs = monthDt.toJSDate();
      const monthEndJs = monthEnd.toJSDate();
      const monthIdx = monthDt.month - 1; // 0-based for array
      const year = monthDt.year;

      // Fetch attendance records for this month
      const records = await platformPrisma.attendanceRecord.findMany({
        where: {
          companyId,
          employeeId,
          date: { gte: monthStartJs, lte: monthEndJs },
        },
        select: {
          status: true,
          isLate: true,
        },
      });

      // Count holidays in this month
      const holidayCount = await platformPrisma.holidayCalendar.count({
        where: {
          companyId,
          date: { gte: monthStartJs, lte: monthEndJs },
        },
      });

      // Count week-offs in this month
      const roster = await platformPrisma.roster.findFirst({
        where: { companyId, isDefault: true },
        select: { weekOff1: true, weekOff2: true },
      });

      const FULL_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      let weekOffCount = 0;
      const totalCalendarDays = monthEnd.day;
      for (let d = 0; d < totalCalendarDays; d++) {
        const dayDt = monthDt.plus({ days: d });
        const dayOfWeek = dayDt.weekday % 7; // 0=Sun..6=Sat (JS convention)
        const fullDayName = FULL_DAY_NAMES[dayOfWeek]!;
        if (fullDayName === roster?.weekOff1 || fullDayName === roster?.weekOff2) {
          weekOffCount++;
        }
      }

      const workingDays = Math.max(0, totalCalendarDays - holidayCount - weekOffCount);

      const presentDays = records.filter((r) =>
        ['PRESENT', 'LATE', 'REGULARIZED'].includes(r.status),
      ).length;

      const absentDays = records.filter((r) =>
        ['ABSENT', 'LOP'].includes(r.status),
      ).length;

      const lateDays = records.filter((r) => r.isLate).length;

      const attendancePercentage = workingDays > 0
        ? Math.round((presentDays / workingDays) * 10000) / 100
        : 0;

      trend.push({
        month: MONTH_NAMES[monthIdx]!,
        year,
        workingDays,
        presentDays,
        absentDays,
        lateDays,
        attendancePercentage,
      });
    }

    return trend;
  }

  // ────────────────────────────────────────────────────────────────────
  // Profile Edit (ESS self-service)
  // ────────────────────────────────────────────────────────────────────

  async updateMyProfile(userId: string, companyId: string, data: {
    personalMobile?: string | undefined;
    alternativeMobile?: string | undefined;
    personalEmail?: string | undefined;
    currentAddress?: any;
    permanentAddress?: any;
    emergencyContactName?: string | undefined;
    emergencyContactRelation?: string | undefined;
    emergencyContactMobile?: string | undefined;
    maritalStatus?: 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED' | undefined;
    bloodGroup?: string | undefined;
    profilePhotoUrl?: string | undefined;
  }) {
    // Resolve employee from user
    const user = await platformPrisma.user.findUnique({
      where: { id: userId },
      select: { employeeId: true, email: true },
    });

    let employeeId = user?.employeeId ?? null;

    // Fallback: match by email
    if (!employeeId && user?.email) {
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
        employeeId = employee.id;
        await platformPrisma.user.update({
          where: { id: userId },
          data: { employeeId: employee.id },
        });
      }
    }

    if (!employeeId) {
      throw ApiError.badRequest('No linked employee profile');
    }

    // Verify employee belongs to this company
    const existing = await platformPrisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, companyId: true },
    });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Employee not found');
    }

    const updated = await platformPrisma.employee.update({
      where: { id: employeeId },
      data: {
        ...(data.personalMobile !== undefined && { personalMobile: data.personalMobile }),
        ...(data.alternativeMobile !== undefined && { alternativeMobile: data.alternativeMobile }),
        ...(data.personalEmail !== undefined && { personalEmail: data.personalEmail }),
        ...(data.currentAddress !== undefined && { currentAddress: data.currentAddress ?? Prisma.JsonNull }),
        ...(data.permanentAddress !== undefined && { permanentAddress: data.permanentAddress ?? Prisma.JsonNull }),
        ...(data.emergencyContactName !== undefined && { emergencyContactName: data.emergencyContactName }),
        ...(data.emergencyContactRelation !== undefined && { emergencyContactRelation: data.emergencyContactRelation }),
        ...(data.emergencyContactMobile !== undefined && { emergencyContactMobile: data.emergencyContactMobile }),
        ...(data.maritalStatus !== undefined && { maritalStatus: data.maritalStatus as MaritalStatus }),
        ...(data.bloodGroup !== undefined && { bloodGroup: data.bloodGroup }),
        ...(data.profilePhotoUrl !== undefined && { profilePhotoUrl: data.profilePhotoUrl }),
      },
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
        personalMobile: true,
        alternativeMobile: true,
        personalEmail: true,
        currentAddress: true,
        permanentAddress: true,
        emergencyContactName: true,
        emergencyContactRelation: true,
        emergencyContactMobile: true,
        maritalStatus: true,
        bloodGroup: true,
        profilePhotoUrl: true,
      },
    });

    return updated;
  }

  // ────────────────────────────────────────────────────────────────────
  // Payslip PDF Download
  // ────────────────────────────────────────────────────────────────────

  async generatePayslipPdf(userId: string, companyId: string, payslipId: string): Promise<Buffer> {
    // Resolve employee from user
    const user = await platformPrisma.user.findUnique({
      where: { id: userId },
      select: { employeeId: true, email: true },
    });

    let employeeId = user?.employeeId ?? null;

    if (!employeeId && user?.email) {
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
      if (employee) employeeId = employee.id;
    }

    if (!employeeId) {
      throw ApiError.badRequest('No linked employee profile');
    }

    // Fetch payslip with employee & company details
    const payslip = await platformPrisma.payslip.findUnique({
      where: { id: payslipId },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            panNumber: true,
            uan: true,
            bankName: true,
            bankAccountNumber: true,
            department: { select: { name: true } },
            designation: { select: { name: true } },
          },
        },
        company: {
          select: { name: true, displayName: true },
        },
      },
    });

    if (!payslip || payslip.companyId !== companyId || payslip.employeeId !== employeeId) {
      throw ApiError.notFound('Payslip not found');
    }

    // Import PDFKit dynamically to keep top-level imports lean
    const PDFDocument = (await import('pdfkit')).default;
    const { PassThrough } = await import('stream');

    const formatCurrency = (amount: number): string => {
      const formatted = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
      return `Rs. ${formatted}`;
    };

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const monthLabel = monthNames[payslip.month - 1] ?? String(payslip.month);

    const companyName = payslip.company?.displayName ?? payslip.company?.name ?? 'Company';
    const empName = `${payslip.employee.firstName} ${payslip.employee.lastName}`.trim();
    const empId = payslip.employee.employeeId ?? '—';
    const deptName = payslip.employee.department?.name ?? '—';
    const desgName = payslip.employee.designation?.name ?? '—';
    const panNumber = payslip.employee.panNumber ?? '—';
    const uanNumber = payslip.employee.uan ?? '—';
    const bankInfo = payslip.employee.bankName
      ? `${payslip.employee.bankName} (****${bankAccountLast4Only(payslip.employee.bankAccountNumber) ?? ''})`
      : '—';

    // ── Parse earnings/deductions (JSON object or array) ──
    const COMP_LABELS: Record<string, string> = {
      BASIC: 'Basic Salary', HRA: 'House Rent Allowance', DA: 'Dearness Allowance',
      CONVEYANCE: 'Conveyance Allowance', MEDICAL: 'Medical Allowance',
      SPECIAL: 'Special Allowance', SPECIAL_ALLOWANCE: 'Special Allowance',
      REIMBURSEMENT: 'Reimbursement', LTA: 'Leave Travel Allowance', BONUS: 'Bonus',
      OVERTIME: 'Overtime', PF_EE: 'Provident Fund', PF_EMPLOYEE: 'Provident Fund',
      ESI_EE: 'ESI (Employee)', ESI_EMPLOYEE: 'ESI (Employee)',
      PT: 'Professional Tax', TDS: 'Income Tax (TDS)',
      LWF_EE: 'Labour Welfare Fund', LOAN_DEDUCTION: 'Loan Deduction',
      ADVANCE_SALARY: 'Advance Recovery',
      PF_ER: 'Provident Fund (Employer)', PF_EMPLOYER: 'Provident Fund (Employer)',
      ESI_ER: 'ESI (Employer)', ESI_EMPLOYER: 'ESI (Employer)',
      LWF_ER: 'Labour Welfare Fund (Employer)', LWF_EMPLOYER: 'LWF (Employer)',
      GRATUITY: 'Gratuity Provision',
    };

    function parseComponents(data: unknown): Array<{ label: string; amount: number }> {
      if (!data) return [];
      if (Array.isArray(data)) return data.map((item: any) => ({ label: item.label ?? item.name ?? item.component ?? 'Unknown', amount: Number(item.amount ?? item.value ?? 0) }));
      if (typeof data === 'object') return Object.entries(data as Record<string, unknown>)
        .filter(([, v]) => Number(v) !== 0)
        .map(([code, amount]) => ({ label: COMP_LABELS[code] ?? code.replace(/_/g, ' '), amount: Number(amount) || 0 }));
      return [];
    }

    const earnings = parseComponents(payslip.earnings);
    const deductions = parseComponents(payslip.deductions);
    const employerContribs = parseComponents(payslip.employerContributions);

    const grossEarnings = Number(payslip.grossEarnings) || earnings.reduce((s, e) => s + e.amount, 0);
    const totalDeductions = Number(payslip.totalDeductions) || deductions.reduce((s, d) => s + d.amount, 0);
    const netPay = Number(payslip.netPay) || grossEarnings - totalDeductions;

    // ── Build Professional PDF ──────────────────────────────────────
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const stream = new PassThrough();
    doc.pipe(stream);

    const pageW = 595.28;
    const mL = 40;
    const mR = 40;
    const contentW = pageW - mL - mR;
    const primary = '#4338ca';   // indigo-700
    const primaryLight = '#e0e7ff'; // indigo-100
    const textDark = '#1e1b4b';  // indigo-950
    const textMuted = '#6b7280'; // neutral-500
    const successGreen = '#15803d';
    const dangerRed = '#b91c1c';

    // ─── Header Banner ───
    doc.rect(0, 0, pageW, 80).fill(primary);
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#ffffff')
      .text(companyName, mL, 20, { width: contentW });
    doc.font('Helvetica').fontSize(10).fillColor('#c7d2fe')
      .text('PAYSLIP', mL, 45, { width: contentW * 0.5 });
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#ffffff')
      .text(`${monthLabel} ${payslip.year}`, mL + contentW * 0.5, 25, { width: contentW * 0.5, align: 'right' });

    // Attendance info if available
    if (payslip.workingDays || payslip.presentDays) {
      doc.font('Helvetica').fontSize(8).fillColor('#c7d2fe')
        .text(`Working Days: ${payslip.workingDays ?? '—'}  |  Present: ${Number(payslip.presentDays ?? 0)}  |  LOP: ${Number(payslip.lopDays ?? 0)}`, mL + contentW * 0.5, 42, { width: contentW * 0.5, align: 'right' });
    }

    doc.y = 95;

    // ─── Employee Details Grid ───
    doc.rect(mL, doc.y, contentW, 70).fill('#f8fafc'); // neutral-50
    doc.rect(mL, doc.y, contentW, 70).lineWidth(0.5).strokeColor('#e2e8f0').stroke();

    const gy = doc.y + 10;
    const col1 = mL + 12;
    const col2 = mL + 135;
    const col3 = mL + contentW * 0.5 + 12;
    const col4 = mL + contentW * 0.5 + 110;

    doc.font('Helvetica').fontSize(7).fillColor(textMuted);
    doc.text('EMPLOYEE NAME', col1, gy);
    doc.text('EMPLOYEE ID', col1, gy + 22);
    doc.text('DEPARTMENT', col1, gy + 44);
    doc.text('DESIGNATION', col3, gy);
    doc.text('PAN', col3, gy + 22);
    doc.text('UAN', col3, gy + 44);

    doc.font('Helvetica-Bold').fontSize(9).fillColor(textDark);
    doc.text(empName, col2, gy);
    doc.text(empId, col2, gy + 22);
    doc.text(deptName, col2, gy + 44);
    doc.text(desgName, col4, gy);
    doc.text(panNumber, col4, gy + 22);
    doc.text(uanNumber, col4, gy + 44);

    doc.y = gy + 72;

    // ─── Earnings & Deductions Side-by-Side Table ───
    const tableY = doc.y;
    const halfW = contentW / 2 - 4;

    // Earnings header
    doc.rect(mL, tableY, halfW, 22).fill(primaryLight);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(primary)
      .text('EARNINGS', mL + 10, tableY + 6, { width: halfW - 20 });

    // Deductions header
    doc.rect(mL + halfW + 8, tableY, halfW, 22).fill('#fef2f2');
    doc.font('Helvetica-Bold').fontSize(9).fillColor(dangerRed)
      .text('DEDUCTIONS', mL + halfW + 18, tableY + 6, { width: halfW - 20 });

    let earY = tableY + 28;
    doc.font('Helvetica').fontSize(8.5);

    // Earnings rows
    for (const e of earnings) {
      doc.fillColor(textMuted).text(e.label, mL + 10, earY, { width: halfW - 100 });
      doc.fillColor(textDark).text(formatCurrency(e.amount), mL + halfW - 90, earY, { width: 80, align: 'right' });
      earY += 15;
    }

    // Earnings total
    earY += 4;
    doc.moveTo(mL + 10, earY).lineTo(mL + halfW - 10, earY).lineWidth(0.5).strokeColor(primary).stroke();
    earY += 6;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(primary)
      .text('Gross Earnings', mL + 10, earY, { width: halfW - 100 });
    doc.text(formatCurrency(grossEarnings), mL + halfW - 90, earY, { width: 80, align: 'right' });

    // Deductions rows
    let dedY = tableY + 28;
    const dedX = mL + halfW + 8;
    doc.font('Helvetica').fontSize(8.5);

    for (const d of deductions) {
      doc.fillColor(textMuted).text(d.label, dedX + 10, dedY, { width: halfW - 100 });
      doc.fillColor(textDark).text(formatCurrency(d.amount), dedX + halfW - 90, dedY, { width: 80, align: 'right' });
      dedY += 15;
    }

    // Deductions total
    dedY += 4;
    doc.moveTo(dedX + 10, dedY).lineTo(dedX + halfW - 10, dedY).lineWidth(0.5).strokeColor(dangerRed).stroke();
    dedY += 6;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(dangerRed)
      .text('Total Deductions', dedX + 10, dedY, { width: halfW - 100 });
    doc.text(formatCurrency(totalDeductions), dedX + halfW - 90, dedY, { width: 80, align: 'right' });

    doc.y = Math.max(earY, dedY) + 25;

    // ─── Employer Contributions (if any) ───
    if (employerContribs.length > 0) {
      const ecY = doc.y;
      doc.rect(mL, ecY, contentW, 18).fill('#eff6ff');
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#1d4ed8')
        .text('EMPLOYER CONTRIBUTIONS', mL + 10, ecY + 4);
      let ecRowY = ecY + 22;
      doc.font('Helvetica').fontSize(8);
      for (const c of employerContribs) {
        doc.fillColor(textMuted).text(c.label, mL + 10, ecRowY, { width: 200 });
        doc.fillColor(textDark).text(formatCurrency(c.amount), mL + 220, ecRowY, { width: 80, align: 'right' });
        ecRowY += 14;
      }
      doc.y = ecRowY + 10;
    }

    // ─── NET PAY Banner ───
    const netY = doc.y;
    doc.rect(mL, netY, contentW, 45).fill(primary);
    doc.font('Helvetica').fontSize(9).fillColor('#c7d2fe')
      .text('NET PAY', mL + 15, netY + 8);
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#ffffff')
      .text(formatCurrency(netPay), mL + 15, netY + 20, { width: contentW - 30, align: 'right' });
    doc.y = netY + 55;

    // ─── Bank Details ───
    if (payslip.employee.bankName) {
      doc.font('Helvetica').fontSize(8).fillColor(textMuted)
        .text(`Bank: ${bankInfo}`, mL, doc.y);
      doc.moveDown(0.5);
    }

    // ─── Footer ───
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(7).fillColor('#9ca3af')
      .text('This is a computer-generated payslip and does not require a signature.', mL, doc.y, { width: contentW, align: 'center' });
    if (payslip.tdsProvisional) {
      doc.text('TDS shown is provisional and subject to final computation at year-end.', { width: contentW, align: 'center' });
    }

    doc.end();

    // Collect buffer
    const chunks: Buffer[] = [];
    return new Promise<Buffer>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
  // ────────────────────────────────────────────────────────────────────
  // Shift Swap Requests
  // ────────────────────────────────────────────────────────────────────

  private async resolveEmployeeIdFromUser(userId: string): Promise<string | null> {
    const user = await platformPrisma.user.findUnique({
      where: { id: userId },
      select: { employeeId: true, email: true },
    });
    if (user?.employeeId) return user.employeeId;

    // Fallback: try email match
    const employee = await platformPrisma.employee.findFirst({
      where: { personalEmail: user?.email ?? '', company: { users: { some: { id: userId } } } },
      select: { id: true },
    });
    if (employee) {
      // Auto-link for future calls
      await platformPrisma.user.update({ where: { id: userId }, data: { employeeId: employee.id } });
      return employee.id;
    }

    return null;
  }

  async getMyShiftSwaps(companyId: string, userId: string) {
    const employeeId = await this.resolveEmployeeIdFromUser(userId);
    if (!employeeId) return [];

    return platformPrisma.shiftSwapRequest.findMany({
      where: { employeeId, companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createShiftSwap(companyId: string, userId: string, data: {
    currentShiftId: string;
    requestedShiftId: string;
    swapDate: string;
    reason: string;
  }) {
    const employeeId = await this.resolveEmployeeIdFromUser(userId);
    if (!employeeId) throw ApiError.badRequest('No employee record linked to your account');

    // Validate currentShiftId != requestedShiftId
    if (data.currentShiftId === data.requestedShiftId) {
      throw ApiError.badRequest('Current shift and requested shift must be different');
    }

    // Validate currentShiftId matches the employee's actual assigned shift
    const employee = await platformPrisma.employee.findUnique({
      where: { id: employeeId },
      select: { shiftId: true },
    });
    if (!employee?.shiftId || employee.shiftId !== data.currentShiftId) {
      throw ApiError.badRequest('Current shift ID does not match your assigned shift');
    }

    // Validate requestedShiftId exists and belongs to the same company
    const requestedShift = await platformPrisma.companyShift.findUnique({
      where: { id: data.requestedShiftId },
      select: { companyId: true },
    });
    if (!requestedShift || requestedShift.companyId !== companyId) {
      throw ApiError.badRequest('Requested shift not found');
    }

    // Prevent duplicate pending swap for the same employee + date
    const existingSwap = await platformPrisma.shiftSwapRequest.findFirst({
      where: {
        employeeId,
        swapDate: new Date(data.swapDate),
        status: 'PENDING',
      },
    });
    if (existingSwap) {
      throw ApiError.badRequest('You already have a pending shift swap request for this date');
    }

    // Validate approval workflow exists BEFORE creating the swap request
    await this.requireWorkflow(companyId, 'SHIFT_CHANGE');

    const swapRequest = await platformPrisma.shiftSwapRequest.create({
      data: {
        employeeId,
        currentShiftId: data.currentShiftId,
        requestedShiftId: data.requestedShiftId,
        swapDate: new Date(data.swapDate),
        reason: data.reason,
        status: 'PENDING',
        companyId,
      },
    });

    // Create approval request — workflow is guaranteed to exist
    await this.createRequest(companyId, {
      requesterId: userId,
      entityType: 'ShiftSwapRequest',
      entityId: swapRequest.id,
      triggerEvent: 'SHIFT_CHANGE',
      data: { currentShiftId: data.currentShiftId, requestedShiftId: data.requestedShiftId, swapDate: data.swapDate },
    });

    return swapRequest;
  }

  async cancelShiftSwap(companyId: string, userId: string, id: string) {
    const employeeId = await this.resolveEmployeeIdFromUser(userId);
    if (!employeeId) throw ApiError.badRequest('No employee record linked to your account');

    const request = await platformPrisma.shiftSwapRequest.findUnique({ where: { id } });
    if (!request || request.employeeId !== employeeId || request.companyId !== companyId) {
      throw ApiError.notFound('Shift swap request not found');
    }
    if (request.status !== 'PENDING') {
      throw ApiError.badRequest('Only pending requests can be cancelled');
    }

    return platformPrisma.shiftSwapRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Shift Swap — Admin / Manager endpoints
  // ────────────────────────────────────────────────────────────────────

  async listShiftSwaps(companyId: string, options: ListOptions & { status?: string }) {
    const { page = 1, limit = 20, status } = options;
    const where: any = { companyId };
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      platformPrisma.shiftSwapRequest.findMany({
        where,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      platformPrisma.shiftSwapRequest.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async adminApproveShiftSwap(companyId: string, id: string, approvedBy: string) {
    const request = await platformPrisma.shiftSwapRequest.findUnique({ where: { id } });
    if (!request || request.companyId !== companyId) {
      throw ApiError.notFound('Shift swap request not found');
    }
    if (request.status !== 'PENDING') {
      throw ApiError.badRequest('Only pending requests can be approved');
    }

    await this.onApprovalComplete(companyId, 'ShiftSwapRequest', id, 'APPROVED');

    return platformPrisma.shiftSwapRequest.findUnique({ where: { id } });
  }

  async adminRejectShiftSwap(companyId: string, id: string) {
    const request = await platformPrisma.shiftSwapRequest.findUnique({ where: { id } });
    if (!request || request.companyId !== companyId) {
      throw ApiError.notFound('Shift swap request not found');
    }
    if (request.status !== 'PENDING') {
      throw ApiError.badRequest('Only pending requests can be rejected');
    }

    await this.onApprovalComplete(companyId, 'ShiftSwapRequest', id, 'REJECTED');

    return platformPrisma.shiftSwapRequest.findUnique({ where: { id } });
  }

  // ────────────────────────────────────────────────────────────────────
  // WFH Requests
  // ────────────────────────────────────────────────────────────────────

  async getMyWfhRequests(companyId: string, userId: string) {
    const employeeId = await this.resolveEmployeeIdFromUser(userId);
    if (!employeeId) return [];

    return platformPrisma.wfhRequest.findMany({
      where: { employeeId, companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createWfhRequest(companyId: string, userId: string, data: {
    fromDate: string;
    toDate: string;
    days: number;
    reason: string;
  }) {
    const employeeId = await this.resolveEmployeeIdFromUser(userId);
    if (!employeeId) throw ApiError.badRequest('No employee record linked to your account');

    // Validate approval workflow exists BEFORE creating the WFH request
    await this.requireWorkflow(companyId, 'WFH_REQUEST');

    const wfhRequest = await platformPrisma.wfhRequest.create({
      data: {
        employeeId,
        fromDate: new Date(data.fromDate),
        toDate: new Date(data.toDate),
        days: data.days,
        reason: data.reason,
        status: 'PENDING',
        companyId,
      },
    });

    // Create approval request — workflow is guaranteed to exist
    await this.createRequest(companyId, {
      requesterId: employeeId,
      entityType: 'WfhRequest',
      entityId: wfhRequest.id,
      triggerEvent: 'WFH_REQUEST',
      data: { fromDate: data.fromDate, toDate: data.toDate, days: data.days, reason: data.reason },
    });

    return wfhRequest;
  }

  async cancelWfhRequest(companyId: string, userId: string, id: string) {
    const employeeId = await this.resolveEmployeeIdFromUser(userId);
    if (!employeeId) throw ApiError.badRequest('No employee record linked to your account');

    const request = await platformPrisma.wfhRequest.findUnique({ where: { id } });
    if (!request || request.employeeId !== employeeId || request.companyId !== companyId) {
      throw ApiError.notFound('WFH request not found');
    }
    if (request.status !== 'PENDING') {
      throw ApiError.badRequest('Only pending requests can be cancelled');
    }

    return platformPrisma.wfhRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Employee Documents (Self-Service Upload)
  // ────────────────────────────────────────────────────────────────────

  async getMyDocuments(companyId: string, userId: string) {
    const employeeId = await this.resolveEmployeeIdFromUser(userId);
    if (!employeeId) return [];

    return platformPrisma.employeeDocument.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async uploadMyDocument(companyId: string, userId: string, data: {
    documentType: string;
    documentNumber?: string | undefined;
    expiryDate?: string | undefined;
    fileUrl: string;
    fileName: string;
  }) {
    const employeeId = await this.resolveEmployeeIdFromUser(userId);
    if (!employeeId) throw ApiError.badRequest('No employee record linked to your account');

    return platformPrisma.employeeDocument.create({
      data: {
        employeeId,
        documentType: data.documentType,
        documentNumber: data.documentNumber ?? null,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        fileUrl: data.fileUrl,
        fileName: data.fileName ?? null,
      },
    });
  }

  async deleteMyDocument(companyId: string, userId: string, documentId: string) {
    const employeeId = await this.resolveEmployeeIdFromUser(userId);
    if (!employeeId) throw ApiError.notFound('Employee not found');

    const document = await platformPrisma.employeeDocument.findUnique({
      where: { id: documentId },
    });
    if (!document || document.employeeId !== employeeId) {
      throw ApiError.notFound('Document not found');
    }

    await platformPrisma.employeeDocument.delete({ where: { id: documentId } });
    return { deleted: true };
  }

  // ────────────────────────────────────────────────────────────────────
  // Policy Documents
  // ────────────────────────────────────────────────────────────────────

  async getPolicyDocuments(companyId: string) {
    return platformPrisma.policyDocument.findMany({
      where: { companyId, isActive: true },
      orderBy: { publishedAt: 'desc' },
    });
  }

  async createPolicyDocument(companyId: string, data: {
    title: string;
    category: string;
    description?: string | undefined;
    fileUrl: string;
    fileName: string;
    version?: string | undefined;
  }, userId?: string | undefined) {
    return platformPrisma.policyDocument.create({
      data: {
        title: data.title,
        category: data.category,
        description: data.description ?? null,
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        version: data.version ?? '1.0',
        isActive: true,
        publishedAt: new Date(),
        companyId,
        uploadedBy: userId ?? null,
      },
    });
  }

  async deletePolicyDocument(companyId: string, documentId: string) {
    const document = await platformPrisma.policyDocument.findUnique({
      where: { id: documentId },
    });
    if (!document || document.companyId !== companyId) {
      throw ApiError.notFound('Policy document not found');
    }

    await platformPrisma.policyDocument.delete({ where: { id: documentId } });
    return { deleted: true };
  }

  // ────────────────────────────────────────────────────────────────────
  // Holiday Calendar (ESS)
  // ────────────────────────────────────────────────────────────────────

  async getMyHolidays(companyId: string, year?: number) {
    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings?.timezone ?? 'Asia/Kolkata';
    const targetYear = year ?? DateTime.now().setZone(companyTimezone).year;
    return platformPrisma.holidayCalendar.findMany({
      where: { companyId, year: targetYear },
      orderBy: { date: 'asc' },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Expense Claims (ESS)
  // ────────────────────────────────────────────────────────────────────

  async getMyExpenseClaims(companyId: string, userId: string, options?: { status?: string; page?: number; limit?: number }) {
    const employeeId = await this.resolveEmployeeIdFromUser(userId);
    if (!employeeId) return { claims: [], total: 0, page: 1, limit: 25 };

    const page = options?.page ?? 1;
    const limit = options?.limit ?? 25;
    const where: any = { employeeId, companyId };
    if (options?.status) where.status = options.status.toUpperCase();

    const [claims, total] = await Promise.all([
      platformPrisma.expenseClaim.findMany({
        where,
        include: {
          items: {
            include: { category: { select: { id: true, name: true, code: true } } },
            orderBy: { expenseDate: 'asc' },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.expenseClaim.count({ where }),
    ]);

    return { claims, total, page, limit };
  }

  async getMyExpenseClaim(companyId: string, userId: string, claimId: string) {
    const employeeId = await this.resolveEmployeeIdFromUser(userId);
    if (!employeeId) throw ApiError.badRequest('No employee record linked to your account');

    const claim = await platformPrisma.expenseClaim.findUnique({
      where: { id: claimId },
      include: {
        items: {
          include: { category: { select: { id: true, name: true, code: true } } },
          orderBy: { expenseDate: 'asc' },
        },
      },
    });
    if (!claim || claim.employeeId !== employeeId || claim.companyId !== companyId) {
      throw ApiError.notFound('Expense claim not found');
    }
    return claim;
  }

  async getExpenseCategories(companyId: string) {
    return platformPrisma.expenseCategory.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async getMyExpenseSummary(companyId: string, userId: string, financialYear?: string) {
    const employeeId = await this.resolveEmployeeIdFromUser(userId);
    if (!employeeId) return null;

    // Determine date range for financial year (April to March)
    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings?.timezone ?? 'Asia/Kolkata';
    let startDate: Date;
    let endDate: Date;
    if (financialYear) {
      const [startYear] = financialYear.split('-').map(Number);
      startDate = new Date(startYear!, 3, 1); // April 1
      endDate = new Date(startYear! + 1, 2, 31); // March 31
    } else {
      const now = DateTime.now().setZone(companyTimezone);
      // Luxon month is 1-indexed: April = 4
      const fiscalStartYear = now.month >= 4 ? now.year : now.year - 1;
      startDate = new Date(fiscalStartYear, 3, 1);
      endDate = new Date(fiscalStartYear + 1, 2, 31);
    }

    // Get all non-cancelled claims for this period
    const claims = await platformPrisma.expenseClaim.findMany({
      where: {
        employeeId,
        companyId,
        status: { notIn: ['CANCELLED', 'DRAFT'] },
        createdAt: { gte: startDate, lte: endDate },
      },
      select: { status: true, amount: true, approvedAmount: true, category: true },
    });

    const summary = {
      totalClaimed: 0,
      totalApproved: 0,
      totalPaid: 0,
      totalPending: 0,
      totalRejected: 0,
      claimCount: claims.length,
      byCategory: {} as Record<string, { claimed: number; approved: number }>,
    };

    for (const claim of claims) {
      const amt = Number(claim.amount);
      summary.totalClaimed += amt;
      if (claim.status === 'APPROVED' || claim.status === 'PARTIALLY_APPROVED') {
        summary.totalApproved += Number(claim.approvedAmount ?? claim.amount);
      }
      if (claim.status === 'PAID') {
        summary.totalPaid += Number(claim.approvedAmount ?? claim.amount);
        summary.totalApproved += Number(claim.approvedAmount ?? claim.amount);
      }
      if (claim.status === 'SUBMITTED' || claim.status === 'PENDING_APPROVAL') {
        summary.totalPending += amt;
      }
      if (claim.status === 'REJECTED') {
        summary.totalRejected += amt;
      }
      if (!summary.byCategory[claim.category]) {
        summary.byCategory[claim.category] = { claimed: 0, approved: 0 };
      }
      summary.byCategory[claim.category]!.claimed += amt;
      if (['APPROVED', 'PARTIALLY_APPROVED', 'PAID'].includes(claim.status)) {
        summary.byCategory[claim.category]!.approved += Number(claim.approvedAmount ?? claim.amount);
      }
    }

    return summary;
  }

  async createMyExpenseClaim(companyId: string, userId: string, data: {
    title: string;
    amount: number;
    category: string;
    description?: string | undefined;
    tripDate?: string | undefined;
    fromDate?: string | undefined;
    toDate?: string | undefined;
    paymentMethod?: string | undefined;
    merchantName?: string | undefined;
    projectCode?: string | undefined;
    currency?: string | undefined;
    receipts?: Array<{ fileName: string; fileUrl: string }> | undefined;
    items?: Array<{
      categoryCode: string;
      categoryId?: string | undefined;
      description: string;
      amount: number;
      expenseDate: string;
      merchantName?: string | undefined;
      receipts?: Array<{ fileName: string; fileUrl: string }> | undefined;
      distanceKm?: number | undefined;
      ratePerKm?: number | undefined;
    }> | undefined;
  }) {
    const employeeId = await this.resolveEmployeeIdFromUser(userId);
    if (!employeeId) throw ApiError.badRequest('No employee record linked to your account');

    // Get employee info for limit checks
    const employee = await platformPrisma.employee.findUnique({
      where: { id: employeeId },
      select: { gradeId: true, designationId: true },
    });

    // Calculate total from line items if provided, otherwise use direct amount
    let totalAmount = data.amount;
    if (data.items && data.items.length > 0) {
      totalAmount = data.items.reduce((sum, item) => sum + item.amount, 0);
    }

    // Validate spending limits if line items are provided
    if (data.items && data.items.length > 0) {
      await this.validateExpenseLimits(companyId, employeeId, employee?.gradeId ?? null, employee?.designationId ?? null, data.items);
    }

    // Generate claim number from Number Series
    const claimNumber = await generateNextNumber(
      platformPrisma, companyId, ['Expense', 'Expense Claims'], 'Expense Claim',
    );

    const createData: any = {
      employeeId,
      claimNumber,
      title: data.title,
      amount: totalAmount,
      category: data.category,
      description: data.description ?? null,
      tripDate: data.tripDate ? new Date(data.tripDate) : null,
      fromDate: data.fromDate ? new Date(data.fromDate) : null,
      toDate: data.toDate ? new Date(data.toDate) : null,
      paymentMethod: (data.paymentMethod as any) ?? 'CASH',
      merchantName: data.merchantName ?? null,
      projectCode: data.projectCode ?? null,
      currency: data.currency ?? 'INR',
      receipts: data.receipts ?? Prisma.JsonNull,
      status: 'DRAFT',
      companyId,
    };

    if (data.items && data.items.length > 0) {
      createData.items = {
        create: data.items.map((item) => ({
          categoryCode: item.categoryCode,
          categoryId: item.categoryId ?? null,
          description: item.description,
          amount: item.amount,
          expenseDate: new Date(item.expenseDate),
          merchantName: item.merchantName ?? null,
          receipts: item.receipts ?? Prisma.JsonNull,
          distanceKm: item.distanceKm ?? null,
          ratePerKm: item.ratePerKm ?? null,
        })),
      };
    }

    const claim = await platformPrisma.expenseClaim.create({
      data: createData,
      include: {
        items: { orderBy: { expenseDate: 'asc' } },
      },
    });

    return claim;
  }

  async updateMyExpenseClaim(companyId: string, userId: string, claimId: string, data: {
    title?: string | undefined;
    amount?: number | undefined;
    category?: string | undefined;
    description?: string | undefined;
    tripDate?: string | undefined;
    fromDate?: string | undefined;
    toDate?: string | undefined;
    paymentMethod?: string | undefined;
    merchantName?: string | undefined;
    projectCode?: string | undefined;
    receipts?: Array<{ fileName: string; fileUrl: string }> | undefined;
    items?: Array<{
      id?: string | undefined;
      categoryCode: string;
      categoryId?: string | undefined;
      description: string;
      amount: number;
      expenseDate: string;
      merchantName?: string | undefined;
      receipts?: Array<{ fileName: string; fileUrl: string }> | undefined;
      distanceKm?: number | undefined;
      ratePerKm?: number | undefined;
    }> | undefined;
  }) {
    const employeeId = await this.resolveEmployeeIdFromUser(userId);
    if (!employeeId) throw ApiError.badRequest('No employee record linked to your account');

    const claim = await platformPrisma.expenseClaim.findUnique({ where: { id: claimId } });
    if (!claim || claim.employeeId !== employeeId || claim.companyId !== companyId) {
      throw ApiError.notFound('Expense claim not found');
    }
    if (claim.status !== 'DRAFT') {
      throw ApiError.badRequest('Only DRAFT claims can be updated');
    }

    // If items are being replaced, recalculate total
    let newAmount = data.amount;
    if (data.items && data.items.length > 0) {
      newAmount = data.items.reduce((sum, item) => sum + item.amount, 0);
    }

    // Delete existing line items and recreate if items are provided
    if (data.items !== undefined) {
      await platformPrisma.expenseClaimItem.deleteMany({ where: { claimId } });
    }

    const updateData: any = {
      ...(data.title !== undefined && { title: data.title }),
      ...(newAmount !== undefined && { amount: newAmount }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.description !== undefined && { description: data.description ?? null }),
      ...(data.tripDate !== undefined && { tripDate: data.tripDate ? new Date(data.tripDate) : null }),
      ...(data.fromDate !== undefined && { fromDate: data.fromDate ? new Date(data.fromDate) : null }),
      ...(data.toDate !== undefined && { toDate: data.toDate ? new Date(data.toDate) : null }),
      ...(data.paymentMethod !== undefined && { paymentMethod: data.paymentMethod as any }),
      ...(data.merchantName !== undefined && { merchantName: data.merchantName ?? null }),
      ...(data.projectCode !== undefined && { projectCode: data.projectCode ?? null }),
      ...(data.receipts !== undefined && { receipts: data.receipts ?? Prisma.JsonNull }),
    };

    if (data.items && data.items.length > 0) {
      updateData.items = {
        create: data.items.map((item) => ({
          categoryCode: item.categoryCode,
          categoryId: item.categoryId ?? null,
          description: item.description,
          amount: item.amount,
          expenseDate: new Date(item.expenseDate),
          merchantName: item.merchantName ?? null,
          receipts: item.receipts ?? Prisma.JsonNull,
          distanceKm: item.distanceKm ?? null,
          ratePerKm: item.ratePerKm ?? null,
        })),
      };
    }

    return platformPrisma.expenseClaim.update({
      where: { id: claimId },
      data: updateData,
      include: {
        items: { orderBy: { expenseDate: 'asc' } },
      },
    });
  }

  async submitMyExpenseClaim(companyId: string, userId: string, claimId: string) {
    const employeeId = await this.resolveEmployeeIdFromUser(userId);
    if (!employeeId) throw ApiError.badRequest('No employee record linked to your account');

    const claim = await platformPrisma.expenseClaim.findUnique({
      where: { id: claimId },
      include: { items: true },
    });
    if (!claim || claim.employeeId !== employeeId || claim.companyId !== companyId) {
      throw ApiError.notFound('Expense claim not found');
    }
    if (claim.status !== 'DRAFT') {
      throw ApiError.badRequest('Only DRAFT claims can be submitted');
    }

    // Validate receipt requirements
    await this.validateExpenseReceipts(companyId, claim);

    // Submit and wire to approval workflow
    const updatedClaim = await platformPrisma.expenseClaim.update({
      where: { id: claimId },
      data: { status: 'SUBMITTED' },
      include: { items: true },
    });

    // Create approval request via workflow
    const approvalRequest = await this.createRequest(companyId, {
      requesterId: employeeId,
      entityType: 'ExpenseClaim',
      entityId: claim.id,
      triggerEvent: 'REIMBURSEMENT',
      data: {
        amount: Number(claim.amount),
        category: claim.category,
        title: claim.title,
        itemCount: claim.items.length,
        claimNumber: claim.claimNumber,
      },
    });

    // If no workflow is configured, auto-approve
    if (!approvalRequest) {
      await platformPrisma.expenseClaim.update({
        where: { id: claimId },
        data: {
          status: 'APPROVED',
          approvedBy: 'auto',
          approvedAt: new Date(),
          approvedAmount: claim.amount,
        },
      });
      if (claim.items.length > 0) {
        await platformPrisma.expenseClaimItem.updateMany({
          where: { claimId },
          data: { isApproved: true },
        });
      }
      return platformPrisma.expenseClaim.findUnique({
        where: { id: claimId },
        include: { items: true },
      });
    } else {
      // Update status to PENDING_APPROVAL since there is a workflow
      return platformPrisma.expenseClaim.update({
        where: { id: claimId },
        data: { status: 'PENDING_APPROVAL' },
        include: { items: true },
      });
    }
  }

  async cancelMyExpenseClaim(companyId: string, userId: string, claimId: string) {
    const employeeId = await this.resolveEmployeeIdFromUser(userId);
    if (!employeeId) throw ApiError.badRequest('No employee record linked to your account');

    const claim = await platformPrisma.expenseClaim.findUnique({ where: { id: claimId } });
    if (!claim || claim.employeeId !== employeeId || claim.companyId !== companyId) {
      throw ApiError.notFound('Expense claim not found');
    }
    if (!['DRAFT', 'SUBMITTED', 'PENDING_APPROVAL'].includes(claim.status)) {
      throw ApiError.badRequest('Only DRAFT, SUBMITTED, or PENDING_APPROVAL claims can be cancelled');
    }

    return platformPrisma.expenseClaim.update({
      where: { id: claimId },
      data: { status: 'CANCELLED' },
    });
  }

  // ── Expense Claim Helper Methods ──────────────────────────────────

  private async validateExpenseLimits(
    companyId: string,
    employeeId: string,
    gradeId: string | null,
    designationId: string | null,
    items: Array<{ categoryCode: string; amount: number; expenseDate: string }>,
  ) {
    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings?.timezone ?? 'Asia/Kolkata';
    // Get categories with limits
    const categoryCodes = [...new Set(items.map((i) => i.categoryCode))];
    const categories = await platformPrisma.expenseCategory.findMany({
      where: { companyId, code: { in: categoryCodes }, isActive: true },
      include: {
        limits: {
          where: {
            OR: [
              { gradeId, designationId },
              { gradeId, designationId: null },
              { gradeId: null, designationId },
              { gradeId: null, designationId: null },
            ],
          },
        },
      },
    });

    const categoryMap = new Map(categories.map((c) => [c.code, c]));

    for (const code of categoryCodes) {
      const cat = categoryMap.get(code);
      if (!cat) continue; // No category config — skip limit check

      // Determine applicable limits (grade+designation > grade > designation > category default)
      const limit = cat.limits.find((l) => l.gradeId === gradeId && l.designationId === designationId)
        ?? cat.limits.find((l) => l.gradeId === gradeId && l.designationId === null)
        ?? cat.limits.find((l) => l.gradeId === null && l.designationId === designationId)
        ?? null;

      const maxPerClaim = limit?.maxAmountPerClaim ? Number(limit.maxAmountPerClaim) : (cat.maxAmountPerClaim ? Number(cat.maxAmountPerClaim) : null);
      const maxPerMonth = limit?.maxAmountPerMonth ? Number(limit.maxAmountPerMonth) : (cat.maxAmountPerMonth ? Number(cat.maxAmountPerMonth) : null);

      // Sum amounts for this category in this claim
      const categoryTotal = items
        .filter((i) => i.categoryCode === code)
        .reduce((sum, i) => sum + i.amount, 0);

      // Per-claim limit
      if (maxPerClaim !== null && categoryTotal > maxPerClaim) {
        throw ApiError.badRequest(
          `${cat.name}: total amount ${categoryTotal} exceeds per-claim limit of ${maxPerClaim}`
        );
      }

      // Monthly limit check
      if (maxPerMonth !== null) {
        // Get current month's approved/pending claims for this category
        const nowDt = DateTime.now().setZone(companyTimezone);
        const monthStart = nowDt.startOf('month').toJSDate();
        const monthEnd = nowDt.endOf('month').toJSDate();

        const existingItems = await platformPrisma.expenseClaimItem.findMany({
          where: {
            categoryCode: code,
            expenseDate: { gte: monthStart, lte: monthEnd },
            claim: {
              employeeId,
              companyId,
              status: { in: ['SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_APPROVED', 'PAID'] },
            },
          },
          select: { amount: true },
        });

        const existingTotal = existingItems.reduce((sum, i) => sum + Number(i.amount), 0);
        if (existingTotal + categoryTotal > maxPerMonth) {
          throw ApiError.badRequest(
            `${cat.name}: monthly limit of ${maxPerMonth} would be exceeded (already ${existingTotal} this month, claiming ${categoryTotal})`
          );
        }
      }
    }
  }

  private async validateExpenseReceipts(
    companyId: string,
    claim: any,
  ) {
    // If claim has line items, validate per-item receipts
    if (claim.items && claim.items.length > 0) {
      const categoryCodes = [...new Set(claim.items.map((i: any) => i.categoryCode))] as string[];
      const categories = await platformPrisma.expenseCategory.findMany({
        where: { companyId, code: { in: categoryCodes } },
      });
      const categoryMap = new Map(categories.map((c) => [c.code, c]));

      // Check claim-level receipts as fallback when item-level receipts are missing
      const claimReceipts = claim.receipts as any[] | null;
      const hasClaimLevelReceipts = claimReceipts && claimReceipts.length > 0;

      for (const item of claim.items) {
        const cat = categoryMap.get(item.categoryCode);
        if (!cat) continue;

        const itemReceipts = item.receipts as any[] | null;
        const hasReceipts = (itemReceipts && itemReceipts.length > 0) || hasClaimLevelReceipts;

        if (cat.requiresReceipt && !hasReceipts) {
          throw ApiError.badRequest(
            `Receipt is required for "${cat.name}" expenses (item: ${item.description})`
          );
        }

        if (!cat.requiresReceipt && cat.receiptThreshold !== null) {
          if (Number(item.amount) >= Number(cat.receiptThreshold) && !hasReceipts) {
            throw ApiError.badRequest(
              `Receipt is required for "${cat.name}" expenses above ${cat.receiptThreshold} (item: ${item.description})`
            );
          }
        }
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // Loan Application (ESS)
  // ────────────────────────────────────────────────────────────────────

  async getMyLoans(companyId: string, userId: string) {
    const employeeId = await this.resolveEmployeeIdFromUser(userId);
    if (!employeeId) return [];

    return platformPrisma.loanRecord.findMany({
      where: { employeeId, companyId },
      include: {
        policy: { select: { name: true, code: true, loanType: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAvailableLoanPolicies(companyId: string) {
    return platformPrisma.loanPolicy.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async applyForLoan(companyId: string, userId: string, data: {
    policyId: string;
    amount: number;
    tenure: number;
    reason?: string | undefined;
  }) {
    const employeeId = await this.resolveEmployeeIdFromUser(userId);
    if (!employeeId) throw ApiError.badRequest('No employee record linked to your account');

    const policy = await platformPrisma.loanPolicy.findUnique({
      where: { id: data.policyId },
    });
    if (!policy || policy.companyId !== companyId || !policy.isActive) {
      throw ApiError.notFound('Loan policy not found or inactive');
    }

    // Validate amount against policy max
    if (policy.maxAmount && data.amount > Number(policy.maxAmount)) {
      throw ApiError.badRequest(`Amount exceeds maximum allowed (${policy.maxAmount})`);
    }

    // Validate tenure against policy max
    if (policy.maxTenureMonths && data.tenure > policy.maxTenureMonths) {
      throw ApiError.badRequest(`Tenure exceeds maximum allowed (${policy.maxTenureMonths} months)`);
    }

    // Validate approval workflow exists BEFORE creating the loan record
    await this.requireWorkflow(companyId, 'LOAN_APPLICATION');

    // Calculate EMI using standard formula
    const interestRate = Number(policy.interestRate);
    const monthlyRate = interestRate / 12 / 100;
    let emiAmount: number;
    if (monthlyRate > 0) {
      const factor = Math.pow(1 + monthlyRate, data.tenure);
      emiAmount = (data.amount * monthlyRate * factor) / (factor - 1);
    } else {
      emiAmount = data.amount / data.tenure;
    }
    // Round to 2 decimal places
    emiAmount = Math.round(emiAmount * 100) / 100;

    const loanRecord = await platformPrisma.loanRecord.create({
      data: {
        employeeId,
        policyId: data.policyId,
        loanType: policy.loanType,
        amount: data.amount,
        tenure: data.tenure,
        emiAmount,
        interestRate,
        outstanding: data.amount,
        status: 'PENDING',
        companyId,
      },
      include: {
        policy: { select: { name: true, code: true, loanType: true } },
      },
    });

    // Create approval request — workflow is guaranteed to exist
    await this.createRequest(companyId, {
      requesterId: employeeId,
      entityType: 'LoanRecord',
      entityId: loanRecord.id,
      triggerEvent: 'LOAN_APPLICATION',
      data: { amount: data.amount, tenure: data.tenure, reason: data.reason, policyName: policy.name },
    });

    return loanRecord;
  }
}

export const essService = new ESSService();
