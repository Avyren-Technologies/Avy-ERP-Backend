import { Prisma } from '@prisma/client';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { logger } from '../../../config/logger';
import { essService } from '../ess/ess.service';
import { n } from '../../../shared/utils/prisma-helpers';

interface ListOptions {
  page?: number;
  limit?: number;
  employeeId?: string;
  status?: string;
}

export class TransferPromotionService {
  // ════════════════════════════════════════════════════════════════════════
  //  TRANSFERS
  // ════════════════════════════════════════════════════════════════════════

  async listTransfers(companyId: string, options: ListOptions = {}) {
    const { page = 1, limit = 25, employeeId, status } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status.toUpperCase();

    const [transfers, total] = await Promise.all([
      platformPrisma.employeeTransfer.findMany({
        where,
        include: {
          employee: {
            select: { id: true, employeeId: true, firstName: true, lastName: true },
          },
          fromDepartment: { select: { id: true, name: true } },
          toDepartment: { select: { id: true, name: true } },
          fromDesignation: { select: { id: true, name: true } },
          toDesignation: { select: { id: true, name: true } },
          fromLocation: { select: { id: true, name: true } },
          toLocation: { select: { id: true, name: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.employeeTransfer.count({ where }),
    ]);

    return { transfers, total, page, limit };
  }

  async getTransfer(companyId: string, id: string) {
    const transfer = await platformPrisma.employeeTransfer.findUnique({
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
            location: { select: { id: true, name: true } },
            reportingManager: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        fromDepartment: { select: { id: true, name: true, code: true } },
        toDepartment: { select: { id: true, name: true, code: true } },
        fromDesignation: { select: { id: true, name: true, code: true } },
        toDesignation: { select: { id: true, name: true, code: true } },
        fromLocation: { select: { id: true, name: true, code: true } },
        toLocation: { select: { id: true, name: true, code: true } },
      },
    });

    if (!transfer || transfer.companyId !== companyId) {
      throw ApiError.notFound('Transfer not found');
    }

    return transfer;
  }

  async createTransfer(companyId: string, userId: string, data: any) {
    // Verify employee belongs to company and get current assignments
    const employee = await platformPrisma.employee.findUnique({
      where: { id: data.employeeId },
      select: {
        id: true,
        companyId: true,
        departmentId: true,
        designationId: true,
        locationId: true,
        reportingManagerId: true,
      },
    });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.badRequest('Employee not found in this company');
    }

    // Create transfer record with from* fields from current employee data
    const transfer = await platformPrisma.employeeTransfer.create({
      data: {
        companyId,
        employeeId: data.employeeId,
        fromDepartmentId: n(employee.departmentId),
        toDepartmentId: n(data.toDepartmentId),
        fromDesignationId: n(employee.designationId),
        toDesignationId: n(data.toDesignationId),
        fromLocationId: n(employee.locationId),
        toLocationId: n(data.toLocationId),
        fromManagerId: n(employee.reportingManagerId),
        toManagerId: n(data.toManagerId),
        effectiveDate: new Date(data.effectiveDate),
        reason: data.reason,
        transferType: data.transferType ?? 'LATERAL',
        status: 'REQUESTED',
      },
      include: {
        employee: {
          select: { id: true, employeeId: true, firstName: true, lastName: true },
        },
        fromDepartment: { select: { id: true, name: true } },
        toDepartment: { select: { id: true, name: true } },
        fromLocation: { select: { id: true, name: true } },
        toLocation: { select: { id: true, name: true } },
      },
    });

    // Create approval request via workflow integration
    const approvalRequest = await essService.createRequest(companyId, {
      requesterId: userId,
      entityType: 'EmployeeTransfer',
      entityId: transfer.id,
      triggerEvent: 'EMPLOYEE_TRANSFER',
      data: {
        employeeId: data.employeeId,
        transferType: data.transferType ?? 'LATERAL',
        reason: data.reason,
      },
    });

    // If no workflow exists, auto-approve
    if (!approvalRequest) {
      logger.info(`No workflow for EMPLOYEE_TRANSFER — auto-approving transfer ${transfer.id}`);
      return this.approveTransfer(companyId, transfer.id, userId, 'Auto-approved (no workflow configured)');
    }

    return transfer;
  }

  async approveTransfer(companyId: string, id: string, userId: string, note?: string) {
    const transfer = await platformPrisma.employeeTransfer.findUnique({ where: { id } });
    if (!transfer || transfer.companyId !== companyId) {
      throw ApiError.notFound('Transfer not found');
    }

    if (transfer.status !== 'REQUESTED') {
      throw ApiError.badRequest(`Cannot approve transfer with status "${transfer.status}"`);
    }

    const updated = await platformPrisma.employeeTransfer.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedBy: userId,
        approvedAt: new Date(),
      },
      include: {
        employee: {
          select: { id: true, employeeId: true, firstName: true, lastName: true },
        },
      },
    });

    // If effectiveDate is today or in the past, auto-apply
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const effectiveDate = new Date(transfer.effectiveDate);
    effectiveDate.setHours(0, 0, 0, 0);

    if (effectiveDate <= today) {
      return this.applyTransfer(companyId, id);
    }

    logger.info(`Transfer ${id} approved, will be applied on ${transfer.effectiveDate}`);
    return updated;
  }

