import { Prisma } from '@prisma/client';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { logger } from '../../../config/logger';

export class RetentionService {
  // ════════════════════════════════════════════════════════════════════════
  //  RETENTION POLICY CRUD
  // ════════════════════════════════════════════════════════════════════════

  async listPolicies(companyId: string) {
    return platformPrisma.dataRetentionPolicy.findMany({
      where: { companyId },
      orderBy: { dataCategory: 'asc' },
    });
  }

  async upsertPolicy(
    companyId: string,
    data: { dataCategory: string; retentionYears: number; actionAfter?: string },
  ) {
    // Check if a policy for this category already exists
    const existing = await platformPrisma.dataRetentionPolicy.findFirst({
      where: { companyId, dataCategory: data.dataCategory },
    });

    if (existing) {
      return platformPrisma.dataRetentionPolicy.update({
        where: { id: existing.id },
        data: {
          retentionYears: data.retentionYears,
          actionAfter: data.actionAfter ?? 'ARCHIVE',
          isActive: true,
        },
      });
    }

    return platformPrisma.dataRetentionPolicy.create({
      data: {
        companyId,
        dataCategory: data.dataCategory,
        retentionYears: data.retentionYears,
        actionAfter: data.actionAfter ?? 'ARCHIVE',
        isActive: true,
      },
    });
  }

  async deletePolicy(companyId: string, id: string) {
    const policy = await platformPrisma.dataRetentionPolicy.findUnique({ where: { id } });
    if (!policy || policy.companyId !== companyId) {
      throw ApiError.notFound('Retention policy not found');
    }

    await platformPrisma.dataRetentionPolicy.delete({ where: { id } });
    return { message: 'Retention policy deleted' };
  }

  // ════════════════════════════════════════════════════════════════════════
  //  DATA ACCESS REQUESTS
  // ════════════════════════════════════════════════════════════════════════

