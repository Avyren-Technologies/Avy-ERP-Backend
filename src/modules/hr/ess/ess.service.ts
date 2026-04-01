import { MaritalStatus, Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { logger } from '../../../config/logger';
import { invalidateESSConfig, getCachedCompanySettings } from '../../../shared/utils/config-cache';
import { nowInCompanyTimezone } from '../../../shared/utils/timezone';

/** Convert undefined to null for Prisma nullable fields. */
function n<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

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

    return { requests, total, page, limit };
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

    // Mark requests with delegation info
    const delegateManagerIds = new Set(delegations.map(d => d.managerId));

    return directRequests.map(req => ({
      ...req,
      isDelegated: false,
      delegatedFromManagerIds: delegateManagerIds.size > 0 ? Array.from(delegateManagerIds) : undefined,
    }));
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
   * Validates that the approver has the correct role for the current workflow step.
   * - MANAGER: approver must be the requester's reporting manager (or an active delegate)
   * - HR: approver must have an HR-related role/permission
   * - If no matching role found, falls back to allowing (backwards compatible)
   */
  private async validateApproverRole(
    companyId: string,
    requesterId: string,
    approverId: string,
    approverRole: string,
  ) {
    const normalizedRole = approverRole.toUpperCase();

    if (normalizedRole === 'MANAGER') {
      // Check if the approver is the requester's reporting manager
      const requester = await platformPrisma.employee.findFirst({
        where: {
          OR: [{ id: requesterId }, { user: { id: requesterId } }],
          companyId,
        },
        select: { id: true, reportingManagerId: true },
      });

      if (requester && requester.reportingManagerId) {
        // Get the approver's employee record
        const approverEmployee = await platformPrisma.employee.findFirst({
          where: {
            OR: [{ id: approverId }, { user: { id: approverId } }],
            companyId,
          },
          select: { id: true },
        });

        if (approverEmployee) {
          // Direct manager check
          if (approverEmployee.id === requester.reportingManagerId) {
            return; // Valid — approver is the reporting manager
          }

          // Check if approver is an active delegate for the reporting manager
          const activeDelegates = await this.getActiveDelegates(companyId, requester.reportingManagerId);
          if (activeDelegates.includes(approverEmployee.id) || activeDelegates.includes(approverId)) {
            return; // Valid — approver is a delegate for the manager
          }
        }

        throw ApiError.badRequest(
          'This approval step requires the reporting manager. You are not authorized to approve this request.'
        );
      }
      // If no requester found or no manager set, fall through (backwards compatible)
      logger.warn(`Approval role validation: could not verify MANAGER role for requester ${requesterId}, allowing fallback`);
    } else if (normalizedRole === 'HR') {
      // Check if the approver's user has HR-related permissions via TenantUser -> Role
      const approverUser = await platformPrisma.user.findFirst({
        where: {
          OR: [{ id: approverId }, { employee: { id: approverId } }],
        },
        select: {
          id: true,
          role: true,
          tenantUsers: {
            include: {
              role: { select: { permissions: true } },
            },
          },
        },
      });

      if (approverUser) {
        // Check tenant-scoped roles for HR permissions
        for (const tu of approverUser.tenantUsers) {
          const permissions = tu.role.permissions as string[];
          const hasHrPermission = Array.isArray(permissions) && permissions.some(
            (p: string) => p === '*' || p.startsWith('hr:') || p === 'hr'
          );
          if (hasHrPermission) return; // Valid
        }

        // Also allow if user's base role is COMPANY_ADMIN (they implicitly have HR access)
        if (approverUser.role === 'COMPANY_ADMIN') return;
      }

      throw ApiError.badRequest(
        'This approval step requires HR personnel. You are not authorized to approve this request.'
      );
    }
    // For any other approverRole value (or no match), allow (backwards compatible)
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

  private async onApprovalComplete(companyId: string, entityType: string, entityId: string, decision: 'APPROVED' | 'REJECTED') {
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

        default:
          // Unknown entity type — log but don't fail
          break;
      }
    } catch (error) {
      // Log the callback error but don't fail the approval
      // The approval itself succeeded; entity update failure should be retryable
      logger.error(`Approval callback failed for ${entityType}/${entityId}:`, error);
    }
  }

  async createRequest(companyId: string, data: {
    requesterId: string;
    entityType: string;
    entityId: string;
    triggerEvent: string;
    data?: any;
  }) {
    // Find matching workflow
    const workflow = await platformPrisma.approvalWorkflow.findUnique({
      where: { companyId_triggerEvent: { companyId, triggerEvent: data.triggerEvent } },
    });

    if (!workflow || !workflow.isActive) {
      // No active workflow — auto-approve
      return null;
    }

    return platformPrisma.approvalRequest.create({
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
    return platformPrisma.notificationTemplate.create({
      data: {
        companyId,
        name: data.name,
        subject: n(data.subject),
        body: data.body,
        channel: data.channel,
        isActive: data.isActive ?? true,
      },
    });
  }

  async updateTemplate(companyId: string, id: string, data: any) {
    const template = await platformPrisma.notificationTemplate.findUnique({ where: { id } });
    if (!template || template.companyId !== companyId) {
      throw ApiError.notFound('Notification template not found');
    }

    return platformPrisma.notificationTemplate.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.subject !== undefined && { subject: n(data.subject) }),
        ...(data.body !== undefined && { body: data.body }),
        ...(data.channel !== undefined && { channel: data.channel }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async deleteTemplate(companyId: string, id: string) {
    const template = await platformPrisma.notificationTemplate.findUnique({ where: { id } });
    if (!template || template.companyId !== companyId) {
      throw ApiError.notFound('Notification template not found');
    }

    // Cascade delete will remove associated rules
    await platformPrisma.notificationTemplate.delete({ where: { id } });
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

    return platformPrisma.notificationRule.create({
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

    return platformPrisma.notificationRule.update({
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
  }

  async deleteRule(companyId: string, id: string) {
    const rule = await platformPrisma.notificationRule.findUnique({ where: { id } });
    if (!rule || rule.companyId !== companyId) {
      throw ApiError.notFound('Notification rule not found');
    }

    await platformPrisma.notificationRule.delete({ where: { id } });
    return { message: 'Notification rule deleted' };
  }

  async triggerNotification(companyId: string, event: string, data: any) {
    // Find matching rules
    const rules = await platformPrisma.notificationRule.findMany({
      where: {
        companyId,
        triggerEvent: event,
        isActive: true,
      },
      include: { template: true },
    });

    if (rules.length === 0) return;

    // Resolve template tokens and queue notifications (placeholder — just log)
    for (const rule of rules) {
      let body = rule.template.body;
      let subject = rule.template.subject ?? '';

      // Replace tokens in body and subject
      if (data && typeof data === 'object') {
        for (const [key, value] of Object.entries(data)) {
          const token = `{${key}}`;
          body = body.replace(new RegExp(token.replace(/[{}]/g, '\\$&'), 'g'), String(value));
          subject = subject.replace(new RegExp(token.replace(/[{}]/g, '\\$&'), 'g'), String(value));
        }
      }

      // Deliver notification based on channel
      try {
        if (rule.channel === 'EMAIL') {
          const recipientEmails = await this.resolveRecipientEmails(companyId, rule.recipientRole, data);
          if (recipientEmails.length > 0) {
            const { sendEmail } = await import('@/infrastructure/email/email.service');
            for (const email of recipientEmails) {
              await sendEmail(
                email,
                subject,
                `<div style="font-family:sans-serif;padding:20px;max-width:600px;margin:0 auto">${body.replace(/\n/g, '<br>')}</div>`,
                body
              );
            }
            logger.info(`[Notification:EMAIL] ${event} → ${recipientEmails.length} recipient(s)`);
          }
        } else if (rule.channel === 'IN_APP') {
          logger.info(`[Notification:IN_APP] ${event} → ${rule.recipientRole}: ${subject}`);
        } else {
          logger.info(`[Notification:${rule.channel}] ${event} → ${rule.recipientRole}: ${subject} (channel not yet implemented)`);
        }
      } catch (err) {
        logger.error(`[Notification] Failed to deliver ${rule.channel} notification for ${event}:`, err);
      }
    }
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
    const currentYear = new Date().getFullYear();
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
      select: { id: true, companyId: true, employeeId: true },
    });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.notFound('Employee not found');
    }

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

    // Create approval request if workflow exists
    await this.createRequest(companyId, {
      requesterId: employeeId,
      entityType: 'LeaveRequest',
      entityId: leaveRequest.id,
      triggerEvent: 'LEAVE_APPLICATION',
      data: {
        employeeId: employee.employeeId,
        leaveTypeId: data.leaveTypeId,
        fromDate: data.fromDate,
        toDate: data.toDate,
        days: data.days,
        reason: data.reason,
      },
    });

    // Trigger notification
    await this.triggerNotification(companyId, 'LEAVE_APPLICATION', {
      employee_name: employee.employeeId,
      leave_days: data.days,
      from_date: data.fromDate,
      to_date: data.toDate,
    });

    return leaveRequest;
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
    const recordDate = new Date(record.date);
    const recordMonth = recordDate.getMonth() + 1;
    const recordYear = recordDate.getFullYear();

    const payrollRun = await platformPrisma.payrollRun.findUnique({
      where: { companyId_month_year: { companyId, month: recordMonth, year: recordYear } },
    });

    if (payrollRun && payrollRun.status !== 'DRAFT') {
      throw ApiError.badRequest(
        `Cannot regularize: attendance for ${recordMonth}/${recordYear} is locked for payroll processing (status: ${payrollRun.status})`
      );
    }

    // 5. Create AttendanceOverride with requestedBy = employeeId, status = PENDING
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

    // 6. Wire into approval workflow via createRequest (Employee -> Manager)
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

    // 7. Return the override
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

    // Form 16 is generated from statutory filings. Return the employee's payslips and TDS records.
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

    return { payslips };
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
    logger.warn(`Dashboard widget "${label}" failed: ${(result.reason as Error)?.message ?? result.reason}`);
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

  private async getDashboardAttendanceStatus(_companyId: string, employeeId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const record = await platformPrisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
      include: {
        shift: { select: { id: true, name: true, startTime: true, endTime: true } },
        location: { select: { id: true, name: true } },
      },
    });

    if (!record) {
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
    const currentYear = new Date().getFullYear();

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
      select: { shiftId: true },
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

    return shift;
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
      const jsDate = dt.toJSDate();
      const dayOfWeek = jsDate.getDay();
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
      const jsDate = dt.toJSDate();
      const dayOfWeek = jsDate.getDay();
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

    const currentYear = new Date().getFullYear();

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
        const dayOfWeek = dayDt.toJSDate().getDay();
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

    const formatCurrency = (amount: number): string =>
      new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);

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

    const earnings: Array<{ label: string; amount: number }> =
      Array.isArray(payslip.earnings) ? (payslip.earnings as any[]) : [];
    const deductions: Array<{ label: string; amount: number }> =
      Array.isArray(payslip.deductions) ? (payslip.deductions as any[]) : [];

    const grossEarnings = typeof payslip.grossEarnings === 'number'
      ? payslip.grossEarnings
      : earnings.reduce((sum, e) => sum + (e.amount ?? 0), 0);
    const totalDeductions = typeof payslip.totalDeductions === 'number'
      ? payslip.totalDeductions
      : deductions.reduce((sum, d) => sum + (d.amount ?? 0), 0);
    const netPay = typeof payslip.netPay === 'number'
      ? payslip.netPay
      : grossEarnings - totalDeductions;

    // ── Build PDF ────────────────────────────────────────────────────
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = new PassThrough();
    doc.pipe(stream);

    // Header
    doc.font('Helvetica-Bold').fontSize(20).text(companyName, { align: 'center' });
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(14).text('Payslip', { align: 'center' });
    doc.font('Helvetica').fontSize(11).text(`${monthLabel} ${payslip.year}`, { align: 'center' });
    doc.moveDown(1);

    // Divider
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    // Employee Info
    const infoStartY = doc.y;
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Employee Name:', 50, infoStartY);
    doc.font('Helvetica').text(empName, 170, infoStartY);

    doc.font('Helvetica-Bold').text('Employee ID:', 50, infoStartY + 18);
    doc.font('Helvetica').text(empId, 170, infoStartY + 18);

    doc.font('Helvetica-Bold').text('Department:', 50, infoStartY + 36);
    doc.font('Helvetica').text(deptName, 170, infoStartY + 36);

    doc.font('Helvetica-Bold').text('Designation:', 300, infoStartY);
    doc.font('Helvetica').text(desgName, 400, infoStartY);

    doc.font('Helvetica-Bold').text('PAN:', 300, infoStartY + 18);
    doc.font('Helvetica').text(panNumber, 400, infoStartY + 18);

    doc.font('Helvetica-Bold').text('UAN:', 300, infoStartY + 36);
    doc.font('Helvetica').text(uanNumber, 400, infoStartY + 36);

    doc.font('Helvetica-Bold').text('Bank:', 50, infoStartY + 54);
    doc.font('Helvetica').text(bankInfo, 170, infoStartY + 54);

    doc.y = infoStartY + 80;
    doc.moveDown(0.5);

    // Divider
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    // Two-column header
    const colLeftX = 50;
    const colRightX = 300;
    const colWidth = 245;

    doc.font('Helvetica-Bold').fontSize(11);
    doc.text('Earnings', colLeftX, doc.y);
    doc.text('Deductions', colRightX, doc.y - doc.currentLineHeight());
    doc.moveDown(0.5);

    // Divider
    const tableTopY = doc.y;
    doc.moveTo(50, tableTopY).lineTo(545, tableTopY).stroke();
    doc.moveDown(0.3);

    // Table rows
    const maxRows = Math.max(earnings.length, deductions.length);
    let rowY = doc.y;
    doc.font('Helvetica').fontSize(9);

    for (let i = 0; i < maxRows; i++) {
      if (rowY > 700) {
        doc.addPage();
        rowY = 50;
      }

      if (earnings[i]) {
        doc.text(earnings[i]!.label ?? '—', colLeftX, rowY, { width: 150 });
        doc.text(formatCurrency(earnings[i]!.amount ?? 0), colLeftX + 150, rowY, { width: 95, align: 'right' });
      }
      if (deductions[i]) {
        doc.text(deductions[i]!.label ?? '—', colRightX, rowY, { width: 150 });
        doc.text(formatCurrency(deductions[i]!.amount ?? 0), colRightX + 150, rowY, { width: 95, align: 'right' });
      }

      rowY += 16;
    }

    doc.y = rowY + 8;

    // Totals divider
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Gross Earnings:', colLeftX, doc.y);
    doc.text(formatCurrency(grossEarnings), colLeftX + 150, doc.y - doc.currentLineHeight(), { width: 95, align: 'right' });

    doc.text('Total Deductions:', colRightX, doc.y - doc.currentLineHeight());
    doc.text(formatCurrency(totalDeductions), colRightX + 150, doc.y - doc.currentLineHeight(), { width: 95, align: 'right' });
    doc.moveDown(1);

    // Net Pay
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(13).text(`Net Pay: ${formatCurrency(netPay)}`, { align: 'center' });
    doc.moveDown(1);

    // Footer
    doc.font('Helvetica').fontSize(8).fillColor('#999999')
      .text('This is a computer-generated payslip and does not require a signature.', { align: 'center' });

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

    // Create an approval request if a workflow is configured
    const approvalResult = await this.createRequest(companyId, {
      requesterId: userId,
      entityType: 'ShiftSwapRequest',
      entityId: swapRequest.id,
      triggerEvent: 'shift_swap_requested',
      data: { currentShiftId: data.currentShiftId, requestedShiftId: data.requestedShiftId, swapDate: data.swapDate },
    });

    // If no active workflow, auto-approve
    if (!approvalResult) {
      await this.onApprovalComplete(companyId, 'ShiftSwapRequest', swapRequest.id, 'APPROVED');
    }

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

    return platformPrisma.wfhRequest.create({
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

  private async resolveRecipientEmails(companyId: string, recipientRole: string, data: any): Promise<string[]> {
    if (recipientRole === 'EMPLOYEE' && data?.employeeEmail) {
      return [data.employeeEmail];
    }

    if (recipientRole === 'MANAGER' && data?.employeeId) {
      const employee = await platformPrisma.employee.findUnique({
        where: { id: data.employeeId },
        select: { reportingManager: { select: { officialEmail: true, personalEmail: true } } },
      });
      const mgr = employee?.reportingManager;
      if (mgr?.officialEmail) return [mgr.officialEmail];
      if (mgr?.personalEmail) return [mgr.personalEmail];
      return [];
    }

    if (recipientRole === 'HR') {
      const hrUsers = await platformPrisma.user.findMany({
        where: { companyId, isActive: true, role: 'COMPANY_ADMIN' },
        select: { email: true },
        take: 5,
      });
      return hrUsers.map((u) => u.email);
    }

    if (recipientRole === 'ALL') {
      const users = await platformPrisma.user.findMany({
        where: { companyId, isActive: true },
        select: { email: true },
        take: 50,
      });
      return users.map((u) => u.email);
    }

    return [];
  }

  // ────────────────────────────────────────────────────────────────────
  // Holiday Calendar (ESS)
  // ────────────────────────────────────────────────────────────────────

  async getMyHolidays(companyId: string, year?: number) {
    const targetYear = year ?? new Date().getFullYear();
    return platformPrisma.holidayCalendar.findMany({
      where: { companyId, year: targetYear },
      orderBy: { date: 'asc' },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Expense Claims (ESS)
  // ────────────────────────────────────────────────────────────────────

  async getMyExpenseClaims(companyId: string, userId: string) {
    const employeeId = await this.resolveEmployeeIdFromUser(userId);
    if (!employeeId) return [];

    return platformPrisma.expenseClaim.findMany({
      where: { employeeId, companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createMyExpenseClaim(companyId: string, userId: string, data: {
    title: string;
    amount: number;
    category: string;
    description?: string | undefined;
    tripDate?: string | undefined;
    receipts?: Array<{ fileName: string; fileUrl: string }> | undefined;
  }) {
    const employeeId = await this.resolveEmployeeIdFromUser(userId);
    if (!employeeId) throw ApiError.badRequest('No employee record linked to your account');

    return platformPrisma.expenseClaim.create({
      data: {
        employeeId,
        title: data.title,
        amount: data.amount,
        category: data.category,
        description: data.description ?? null,
        tripDate: data.tripDate ? new Date(data.tripDate) : null,
        receipts: data.receipts ?? Prisma.JsonNull,
        status: 'DRAFT',
        companyId,
      },
    });
  }

  async submitMyExpenseClaim(companyId: string, userId: string, claimId: string) {
    const employeeId = await this.resolveEmployeeIdFromUser(userId);
    if (!employeeId) throw ApiError.badRequest('No employee record linked to your account');

    const claim = await platformPrisma.expenseClaim.findUnique({ where: { id: claimId } });
    if (!claim || claim.employeeId !== employeeId || claim.companyId !== companyId) {
      throw ApiError.notFound('Expense claim not found');
    }
    if (claim.status !== 'DRAFT') {
      throw ApiError.badRequest('Only DRAFT claims can be submitted');
    }

    return platformPrisma.expenseClaim.update({
      where: { id: claimId },
      data: { status: 'SUBMITTED' },
    });
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

    return platformPrisma.loanRecord.create({
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
  }
}

export const essService = new ESSService();