  async applyTransfer(companyId: string, id: string) {
    const transfer = await platformPrisma.employeeTransfer.findUnique({
      where: { id },
      include: {
        fromDepartment: { select: { id: true, name: true } },
        toDepartment: { select: { id: true, name: true } },
        fromDesignation: { select: { id: true, name: true } },
        toDesignation: { select: { id: true, name: true } },
        fromLocation: { select: { id: true, name: true } },
        toLocation: { select: { id: true, name: true } },
        employee: {
          select: { id: true, employeeId: true, firstName: true, lastName: true },
        },
      },
    });
    if (!transfer || transfer.companyId !== companyId) {
      throw ApiError.notFound('Transfer not found');
    }

    if (transfer.status !== 'APPROVED') {
      throw ApiError.badRequest(`Cannot apply transfer with status "${transfer.status}". Must be APPROVED.`);
    }

    // Build employee update data — only update fields that have a new value
    const empUpdateData: any = {};
    if (transfer.toDepartmentId) empUpdateData.departmentId = transfer.toDepartmentId;
    if (transfer.toDesignationId) empUpdateData.designationId = transfer.toDesignationId;
    if (transfer.toLocationId) empUpdateData.locationId = transfer.toLocationId;
    if (transfer.toManagerId) empUpdateData.reportingManagerId = transfer.toManagerId;

    // Transaction: update employee + mark transfer applied + create timeline event
    const result = await platformPrisma.$transaction(async (tx) => {
      // Update employee record
      if (Object.keys(empUpdateData).length > 0) {
        await tx.employee.update({
          where: { id: transfer.employeeId },
          data: empUpdateData,
        });
      }

      // Create timeline event
      await tx.employeeTimeline.create({
        data: {
          employeeId: transfer.employeeId,
          eventType: 'TRANSFERRED',
          title: 'Employee Transferred',
          description: `Transfer (${transfer.transferType}) applied — ${transfer.reason}`,
          eventData: {
            transferId: transfer.id,
            transferType: transfer.transferType,
            fromDepartment: transfer.fromDepartment?.name ?? null,
            toDepartment: transfer.toDepartment?.name ?? null,
            fromDesignation: transfer.fromDesignation?.name ?? null,
            toDesignation: transfer.toDesignation?.name ?? null,
            fromLocation: transfer.fromLocation?.name ?? null,
            toLocation: transfer.toLocation?.name ?? null,
            fromManagerId: transfer.fromManagerId,
            toManagerId: transfer.toManagerId,
            effectiveDate: transfer.effectiveDate.toISOString(),
          } as any,
          performedBy: transfer.approvedBy,
        },
      });

      // Mark transfer as applied
      return tx.employeeTransfer.update({
        where: { id },
        data: {
          status: 'APPLIED',
          appliedAt: new Date(),
        },
        include: {
          employee: {
            select: { id: true, employeeId: true, firstName: true, lastName: true },
          },
          fromDepartment: { select: { id: true, name: true } },
          toDepartment: { select: { id: true, name: true } },
          fromLocation: { select: { id: true, name: true } },
          toLocation: { select: { id: true, name: true } },
        },
      });
    });

    // Auto-generate transfer letter if template exists (non-blocking)
    this.generateLetter(companyId, transfer.employeeId, 'TRANSFER', transfer.effectiveDate)
      .then(async (letter) => {
        if (letter) {
          await platformPrisma.employeeTransfer.update({
            where: { id },
            data: { transferLetterUrl: letter.pdfUrl },
          });
          logger.info(`Transfer letter generated for transfer ${id}`);
        }
      })
      .catch((err) => logger.warn(`Failed to generate transfer letter for ${id}: ${err.message}`));

    logger.info(`Transfer ${id} applied for employee ${transfer.employeeId}`);
    return result;
  }

