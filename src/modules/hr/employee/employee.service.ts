import { Prisma } from '@prisma/client';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { logger } from '../../../config/logger';

/** Convert undefined to null for Prisma nullable fields. */
function n<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

export class EmployeeService {
  // ────────────────────────────────────────────────────────────────────
  // Employee ID Generation (from NoSeries)
  // ────────────────────────────────────────────────────────────────────

  async generateEmployeeId(companyId: string): Promise<string> {
    const noSeries = await platformPrisma.noSeriesConfig.findFirst({
      where: { companyId, linkedScreen: 'Employee Onboarding' },
    });

    if (!noSeries) {
      // Fallback: EMP-<timestamp>
      return `EMP-${Date.now()}`;
    }

    const count = await platformPrisma.employee.count({ where: { companyId } });
    const nextNum = (noSeries.startNumber || 1) + count;
    const padded = String(nextNum).padStart(noSeries.numberCount || 5, '0');
    return `${noSeries.prefix || ''}${padded}${noSeries.suffix || ''}`;
  }

  // ────────────────────────────────────────────────────────────────────
  // Employee CRUD
  // ────────────────────────────────────────────────────────────────────

  async listEmployees(
    companyId: string,
    options: {
      page?: number;
      limit?: number;
      search?: string;
      departmentId?: string;
      locationId?: string;
      status?: string;
      employeeTypeId?: string;
    } = {},
  ) {
    const { page = 1, limit = 25, search, departmentId, locationId, status, employeeTypeId } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };

    if (status) {
      where.status = status;
    }
    if (departmentId) {
      where.departmentId = departmentId;
    }
    if (locationId) {
      where.locationId = locationId;
    }
    if (employeeTypeId) {
      where.employeeTypeId = employeeTypeId;
    }
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { employeeId: { contains: search, mode: 'insensitive' } },
        { personalEmail: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [employees, total] = await Promise.all([
      platformPrisma.employee.findMany({
        where,
        include: {
          department: { select: { id: true, name: true, code: true } },
          designation: { select: { id: true, name: true, code: true } },
          grade: { select: { id: true, name: true, code: true } },
          employeeType: { select: { id: true, name: true, code: true } },
          location: { select: { id: true, name: true, code: true } },
          shift: { select: { id: true, name: true } },
          reportingManager: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.employee.count({ where }),
    ]);

    return { employees, total, page, limit };
  }

  async getEmployee(companyId: string, id: string) {
    const employee = await platformPrisma.employee.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true, code: true } },
        designation: { select: { id: true, name: true, code: true } },
        grade: { select: { id: true, name: true, code: true, probationMonths: true, noticeDays: true } },
        employeeType: { select: { id: true, name: true, code: true } },
        location: { select: { id: true, name: true, code: true } },
        shift: { select: { id: true, name: true, fromTime: true, toTime: true } },
        costCentre: { select: { id: true, name: true, code: true } },
        reportingManager: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
        functionalManager: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
        nominees: { orderBy: { createdAt: 'asc' } },
        education: { orderBy: { yearOfPassing: 'desc' } },
        previousEmployment: { orderBy: { leaveDate: 'desc' } },
        documents: { orderBy: { createdAt: 'desc' } },
        timeline: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!employee || employee.companyId !== companyId) {
      throw ApiError.notFound('Employee not found');
    }

    return employee;
  }

