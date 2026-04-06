import { Prisma } from '@prisma/client';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { n } from '../../../shared/utils/prisma-helpers';

interface BudgetListOptions {
  page?: number;
  limit?: number;
  fiscalYear?: string;
}

class TrainingBudgetService {
  // ════════════════════════════════════════════════════════════════
  // LIST
  // ════════════════════════════════════════════════════════════════

  async listBudgets(companyId: string, options: BudgetListOptions = {}) {
    const { page = 1, limit = 25, fiscalYear } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (fiscalYear) where.fiscalYear = fiscalYear;

    const [budgets, total] = await Promise.all([
      platformPrisma.trainingBudget.findMany({
        where,
        include: {
          department: { select: { id: true, name: true } },
        },
        skip: offset,
        take: limit,
        orderBy: [{ fiscalYear: 'desc' }, { createdAt: 'desc' }],
      }),
      platformPrisma.trainingBudget.count({ where }),
    ]);

    // Calculate remaining for each budget
    const budgetsWithRemaining = budgets.map((b) => {
      const allocated = Number(b.allocatedAmount);
      const used = Number(b.usedAmount);
      return {
        ...b,
        allocatedAmount: allocated,
        usedAmount: used,
        remaining: allocated - used,
      };
    });

    return { budgets: budgetsWithRemaining, total, page, limit };
  }

  // ════════════════════════════════════════════════════════════════
  // CREATE
  // ════════════════════════════════════════════════════════════════

  async createBudget(companyId: string, data: { fiscalYear: string; departmentId?: string | undefined; allocatedAmount: number }) {
    // Validate department exists if provided
    if (data.departmentId) {
      const department = await platformPrisma.department.findUnique({
        where: { id: data.departmentId },
      });
      if (!department || department.companyId !== companyId) {
        throw ApiError.notFound('Department not found');
      }
    }

    // Check for duplicate (@@unique constraint)
    const existing = await platformPrisma.trainingBudget.findFirst({
      where: {
        companyId,
        fiscalYear: data.fiscalYear,
        departmentId: data.departmentId ?? null,
      },
    });
    if (existing) {
      throw ApiError.badRequest(
        `A training budget already exists for fiscal year ${data.fiscalYear}${data.departmentId ? ' and this department' : ' (company-wide)'}`,
      );
    }

    const budget = await platformPrisma.trainingBudget.create({
      data: {
        companyId,
        fiscalYear: data.fiscalYear,
        departmentId: n(data.departmentId),
        allocatedAmount: new Prisma.Decimal(data.allocatedAmount),
      },
      include: {
        department: { select: { id: true, name: true } },
      },
    });

    const allocated = Number(budget.allocatedAmount);
    const used = Number(budget.usedAmount);

    return {
      ...budget,
      allocatedAmount: allocated,
      usedAmount: used,
      remaining: allocated - used,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // UPDATE
  // ════════════════════════════════════════════════════════════════

  async updateBudget(companyId: string, id: string, data: { allocatedAmount?: number | undefined }) {
    const budget = await platformPrisma.trainingBudget.findUnique({ where: { id } });
    if (!budget || budget.companyId !== companyId) {
      throw ApiError.notFound('Training budget not found');
    }

    const updated = await platformPrisma.trainingBudget.update({
      where: { id },
      data: {
        ...(data.allocatedAmount !== undefined && {
          allocatedAmount: new Prisma.Decimal(data.allocatedAmount),
        }),
      },
      include: {
        department: { select: { id: true, name: true } },
      },
    });

    const allocated = Number(updated.allocatedAmount);
    const used = Number(updated.usedAmount);

    return {
      ...updated,
      allocatedAmount: allocated,
      usedAmount: used,
      remaining: allocated - used,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // DELETE
  // ════════════════════════════════════════════════════════════════

  async deleteBudget(companyId: string, id: string) {
    const budget = await platformPrisma.trainingBudget.findFirst({ where: { id, companyId } });
    if (!budget) throw ApiError.notFound('Training budget not found');
    if (Number(budget.usedAmount) > 0) {
      throw ApiError.badRequest('Cannot delete a budget that has been used');
    }
    await platformPrisma.trainingBudget.delete({ where: { id } });
  }

  // ════════════════════════════════════════════════════════════════
  // UTILIZATION
  // ════════════════════════════════════════════════════════════════

  async getUtilization(companyId: string, fiscalYear: string) {
    const budgets = await platformPrisma.trainingBudget.findMany({
      where: { companyId, fiscalYear },
      include: {
        department: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    let totalAllocated = 0;
    let totalUsed = 0;

    const departments = budgets.map((b) => {
      const allocated = Number(b.allocatedAmount);
      const used = Number(b.usedAmount);
      const remaining = allocated - used;
      const utilizationPercent = allocated > 0 ? Math.round((used / allocated) * 10000) / 100 : 0;

      totalAllocated += allocated;
      totalUsed += used;

      return {
        id: b.id,
        departmentId: b.departmentId,
        departmentName: b.department?.name ?? 'Company-wide',
        allocated,
        used,
        remaining,
        utilizationPercent,
      };
    });

    const totalRemaining = totalAllocated - totalUsed;
    const totalUtilizationPercent =
      totalAllocated > 0 ? Math.round((totalUsed / totalAllocated) * 10000) / 100 : 0;

    return {
      fiscalYear,
      departments,
      total: {
        allocated: totalAllocated,
        used: totalUsed,
        remaining: totalRemaining,
        utilizationPercent: totalUtilizationPercent,
      },
    };
  }
}

export const trainingBudgetService = new TrainingBudgetService();