  async rejectTransfer(companyId: string, id: string, userId: string, note: string) {
    const transfer = await platformPrisma.employeeTransfer.findUnique({ where: { id } });
    if (!transfer || transfer.companyId !== companyId) {
      throw ApiError.notFound('Transfer not found');
    }

    if (transfer.status !== 'REQUESTED') {
      throw ApiError.badRequest(`Cannot reject transfer with status "${transfer.status}"`);
    }

    return platformPrisma.employeeTransfer.update({
      where: { id },
      data: { status: 'REJECTED' },
    });
  }

  async cancelTransfer(companyId: string, id: string) {
    const transfer = await platformPrisma.employeeTransfer.findUnique({ where: { id } });
    if (!transfer || transfer.companyId !== companyId) {
      throw ApiError.notFound('Transfer not found');
    }

    if (transfer.status !== 'REQUESTED') {
      throw ApiError.badRequest('Only REQUESTED transfers can be cancelled');
    }

    return platformPrisma.employeeTransfer.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  //  PROMOTIONS
  // ════════════════════════════════════════════════════════════════════════

  async listPromotions(companyId: string, options: ListOptions = {}) {
    const { page = 1, limit = 25, employeeId, status } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status.toUpperCase();

    const [promotions, total] = await Promise.all([
      platformPrisma.employeePromotion.findMany({
        where,
        include: {
          employee: {
            select: { id: true, employeeId: true, firstName: true, lastName: true },
          },
          fromDesignation: { select: { id: true, name: true } },
          toDesignation: { select: { id: true, name: true } },
          fromGrade: { select: { id: true, name: true } },
          toGrade: { select: { id: true, name: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.employeePromotion.count({ where }),
    ]);

    return { promotions, total, page, limit };
  }

  async getPromotion(companyId: string, id: string) {
    const promotion = await platformPrisma.employeePromotion.findUnique({
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
            grade: { select: { id: true, name: true } },
            annualCtc: true,
          },
        },
        fromDesignation: { select: { id: true, name: true, code: true } },
        toDesignation: { select: { id: true, name: true, code: true } },
        fromGrade: { select: { id: true, name: true, code: true } },
        toGrade: { select: { id: true, name: true, code: true } },
      },
    });

    if (!promotion || promotion.companyId !== companyId) {
      throw ApiError.notFound('Promotion not found');
    }

    return promotion;
  }

  async createPromotion(companyId: string, userId: string, data: any) {
    // Verify employee belongs to company and get current assignments
    const employee = await platformPrisma.employee.findUnique({
      where: { id: data.employeeId },
      select: {
        id: true,
        companyId: true,
        designationId: true,
        gradeId: true,
        annualCtc: true,
      },
    });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.badRequest('Employee not found in this company');
    }

    // Validate upward move if both from and to grade exist
    if (data.toGradeId && employee.gradeId) {
      const [fromGrade, toGrade] = await Promise.all([
        platformPrisma.grade.findUnique({ where: { id: employee.gradeId }, select: { ctcMin: true, name: true } }),
        platformPrisma.grade.findUnique({ where: { id: data.toGradeId }, select: { ctcMin: true, name: true } }),
      ]);
      if (fromGrade?.ctcMin != null && toGrade?.ctcMin != null) {
        if (Number(toGrade.ctcMin) < Number(fromGrade.ctcMin)) {
          throw ApiError.badRequest(
            `Target grade "${toGrade.name}" has lower CTC minimum than current grade "${fromGrade.name}". This does not qualify as a promotion.`,
          );
        }
      }
    }

    // Auto-calculate increment percent
    const currentCtc = employee.annualCtc ? Number(employee.annualCtc) : null;
    let incrementPercent: number | null = null;
    if (currentCtc && currentCtc > 0 && data.newCtc) {
      incrementPercent = Math.round(((data.newCtc - currentCtc) / currentCtc) * 10000) / 100; // 2 decimal places
    }

    const promotion = await platformPrisma.employeePromotion.create({
      data: {
        companyId,
        employeeId: data.employeeId,
        fromDesignationId: n(employee.designationId),
        toDesignationId: data.toDesignationId,
        fromGradeId: n(employee.gradeId),
        toGradeId: n(data.toGradeId),
        currentCtc: currentCtc ?? null,
        newCtc: data.newCtc ?? null,
        incrementPercent: incrementPercent ?? null,
        effectiveDate: new Date(data.effectiveDate),
        reason: n(data.reason),
        appraisalEntryId: n(data.appraisalEntryId),
        status: 'REQUESTED',
      },
      include: {
        employee: {
          select: { id: true, employeeId: true, firstName: true, lastName: true },
        },
        fromDesignation: { select: { id: true, name: true } },
        toDesignation: { select: { id: true, name: true } },
        fromGrade: { select: { id: true, name: true } },
        toGrade: { select: { id: true, name: true } },
      },
    });

    // Create approval request via workflow integration
    const approvalRequest = await essService.createRequest(companyId, {
      requesterId: userId,
      entityType: 'EmployeePromotion',
      entityId: promotion.id,
      triggerEvent: 'EMPLOYEE_PROMOTION',
      data: {
        employeeId: data.employeeId,
        toDesignationId: data.toDesignationId,
        toGradeId: data.toGradeId,
        newCtc: data.newCtc,
        reason: data.reason,
      },
    });

    // If no workflow exists, auto-approve
    if (!approvalRequest) {
      logger.info(`No workflow for EMPLOYEE_PROMOTION — auto-approving promotion ${promotion.id}`);
      return this.approvePromotion(companyId, promotion.id, userId, 'Auto-approved (no workflow configured)');
    }

    return promotion;
  }

  async approvePromotion(companyId: string, id: string, userId: string, note?: string) {
    const promotion = await platformPrisma.employeePromotion.findUnique({ where: { id } });
    if (!promotion || promotion.companyId !== companyId) {
      throw ApiError.notFound('Promotion not found');
    }

    if (promotion.status !== 'REQUESTED' && promotion.status !== 'RECOMMENDED') {
      throw ApiError.badRequest(`Cannot approve promotion with status "${promotion.status}"`);
    }

    const updated = await platformPrisma.employeePromotion.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedBy: userId,
        approvedAt: new Date(),
      },
      include: {
        employee: {
          select: { id: true, employeeId: true, firstName: true, lastName: true },
        },
      },
    });

