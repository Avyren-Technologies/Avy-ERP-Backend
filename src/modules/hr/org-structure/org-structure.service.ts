import { Prisma } from '@prisma/client';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { n } from '../../../shared/utils/prisma-helpers';

interface ListOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}

export class OrgStructureService {
  // ────────────────────────────────────────────────────────────────────
  // Department
  // ────────────────────────────────────────────────────────────────────

  async listDepartments(companyId: string, options: ListOptions = {}) {
    const { page = 1, limit = 25, search, status } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [departments, total] = await Promise.all([
      platformPrisma.department.findMany({
        where,
        include: {
          parent: { select: { id: true, name: true, code: true } },
          children: { select: { id: true, name: true, code: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      platformPrisma.department.count({ where }),
    ]);

    return { departments, total, page, limit };
  }

  async getDepartment(companyId: string, id: string) {
    const department = await platformPrisma.department.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true, code: true } },
        children: { select: { id: true, name: true, code: true, status: true } },
      },
    });

    if (!department || department.companyId !== companyId) {
      throw ApiError.notFound('Department not found');
    }

    return department;
  }

  async createDepartment(companyId: string, data: any) {
    // Check unique code within company
    const existing = await platformPrisma.department.findUnique({
      where: { companyId_code: { companyId, code: data.code } },
    });
    if (existing) {
      throw ApiError.conflict(`Department code "${data.code}" already exists`);
    }

    // Validate parentId belongs to same company
    if (data.parentId) {
      const parent = await platformPrisma.department.findUnique({ where: { id: data.parentId } });
      if (!parent || parent.companyId !== companyId) {
        throw ApiError.badRequest('Parent department not found');
      }
    }

    return platformPrisma.department.create({
      data: {
        companyId,
        name: data.name,
        code: data.code,
        parentId: n(data.parentId),
        headEmployeeId: n(data.headEmployeeId),
        costCentreCode: n(data.costCentreCode),
        status: data.status ?? 'Active',
      },
      include: {
        parent: { select: { id: true, name: true, code: true } },
        children: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async updateDepartment(companyId: string, id: string, data: any) {
    const department = await platformPrisma.department.findUnique({ where: { id } });
    if (!department || department.companyId !== companyId) {
      throw ApiError.notFound('Department not found');
    }

    // If code is changing, check uniqueness
    if (data.code && data.code !== department.code) {
      const existing = await platformPrisma.department.findUnique({
        where: { companyId_code: { companyId, code: data.code } },
      });
      if (existing) {
        throw ApiError.conflict(`Department code "${data.code}" already exists`);
      }
    }

    // Validate parentId if provided
    if (data.parentId) {
      if (data.parentId === id) {
        throw ApiError.badRequest('Department cannot be its own parent');
      }
      const parent = await platformPrisma.department.findUnique({ where: { id: data.parentId } });
      if (!parent || parent.companyId !== companyId) {
        throw ApiError.badRequest('Parent department not found');
      }
    }

    return platformPrisma.department.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.code !== undefined && { code: data.code }),
        ...(data.parentId !== undefined && { parentId: n(data.parentId) }),
        ...(data.headEmployeeId !== undefined && { headEmployeeId: n(data.headEmployeeId) }),
        ...(data.costCentreCode !== undefined && { costCentreCode: n(data.costCentreCode) }),
        ...(data.status !== undefined && { status: data.status }),
      },
      include: {
        parent: { select: { id: true, name: true, code: true } },
        children: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async deleteDepartment(companyId: string, id: string) {
    const department = await platformPrisma.department.findUnique({ where: { id } });
    if (!department || department.companyId !== companyId) {
      throw ApiError.notFound('Department not found');
    }

    // Check for assigned employees
    const employeeCount = await platformPrisma.employee.count({ where: { departmentId: id } });
    if (employeeCount > 0) {
      throw ApiError.badRequest(`Cannot delete: ${employeeCount} employees are assigned to this department`);
    }

    // Check for child departments
    const childCount = await platformPrisma.department.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw ApiError.badRequest(`Cannot delete: ${childCount} child departments exist under this department`);
    }

    await platformPrisma.department.delete({ where: { id } });
    return { message: 'Department deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Designation
  // ────────────────────────────────────────────────────────────────────

  async listDesignations(companyId: string, options: ListOptions = {}) {
    const { page = 1, limit = 25, search, status } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [designations, total] = await Promise.all([
      platformPrisma.designation.findMany({
        where,
        include: {
          department: { select: { id: true, name: true, code: true } },
          grade: { select: { id: true, name: true, code: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      platformPrisma.designation.count({ where }),
    ]);

    return { designations, total, page, limit };
  }

  async getDesignation(companyId: string, id: string) {
    const designation = await platformPrisma.designation.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true, code: true } },
        grade: { select: { id: true, name: true, code: true } },
      },
    });

    if (!designation || designation.companyId !== companyId) {
      throw ApiError.notFound('Designation not found');
    }

    return designation;
  }

  async createDesignation(companyId: string, data: any) {
    const existing = await platformPrisma.designation.findUnique({
      where: { companyId_code: { companyId, code: data.code } },
    });
    if (existing) {
      throw ApiError.conflict(`Designation code "${data.code}" already exists`);
    }

    return platformPrisma.designation.create({
      data: {
        companyId,
        name: data.name,
        code: data.code,
        departmentId: n(data.departmentId),
        gradeId: n(data.gradeId),
        jobLevel: n(data.jobLevel),
        managerialFlag: data.managerialFlag ?? false,
        reportsTo: n(data.reportsTo),
        probationDays: n(data.probationDays),
        status: data.status ?? 'Active',
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
        grade: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async updateDesignation(companyId: string, id: string, data: any) {
    const designation = await platformPrisma.designation.findUnique({ where: { id } });
    if (!designation || designation.companyId !== companyId) {
      throw ApiError.notFound('Designation not found');
    }

    if (data.code && data.code !== designation.code) {
      const existing = await platformPrisma.designation.findUnique({
        where: { companyId_code: { companyId, code: data.code } },
      });
      if (existing) {
        throw ApiError.conflict(`Designation code "${data.code}" already exists`);
      }
    }

    return platformPrisma.designation.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.code !== undefined && { code: data.code }),
        ...(data.departmentId !== undefined && { departmentId: n(data.departmentId) }),
        ...(data.gradeId !== undefined && { gradeId: n(data.gradeId) }),
        ...(data.jobLevel !== undefined && { jobLevel: n(data.jobLevel) }),
        ...(data.managerialFlag !== undefined && { managerialFlag: data.managerialFlag }),
        ...(data.reportsTo !== undefined && { reportsTo: n(data.reportsTo) }),
        ...(data.probationDays !== undefined && { probationDays: n(data.probationDays) }),
        ...(data.status !== undefined && { status: data.status }),
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
        grade: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async deleteDesignation(companyId: string, id: string) {
    const designation = await platformPrisma.designation.findUnique({ where: { id } });
    if (!designation || designation.companyId !== companyId) {
      throw ApiError.notFound('Designation not found');
    }

    const employeeCount = await platformPrisma.employee.count({ where: { designationId: id } });
    if (employeeCount > 0) {
      throw ApiError.badRequest(`Cannot delete: ${employeeCount} employees are assigned to this designation`);
    }

    await platformPrisma.designation.delete({ where: { id } });
    return { message: 'Designation deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Grade
  // ────────────────────────────────────────────────────────────────────

  async listGrades(companyId: string, options: ListOptions = {}) {
    const { page = 1, limit = 25, search, status } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [grades, total] = await Promise.all([
      platformPrisma.grade.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { code: 'asc' },
      }),
      platformPrisma.grade.count({ where }),
    ]);

    return { grades, total, page, limit };
  }

  async getGrade(companyId: string, id: string) {
    const grade = await platformPrisma.grade.findUnique({
      where: { id },
    });

    if (!grade || grade.companyId !== companyId) {
      throw ApiError.notFound('Grade not found');
    }

    return grade;
  }

  async createGrade(companyId: string, data: any) {
    const existing = await platformPrisma.grade.findUnique({
      where: { companyId_code: { companyId, code: data.code } },
    });
    if (existing) {
      throw ApiError.conflict(`Grade code "${data.code}" already exists`);
    }

    return platformPrisma.grade.create({
      data: {
        companyId,
        code: data.code,
        name: data.name,
        ctcMin: n(data.ctcMin),
        ctcMax: n(data.ctcMax),
        hraPercent: n(data.hraPercent),
        pfTier: n(data.pfTier),
        benefitFlags: data.benefitFlags ?? Prisma.JsonNull,
        probationMonths: n(data.probationMonths),
        noticeDays: n(data.noticeDays),
        status: data.status ?? 'Active',
      },
    });
  }

  async updateGrade(companyId: string, id: string, data: any) {
    const grade = await platformPrisma.grade.findUnique({ where: { id } });
    if (!grade || grade.companyId !== companyId) {
      throw ApiError.notFound('Grade not found');
    }

    if (data.code && data.code !== grade.code) {
      const existing = await platformPrisma.grade.findUnique({
        where: { companyId_code: { companyId, code: data.code } },
      });
      if (existing) {
        throw ApiError.conflict(`Grade code "${data.code}" already exists`);
      }
    }

    return platformPrisma.grade.update({
      where: { id },
      data: {
        ...(data.code !== undefined && { code: data.code }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.ctcMin !== undefined && { ctcMin: n(data.ctcMin) }),
        ...(data.ctcMax !== undefined && { ctcMax: n(data.ctcMax) }),
        ...(data.hraPercent !== undefined && { hraPercent: n(data.hraPercent) }),
        ...(data.pfTier !== undefined && { pfTier: n(data.pfTier) }),
        ...(data.benefitFlags !== undefined && { benefitFlags: data.benefitFlags ?? Prisma.JsonNull }),
        ...(data.probationMonths !== undefined && { probationMonths: n(data.probationMonths) }),
        ...(data.noticeDays !== undefined && { noticeDays: n(data.noticeDays) }),
        ...(data.status !== undefined && { status: data.status }),
      },
    });
  }

  async deleteGrade(companyId: string, id: string) {
    const grade = await platformPrisma.grade.findUnique({ where: { id } });
    if (!grade || grade.companyId !== companyId) {
      throw ApiError.notFound('Grade not found');
    }

    const employeeCount = await platformPrisma.employee.count({ where: { gradeId: id } });
    if (employeeCount > 0) {
      throw ApiError.badRequest(`Cannot delete: ${employeeCount} employees are assigned to this grade`);
    }

    await platformPrisma.grade.delete({ where: { id } });
    return { message: 'Grade deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Employee Type
  // ────────────────────────────────────────────────────────────────────

  async listEmployeeTypes(companyId: string, options: ListOptions = {}) {
    const { page = 1, limit = 25, search, status } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [employeeTypes, total] = await Promise.all([
      platformPrisma.employeeType.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      platformPrisma.employeeType.count({ where }),
    ]);

    return { employeeTypes, total, page, limit };
  }

  async getEmployeeType(companyId: string, id: string) {
    const employeeType = await platformPrisma.employeeType.findUnique({
      where: { id },
    });

    if (!employeeType || employeeType.companyId !== companyId) {
      throw ApiError.notFound('Employee type not found');
    }

    return employeeType;
  }

  async createEmployeeType(companyId: string, data: any) {
    const existing = await platformPrisma.employeeType.findUnique({
      where: { companyId_code: { companyId, code: data.code } },
    });
    if (existing) {
      throw ApiError.conflict(`Employee type code "${data.code}" already exists`);
    }

    return platformPrisma.employeeType.create({
      data: {
        companyId,
        name: data.name,
        code: data.code,
        pfApplicable: data.pfApplicable,
        esiApplicable: data.esiApplicable,
        ptApplicable: data.ptApplicable,
        gratuityEligible: data.gratuityEligible,
        bonusEligible: data.bonusEligible,
        status: data.status ?? 'Active',
      },
    });
  }

  async updateEmployeeType(companyId: string, id: string, data: any) {
    const employeeType = await platformPrisma.employeeType.findUnique({ where: { id } });
    if (!employeeType || employeeType.companyId !== companyId) {
      throw ApiError.notFound('Employee type not found');
    }

    if (data.code && data.code !== employeeType.code) {
      const existing = await platformPrisma.employeeType.findUnique({
        where: { companyId_code: { companyId, code: data.code } },
      });
      if (existing) {
        throw ApiError.conflict(`Employee type code "${data.code}" already exists`);
      }
    }

    return platformPrisma.employeeType.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.code !== undefined && { code: data.code }),
        ...(data.pfApplicable !== undefined && { pfApplicable: data.pfApplicable }),
        ...(data.esiApplicable !== undefined && { esiApplicable: data.esiApplicable }),
        ...(data.ptApplicable !== undefined && { ptApplicable: data.ptApplicable }),
        ...(data.gratuityEligible !== undefined && { gratuityEligible: data.gratuityEligible }),
        ...(data.bonusEligible !== undefined && { bonusEligible: data.bonusEligible }),
        ...(data.status !== undefined && { status: data.status }),
      },
    });
  }

  async deleteEmployeeType(companyId: string, id: string) {
    const employeeType = await platformPrisma.employeeType.findUnique({ where: { id } });
    if (!employeeType || employeeType.companyId !== companyId) {
      throw ApiError.notFound('Employee type not found');
    }

    const employeeCount = await platformPrisma.employee.count({ where: { employeeTypeId: id } });
    if (employeeCount > 0) {
      throw ApiError.badRequest(`Cannot delete: ${employeeCount} employees are assigned to this employee type`);
    }

    await platformPrisma.employeeType.delete({ where: { id } });
    return { message: 'Employee type deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Cost Centre
  // ────────────────────────────────────────────────────────────────────

  async listCostCentres(companyId: string, options: ListOptions = {}) {
    const { page = 1, limit = 25, search, status } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [costCentres, total] = await Promise.all([
      platformPrisma.costCentre.findMany({
        where,
        include: {
          department: { select: { id: true, name: true, code: true } },
          location: { select: { id: true, name: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { code: 'asc' },
      }),
      platformPrisma.costCentre.count({ where }),
    ]);

    return { costCentres, total, page, limit };
  }

  async getCostCentre(companyId: string, id: string) {
    const costCentre = await platformPrisma.costCentre.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true, code: true } },
        location: { select: { id: true, name: true } },
      },
    });

    if (!costCentre || costCentre.companyId !== companyId) {
      throw ApiError.notFound('Cost centre not found');
    }

    return costCentre;
  }

  async createCostCentre(companyId: string, data: any) {
    const existing = await platformPrisma.costCentre.findUnique({
      where: { companyId_code: { companyId, code: data.code } },
    });
    if (existing) {
      throw ApiError.conflict(`Cost centre code "${data.code}" already exists`);
    }

    return platformPrisma.costCentre.create({
      data: {
        companyId,
        code: data.code,
        name: data.name,
        departmentId: n(data.departmentId),
        locationId: n(data.locationId),
        annualBudget: n(data.annualBudget),
        glAccountCode: n(data.glAccountCode),
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
        location: { select: { id: true, name: true } },
      },
    });
  }

  async updateCostCentre(companyId: string, id: string, data: any) {
    const costCentre = await platformPrisma.costCentre.findUnique({ where: { id } });
    if (!costCentre || costCentre.companyId !== companyId) {
      throw ApiError.notFound('Cost centre not found');
    }

    if (data.code && data.code !== costCentre.code) {
      const existing = await platformPrisma.costCentre.findUnique({
        where: { companyId_code: { companyId, code: data.code } },
      });
      if (existing) {
        throw ApiError.conflict(`Cost centre code "${data.code}" already exists`);
      }
    }

    return platformPrisma.costCentre.update({
      where: { id },
      data: {
        ...(data.code !== undefined && { code: data.code }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.departmentId !== undefined && { departmentId: n(data.departmentId) }),
        ...(data.locationId !== undefined && { locationId: n(data.locationId) }),
        ...(data.annualBudget !== undefined && { annualBudget: n(data.annualBudget) }),
        ...(data.glAccountCode !== undefined && { glAccountCode: n(data.glAccountCode) }),
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
        location: { select: { id: true, name: true } },
      },
    });
  }

  async deleteCostCentre(companyId: string, id: string) {
    const costCentre = await platformPrisma.costCentre.findUnique({ where: { id } });
    if (!costCentre || costCentre.companyId !== companyId) {
      throw ApiError.notFound('Cost centre not found');
    }

    const employeeCount = await platformPrisma.employee.count({ where: { costCentreId: id } });
    if (employeeCount > 0) {
      throw ApiError.badRequest(`Cannot delete: ${employeeCount} employees are assigned to this cost centre`);
    }

    await platformPrisma.costCentre.delete({ where: { id } });
    return { message: 'Cost centre deleted' };
  }
}

export const orgStructureService = new OrgStructureService();
