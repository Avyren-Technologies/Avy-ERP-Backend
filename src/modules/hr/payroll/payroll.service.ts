import { Prisma } from '@prisma/client';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { essService } from '../ess/ess.service';

/** Convert undefined to null for Prisma nullable fields. */
function n<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

interface ListOptions {
  page?: number;
  limit?: number;
  search?: string;
}

interface EmployeeSalaryListOptions extends ListOptions {
  employeeId?: string;
  isCurrent?: boolean;
}

interface LoanListOptions extends ListOptions {
  employeeId?: string;
  status?: string;
}

// Default India FY 2025-26 tax slabs
const DEFAULT_OLD_REGIME_SLABS = [
  { fromAmount: 0, toAmount: 250000, rate: 0 },
  { fromAmount: 250001, toAmount: 500000, rate: 5 },
  { fromAmount: 500001, toAmount: 1000000, rate: 20 },
  { fromAmount: 1000001, toAmount: Infinity, rate: 30 },
];

const DEFAULT_NEW_REGIME_SLABS = [
  { fromAmount: 0, toAmount: 400000, rate: 0 },
  { fromAmount: 400001, toAmount: 800000, rate: 5 },
  { fromAmount: 800001, toAmount: 1200000, rate: 10 },
  { fromAmount: 1200001, toAmount: 1600000, rate: 15 },
  { fromAmount: 1600001, toAmount: 2000000, rate: 20 },
  { fromAmount: 2000001, toAmount: 2400000, rate: 25 },
  { fromAmount: 2400001, toAmount: Infinity, rate: 30 },
];

const DEFAULT_SURCHARGE_RATES = [
  { threshold: 5000000, rate: 10 },
  { threshold: 10000000, rate: 15 },
  { threshold: 20000000, rate: 25 },
  { threshold: 50000000, rate: 37 },
];

export class PayrollConfigService {
  // ────────────────────────────────────────────────────────────────────
  // Salary Components
  // ────────────────────────────────────────────────────────────────────