    // If effectiveDate is today or in the past, auto-apply
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const effectiveDate = new Date(promotion.effectiveDate);
    effectiveDate.setHours(0, 0, 0, 0);

    if (effectiveDate <= today) {
      return this.applyPromotion(companyId, id);
    }

    logger.info(`Promotion ${id} approved, will be applied on ${promotion.effectiveDate}`);
    return updated;
  }

  async applyPromotion(companyId: string, id: string) {
    const promotion = await platformPrisma.employeePromotion.findUnique({
      where: { id },
      include: {
        fromDesignation: { select: { id: true, name: true } },
        toDesignation: { select: { id: true, name: true } },
        fromGrade: { select: { id: true, name: true } },
        toGrade: { select: { id: true, name: true } },
        employee: {
          select: { id: true, employeeId: true, firstName: true, lastName: true, annualCtc: true },
        },
      },
    });
    if (!promotion || promotion.companyId !== companyId) {
      throw ApiError.notFound('Promotion not found');
    }

    if (promotion.status !== 'APPROVED') {
      throw ApiError.badRequest(`Cannot apply promotion with status "${promotion.status}". Must be APPROVED.`);
    }

    const result = await platformPrisma.$transaction(async (tx) => {
      // Update employee: designation and grade
      const empUpdateData: any = {
        designationId: promotion.toDesignationId,
      };
      if (promotion.toGradeId) {
        empUpdateData.gradeId = promotion.toGradeId;
      }

      await tx.employee.update({
        where: { id: promotion.employeeId },
        data: empUpdateData,
      });

      // If newCtc provided, create new salary record
      if (promotion.newCtc) {
        const newCtcNum = Number(promotion.newCtc);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Set previous current salary isCurrent = false
        await tx.employeeSalary.updateMany({
          where: { employeeId: promotion.employeeId, companyId, isCurrent: true },
          data: {
            isCurrent: false,
            effectiveTo: today,
          },
        });

        // Create new salary record
        await tx.employeeSalary.create({
          data: {
            companyId,
            employeeId: promotion.employeeId,
            annualCtc: newCtcNum,
            monthlyGross: Math.round((newCtcNum / 12) * 100) / 100,
            components: {} as any, // Will be computed by payroll module if structure assigned
            effectiveFrom: promotion.effectiveDate,
            isCurrent: true,
          },
        });

        // Update employee annualCtc
        await tx.employee.update({
          where: { id: promotion.employeeId },
          data: { annualCtc: newCtcNum },
        });
      }

      // Create timeline event
      await tx.employeeTimeline.create({
        data: {
          employeeId: promotion.employeeId,
          eventType: 'PROMOTED',
          title: 'Employee Promoted',
          description: `Promoted to ${promotion.toDesignation?.name ?? 'new designation'}${promotion.toGrade ? ` (${promotion.toGrade.name})` : ''}`,
          eventData: {
            promotionId: promotion.id,
            fromDesignation: promotion.fromDesignation?.name ?? null,
            toDesignation: promotion.toDesignation?.name ?? null,
            fromGrade: promotion.fromGrade?.name ?? null,
            toGrade: promotion.toGrade?.name ?? null,
            currentCtc: promotion.currentCtc ? Number(promotion.currentCtc) : null,
            newCtc: promotion.newCtc ? Number(promotion.newCtc) : null,
            incrementPercent: promotion.incrementPercent ? Number(promotion.incrementPercent) : null,
            effectiveDate: promotion.effectiveDate.toISOString(),
          } as any,
          performedBy: promotion.approvedBy,
        },
      });

      // Mark promotion as applied
      return tx.employeePromotion.update({
        where: { id },
        data: {
          status: 'APPLIED',
          appliedAt: new Date(),
        },
        include: {
          employee: {
            select: { id: true, employeeId: true, firstName: true, lastName: true },
          },
          fromDesignation: { select: { id: true, name: true } },
          toDesignation: { select: { id: true, name: true } },
          fromGrade: { select: { id: true, name: true } },
          toGrade: { select: { id: true, name: true } },
        },
      });
    });

    // Auto-generate promotion letter if template exists (non-blocking)
    this.generateLetter(companyId, promotion.employeeId, 'PROMOTION', promotion.effectiveDate)
      .then(async (letter) => {
        if (letter) {
          await platformPrisma.employeePromotion.update({
            where: { id },
            data: { promotionLetterUrl: letter.pdfUrl },
          });
          logger.info(`Promotion letter generated for promotion ${id}`);
        }
      })
      .catch((err) => logger.warn(`Failed to generate promotion letter for ${id}: ${err.message}`));

    logger.info(`Promotion ${id} applied for employee ${promotion.employeeId}`);
    return result;
  }

  async rejectPromotion(companyId: string, id: string, userId: string, note: string) {
    const promotion = await platformPrisma.employeePromotion.findUnique({ where: { id } });
    if (!promotion || promotion.companyId !== companyId) {
      throw ApiError.notFound('Promotion not found');
    }

    if (promotion.status !== 'REQUESTED' && promotion.status !== 'RECOMMENDED') {
      throw ApiError.badRequest(`Cannot reject promotion with status "${promotion.status}"`);
    }

    return platformPrisma.employeePromotion.update({
      where: { id },
      data: { status: 'REJECTED' },
    });
  }

  async cancelPromotion(companyId: string, id: string) {
    const promotion = await platformPrisma.employeePromotion.findUnique({ where: { id } });
    if (!promotion || promotion.companyId !== companyId) {
      throw ApiError.notFound('Promotion not found');
    }

    if (promotion.status !== 'REQUESTED' && promotion.status !== 'RECOMMENDED') {
      throw ApiError.badRequest('Only REQUESTED or RECOMMENDED promotions can be cancelled');
    }

    return platformPrisma.employeePromotion.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  //  PRIVATE HELPERS
  // ════════════════════════════════════════════════════════════════════════

  private async generateLetter(companyId: string, employeeId: string, letterType: string, effectiveDate: Date) {
    const template = await platformPrisma.hRLetterTemplate.findFirst({
      where: { companyId, type: letterType, isActive: true },
    });
    if (!template) return null;

    const employee = await platformPrisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        designation: { select: { name: true } },
        department: { select: { name: true } },
        grade: { select: { name: true } },
      },
    });
    if (!employee) return null;

    // Resolve tokens in template body
    const body = template.bodyTemplate
      .replace(/\{employee_name\}/g, `${employee.firstName} ${employee.lastName}`)
      .replace(/\{designation\}/g, employee.designation?.name ?? '')
      .replace(/\{department\}/g, employee.department?.name ?? '')
      .replace(/\{effective_date\}/g, effectiveDate.toLocaleDateString('en-IN'))
      .replace(/\{employee_id\}/g, employee.employeeId);

    return platformPrisma.hRLetter.create({
      data: {
        companyId,
        templateId: template.id,
        employeeId,
        effectiveDate,
        // pdfUrl will be generated later by PDF generation service
      },
    });
  }
}

export const transferPromotionService = new TransferPromotionService();