  async createEmployee(companyId: string, data: any, performedBy?: string) {
    // Validate references exist
    await this.validateReferences(companyId, data);

    const employeeId = await this.generateEmployeeId(companyId);

    // Calculate probation end date if grade has probationMonths
    let probationEndDate: Date | null = null;
    if (data.gradeId) {
      const grade = await platformPrisma.grade.findUnique({
        where: { id: data.gradeId },
        select: { probationMonths: true },
      });
      if (grade?.probationMonths) {
        const joiningDate = new Date(data.joiningDate);
        probationEndDate = new Date(joiningDate);
        probationEndDate.setMonth(probationEndDate.getMonth() + grade.probationMonths);
      }
    }

    const employee = await platformPrisma.employee.create({
      data: {
        companyId,
        employeeId,

        // Personal
        firstName: data.firstName,
        middleName: n(data.middleName),
        lastName: data.lastName,
        dateOfBirth: new Date(data.dateOfBirth),
        gender: data.gender,
        maritalStatus: n(data.maritalStatus),
        bloodGroup: n(data.bloodGroup),
        fatherMotherName: n(data.fatherMotherName),
        nationality: data.nationality ?? 'Indian',
        religion: n(data.religion),
        category: n(data.category),
        differentlyAbled: data.differentlyAbled ?? false,
        disabilityType: n(data.disabilityType),
        profilePhotoUrl: n(data.profilePhotoUrl),

        // Contact
        personalMobile: data.personalMobile,
        alternativeMobile: n(data.alternativeMobile),
        personalEmail: data.personalEmail,
        officialEmail: n(data.officialEmail),
        currentAddress: data.currentAddress ? (data.currentAddress as any) : Prisma.JsonNull,
        permanentAddress: data.permanentAddress ? (data.permanentAddress as any) : Prisma.JsonNull,
        emergencyContactName: data.emergencyContactName,
        emergencyContactRelation: data.emergencyContactRelation,
        emergencyContactMobile: data.emergencyContactMobile,

        // Professional
        joiningDate: new Date(data.joiningDate),
        employeeTypeId: data.employeeTypeId,
        departmentId: data.departmentId,
        designationId: data.designationId,
        gradeId: n(data.gradeId),
        reportingManagerId: n(data.reportingManagerId),
        functionalManagerId: n(data.functionalManagerId),
        workType: n(data.workType),
        shiftId: n(data.shiftId),
        costCentreId: n(data.costCentreId),
        locationId: n(data.locationId),
        noticePeriodDays: n(data.noticePeriodDays),
        probationEndDate,

        // Salary
        annualCtc: data.annualCtc ?? null,
        salaryStructure: data.salaryStructure ? (data.salaryStructure as any) : Prisma.JsonNull,
        paymentMode: n(data.paymentMode),

        // Bank
        bankAccountNumber: n(data.bankAccountNumber),
        bankIfscCode: n(data.bankIfscCode),
        bankName: n(data.bankName),
        bankBranch: n(data.bankBranch),
        accountType: n(data.accountType),

        // Statutory
        panNumber: n(data.panNumber),
        aadhaarNumber: n(data.aadhaarNumber),
        uan: n(data.uan),
        esiIpNumber: n(data.esiIpNumber),
        passportNumber: n(data.passportNumber),
        passportExpiry: data.passportExpiry ? new Date(data.passportExpiry) : null,
        drivingLicence: n(data.drivingLicence),
        voterId: n(data.voterId),
        pran: n(data.pran),

        // Status defaults to PROBATION (from schema default)
        status: 'PROBATION',

        // Timeline: JOINED event
        timeline: {
          create: {
            eventType: 'JOINED',
            title: 'Employee Joined',
            description: `${data.firstName} ${data.lastName} joined the organization`,
            eventData: { joiningDate: data.joiningDate, employeeId } as any,
            performedBy: n(performedBy),
          },
        },
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
        designation: { select: { id: true, name: true, code: true } },
        grade: { select: { id: true, name: true, code: true } },
        employeeType: { select: { id: true, name: true, code: true } },
        timeline: true,
      },
    });

    logger.info(`Employee created: ${employee.id} (${employee.employeeId}) for company ${companyId}`);
    return employee;
  }

  async updateEmployee(companyId: string, id: string, data: any, performedBy?: string) {
    const existing = await platformPrisma.employee.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Employee not found');
    }

    // Validate references if they're being changed
    if (data.departmentId || data.designationId || data.employeeTypeId || data.gradeId) {
      await this.validateReferences(companyId, {
        departmentId: data.departmentId ?? existing.departmentId,
        designationId: data.designationId ?? existing.designationId,
        employeeTypeId: data.employeeTypeId ?? existing.employeeTypeId,
        gradeId: data.gradeId ?? existing.gradeId,
        reportingManagerId: data.reportingManagerId,
        functionalManagerId: data.functionalManagerId,
        shiftId: data.shiftId,
        costCentreId: data.costCentreId,
        locationId: data.locationId,
      });
    }

    // Recalculate probation end date if grade changes
    let probationEndDate: Date | null | undefined = undefined;
    if (data.gradeId && data.gradeId !== existing.gradeId) {
      const grade = await platformPrisma.grade.findUnique({
        where: { id: data.gradeId },
        select: { probationMonths: true },
      });
      if (grade?.probationMonths) {
        const joiningDate = data.joiningDate ? new Date(data.joiningDate) : existing.joiningDate;
        probationEndDate = new Date(joiningDate);
        probationEndDate.setMonth(probationEndDate.getMonth() + grade.probationMonths);
      } else {
        probationEndDate = null;
      }
    }