  async listSalaryComponents(companyId: string, options: ListOptions = {}) {
    const { page = 1, limit = 50, search } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [components, total] = await Promise.all([
      platformPrisma.salaryComponent.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: [{ payslipOrder: 'asc' }, { name: 'asc' }],
      }),
      platformPrisma.salaryComponent.count({ where }),
    ]);

    // Enrich with usage count in structures
    const enriched = await Promise.all(
      components.map(async (comp) => {
        const structures = await platformPrisma.salaryStructure.findMany({
          where: { companyId },
          select: { components: true },
        });
        let usageCount = 0;
        for (const s of structures) {
          const comps = s.components as any[];
          if (Array.isArray(comps) && comps.some((c: any) => c.componentId === comp.id)) {
            usageCount++;
          }
        }
        return { ...comp, usageCount };
      })
    );

    return { components: enriched, total, page, limit };
  }

  async getSalaryComponent(companyId: string, id: string) {
    const component = await platformPrisma.salaryComponent.findUnique({ where: { id } });
    if (!component || component.companyId !== companyId) {
      throw ApiError.notFound('Salary component not found');
    }
    return component;
  }

  async createSalaryComponent(companyId: string, data: any) {
    const existing = await platformPrisma.salaryComponent.findUnique({
      where: { companyId_code: { companyId, code: data.code } },
    });
    if (existing) {
      throw ApiError.conflict(`Salary component code "${data.code}" already exists`);
    }

    return platformPrisma.salaryComponent.create({
      data: {
        companyId,
        name: data.name,
        code: data.code,
        type: data.type,
        calculationMethod: data.calculationMethod ?? 'FIXED',
        formula: n(data.formula),
        formulaValue: n(data.formulaValue),
        taxable: data.taxable ?? 'FULLY_TAXABLE',
        exemptionSection: n(data.exemptionSection),
        exemptionLimit: n(data.exemptionLimit),
        pfInclusion: data.pfInclusion ?? false,
        esiInclusion: data.esiInclusion ?? false,
        bonusInclusion: data.bonusInclusion ?? false,
        gratuityInclusion: data.gratuityInclusion ?? false,
        showOnPayslip: data.showOnPayslip ?? true,
        payslipOrder: n(data.payslipOrder),
        isActive: data.isActive ?? true,
      },
    });
  }

  async updateSalaryComponent(companyId: string, id: string, data: any) {
    const component = await platformPrisma.salaryComponent.findUnique({ where: { id } });
    if (!component || component.companyId !== companyId) {
      throw ApiError.notFound('Salary component not found');
    }

    if (data.code && data.code !== component.code) {
      const existing = await platformPrisma.salaryComponent.findUnique({
        where: { companyId_code: { companyId, code: data.code } },
      });
      if (existing) {
        throw ApiError.conflict(`Salary component code "${data.code}" already exists`);
      }
    }

    return platformPrisma.salaryComponent.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.code !== undefined && { code: data.code }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.calculationMethod !== undefined && { calculationMethod: data.calculationMethod }),
        ...(data.formula !== undefined && { formula: n(data.formula) }),
        ...(data.formulaValue !== undefined && { formulaValue: n(data.formulaValue) }),
        ...(data.taxable !== undefined && { taxable: data.taxable }),
        ...(data.exemptionSection !== undefined && { exemptionSection: n(data.exemptionSection) }),
        ...(data.exemptionLimit !== undefined && { exemptionLimit: n(data.exemptionLimit) }),
        ...(data.pfInclusion !== undefined && { pfInclusion: data.pfInclusion }),
        ...(data.esiInclusion !== undefined && { esiInclusion: data.esiInclusion }),
        ...(data.bonusInclusion !== undefined && { bonusInclusion: data.bonusInclusion }),
        ...(data.gratuityInclusion !== undefined && { gratuityInclusion: data.gratuityInclusion }),
        ...(data.showOnPayslip !== undefined && { showOnPayslip: data.showOnPayslip }),
        ...(data.payslipOrder !== undefined && { payslipOrder: n(data.payslipOrder) }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async deleteSalaryComponent(companyId: string, id: string) {
    const component = await platformPrisma.salaryComponent.findUnique({ where: { id } });
    if (!component || component.companyId !== companyId) {
      throw ApiError.notFound('Salary component not found');
    }

    // Check usage in structures
    const structures = await platformPrisma.salaryStructure.findMany({
      where: { companyId },
      select: { id: true, name: true, components: true },
    });
    const usedIn = structures.filter((s) => {
      const comps = s.components as any[];
      return Array.isArray(comps) && comps.some((c: any) => c.componentId === id);
    });
    if (usedIn.length > 0) {
      throw ApiError.badRequest(
        `Cannot delete: component is used in ${usedIn.length} salary structure(s): ${usedIn.map((s) => s.name).join(', ')}`
      );
    }

    await platformPrisma.salaryComponent.delete({ where: { id } });
    return { message: 'Salary component deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Salary Structures
  // ────────────────────────────────────────────────────────────────────

  async listSalaryStructures(companyId: string, options: ListOptions = {}) {
    const { page = 1, limit = 25, search } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [structures, total] = await Promise.all([
      platformPrisma.salaryStructure.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      platformPrisma.salaryStructure.count({ where }),
    ]);

    // Enrich with component details
    const allComponentIds = new Set<string>();
    for (const s of structures) {
      const comps = s.components as any[];
      if (Array.isArray(comps)) {
        comps.forEach((c: any) => allComponentIds.add(c.componentId));
      }
    }

    const componentMap = new Map<string, any>();
    if (allComponentIds.size > 0) {
      const components = await platformPrisma.salaryComponent.findMany({
        where: { id: { in: Array.from(allComponentIds) } },
        select: { id: true, name: true, code: true, type: true },
      });
      components.forEach((c) => componentMap.set(c.id, c));
    }

    const enriched = structures.map((s) => {
      const comps = s.components as any[];
      const enrichedComponents = Array.isArray(comps)
        ? comps.map((c: any) => ({
            ...c,
            component: componentMap.get(c.componentId) ?? null,
          }))
        : [];
      return { ...s, components: enrichedComponents };
    });

    return { structures: enriched, total, page, limit };
  }

  async getSalaryStructure(companyId: string, id: string) {
    const structure = await platformPrisma.salaryStructure.findUnique({ where: { id } });
    if (!structure || structure.companyId !== companyId) {
      throw ApiError.notFound('Salary structure not found');
    }

    // Enrich components
    const comps = structure.components as any[];
    const componentIds = Array.isArray(comps) ? comps.map((c: any) => c.componentId) : [];
    const components = componentIds.length > 0
      ? await platformPrisma.salaryComponent.findMany({
          where: { id: { in: componentIds } },
          select: { id: true, name: true, code: true, type: true, calculationMethod: true },
        })
      : [];
    const componentMap = new Map(components.map((c) => [c.id, c]));

    const enrichedComponents = Array.isArray(comps)
      ? comps.map((c: any) => ({
          ...c,
          component: componentMap.get(c.componentId) ?? null,
        }))
      : [];

    return { ...structure, components: enrichedComponents };
  }

  async createSalaryStructure(companyId: string, data: any) {
    const existing = await platformPrisma.salaryStructure.findUnique({
      where: { companyId_code: { companyId, code: data.code } },
    });
    if (existing) {
      throw ApiError.conflict(`Salary structure code "${data.code}" already exists`);
    }

    // Validate all componentIds belong to company
    await this.validateComponentIds(companyId, data.components);

    return platformPrisma.salaryStructure.create({
      data: {
        companyId,
        name: data.name,
        code: data.code,
        applicableGradeIds: data.applicableGradeIds ?? Prisma.JsonNull,
        applicableDesignationIds: data.applicableDesignationIds ?? Prisma.JsonNull,
        applicableTypeIds: data.applicableTypeIds ?? Prisma.JsonNull,
        components: data.components,
        ctcBasis: data.ctcBasis ?? 'CTC',
        isActive: data.isActive ?? true,
      },
    });
  }

  async updateSalaryStructure(companyId: string, id: string, data: any) {
    const structure = await platformPrisma.salaryStructure.findUnique({ where: { id } });
    if (!structure || structure.companyId !== companyId) {
      throw ApiError.notFound('Salary structure not found');
    }

    if (data.code && data.code !== structure.code) {
      const existing = await platformPrisma.salaryStructure.findUnique({
        where: { companyId_code: { companyId, code: data.code } },
      });
      if (existing) {
        throw ApiError.conflict(`Salary structure code "${data.code}" already exists`);
      }
    }

    // Validate componentIds if components are being updated
    if (data.components) {
      await this.validateComponentIds(companyId, data.components);
    }

    return platformPrisma.salaryStructure.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.code !== undefined && { code: data.code }),
        ...(data.applicableGradeIds !== undefined && { applicableGradeIds: data.applicableGradeIds ?? Prisma.JsonNull }),
        ...(data.applicableDesignationIds !== undefined && { applicableDesignationIds: data.applicableDesignationIds ?? Prisma.JsonNull }),
        ...(data.applicableTypeIds !== undefined && { applicableTypeIds: data.applicableTypeIds ?? Prisma.JsonNull }),
        ...(data.components !== undefined && { components: data.components }),
        ...(data.ctcBasis !== undefined && { ctcBasis: data.ctcBasis }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async deleteSalaryStructure(companyId: string, id: string) {
    const structure = await platformPrisma.salaryStructure.findUnique({ where: { id } });
    if (!structure || structure.companyId !== companyId) {
      throw ApiError.notFound('Salary structure not found');
    }

    // Check if any employee salaries reference this structure
    const salaryCount = await platformPrisma.employeeSalary.count({ where: { structureId: id } });
    if (salaryCount > 0) {
      throw ApiError.badRequest(`Cannot delete: ${salaryCount} employee salary record(s) use this structure`);
    }

    await platformPrisma.salaryStructure.delete({ where: { id } });
    return { message: 'Salary structure deleted' };
  }

  private async validateComponentIds(companyId: string, components: any[]) {
    const componentIds = components.map((c: any) => c.componentId);
    const found = await platformPrisma.salaryComponent.findMany({
      where: { id: { in: componentIds }, companyId },
      select: { id: true },
    });
    const foundIds = new Set(found.map((c) => c.id));
    const missing = componentIds.filter((id: string) => !foundIds.has(id));
    if (missing.length > 0) {
      throw ApiError.badRequest(`Invalid component IDs (not found in company): ${missing.join(', ')}`);
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // Employee Salary
  // ────────────────────────────────────────────────────────────────────

  async listEmployeeSalaries(companyId: string, options: EmployeeSalaryListOptions = {}) {
    const { page = 1, limit = 25, employeeId, isCurrent } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (employeeId) where.employeeId = employeeId;
    if (isCurrent !== undefined) where.isCurrent = isCurrent;

    const [salaries, total] = await Promise.all([
      platformPrisma.employeeSalary.findMany({
        where,
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
          structure: {
            select: { id: true, name: true, code: true },
          },
        },
        skip: offset,
        take: limit,
        orderBy: [{ isCurrent: 'desc' }, { effectiveFrom: 'desc' }],
      }),
      platformPrisma.employeeSalary.count({ where }),
    ]);

    return { salaries, total, page, limit };
  }

  async getEmployeeSalary(companyId: string, id: string) {
    const salary = await platformPrisma.employeeSalary.findUnique({
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
        structure: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    if (!salary || salary.companyId !== companyId) {
      throw ApiError.notFound('Employee salary record not found');
    }

    return salary;
  }

  async assignSalary(companyId: string, data: any) {
    // Verify employee belongs to company
    const employee = await platformPrisma.employee.findUnique({
      where: { id: data.employeeId },
      select: { id: true, companyId: true },
    });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.badRequest('Employee not found in this company');
    }

    // Compute components from structure if structureId provided and no components given
    let components = data.components ?? {};
    if (data.structureId && (!data.components || Object.keys(data.components).length === 0)) {
      const structure = await platformPrisma.salaryStructure.findUnique({
        where: { id: data.structureId },
      });
      if (!structure || structure.companyId !== companyId) {
        throw ApiError.badRequest('Salary structure not found in this company');
      }
      components = this.computeComponentBreakup(structure, data.annualCtc);
    }

    const monthlyGross = data.annualCtc / 12;
    const effectiveFrom = new Date(data.effectiveFrom);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // In a transaction: set previous record's isCurrent=false and create new record
    const result = await platformPrisma.$transaction(async (tx) => {
      // Set previous current salary's isCurrent=false
      await tx.employeeSalary.updateMany({
        where: { employeeId: data.employeeId, companyId, isCurrent: true },
        data: {
          isCurrent: false,
          effectiveTo: today,
        },
      });

      // Create new salary record
      return tx.employeeSalary.create({
        data: {
          companyId,
          employeeId: data.employeeId,
          structureId: n(data.structureId),
          annualCtc: data.annualCtc,
          monthlyGross: Math.round(monthlyGross * 100) / 100,
          components,
          effectiveFrom,
          isCurrent: true,
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
          structure: {
            select: { id: true, name: true, code: true },
          },
        },
      });
    });

    return result;
  }

  async updateEmployeeSalary(companyId: string, id: string, data: any) {
    const salary = await platformPrisma.employeeSalary.findUnique({ where: { id } });
    if (!salary || salary.companyId !== companyId) {
      throw ApiError.notFound('Employee salary record not found');
    }

    const updateData: any = {};
    if (data.annualCtc !== undefined) {
      updateData.annualCtc = data.annualCtc;
      updateData.monthlyGross = Math.round((data.annualCtc / 12) * 100) / 100;
    }
    if (data.components !== undefined) updateData.components = data.components;
    if (data.effectiveFrom !== undefined) updateData.effectiveFrom = new Date(data.effectiveFrom);
    if (data.structureId !== undefined) updateData.structureId = n(data.structureId);

    return platformPrisma.employeeSalary.update({
      where: { id },
      data: updateData,
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
          },
        },
        structure: {
          select: { id: true, name: true, code: true },
        },
      },
    });
  }

  private computeComponentBreakup(structure: any, annualCtc: number): Record<string, number> {
    const components = structure.components as any[];
    const breakup: Record<string, number> = {};
    const monthly = annualCtc / 12;

    // First pass: find basic (FIXED components need their value from the structure)
    let basicAmount = 0;
    let grossAmount = monthly;

    for (const comp of components) {
      if (comp.calculationMethod === 'FIXED') {
        breakup[comp.componentId] = comp.value ?? 0;
        if (comp.componentId.toLowerCase().includes('basic') || comp.formula?.toLowerCase()?.includes('basic')) {
          basicAmount = comp.value ?? 0;
        }
      }
    }

    // If no fixed basic found, try percent-based basic
    for (const comp of components) {
      if (comp.calculationMethod === 'PERCENT_OF_GROSS') {
        breakup[comp.componentId] = Math.round(((comp.value ?? 0) / 100) * grossAmount * 100) / 100;
        if (!basicAmount) basicAmount = breakup[comp.componentId] ?? 0;
      }
    }

    // Second pass: percent of basic
    for (const comp of components) {
      if (comp.calculationMethod === 'PERCENT_OF_BASIC') {
        breakup[comp.componentId] = Math.round(((comp.value ?? 0) / 100) * basicAmount * 100) / 100;
      }
    }

    return breakup;
  }

  // ────────────────────────────────────────────────────────────────────
  // PF Config (singleton upsert)
  // ────────────────────────────────────────────────────────────────────

  async getPFConfig(companyId: string) {
    let config = await platformPrisma.pFConfig.findUnique({ where: { companyId } });

    if (!config) {
      config = await platformPrisma.pFConfig.create({
        data: {
          companyId,
          employeeRate: 12,
          employerEpfRate: 3.67,
          employerEpsRate: 8.33,
          employerEdliRate: 0.5,
          adminChargeRate: 0.5,
          wageCeiling: 15000,
          vpfEnabled: false,
        },
      });
    }

    return config;
  }

  async updatePFConfig(companyId: string, data: any) {
    return platformPrisma.pFConfig.upsert({
      where: { companyId },
      create: {
        companyId,
        employeeRate: data.employeeRate ?? 12,
        employerEpfRate: data.employerEpfRate ?? 3.67,
        employerEpsRate: data.employerEpsRate ?? 8.33,
        employerEdliRate: data.employerEdliRate ?? 0.5,
        adminChargeRate: data.adminChargeRate ?? 0.5,
        wageCeiling: data.wageCeiling ?? 15000,
        vpfEnabled: data.vpfEnabled ?? false,
        excludedComponents: data.excludedComponents ?? Prisma.JsonNull,
      },
      update: {
        ...(data.employeeRate !== undefined && { employeeRate: data.employeeRate }),
        ...(data.employerEpfRate !== undefined && { employerEpfRate: data.employerEpfRate }),
        ...(data.employerEpsRate !== undefined && { employerEpsRate: data.employerEpsRate }),
        ...(data.employerEdliRate !== undefined && { employerEdliRate: data.employerEdliRate }),
        ...(data.adminChargeRate !== undefined && { adminChargeRate: data.adminChargeRate }),
        ...(data.wageCeiling !== undefined && { wageCeiling: data.wageCeiling }),
        ...(data.vpfEnabled !== undefined && { vpfEnabled: data.vpfEnabled }),
        ...(data.excludedComponents !== undefined && { excludedComponents: data.excludedComponents ?? Prisma.JsonNull }),
      },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // ESI Config (singleton upsert)
  // ────────────────────────────────────────────────────────────────────

  async getESIConfig(companyId: string) {
    let config = await platformPrisma.eSIConfig.findUnique({ where: { companyId } });

    if (!config) {
      config = await platformPrisma.eSIConfig.create({
        data: {
          companyId,
          employeeRate: 0.75,
          employerRate: 3.25,
          wageCeiling: 21000,
        },
      });
    }

    return config;
  }

  async updateESIConfig(companyId: string, data: any) {
    return platformPrisma.eSIConfig.upsert({
      where: { companyId },
      create: {
        companyId,
        employeeRate: data.employeeRate ?? 0.75,
        employerRate: data.employerRate ?? 3.25,
        wageCeiling: data.wageCeiling ?? 21000,
        excludedWages: data.excludedWages ?? Prisma.JsonNull,
      },
      update: {
        ...(data.employeeRate !== undefined && { employeeRate: data.employeeRate }),
        ...(data.employerRate !== undefined && { employerRate: data.employerRate }),
        ...(data.wageCeiling !== undefined && { wageCeiling: data.wageCeiling }),
        ...(data.excludedWages !== undefined && { excludedWages: data.excludedWages ?? Prisma.JsonNull }),
      },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // PT Config (multi-state CRUD)
  // ────────────────────────────────────────────────────────────────────

  async listPTConfigs(companyId: string) {
    return platformPrisma.pTConfig.findMany({
      where: { companyId },
      orderBy: { state: 'asc' },
    });
  }

  async createPTConfig(companyId: string, data: any) {
    const existing = await platformPrisma.pTConfig.findUnique({
      where: { companyId_state: { companyId, state: data.state } },
    });
    if (existing) {
      throw ApiError.conflict(`PT config for state "${data.state}" already exists`);
    }

    return platformPrisma.pTConfig.create({
      data: {
        companyId,
        state: data.state,
        slabs: data.slabs,
        frequency: data.frequency ?? 'MONTHLY',
        registrationNumber: n(data.registrationNumber),
      },
    });
  }

  async updatePTConfig(companyId: string, id: string, data: any) {
    const config = await platformPrisma.pTConfig.findUnique({ where: { id } });
    if (!config || config.companyId !== companyId) {
      throw ApiError.notFound('PT config not found');
    }

    return platformPrisma.pTConfig.update({
      where: { id },
      data: {
        ...(data.state !== undefined && { state: data.state }),
        ...(data.slabs !== undefined && { slabs: data.slabs }),
        ...(data.frequency !== undefined && { frequency: data.frequency }),
        ...(data.registrationNumber !== undefined && { registrationNumber: n(data.registrationNumber) }),
      },
    });
  }

  async deletePTConfig(companyId: string, id: string) {
    const config = await platformPrisma.pTConfig.findUnique({ where: { id } });
    if (!config || config.companyId !== companyId) {
      throw ApiError.notFound('PT config not found');
    }

    await platformPrisma.pTConfig.delete({ where: { id } });
    return { message: 'PT config deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Gratuity Config (singleton upsert)
  // ────────────────────────────────────────────────────────────────────

  async getGratuityConfig(companyId: string) {
    let config = await platformPrisma.gratuityConfig.findUnique({ where: { companyId } });

    if (!config) {
      config = await platformPrisma.gratuityConfig.create({
        data: {
          companyId,
          formula: '(lastBasic * 15 * yearsOfService) / 26',
          baseSalary: 'Basic',
          maxAmount: 2000000,
          provisionMethod: 'MONTHLY',
          trustExists: false,
        },
      });
    }

    return config;
  }

  async updateGratuityConfig(companyId: string, data: any) {
    return platformPrisma.gratuityConfig.upsert({
      where: { companyId },
      create: {
        companyId,
        formula: data.formula ?? '(lastBasic * 15 * yearsOfService) / 26',
        baseSalary: data.baseSalary ?? 'Basic',
        maxAmount: data.maxAmount ?? 2000000,
        provisionMethod: data.provisionMethod ?? 'MONTHLY',
        trustExists: data.trustExists ?? false,
      },
      update: {
        ...(data.formula !== undefined && { formula: data.formula }),
        ...(data.baseSalary !== undefined && { baseSalary: data.baseSalary }),
        ...(data.maxAmount !== undefined && { maxAmount: data.maxAmount }),
        ...(data.provisionMethod !== undefined && { provisionMethod: data.provisionMethod }),
        ...(data.trustExists !== undefined && { trustExists: data.trustExists }),
      },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Bonus Config (singleton upsert)
  // ────────────────────────────────────────────────────────────────────

  async getBonusConfig(companyId: string) {
    let config = await platformPrisma.bonusConfig.findUnique({ where: { companyId } });

    if (!config) {
      config = await platformPrisma.bonusConfig.create({
        data: {
          companyId,
          wageCeiling: 7000,
          minBonusPercent: 8.33,
          maxBonusPercent: 20,
          eligibilityDays: 30,
          calculationPeriod: 'APR_MAR',
        },
      });
    }

    return config;
  }

  async updateBonusConfig(companyId: string, data: any) {
    return platformPrisma.bonusConfig.upsert({
      where: { companyId },
      create: {
        companyId,
        wageCeiling: data.wageCeiling ?? 7000,
        minBonusPercent: data.minBonusPercent ?? 8.33,
        maxBonusPercent: data.maxBonusPercent ?? 20,
        eligibilityDays: data.eligibilityDays ?? 30,
        calculationPeriod: data.calculationPeriod ?? 'APR_MAR',
      },
      update: {
        ...(data.wageCeiling !== undefined && { wageCeiling: data.wageCeiling }),
        ...(data.minBonusPercent !== undefined && { minBonusPercent: data.minBonusPercent }),
        ...(data.maxBonusPercent !== undefined && { maxBonusPercent: data.maxBonusPercent }),
        ...(data.eligibilityDays !== undefined && { eligibilityDays: data.eligibilityDays }),
        ...(data.calculationPeriod !== undefined && { calculationPeriod: data.calculationPeriod }),
      },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // LWF Config (multi-state CRUD)
  // ────────────────────────────────────────────────────────────────────

  async listLWFConfigs(companyId: string) {
    return platformPrisma.lWFConfig.findMany({
      where: { companyId },
      orderBy: { state: 'asc' },
    });
  }

  async createLWFConfig(companyId: string, data: any) {
    const existing = await platformPrisma.lWFConfig.findUnique({
      where: { companyId_state: { companyId, state: data.state } },
    });
    if (existing) {
      throw ApiError.conflict(`LWF config for state "${data.state}" already exists`);
    }

    return platformPrisma.lWFConfig.create({
      data: {
        companyId,
        state: data.state,
        employeeAmount: data.employeeAmount,
        employerAmount: data.employerAmount,
        frequency: data.frequency ?? 'MONTHLY',
      },
    });
  }

  async updateLWFConfig(companyId: string, id: string, data: any) {
    const config = await platformPrisma.lWFConfig.findUnique({ where: { id } });
    if (!config || config.companyId !== companyId) {
      throw ApiError.notFound('LWF config not found');
    }

    return platformPrisma.lWFConfig.update({
      where: { id },
      data: {
        ...(data.state !== undefined && { state: data.state }),
        ...(data.employeeAmount !== undefined && { employeeAmount: data.employeeAmount }),
        ...(data.employerAmount !== undefined && { employerAmount: data.employerAmount }),
        ...(data.frequency !== undefined && { frequency: data.frequency }),
      },
    });
  }

  async deleteLWFConfig(companyId: string, id: string) {
    const config = await platformPrisma.lWFConfig.findUnique({ where: { id } });
    if (!config || config.companyId !== companyId) {
      throw ApiError.notFound('LWF config not found');
    }

    await platformPrisma.lWFConfig.delete({ where: { id } });
    return { message: 'LWF config deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Bank Config (singleton upsert)
  // ────────────────────────────────────────────────────────────────────

  async getBankConfig(companyId: string) {
    const config = await platformPrisma.bankConfig.findUnique({ where: { companyId } });
    return config; // returns null if not set yet — caller decides default
  }

  async updateBankConfig(companyId: string, data: any) {
    const existing = await platformPrisma.bankConfig.findUnique({ where: { companyId } });

    if (existing) {
      return platformPrisma.bankConfig.update({
        where: { companyId },
        data: {
          ...(data.bankName !== undefined && { bankName: data.bankName }),
          ...(data.accountNumber !== undefined && { accountNumber: data.accountNumber }),
          ...(data.ifscCode !== undefined && { ifscCode: data.ifscCode }),
          ...(data.branchName !== undefined && { branchName: n(data.branchName) }),
          ...(data.paymentMode !== undefined && { paymentMode: data.paymentMode }),
          ...(data.fileFormat !== undefined && { fileFormat: n(data.fileFormat) }),
          ...(data.autoPushOnApproval !== undefined && { autoPushOnApproval: data.autoPushOnApproval }),
        },
      });
    }

    // First time: require all mandatory fields
    if (!data.bankName || !data.accountNumber || !data.ifscCode) {
      throw ApiError.badRequest('bankName, accountNumber, and ifscCode are required for initial bank config setup');
    }

    return platformPrisma.bankConfig.create({
      data: {
        companyId,
        bankName: data.bankName,
        accountNumber: data.accountNumber,
        ifscCode: data.ifscCode,
        branchName: n(data.branchName),
        paymentMode: data.paymentMode ?? 'NEFT',
        fileFormat: n(data.fileFormat),
        autoPushOnApproval: data.autoPushOnApproval ?? false,
      },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Loan Policies
  // ────────────────────────────────────────────────────────────────────

  async listLoanPolicies(companyId: string, options: ListOptions = {}) {
    const { page = 1, limit = 25, search } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [policies, total] = await Promise.all([
      platformPrisma.loanPolicy.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      platformPrisma.loanPolicy.count({ where }),
    ]);

    return { policies, total, page, limit };
  }

  async getLoanPolicy(companyId: string, id: string) {
    const policy = await platformPrisma.loanPolicy.findUnique({ where: { id } });
    if (!policy || policy.companyId !== companyId) {
      throw ApiError.notFound('Loan policy not found');
    }
    return policy;
  }

  async createLoanPolicy(companyId: string, data: any) {
    const existing = await platformPrisma.loanPolicy.findUnique({
      where: { companyId_code: { companyId, code: data.code } },
    });
    if (existing) {
      throw ApiError.conflict(`Loan policy code "${data.code}" already exists`);
    }

    return platformPrisma.loanPolicy.create({
      data: {
        companyId,
        name: data.name,
        code: data.code,
        maxAmount: n(data.maxAmount),
        maxTenureMonths: n(data.maxTenureMonths),
        interestRate: data.interestRate ?? 0,
        emiCapPercent: n(data.emiCapPercent),
        eligibilityTenureDays: n(data.eligibilityTenureDays),
        eligibleTypeIds: data.eligibleTypeIds ?? Prisma.JsonNull,
        isActive: data.isActive ?? true,
      },
    });
  }

  async updateLoanPolicy(companyId: string, id: string, data: any) {
    const policy = await platformPrisma.loanPolicy.findUnique({ where: { id } });
    if (!policy || policy.companyId !== companyId) {
      throw ApiError.notFound('Loan policy not found');
    }

    if (data.code && data.code !== policy.code) {
      const existing = await platformPrisma.loanPolicy.findUnique({
        where: { companyId_code: { companyId, code: data.code } },
      });
      if (existing) {
        throw ApiError.conflict(`Loan policy code "${data.code}" already exists`);
      }
    }

    return platformPrisma.loanPolicy.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.code !== undefined && { code: data.code }),
        ...(data.maxAmount !== undefined && { maxAmount: n(data.maxAmount) }),
        ...(data.maxTenureMonths !== undefined && { maxTenureMonths: n(data.maxTenureMonths) }),
        ...(data.interestRate !== undefined && { interestRate: data.interestRate }),
        ...(data.emiCapPercent !== undefined && { emiCapPercent: n(data.emiCapPercent) }),
        ...(data.eligibilityTenureDays !== undefined && { eligibilityTenureDays: n(data.eligibilityTenureDays) }),
        ...(data.eligibleTypeIds !== undefined && { eligibleTypeIds: data.eligibleTypeIds ?? Prisma.JsonNull }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async deleteLoanPolicy(companyId: string, id: string) {
    const policy = await platformPrisma.loanPolicy.findUnique({ where: { id } });
    if (!policy || policy.companyId !== companyId) {
      throw ApiError.notFound('Loan policy not found');
    }

    const loanCount = await platformPrisma.loanRecord.count({ where: { policyId: id } });
    if (loanCount > 0) {
      throw ApiError.badRequest(`Cannot delete: ${loanCount} loan record(s) reference this policy`);
    }

    await platformPrisma.loanPolicy.delete({ where: { id } });
    return { message: 'Loan policy deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Loan Records
  // ────────────────────────────────────────────────────────────────────

  async listLoans(companyId: string, options: LoanListOptions = {}) {
    const { page = 1, limit = 25, employeeId, status } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status.toUpperCase();

    const [loans, total] = await Promise.all([
      platformPrisma.loanRecord.findMany({
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
          policy: {
            select: { id: true, name: true, code: true },
          },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.loanRecord.count({ where }),
    ]);

    return { loans, total, page, limit };
  }

  async getLoan(companyId: string, id: string) {
    const loan = await platformPrisma.loanRecord.findUnique({
      where: { id },
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
        policy: {
          select: { id: true, name: true, code: true, interestRate: true },
        },
      },
    });

    if (!loan || loan.companyId !== companyId) {
      throw ApiError.notFound('Loan record not found');
    }

    return loan;
  }

  async createLoan(companyId: string, data: any) {
    // Validate employee
    const employee = await platformPrisma.employee.findUnique({
      where: { id: data.employeeId },
      select: { id: true, companyId: true },
    });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.badRequest('Employee not found in this company');
    }

    // Validate policy
    const policy = await platformPrisma.loanPolicy.findUnique({
      where: { id: data.policyId },
    });
    if (!policy || policy.companyId !== companyId) {
      throw ApiError.badRequest('Loan policy not found in this company');
    }

    // Use interest rate from data or fall back to policy
    const interestRate = data.interestRate ?? Number(policy.interestRate);

    // Calculate EMI if not provided: EMI = (principal * (1 + rate/100)) / tenure
    const emiAmount = data.emiAmount ?? Math.round(
      ((Number(data.amount) * (1 + interestRate / 100)) / data.tenure) * 100
    ) / 100;

    const outstanding = Number(data.amount) * (1 + interestRate / 100);

    const loan = await platformPrisma.loanRecord.create({
      data: {
        companyId,
        employeeId: data.employeeId,
        policyId: data.policyId,
        amount: data.amount,
        tenure: data.tenure,
        emiAmount,
        interestRate,
        outstanding: Math.round(outstanding * 100) / 100,
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
        policy: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    // Wire approval workflow
    await essService.createRequest(companyId, {
      requesterId: data.employeeId,
      entityType: 'LoanRecord',
      entityId: loan.id,
      triggerEvent: 'LOAN_APPLICATION',
      data: { amount: data.amount, tenure: data.tenure, policyName: policy.name },
    });

    return loan;
  }

  async updateLoan(companyId: string, id: string, data: any) {
    const loan = await platformPrisma.loanRecord.findUnique({ where: { id } });
    if (!loan || loan.companyId !== companyId) {
      throw ApiError.notFound('Loan record not found');
    }

    return platformPrisma.loanRecord.update({
      where: { id },
      data: {
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.tenure !== undefined && { tenure: data.tenure }),
        ...(data.emiAmount !== undefined && { emiAmount: data.emiAmount }),
        ...(data.interestRate !== undefined && { interestRate: data.interestRate }),
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
        policy: {
          select: { id: true, name: true, code: true },
        },
      },
    });
  }

  async updateLoanStatus(companyId: string, id: string, status: string, approvedBy?: string) {
    const loan = await platformPrisma.loanRecord.findUnique({ where: { id } });
    if (!loan || loan.companyId !== companyId) {
      throw ApiError.notFound('Loan record not found');
    }

    const updateData: any = { status };

    if (approvedBy) {
      updateData.approvedBy = approvedBy;
    }

    // On ACTIVE: set disbursedAt
    if (status === 'ACTIVE') {
      updateData.disbursedAt = new Date();
    }

    // On CLOSED: set outstanding to 0
    if (status === 'CLOSED') {
      updateData.outstanding = 0;
    }

    return platformPrisma.loanRecord.update({
      where: { id },
      data: updateData,
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
          },
        },
        policy: {
          select: { id: true, name: true, code: true },
        },
      },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Tax Config (singleton upsert)
  // ────────────────────────────────────────────────────────────────────

  async getTaxConfig(companyId: string) {
    let config = await platformPrisma.taxConfig.findUnique({ where: { companyId } });

    if (!config) {
      config = await platformPrisma.taxConfig.create({
        data: {
          companyId,
          defaultRegime: 'NEW',
          oldRegimeSlabs: DEFAULT_OLD_REGIME_SLABS,
          newRegimeSlabs: DEFAULT_NEW_REGIME_SLABS,
          surchargeRates: DEFAULT_SURCHARGE_RATES,
          cessRate: 4,
        },
      });
    }

    return config;
  }

  async updateTaxConfig(companyId: string, data: any) {
    return platformPrisma.taxConfig.upsert({
      where: { companyId },
      create: {
        companyId,
        defaultRegime: data.defaultRegime ?? 'NEW',
        oldRegimeSlabs: data.oldRegimeSlabs ?? DEFAULT_OLD_REGIME_SLABS,
        newRegimeSlabs: data.newRegimeSlabs ?? DEFAULT_NEW_REGIME_SLABS,
        declarationDeadline: data.declarationDeadline ? new Date(data.declarationDeadline) : null,
        surchargeRates: data.surchargeRates ?? DEFAULT_SURCHARGE_RATES,
        cessRate: data.cessRate ?? 4,
      },
      update: {
        ...(data.defaultRegime !== undefined && { defaultRegime: data.defaultRegime }),
        ...(data.oldRegimeSlabs !== undefined && { oldRegimeSlabs: data.oldRegimeSlabs }),
        ...(data.newRegimeSlabs !== undefined && { newRegimeSlabs: data.newRegimeSlabs }),
        ...(data.declarationDeadline !== undefined && { declarationDeadline: data.declarationDeadline ? new Date(data.declarationDeadline) : null }),
        ...(data.surchargeRates !== undefined && { surchargeRates: data.surchargeRates ?? Prisma.JsonNull }),
        ...(data.cessRate !== undefined && { cessRate: data.cessRate }),
      },
    });
  }
}

export const payrollConfigService = new PayrollConfigService();
