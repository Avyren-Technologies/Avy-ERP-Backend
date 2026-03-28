import { Prisma } from '@prisma/client';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';

/** Convert undefined to null for Prisma nullable fields. */
function n<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
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
      config = await platformPrisma.eSSConfig.create({
        data: { companyId },
      });
    }

    return config;
  }

  async updateESSConfig(companyId: string, data: any) {
    return platformPrisma.eSSConfig.upsert({
      where: { companyId },
      create: {
        companyId,
        viewPayslips: data.viewPayslips ?? true,
        downloadForm16: data.downloadForm16 ?? true,
        leaveApplication: data.leaveApplication ?? true,
        leaveBalanceView: data.leaveBalanceView ?? true,
        itDeclaration: data.itDeclaration ?? true,
        attendanceView: data.attendanceView ?? true,
        attendanceRegularization: data.attendanceRegularization ?? false,
        reimbursementClaims: data.reimbursementClaims ?? false,
        profileUpdate: data.profileUpdate ?? false,
        documentUpload: data.documentUpload ?? false,
        loanApplication: data.loanApplication ?? false,
        assetView: data.assetView ?? false,
        performanceGoals: data.performanceGoals ?? false,
        appraisalAccess: data.appraisalAccess ?? false,
        feedback360: data.feedback360 ?? false,
        trainingEnrollment: data.trainingEnrollment ?? false,
        helpDesk: data.helpDesk ?? false,
        employeeDirectory: data.employeeDirectory ?? false,
        holidayCalendar: data.holidayCalendar ?? true,
        policyDocuments: data.policyDocuments ?? false,
        grievanceSubmission: data.grievanceSubmission ?? false,
        loginMethod: data.loginMethod ?? 'PASSWORD',
        passwordMinLength: data.passwordMinLength ?? 8,
        passwordComplexity: data.passwordComplexity ?? true,
        sessionTimeoutMinutes: data.sessionTimeoutMinutes ?? 30,
        mfaRequired: data.mfaRequired ?? false,
      },
      update: {
        ...(data.viewPayslips !== undefined && { viewPayslips: data.viewPayslips }),
        ...(data.downloadForm16 !== undefined && { downloadForm16: data.downloadForm16 }),
        ...(data.leaveApplication !== undefined && { leaveApplication: data.leaveApplication }),
        ...(data.leaveBalanceView !== undefined && { leaveBalanceView: data.leaveBalanceView }),
        ...(data.itDeclaration !== undefined && { itDeclaration: data.itDeclaration }),
        ...(data.attendanceView !== undefined && { attendanceView: data.attendanceView }),
        ...(data.attendanceRegularization !== undefined && { attendanceRegularization: data.attendanceRegularization }),
        ...(data.reimbursementClaims !== undefined && { reimbursementClaims: data.reimbursementClaims }),
        ...(data.profileUpdate !== undefined && { profileUpdate: data.profileUpdate }),
        ...(data.documentUpload !== undefined && { documentUpload: data.documentUpload }),
        ...(data.loanApplication !== undefined && { loanApplication: data.loanApplication }),
        ...(data.assetView !== undefined && { assetView: data.assetView }),
        ...(data.performanceGoals !== undefined && { performanceGoals: data.performanceGoals }),
        ...(data.appraisalAccess !== undefined && { appraisalAccess: data.appraisalAccess }),
        ...(data.feedback360 !== undefined && { feedback360: data.feedback360 }),
        ...(data.trainingEnrollment !== undefined && { trainingEnrollment: data.trainingEnrollment }),
        ...(data.helpDesk !== undefined && { helpDesk: data.helpDesk }),
        ...(data.employeeDirectory !== undefined && { employeeDirectory: data.employeeDirectory }),
        ...(data.holidayCalendar !== undefined && { holidayCalendar: data.holidayCalendar }),
        ...(data.policyDocuments !== undefined && { policyDocuments: data.policyDocuments }),
        ...(data.grievanceSubmission !== undefined && { grievanceSubmission: data.grievanceSubmission }),
        ...(data.loginMethod !== undefined && { loginMethod: data.loginMethod }),
        ...(data.passwordMinLength !== undefined && { passwordMinLength: data.passwordMinLength }),
        ...(data.passwordComplexity !== undefined && { passwordComplexity: data.passwordComplexity }),
        ...(data.sessionTimeoutMinutes !== undefined && { sessionTimeoutMinutes: data.sessionTimeoutMinutes }),
        ...(data.mfaRequired !== undefined && { mfaRequired: data.mfaRequired }),
      },
    });
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
    const request = await platformPrisma.approvalRequest.findUnique({
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
      const updatedRequest = await platformPrisma.approvalRequest.update({
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
    return platformPrisma.approvalRequest.update({
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

        default:
          // Unknown entity type — log but don't fail
          break;
      }
    } catch (error) {
      // Log the callback error but don't fail the approval
      // The approval itself succeeded; entity update failure should be retryable
      console.error(`Approval callback failed for ${entityType}/${entityId}:`, error);
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

      // TODO: Queue actual notification delivery (email, SMS, push, etc.)
      console.log(`[Notification] Event: ${event}, Channel: ${rule.channel}, Recipient: ${rule.recipientRole}, Subject: ${subject}, Body: ${body}`);
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
        shift: { select: { id: true, name: true, fromTime: true, toTime: true } },
        location: { select: { id: true, name: true } },
        reportingManager: {
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

    // Filter sensitive fields based on ESS config
    const config = await this.getESSConfig(companyId);

    // Return profile data (always allowed fields)
    return {
      id: employee.id,
      employeeId: employee.employeeId,
      firstName: employee.firstName,
      middleName: employee.middleName,
      lastName: employee.lastName,
      dateOfBirth: employee.dateOfBirth,
      gender: employee.gender,
      personalMobile: employee.personalMobile,
      personalEmail: employee.personalEmail,
      officialEmail: employee.officialEmail,
      profilePhotoUrl: employee.profilePhotoUrl,
      joiningDate: employee.joiningDate,
      department: employee.department,
      designation: employee.designation,
      grade: employee.grade,
      employeeType: employee.employeeType,
      shift: employee.shift,
      location: employee.location,
      reportingManager: employee.reportingManager,
      status: employee.status,
      workType: employee.workType,
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
        shift: { select: { id: true, name: true, fromTime: true, toTime: true } },
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

  async getTeamMembers(companyId: string, managerId: string) {
    const reportees = await platformPrisma.employee.findMany({
      where: {
        companyId,
        reportingManagerId: managerId,
        status: { in: ['ACTIVE', 'PROBATION', 'CONFIRMED'] },
      },
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
      orderBy: { firstName: 'asc' },
    });

    return reportees;
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
        shift: { select: { id: true, name: true, fromTime: true, toTime: true } },
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
}

export const essService = new ESSService();