    // Build update data, only including provided fields
    const updateData: any = {};

    // Personal fields
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.middleName !== undefined) updateData.middleName = n(data.middleName);
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.dateOfBirth !== undefined) updateData.dateOfBirth = new Date(data.dateOfBirth);
    if (data.gender !== undefined) updateData.gender = data.gender;
    if (data.maritalStatus !== undefined) updateData.maritalStatus = n(data.maritalStatus);
    if (data.bloodGroup !== undefined) updateData.bloodGroup = n(data.bloodGroup);
    if (data.fatherMotherName !== undefined) updateData.fatherMotherName = n(data.fatherMotherName);
    if (data.nationality !== undefined) updateData.nationality = data.nationality;
    if (data.religion !== undefined) updateData.religion = n(data.religion);
    if (data.category !== undefined) updateData.category = n(data.category);
    if (data.differentlyAbled !== undefined) updateData.differentlyAbled = data.differentlyAbled;
    if (data.disabilityType !== undefined) updateData.disabilityType = n(data.disabilityType);
    if (data.profilePhotoUrl !== undefined) updateData.profilePhotoUrl = n(data.profilePhotoUrl);

    // Contact
    if (data.personalMobile !== undefined) updateData.personalMobile = data.personalMobile;
    if (data.alternativeMobile !== undefined) updateData.alternativeMobile = n(data.alternativeMobile);
    if (data.personalEmail !== undefined) updateData.personalEmail = data.personalEmail;
    if (data.officialEmail !== undefined) updateData.officialEmail = n(data.officialEmail);
    if (data.currentAddress !== undefined) updateData.currentAddress = data.currentAddress ? (data.currentAddress as any) : Prisma.JsonNull;
    if (data.permanentAddress !== undefined) updateData.permanentAddress = data.permanentAddress ? (data.permanentAddress as any) : Prisma.JsonNull;
    if (data.emergencyContactName !== undefined) updateData.emergencyContactName = data.emergencyContactName;
    if (data.emergencyContactRelation !== undefined) updateData.emergencyContactRelation = data.emergencyContactRelation;
    if (data.emergencyContactMobile !== undefined) updateData.emergencyContactMobile = data.emergencyContactMobile;

    // Professional
    if (data.joiningDate !== undefined) updateData.joiningDate = new Date(data.joiningDate);
    if (data.employeeTypeId !== undefined) updateData.employeeTypeId = data.employeeTypeId;
    if (data.departmentId !== undefined) updateData.departmentId = data.departmentId;
    if (data.designationId !== undefined) updateData.designationId = data.designationId;
    if (data.gradeId !== undefined) updateData.gradeId = n(data.gradeId);
    if (data.reportingManagerId !== undefined) updateData.reportingManagerId = n(data.reportingManagerId);
    if (data.functionalManagerId !== undefined) updateData.functionalManagerId = n(data.functionalManagerId);
    if (data.workType !== undefined) updateData.workType = n(data.workType);
    if (data.shiftId !== undefined) updateData.shiftId = n(data.shiftId);
    if (data.costCentreId !== undefined) updateData.costCentreId = n(data.costCentreId);
    if (data.locationId !== undefined) updateData.locationId = n(data.locationId);
    if (data.noticePeriodDays !== undefined) updateData.noticePeriodDays = n(data.noticePeriodDays);
    if (probationEndDate !== undefined) updateData.probationEndDate = probationEndDate;

    // Salary
    if (data.annualCtc !== undefined) updateData.annualCtc = data.annualCtc ?? null;
    if (data.salaryStructure !== undefined) updateData.salaryStructure = data.salaryStructure ? (data.salaryStructure as any) : Prisma.JsonNull;
    if (data.paymentMode !== undefined) updateData.paymentMode = n(data.paymentMode);

    // Bank
    if (data.bankAccountNumber !== undefined) updateData.bankAccountNumber = n(data.bankAccountNumber);
    if (data.bankIfscCode !== undefined) updateData.bankIfscCode = n(data.bankIfscCode);
    if (data.bankName !== undefined) updateData.bankName = n(data.bankName);
    if (data.bankBranch !== undefined) updateData.bankBranch = n(data.bankBranch);
    if (data.accountType !== undefined) updateData.accountType = n(data.accountType);

    // Statutory
    if (data.panNumber !== undefined) updateData.panNumber = n(data.panNumber);
    if (data.aadhaarNumber !== undefined) updateData.aadhaarNumber = n(data.aadhaarNumber);
    if (data.uan !== undefined) updateData.uan = n(data.uan);
    if (data.esiIpNumber !== undefined) updateData.esiIpNumber = n(data.esiIpNumber);
    if (data.passportNumber !== undefined) updateData.passportNumber = n(data.passportNumber);
    if (data.passportExpiry !== undefined) updateData.passportExpiry = data.passportExpiry ? new Date(data.passportExpiry) : null;
    if (data.drivingLicence !== undefined) updateData.drivingLicence = n(data.drivingLicence);
    if (data.voterId !== undefined) updateData.voterId = n(data.voterId);
    if (data.pran !== undefined) updateData.pran = n(data.pran);

    const employee = await platformPrisma.employee.update({
      where: { id },
      data: updateData,
      include: {
        department: { select: { id: true, name: true, code: true } },
        designation: { select: { id: true, name: true, code: true } },
        grade: { select: { id: true, name: true, code: true } },
        employeeType: { select: { id: true, name: true, code: true } },
      },
    });

    // Add timeline for significant changes (department, designation, grade)
    const changes: string[] = [];
    if (data.departmentId && data.departmentId !== existing.departmentId) changes.push('department');
    if (data.designationId && data.designationId !== existing.designationId) changes.push('designation');
    if (data.gradeId && data.gradeId !== existing.gradeId) changes.push('grade');
    if (data.annualCtc !== undefined && data.annualCtc !== Number(existing.annualCtc)) changes.push('salary');

    if (changes.length > 0) {
      const eventType = changes.includes('salary') ? 'SALARY_REVISED'
        : changes.includes('designation') ? 'PROMOTED'
        : 'TRANSFERRED';

      await this.addTimelineEvent(
        id,
        eventType,
        `Profile Updated: ${changes.join(', ')}`,
        `Updated fields: ${changes.join(', ')}`,
        { changes, updatedFields: Object.keys(updateData) },
        performedBy,
      );
    }

    return employee;
  }

  async updateEmployeeStatus(companyId: string, id: string, data: any, performedBy?: string) {
    const existing = await platformPrisma.employee.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Employee not found');
    }

    const updateData: any = { status: data.status };

    // Set confirmation date when confirmed
    if (data.status === 'CONFIRMED' && existing.status === 'PROBATION') {
      updateData.confirmationDate = new Date();
    }

    // Set last working date when exiting
    if (data.status === 'EXITED' || data.status === 'ON_NOTICE') {
      if (data.lastWorkingDate) updateData.lastWorkingDate = new Date(data.lastWorkingDate);
      if (data.exitReason) updateData.exitReason = data.exitReason;
    }

    const employee = await platformPrisma.employee.update({
      where: { id },
      data: updateData,
    });

    // Map status to timeline event type
    const eventTypeMap: Record<string, string> = {
      ACTIVE: 'CUSTOM',
      PROBATION: 'PROBATION_STARTED',
      CONFIRMED: 'CONFIRMED',
      ON_NOTICE: 'RESIGNED',
      SUSPENDED: 'CUSTOM',
      EXITED: 'EXITED',
    };

    await this.addTimelineEvent(
      id,
      eventTypeMap[data.status] || 'CUSTOM',
      `Status changed to ${data.status}`,
      data.exitReason || `Employee status updated from ${existing.status} to ${data.status}`,
      { previousStatus: existing.status, newStatus: data.status, lastWorkingDate: data.lastWorkingDate },
      performedBy,
    );

    return employee;
  }

  async deleteEmployee(companyId: string, id: string, performedBy?: string) {
    const existing = await platformPrisma.employee.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Employee not found');
    }

    // Soft delete: set status to EXITED
    const employee = await platformPrisma.employee.update({
      where: { id },
      data: {
        status: 'EXITED',
        lastWorkingDate: new Date(),
      },
    });

    await this.addTimelineEvent(
      id,
      'EXITED',
      'Employee Record Deactivated',
      'Employee record was soft-deleted (status set to EXITED)',
      { previousStatus: existing.status },
      performedBy,
    );

    logger.info(`Employee soft-deleted: ${id} (${existing.employeeId}) for company ${companyId}`);
    return { message: 'Employee deactivated (soft-deleted)', employeeId: existing.employeeId };
  }

  // ────────────────────────────────────────────────────────────────────
  // Nominees
  // ────────────────────────────────────────────────────────────────────

  async listNominees(employeeId: string) {
    return platformPrisma.employeeNominee.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addNominee(employeeId: string, data: any) {
    // Validate total share percent does not exceed 100
    const existingNominees = await platformPrisma.employeeNominee.findMany({
      where: { employeeId },
      select: { sharePercent: true },
    });

    const currentTotal = existingNominees.reduce(
      (sum, nom) => sum + (nom.sharePercent ? Number(nom.sharePercent) : 0),
      0,
    );
    const newShare = data.sharePercent || 0;

    if (currentTotal + newShare > 100) {
      throw ApiError.badRequest(
        `Total nominee share cannot exceed 100%. Current total: ${currentTotal}%, requested: ${newShare}%`,
      );
    }

    return platformPrisma.employeeNominee.create({
      data: {
        employeeId,
        name: data.name,
        relation: data.relation,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        sharePercent: data.sharePercent ?? null,
        aadhaar: n(data.aadhaar),
        pan: n(data.pan),
        address: data.address ? (data.address as any) : Prisma.JsonNull,
      },
    });
  }

  async updateNominee(employeeId: string, nomineeId: string, data: any) {
    const nominee = await platformPrisma.employeeNominee.findUnique({ where: { id: nomineeId } });
    if (!nominee || nominee.employeeId !== employeeId) {
      throw ApiError.notFound('Nominee not found');
    }

    // Validate share percent if being updated
    if (data.sharePercent !== undefined) {
      const existingNominees = await platformPrisma.employeeNominee.findMany({
        where: { employeeId, id: { not: nomineeId } },
        select: { sharePercent: true },
      });

      const othersTotal = existingNominees.reduce(
        (sum, nom) => sum + (nom.sharePercent ? Number(nom.sharePercent) : 0),
        0,
      );

      if (othersTotal + (data.sharePercent || 0) > 100) {
        throw ApiError.badRequest(
          `Total nominee share cannot exceed 100%. Others total: ${othersTotal}%, requested: ${data.sharePercent}%`,
        );
      }
    }

    return platformPrisma.employeeNominee.update({
      where: { id: nomineeId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.relation !== undefined && { relation: data.relation }),
        ...(data.dateOfBirth !== undefined && { dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null }),
        ...(data.sharePercent !== undefined && { sharePercent: data.sharePercent ?? null }),
        ...(data.aadhaar !== undefined && { aadhaar: n(data.aadhaar) }),
        ...(data.pan !== undefined && { pan: n(data.pan) }),
        ...(data.address !== undefined && { address: data.address ? (data.address as any) : Prisma.JsonNull }),
      },
    });
  }

  async deleteNominee(employeeId: string, nomineeId: string) {
    const nominee = await platformPrisma.employeeNominee.findUnique({ where: { id: nomineeId } });
    if (!nominee || nominee.employeeId !== employeeId) {
      throw ApiError.notFound('Nominee not found');
    }

    await platformPrisma.employeeNominee.delete({ where: { id: nomineeId } });
    return { message: 'Nominee deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Education
  // ────────────────────────────────────────────────────────────────────

  async listEducation(employeeId: string) {
    return platformPrisma.employeeEducation.findMany({
      where: { employeeId },
      orderBy: { yearOfPassing: 'desc' },
    });
  }

  async addEducation(employeeId: string, data: any) {
    return platformPrisma.employeeEducation.create({
      data: {
        employeeId,
        qualification: data.qualification,
        degree: n(data.degree),
        institution: n(data.institution),
        university: n(data.university),
        yearOfPassing: n(data.yearOfPassing),
        marks: n(data.marks),
        certificateUrl: n(data.certificateUrl),
      },
    });
  }

  async updateEducation(employeeId: string, educationId: string, data: any) {
    const edu = await platformPrisma.employeeEducation.findUnique({ where: { id: educationId } });
    if (!edu || edu.employeeId !== employeeId) {
      throw ApiError.notFound('Education record not found');
    }

    return platformPrisma.employeeEducation.update({
      where: { id: educationId },
      data: {
        ...(data.qualification !== undefined && { qualification: data.qualification }),
        ...(data.degree !== undefined && { degree: n(data.degree) }),
        ...(data.institution !== undefined && { institution: n(data.institution) }),
        ...(data.university !== undefined && { university: n(data.university) }),
        ...(data.yearOfPassing !== undefined && { yearOfPassing: n(data.yearOfPassing) }),
        ...(data.marks !== undefined && { marks: n(data.marks) }),
        ...(data.certificateUrl !== undefined && { certificateUrl: n(data.certificateUrl) }),
      },
    });
  }

  async deleteEducation(employeeId: string, educationId: string) {
    const edu = await platformPrisma.employeeEducation.findUnique({ where: { id: educationId } });
    if (!edu || edu.employeeId !== employeeId) {
      throw ApiError.notFound('Education record not found');
    }

    await platformPrisma.employeeEducation.delete({ where: { id: educationId } });
    return { message: 'Education record deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Previous Employment
  // ────────────────────────────────────────────────────────────────────

  async listPrevEmployment(employeeId: string) {
    return platformPrisma.employeePrevEmployment.findMany({
      where: { employeeId },
      orderBy: { leaveDate: 'desc' },
    });
  }

  async addPrevEmployment(employeeId: string, data: any) {
    return platformPrisma.employeePrevEmployment.create({
      data: {
        employeeId,
        employerName: data.employerName,
        designation: n(data.designation),
        lastCtc: data.lastCtc ?? null,
        joinDate: data.joinDate ? new Date(data.joinDate) : null,
        leaveDate: data.leaveDate ? new Date(data.leaveDate) : null,
        reason: n(data.reason),
        experienceLetterUrl: n(data.experienceLetterUrl),
        relievingLetterUrl: n(data.relievingLetterUrl),
        previousPfAccount: n(data.previousPfAccount),
      },
    });
  }

  async updatePrevEmployment(employeeId: string, prevEmpId: string, data: any) {
    const record = await platformPrisma.employeePrevEmployment.findUnique({ where: { id: prevEmpId } });
    if (!record || record.employeeId !== employeeId) {
      throw ApiError.notFound('Previous employment record not found');
    }

    return platformPrisma.employeePrevEmployment.update({
      where: { id: prevEmpId },
      data: {
        ...(data.employerName !== undefined && { employerName: data.employerName }),
        ...(data.designation !== undefined && { designation: n(data.designation) }),
        ...(data.lastCtc !== undefined && { lastCtc: data.lastCtc ?? null }),
        ...(data.joinDate !== undefined && { joinDate: data.joinDate ? new Date(data.joinDate) : null }),
        ...(data.leaveDate !== undefined && { leaveDate: data.leaveDate ? new Date(data.leaveDate) : null }),
        ...(data.reason !== undefined && { reason: n(data.reason) }),
        ...(data.experienceLetterUrl !== undefined && { experienceLetterUrl: n(data.experienceLetterUrl) }),
        ...(data.relievingLetterUrl !== undefined && { relievingLetterUrl: n(data.relievingLetterUrl) }),
        ...(data.previousPfAccount !== undefined && { previousPfAccount: n(data.previousPfAccount) }),
      },
    });
  }

  async deletePrevEmployment(employeeId: string, prevEmpId: string) {
    const record = await platformPrisma.employeePrevEmployment.findUnique({ where: { id: prevEmpId } });
    if (!record || record.employeeId !== employeeId) {
      throw ApiError.notFound('Previous employment record not found');
    }

    await platformPrisma.employeePrevEmployment.delete({ where: { id: prevEmpId } });
    return { message: 'Previous employment record deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Documents
  // ────────────────────────────────────────────────────────────────────

  async listDocuments(employeeId: string) {
    return platformPrisma.employeeDocument.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addDocument(employeeId: string, data: any, performedBy?: string) {
    const doc = await platformPrisma.employeeDocument.create({
      data: {
        employeeId,
        documentType: data.documentType,
        documentNumber: n(data.documentNumber),
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        fileUrl: data.fileUrl,
        fileName: n(data.fileName),
      },
    });

    await this.addTimelineEvent(
      employeeId,
      'DOCUMENT_UPLOADED',
      `Document Uploaded: ${data.documentType}`,
      data.fileName || data.documentType,
      { documentId: doc.id, documentType: data.documentType },
      performedBy,
    );

    return doc;
  }

  async updateDocument(employeeId: string, documentId: string, data: any) {
    const doc = await platformPrisma.employeeDocument.findUnique({ where: { id: documentId } });
    if (!doc || doc.employeeId !== employeeId) {
      throw ApiError.notFound('Document not found');
    }

    return platformPrisma.employeeDocument.update({
      where: { id: documentId },
      data: {
        ...(data.documentType !== undefined && { documentType: data.documentType }),
        ...(data.documentNumber !== undefined && { documentNumber: n(data.documentNumber) }),
        ...(data.expiryDate !== undefined && { expiryDate: data.expiryDate ? new Date(data.expiryDate) : null }),
        ...(data.fileUrl !== undefined && { fileUrl: data.fileUrl }),
        ...(data.fileName !== undefined && { fileName: n(data.fileName) }),
      },
    });
  }

  async deleteDocument(employeeId: string, documentId: string) {
    const doc = await platformPrisma.employeeDocument.findUnique({ where: { id: documentId } });
    if (!doc || doc.employeeId !== employeeId) {
      throw ApiError.notFound('Document not found');
    }

    await platformPrisma.employeeDocument.delete({ where: { id: documentId } });
    return { message: 'Document deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Timeline
  // ────────────────────────────────────────────────────────────────────

  async getTimeline(employeeId: string) {
    return platformPrisma.employeeTimeline.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addTimelineEvent(
    employeeId: string,
    eventType: string,
    title: string,
    description?: string,
    eventData?: any,
    performedBy?: string,
  ) {
    return platformPrisma.employeeTimeline.create({
      data: {
        employeeId,
        eventType: eventType as any,
        title,
        description: description ?? null,
        eventData: eventData ? (eventData as any) : Prisma.JsonNull,
        performedBy: performedBy ?? null,
      },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Private helpers
  // ────────────────────────────────────────────────────────────────────

  private async validateReferences(companyId: string, data: any) {
    // Validate department
    if (data.departmentId) {
      const dept = await platformPrisma.department.findUnique({ where: { id: data.departmentId } });
      if (!dept || dept.companyId !== companyId) {
        throw ApiError.badRequest('Invalid department');
      }
    }

    // Validate designation
    if (data.designationId) {
      const desig = await platformPrisma.designation.findUnique({ where: { id: data.designationId } });
      if (!desig || desig.companyId !== companyId) {
        throw ApiError.badRequest('Invalid designation');
      }
    }

    // Validate employee type
    if (data.employeeTypeId) {
      const empType = await platformPrisma.employeeType.findUnique({ where: { id: data.employeeTypeId } });
      if (!empType || empType.companyId !== companyId) {
        throw ApiError.badRequest('Invalid employee type');
      }
    }

    // Validate grade (optional)
    if (data.gradeId) {
      const grade = await platformPrisma.grade.findUnique({ where: { id: data.gradeId } });
      if (!grade || grade.companyId !== companyId) {
        throw ApiError.badRequest('Invalid grade');
      }
    }

    // Validate reporting manager (optional, must be an employee in same company)
    if (data.reportingManagerId) {
      const manager = await platformPrisma.employee.findUnique({ where: { id: data.reportingManagerId } });
      if (!manager || manager.companyId !== companyId) {
        throw ApiError.badRequest('Invalid reporting manager');
      }
    }

    // Validate functional manager (optional)
    if (data.functionalManagerId) {
      const manager = await platformPrisma.employee.findUnique({ where: { id: data.functionalManagerId } });
      if (!manager || manager.companyId !== companyId) {
        throw ApiError.badRequest('Invalid functional manager');
      }
    }

    // Validate shift (optional)
    if (data.shiftId) {
      const shift = await platformPrisma.companyShift.findUnique({ where: { id: data.shiftId } });
      if (!shift || shift.companyId !== companyId) {
        throw ApiError.badRequest('Invalid shift');
      }
    }

    // Validate cost centre (optional)
    if (data.costCentreId) {
      const cc = await platformPrisma.costCentre.findUnique({ where: { id: data.costCentreId } });
      if (!cc || cc.companyId !== companyId) {
        throw ApiError.badRequest('Invalid cost centre');
      }
    }

    // Validate location (optional)
    if (data.locationId) {
      const loc = await platformPrisma.location.findUnique({ where: { id: data.locationId } });
      if (!loc || loc.companyId !== companyId) {
        throw ApiError.badRequest('Invalid location');
      }
    }
  }
}

export const employeeService = new EmployeeService();