  async listDataAccessRequests(
    companyId: string,
    options: { page?: number; limit?: number; status?: string; employeeId?: string } = {},
  ) {
    const { page = 1, limit = 25, status, employeeId } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;

    const [requests, total] = await Promise.all([
      platformPrisma.dataAccessRequest.findMany({
        where,
        include: {
          employee: {
            select: { id: true, employeeId: true, firstName: true, lastName: true },
          },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.dataAccessRequest.count({ where }),
    ]);

    return { requests, page, limit, total };
  }

  async createDataAccessRequest(
    companyId: string,
    employeeId: string,
    data: { requestType: string; description?: string },
  ) {
    // Validate employee belongs to company
    const employee = await platformPrisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.notFound('Employee not found');
    }

    const request = await platformPrisma.dataAccessRequest.create({
      data: {
        companyId,
        employeeId,
        requestType: data.requestType,
        description: data.description ?? null,
        status: 'PENDING',
      },
    });

    logger.info(`Data access request created: ${request.id} (${data.requestType}) for employee ${employeeId}`);
    return request;
  }

  async processDataAccessRequest(
    companyId: string,
    requestId: string,
    data: { status: string; responseUrl?: string },
    processedBy: string,
  ) {
    const request = await platformPrisma.dataAccessRequest.findUnique({ where: { id: requestId } });
    if (!request || request.companyId !== companyId) {
      throw ApiError.notFound('Data access request not found');
    }

    if (request.status === 'COMPLETED' || request.status === 'REJECTED') {
      throw ApiError.badRequest('This request has already been processed');
    }

    const updated = await platformPrisma.dataAccessRequest.update({
      where: { id: requestId },
      data: {
        status: data.status,
        responseUrl: data.responseUrl ?? null,
        processedBy,
        processedAt: data.status === 'COMPLETED' || data.status === 'REJECTED' ? new Date() : null,
      },
    });

    logger.info(`Data access request ${requestId} processed: ${data.status} by ${processedBy}`);
    return updated;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  DATA EXPORT (PORTABILITY)
  // ════════════════════════════════════════════════════════════════════════

  async exportEmployeeData(companyId: string, employeeId: string) {
    const employee = await platformPrisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        department: { select: { id: true, name: true, code: true } },
        designation: { select: { id: true, name: true, code: true } },
        grade: { select: { id: true, name: true, code: true } },
        employeeType: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        costCentre: { select: { id: true, name: true } },
        nominees: true,
        education: true,
        previousEmployment: true,
        documents: { select: { id: true, documentType: true, documentNumber: true, fileName: true, createdAt: true } },
        timeline: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!employee || employee.companyId !== companyId) {
      throw ApiError.notFound('Employee not found');
    }

    // Mask sensitive fields
    const maskLast4 = (val: string | null): string | null => {
      if (!val) return null;
      if (val.length <= 4) return '****';
      return '*'.repeat(val.length - 4) + val.slice(-4);
    };

    // Build export object
    const exportData = {
      exportedAt: new Date().toISOString(),
      personalInfo: {
        employeeId: employee.employeeId,
        firstName: employee.firstName,
        middleName: employee.middleName,
        lastName: employee.lastName,
        dateOfBirth: employee.dateOfBirth,
        gender: employee.gender,
        maritalStatus: employee.maritalStatus,
        bloodGroup: employee.bloodGroup,
        nationality: employee.nationality,
        personalMobile: employee.personalMobile,
        personalEmail: employee.personalEmail,
        currentAddress: employee.currentAddress,
        permanentAddress: employee.permanentAddress,
        panNumber: maskLast4(employee.panNumber),
        aadhaarNumber: maskLast4(employee.aadhaarNumber),
      },
      employmentHistory: {
        joiningDate: employee.joiningDate,
        confirmationDate: employee.confirmationDate,
        lastWorkingDate: employee.lastWorkingDate,
        exitReason: employee.exitReason,
        status: employee.status,
        department: employee.department,
        designation: employee.designation,
        grade: employee.grade,
        employeeType: employee.employeeType,
        location: employee.location,
        costCentre: employee.costCentre,
      },
      nominees: employee.nominees.map((n) => ({
        name: n.name,
        relation: n.relation,
        dateOfBirth: n.dateOfBirth,
        sharePercent: n.sharePercent,
      })),
      education: employee.education.map((e) => ({
        qualification: e.qualification,
        degree: e.degree,
        institution: e.institution,
        university: e.university,
        yearOfPassing: e.yearOfPassing,
        marks: e.marks,
      })),
      previousEmployment: employee.previousEmployment.map((p) => ({
        employerName: p.employerName,
        designation: p.designation,
        joinDate: p.joinDate,
        leaveDate: p.leaveDate,
        reason: p.reason,
      })),
      documents: employee.documents.map((d) => ({
        documentType: d.documentType,
        documentNumber: d.documentNumber,
        fileName: d.fileName,
        uploadedAt: d.createdAt,
      })),
      timeline: employee.timeline.map((t) => ({
        eventType: t.eventType,
        title: t.title,
        description: t.description,
        date: t.createdAt,
      })),
    };

    logger.info(`Data export generated for employee ${employeeId} in company ${companyId}`);
    return exportData;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  ANONYMISATION
  // ════════════════════════════════════════════════════════════════════════

  async anonymiseEmployee(companyId: string, employeeId: string) {
    const employee = await platformPrisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.notFound('Employee not found');
    }

    if (employee.status !== 'EXITED') {
      throw ApiError.badRequest('Only EXITED employees can be anonymised');
    }

    const anonSuffix = employee.id.slice(-6);

    const updated = await platformPrisma.$transaction(async (tx) => {
      const result = await tx.employee.update({
        where: { id: employeeId },
        data: {
          firstName: `ANON-${anonSuffix}`,
          lastName: 'Anonymised',
          middleName: null,
          personalMobile: '0000000000',
          alternativeMobile: null,
          personalEmail: `anon-${anonSuffix}@redacted.local`,
          officialEmail: null,
          currentAddress: Prisma.JsonNull,
          permanentAddress: Prisma.JsonNull,
          emergencyContactName: 'Redacted',
          emergencyContactRelation: 'Redacted',
          emergencyContactMobile: '0000000000',
          panNumber: null,
          aadhaarNumber: null,
          bankAccountNumber: null,
          bankIfscCode: null,
          bankName: null,
          profilePhotoUrl: null,
          dateOfBirth: new Date('1900-01-01'),
        },
      });

      await tx.employeeTimeline.create({
        data: {
          employeeId,
          eventType: 'CUSTOM' as any,
          title: 'Data Anonymised',
          description: 'Data anonymised per retention policy',
          eventData: Prisma.JsonNull,
          performedBy: null,
        },
      });

      return result;
    });

    logger.info(`Employee ${employeeId} anonymised in company ${companyId}`);
    return { message: 'Employee data anonymised', employeeId: updated.id };
  }

  // ════════════════════════════════════════════════════════════════════════
  //  CONSENT MANAGEMENT
  // ════════════════════════════════════════════════════════════════════════

  async listConsents(companyId: string, employeeId: string) {
    // Validate employee belongs to company
    const employee = await platformPrisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.notFound('Employee not found');
    }

    return platformPrisma.consentRecord.findMany({
      where: { companyId, employeeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async recordConsent(
    companyId: string,
    employeeId: string,
    data: { consentType: string; granted: boolean; ipAddress?: string },
  ) {
    // Validate employee belongs to company
    const employee = await platformPrisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.notFound('Employee not found');
    }

    // Upsert based on unique constraint [employeeId, consentType]
    const existing = await platformPrisma.consentRecord.findFirst({
      where: { employeeId, consentType: data.consentType },
    });

    if (existing) {
      return platformPrisma.consentRecord.update({
        where: { id: existing.id },
        data: {
          granted: data.granted,
          grantedAt: data.granted ? new Date() : existing.grantedAt,
          revokedAt: !data.granted ? new Date() : null,
          ipAddress: data.ipAddress ?? null,
        },
      });
    }

    return platformPrisma.consentRecord.create({
      data: {
        companyId,
        employeeId,
        consentType: data.consentType,
        granted: data.granted,
        grantedAt: data.granted ? new Date() : null,
        revokedAt: !data.granted ? new Date() : null,
        ipAddress: data.ipAddress ?? null,
      },
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  //  RETENTION CHECK
  // ════════════════════════════════════════════════════════════════════════

  async checkRetentionDue(companyId: string) {
    const policies = await platformPrisma.dataRetentionPolicy.findMany({
      where: { companyId, isActive: true },
    });

    const results: Array<{
      dataCategory: string;
      count: number;
      oldestDate: Date | null;
      suggestedAction: string;
    }> = [];

    for (const policy of policies) {
      const cutoffDate = new Date();
      cutoffDate.setFullYear(cutoffDate.getFullYear() - policy.retentionYears);

      if (policy.dataCategory === 'EMPLOYEE_MASTER') {
        // Find EXITED employees whose lastWorkingDate is past retention
        const employees = await platformPrisma.employee.findMany({
          where: {
            companyId,
            status: 'EXITED',
            lastWorkingDate: { lt: cutoffDate },
          },
          select: { lastWorkingDate: true },
          orderBy: { lastWorkingDate: 'asc' },
        });

        if (employees.length > 0) {
          const oldest = employees[0];
          results.push({
            dataCategory: policy.dataCategory,
            count: employees.length,
            oldestDate: oldest?.lastWorkingDate ?? null,
            suggestedAction: policy.actionAfter,
          });
        }
      } else if (policy.dataCategory === 'PAYROLL') {
        // Find payroll runs where the year is past retention
        const cutoffYear = new Date().getFullYear() - policy.retentionYears;
        const payrollRuns = await platformPrisma.payrollRun.findMany({
          where: {
            companyId,
            year: { lte: cutoffYear },
          },
          select: { year: true, month: true },
          orderBy: [{ year: 'asc' }, { month: 'asc' }],
        });

        if (payrollRuns.length > 0) {
          const oldestRun = payrollRuns[0]!;
          results.push({
            dataCategory: policy.dataCategory,
            count: payrollRuns.length,
            oldestDate: new Date(oldestRun.year, oldestRun.month - 1, 1),
            suggestedAction: policy.actionAfter,
          });
        }
      } else if (policy.dataCategory === 'ATTENDANCE') {
        const records = await platformPrisma.attendanceRecord.count({
          where: {
            companyId,
            date: { lt: cutoffDate },
          },
        });

        if (records > 0) {
          const oldest = await platformPrisma.attendanceRecord.findFirst({
            where: { companyId, date: { lt: cutoffDate } },
            orderBy: { date: 'asc' },
            select: { date: true },
          });

          results.push({
            dataCategory: policy.dataCategory,
            count: records,
            oldestDate: oldest?.date ?? null,
            suggestedAction: policy.actionAfter,
          });
        }
      } else if (policy.dataCategory === 'LEAVE') {
        const records = await platformPrisma.leaveRequest.count({
          where: {
            companyId,
            createdAt: { lt: cutoffDate },
          },
        });

        if (records > 0) {
          const oldest = await platformPrisma.leaveRequest.findFirst({
            where: { companyId, createdAt: { lt: cutoffDate } },
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true },
          });

          results.push({
            dataCategory: policy.dataCategory,
            count: records,
            oldestDate: oldest?.createdAt ?? null,
            suggestedAction: policy.actionAfter,
          });
        }
      } else if (policy.dataCategory === 'DOCUMENTS') {
        const records = await platformPrisma.employeeDocument.count({
          where: {
            employee: { companyId },
            createdAt: { lt: cutoffDate },
          },
        });

        if (records > 0) {
          const oldest = await platformPrisma.employeeDocument.findFirst({
            where: { employee: { companyId }, createdAt: { lt: cutoffDate } },
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true },
          });

          results.push({
            dataCategory: policy.dataCategory,
            count: records,
            oldestDate: oldest?.createdAt ?? null,
            suggestedAction: policy.actionAfter,
          });
        }
      } else {
        // For categories without specific implementation yet, just report the policy
        results.push({
          dataCategory: policy.dataCategory,
          count: 0,
          oldestDate: null,
          suggestedAction: policy.actionAfter,
        });
      }
    }

    return results;
  }
}

export const retentionService = new RetentionService();
