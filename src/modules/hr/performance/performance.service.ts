import { Prisma } from '@prisma/client';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { logger } from '../../../config/logger';
import { generateNextNumber } from '../../../shared/utils/number-series';

/** Convert undefined to null for Prisma nullable fields. */
function n<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

interface ListOptions {
  page?: number;
  limit?: number;
}

interface GoalListOptions extends ListOptions {
  cycleId?: string;
  employeeId?: string;
  departmentId?: string;
  level?: string;
  status?: string;
}

interface EntryListOptions extends ListOptions {
  status?: string;
  employeeId?: string;
  departmentId?: string;
}

interface FeedbackListOptions extends ListOptions {
  employeeId?: string;
}

interface SkillMappingListOptions extends ListOptions {
  employeeId?: string;
  category?: string;
}

interface SuccessionListOptions extends ListOptions {
  readiness?: string;
}

// ═══════════════════════════════════════════════════════════════════
// 9-Box Grid position mapping
// ═══════════════════════════════════════════════════════════════════

const NINE_BOX_POSITIONS: Record<string, { perfMin: number; perfMax: number; potMin: number; potMax: number }> = {
  'Bad Hire':          { perfMin: 0.0, perfMax: 2.0, potMin: 0.0, potMax: 2.0 },
  'Up or Out':         { perfMin: 0.0, perfMax: 2.0, potMin: 2.0, potMax: 3.5 },
  'Rough Diamond':     { perfMin: 0.0, perfMax: 2.0, potMin: 3.5, potMax: 5.1 },
  'Underperformer':    { perfMin: 2.0, perfMax: 3.5, potMin: 0.0, potMax: 2.0 },
  'Core Player':       { perfMin: 2.0, perfMax: 3.5, potMin: 2.0, potMax: 3.5 },
  'Future Star':       { perfMin: 2.0, perfMax: 3.5, potMin: 3.5, potMax: 5.1 },
  'Solid Performer':   { perfMin: 3.5, perfMax: 5.1, potMin: 0.0, potMax: 2.0 },
  'High Performer':    { perfMin: 3.5, perfMax: 5.1, potMin: 2.0, potMax: 3.5 },
  'Top Talent':        { perfMin: 3.5, perfMax: 5.1, potMin: 3.5, potMax: 5.1 },
};

function classifyNineBox(perf: number, pot: number): string {
  for (const [label, range] of Object.entries(NINE_BOX_POSITIONS)) {
    if (perf >= range.perfMin && perf < range.perfMax && pot >= range.potMin && pot < range.potMax) {
      return label;
    }
  }
  return 'Unclassified';
}

export class PerformanceService {
  // ────────────────────────────────────────────────────────────────────
  // Appraisal Cycles
  // ────────────────────────────────────────────────────────────────────

  async listCycles(companyId: string, options: ListOptions = {}) {
    const { page = 1, limit = 25 } = options;
    const offset = (page - 1) * limit;

    const where = { companyId };

    const [cycles, total] = await Promise.all([
      platformPrisma.appraisalCycle.findMany({
        where,
        include: {
          _count: { select: { goals: true, entries: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { startDate: 'desc' },
      }),
      platformPrisma.appraisalCycle.count({ where }),
    ]);

    return { cycles, total, page, limit };
  }

  async getCycle(companyId: string, id: string) {
    const cycle = await platformPrisma.appraisalCycle.findUnique({
      where: { id },
      include: {
        _count: { select: { goals: true, entries: true, feedback360: true } },
      },
    });

    if (!cycle || cycle.companyId !== companyId) {
      throw ApiError.notFound('Appraisal cycle not found');
    }

    return cycle;
  }

  async createCycle(companyId: string, data: any) {
    const referenceNumber = await generateNextNumber(
      platformPrisma, companyId, ['Performance', 'Performance Review'], 'Appraisal Cycle',
    );

    return platformPrisma.appraisalCycle.create({
      data: {
        companyId,
        referenceNumber,
        name: data.name,
        frequency: data.frequency ?? 'ANNUAL',
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        ratingScale: data.ratingScale ?? 5,
        ratingLabels: data.ratingLabels ?? Prisma.JsonNull,
        kraWeightage: data.kraWeightage ?? 70,
        competencyWeightage: data.competencyWeightage ?? 30,
        bellCurve: data.bellCurve ?? Prisma.JsonNull,
        forcedDistribution: data.forcedDistribution ?? false,
        midYearReview: data.midYearReview ?? false,
        midYearMonth: n(data.midYearMonth),
        managerEditDays: n(data.managerEditDays),
        status: 'DRAFT',
      },
    });
  }

  async updateCycle(companyId: string, id: string, data: any) {
    const cycle = await platformPrisma.appraisalCycle.findUnique({ where: { id } });
    if (!cycle || cycle.companyId !== companyId) {
      throw ApiError.notFound('Appraisal cycle not found');
    }

    return platformPrisma.appraisalCycle.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.frequency !== undefined && { frequency: data.frequency }),
        ...(data.startDate !== undefined && { startDate: new Date(data.startDate) }),
        ...(data.endDate !== undefined && { endDate: new Date(data.endDate) }),
        ...(data.ratingScale !== undefined && { ratingScale: data.ratingScale }),
        ...(data.ratingLabels !== undefined && { ratingLabels: data.ratingLabels ?? Prisma.JsonNull }),
        ...(data.kraWeightage !== undefined && { kraWeightage: data.kraWeightage }),
        ...(data.competencyWeightage !== undefined && { competencyWeightage: data.competencyWeightage }),
        ...(data.bellCurve !== undefined && { bellCurve: data.bellCurve ?? Prisma.JsonNull }),
        ...(data.forcedDistribution !== undefined && { forcedDistribution: data.forcedDistribution }),
        ...(data.midYearReview !== undefined && { midYearReview: data.midYearReview }),
        ...(data.midYearMonth !== undefined && { midYearMonth: n(data.midYearMonth) }),
        ...(data.managerEditDays !== undefined && { managerEditDays: n(data.managerEditDays) }),
      },
    });
  }

  async deleteCycle(companyId: string, id: string) {
    const cycle = await platformPrisma.appraisalCycle.findUnique({ where: { id } });
    if (!cycle || cycle.companyId !== companyId) {
      throw ApiError.notFound('Appraisal cycle not found');
    }

    if (cycle.status !== 'DRAFT') {
      throw ApiError.badRequest('Only DRAFT cycles can be deleted');
    }

    await platformPrisma.appraisalCycle.delete({ where: { id } });
    return { message: 'Appraisal cycle deleted' };
  }

  // ── Lifecycle transitions ─────────────────────────────────────────

  async activateCycle(companyId: string, id: string) {
    const cycle = await platformPrisma.appraisalCycle.findUnique({ where: { id } });
    if (!cycle || cycle.companyId !== companyId) {
      throw ApiError.notFound('Appraisal cycle not found');
    }
    if (cycle.status !== 'DRAFT') {
      throw ApiError.badRequest('Only DRAFT cycles can be activated');
    }

    return platformPrisma.appraisalCycle.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  }

  async closeReviewWindow(companyId: string, id: string) {
    const cycle = await platformPrisma.appraisalCycle.findUnique({ where: { id } });
    if (!cycle || cycle.companyId !== companyId) {
      throw ApiError.notFound('Appraisal cycle not found');
    }
    if (cycle.status !== 'ACTIVE') {
      throw ApiError.badRequest('Only ACTIVE cycles can move to REVIEW');
    }

    return platformPrisma.appraisalCycle.update({
      where: { id },
      data: { status: 'REVIEW' },
    });
  }

  async startCalibration(companyId: string, id: string) {
    const cycle = await platformPrisma.appraisalCycle.findUnique({ where: { id } });
    if (!cycle || cycle.companyId !== companyId) {
      throw ApiError.notFound('Appraisal cycle not found');
    }
    if (cycle.status !== 'REVIEW') {
      throw ApiError.badRequest('Only REVIEW cycles can move to CALIBRATION');
    }

    return platformPrisma.appraisalCycle.update({
      where: { id },
      data: { status: 'CALIBRATION' },
    });
  }

  async publishRatings(companyId: string, id: string) {
    const cycle = await platformPrisma.appraisalCycle.findUnique({ where: { id } });
    if (!cycle || cycle.companyId !== companyId) {
      throw ApiError.notFound('Appraisal cycle not found');
    }
    if (cycle.status !== 'CALIBRATION') {
      throw ApiError.badRequest('Only CALIBRATION cycles can be published');
    }

    // Bell curve enforcement check
    const bellCurve = cycle.bellCurve as Record<string, number> | null;
    if (bellCurve && typeof bellCurve === 'object') {
      // Get actual rating distribution via groupBy
      const ratingGroups = await platformPrisma.appraisalEntry.groupBy({
        by: ['finalRating'],
        _count: { _all: true },
        where: { companyId, cycleId: id, finalRating: { not: null } },
      });

      const totalRated = ratingGroups.reduce((sum, g) => sum + g._count._all, 0);

      if (totalRated > 0 && cycle.forcedDistribution) {
        const ratingScale = cycle.ratingScale;
        const actualDistribution: Record<number, number> = {};
        for (let r = 1; r <= ratingScale; r++) actualDistribution[r] = 0;

        for (const group of ratingGroups) {
          if (group.finalRating !== null) {
            const bucket = Math.min(ratingScale, Math.max(1, Math.round(Number(group.finalRating))));
            actualDistribution[bucket] = (actualDistribution[bucket] ?? 0) + group._count._all;
          }
        }

        // Compare actual vs target distribution within +/- 10% tolerance
        const TOLERANCE = 10;
        const violations: string[] = [];

        for (const [ratingKey, targetPercent] of Object.entries(bellCurve)) {
          const bucket = Number(ratingKey.replace(/^R/, ''));
          if (isNaN(bucket) || bucket < 1 || bucket > ratingScale) continue;

          const actualCount = actualDistribution[bucket] ?? 0;
          const actualPercent = Math.round((actualCount / totalRated) * 100);
          const diff = Math.abs(actualPercent - Number(targetPercent));

          if (diff > TOLERANCE) {
            violations.push(`Rating ${bucket}: actual ${actualPercent}% vs target ${targetPercent}% (diff ${diff}%)`);
          }
        }

        if (violations.length > 0) {
          throw ApiError.badRequest(
            `Rating distribution does not match bell curve targets. Recalibrate before publishing. Violations: ${violations.join('; ')}`
          );
        }
      } else if (totalRated > 0 && !cycle.forcedDistribution) {
        // Soft warning — log but allow publishing
        logger.warn(`Cycle ${id}: bell curve configured but forcedDistribution is off. Publishing without enforcement.`);
      }
    }

    return platformPrisma.appraisalCycle.update({
      where: { id },
      data: { status: 'PUBLISHED' },
    });
  }

  async closeCycle(companyId: string, id: string) {
    const cycle = await platformPrisma.appraisalCycle.findUnique({ where: { id } });
    if (!cycle || cycle.companyId !== companyId) {
      throw ApiError.notFound('Appraisal cycle not found');
    }
    if (cycle.status !== 'PUBLISHED') {
      throw ApiError.badRequest('Only PUBLISHED cycles can be closed');
    }

    return platformPrisma.appraisalCycle.update({
      where: { id },
      data: { status: 'CLOSED' },
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Goals (KRA/OKR)
  // ────────────────────────────────────────────────────────────────────

  async listGoals(companyId: string, options: GoalListOptions = {}) {
    const { page = 1, limit = 25, cycleId, employeeId, departmentId, level, status } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (cycleId) where.cycleId = cycleId;
    if (employeeId) where.employeeId = employeeId;
    if (departmentId) where.departmentId = departmentId;
    if (level) where.level = level;
    if (status) where.status = status.toUpperCase();

    const [goals, total] = await Promise.all([
      platformPrisma.goal.findMany({
        where,
        include: {
          employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
          department: { select: { id: true, name: true } },
          parentGoal: { select: { id: true, title: true, level: true } },
          _count: { select: { childGoals: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.goal.count({ where }),
    ]);

    return { goals, total, page, limit };
  }

  async getGoal(companyId: string, id: string) {
    const goal = await platformPrisma.goal.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        department: { select: { id: true, name: true } },
        parentGoal: { select: { id: true, title: true, level: true } },
        childGoals: {
          include: {
            employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
            department: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!goal || goal.companyId !== companyId) {
      throw ApiError.notFound('Goal not found');
    }

    return goal;
  }

  async createGoal(companyId: string, data: any) {
    // Validate cycle belongs to company
    const cycle = await platformPrisma.appraisalCycle.findUnique({ where: { id: data.cycleId } });
    if (!cycle || cycle.companyId !== companyId) {
      throw ApiError.badRequest('Appraisal cycle not found in this company');
    }

    // Goal locking: prevent goal creation if cycle is not in DRAFT status
    if (cycle.status !== 'DRAFT') {
      throw ApiError.badRequest('Goals are locked — appraisal cycle is no longer in DRAFT status');
    }

    // Validate parentGoalId if provided
    if (data.parentGoalId) {
      const parentGoal = await platformPrisma.goal.findUnique({ where: { id: data.parentGoalId } });
      if (!parentGoal || parentGoal.companyId !== companyId) {
        throw ApiError.badRequest('Parent goal not found in this company');
      }
    }

    // Validate employee if provided
    if (data.employeeId) {
      const employee = await platformPrisma.employee.findUnique({ where: { id: data.employeeId } });
      if (!employee || employee.companyId !== companyId) {
        throw ApiError.badRequest('Employee not found in this company');
      }
    }

    return platformPrisma.goal.create({
      data: {
        companyId,
        cycleId: data.cycleId,
        employeeId: n(data.employeeId),
        departmentId: n(data.departmentId),
        parentGoalId: n(data.parentGoalId),
        title: data.title,
        description: n(data.description),
        kpiMetric: n(data.kpiMetric),
        targetValue: n(data.targetValue),
        weightage: data.weightage,
        level: data.level ?? 'INDIVIDUAL',
        status: data.status ?? 'DRAFT',
      },
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        department: { select: { id: true, name: true } },
        parentGoal: { select: { id: true, title: true, level: true } },
      },
    });
  }

  async updateGoal(companyId: string, id: string, data: any) {
    const goal = await platformPrisma.goal.findUnique({ where: { id } });
    if (!goal || goal.companyId !== companyId) {
      throw ApiError.notFound('Goal not found');
    }

    // Goal locking: check if the linked cycle is still in DRAFT status
    const cycle = await platformPrisma.appraisalCycle.findUnique({ where: { id: goal.cycleId } });
    if (cycle && cycle.status !== 'DRAFT') {
      // Only achievedValue and selfRating are updatable when cycle is not DRAFT
      const ALLOWED_FIELDS_WHEN_LOCKED = new Set(['achievedValue', 'selfRating']);
      const attemptedFields = Object.keys(data).filter(
        (key) => data[key] !== undefined && !ALLOWED_FIELDS_WHEN_LOCKED.has(key)
      );

      if (attemptedFields.length > 0) {
        throw ApiError.badRequest('Goals are locked — appraisal cycle is no longer in DRAFT status');
      }
    }

    return platformPrisma.goal.update({
      where: { id },
      data: {
        ...(data.employeeId !== undefined && { employeeId: n(data.employeeId) }),
        ...(data.departmentId !== undefined && { departmentId: n(data.departmentId) }),
        ...(data.parentGoalId !== undefined && { parentGoalId: n(data.parentGoalId) }),
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: n(data.description) }),
        ...(data.kpiMetric !== undefined && { kpiMetric: n(data.kpiMetric) }),
        ...(data.targetValue !== undefined && { targetValue: n(data.targetValue) }),
        ...(data.achievedValue !== undefined && { achievedValue: n(data.achievedValue) }),
        ...(data.weightage !== undefined && { weightage: data.weightage }),
        ...(data.level !== undefined && { level: data.level }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.selfRating !== undefined && { selfRating: data.selfRating }),
      },
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        department: { select: { id: true, name: true } },
        parentGoal: { select: { id: true, title: true, level: true } },
      },
    });
  }

  async deleteGoal(companyId: string, id: string) {
    const goal = await platformPrisma.goal.findUnique({
      where: { id },
      include: { _count: { select: { childGoals: true } } },
    });
    if (!goal || goal.companyId !== companyId) {
      throw ApiError.notFound('Goal not found');
    }

    if (goal._count.childGoals > 0) {
      throw ApiError.badRequest(`Cannot delete: ${goal._count.childGoals} child goal(s) are linked to this goal`);
    }

    await platformPrisma.goal.delete({ where: { id } });
    return { message: 'Goal deleted' };
  }

  async getGoalCascade(companyId: string, departmentId: string) {
    // Fetch company-level goals, department-level goals, and individual goals under this department
    const companyGoals = await platformPrisma.goal.findMany({
      where: { companyId, level: 'COMPANY' },
      include: {
        childGoals: {
          where: { level: 'DEPARTMENT', departmentId },
          include: {
            department: { select: { id: true, name: true } },
            childGoals: {
              where: { level: 'INDIVIDUAL' },
              include: {
                employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return companyGoals;
  }

  // ────────────────────────────────────────────────────────────────────
  // Appraisal Entries
  // ────────────────────────────────────────────────────────────────────

  async listEntries(companyId: string, cycleId: string, options: EntryListOptions = {}) {
    const { page = 1, limit = 25, status, employeeId, departmentId } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId, cycleId };
    if (status) where.status = status.toUpperCase();
    if (employeeId) where.employeeId = employeeId;
    if (departmentId) {
      where.employee = { departmentId };
    }

    const [entries, total] = await Promise.all([
      platformPrisma.appraisalEntry.findMany({
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
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.appraisalEntry.count({ where }),
    ]);

    return { entries, total, page, limit };
  }

  async getEntry(companyId: string, id: string) {
    const entry = await platformPrisma.appraisalEntry.findUnique({
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
            reportingManager: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        cycle: { select: { id: true, name: true, ratingScale: true, ratingLabels: true } },
      },
    });

    if (!entry || entry.companyId !== companyId) {
      throw ApiError.notFound('Appraisal entry not found');
    }

    // Fetch associated goals for this employee in this cycle
    const goals = await platformPrisma.goal.findMany({
      where: { companyId, cycleId: entry.cycleId, employeeId: entry.employeeId },
      orderBy: { createdAt: 'asc' },
    });

    return { ...entry, goals };
  }

  async createEntry(companyId: string, data: { cycleId: string; employeeId: string }) {
    // Validate cycle
    const cycle = await platformPrisma.appraisalCycle.findUnique({ where: { id: data.cycleId } });
    if (!cycle || cycle.companyId !== companyId) {
      throw ApiError.badRequest('Appraisal cycle not found');
    }

    // Validate employee
    const employee = await platformPrisma.employee.findUnique({ where: { id: data.employeeId } });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.badRequest('Employee not found');
    }

    // Check uniqueness
    const existing = await platformPrisma.appraisalEntry.findUnique({
      where: { cycleId_employeeId: { cycleId: data.cycleId, employeeId: data.employeeId } },
    });
    if (existing) {
      throw ApiError.conflict('Appraisal entry for this employee in this cycle already exists');
    }

    return platformPrisma.appraisalEntry.create({
      data: {
        companyId,
        cycleId: data.cycleId,
        employeeId: data.employeeId,
        status: 'PENDING',
      },
      include: {
        employee: {
          select: { id: true, employeeId: true, firstName: true, lastName: true },
        },
      },
    });
  }

  async selfReview(companyId: string, id: string, data: any) {
    const entry = await platformPrisma.appraisalEntry.findUnique({ where: { id } });
    if (!entry || entry.companyId !== companyId) {
      throw ApiError.notFound('Appraisal entry not found');
    }
    if (entry.status !== 'PENDING') {
      throw ApiError.badRequest('Self-review is only allowed when status is PENDING');
    }

    // Update goal ratings if provided
    if (data.goalRatings && Array.isArray(data.goalRatings)) {
      for (const gr of data.goalRatings) {
        await platformPrisma.goal.updateMany({
          where: { id: gr.goalId, companyId, employeeId: entry.employeeId },
          data: {
            selfRating: gr.selfRating,
            ...(gr.achievedValue !== undefined && { achievedValue: gr.achievedValue }),
          },
        });
      }
    }

    return platformPrisma.appraisalEntry.update({
      where: { id },
      data: {
        selfRating: data.selfRating,
        selfComments: n(data.selfComments),
        ...(data.kraScore !== undefined && { kraScore: data.kraScore }),
        ...(data.competencyScore !== undefined && { competencyScore: data.competencyScore }),
        status: 'SELF_REVIEW',
      },
      include: {
        employee: {
          select: { id: true, employeeId: true, firstName: true, lastName: true },
        },
      },
    });
  }

  async managerReview(companyId: string, id: string, data: any) {
    const entry = await platformPrisma.appraisalEntry.findUnique({ where: { id } });
    if (!entry || entry.companyId !== companyId) {
      throw ApiError.notFound('Appraisal entry not found');
    }
    if (entry.status !== 'SELF_REVIEW') {
      throw ApiError.badRequest('Manager review is only allowed when status is SELF_REVIEW');
    }

    // Update goal manager ratings if provided
    if (data.goalRatings && Array.isArray(data.goalRatings)) {
      for (const gr of data.goalRatings) {
        await platformPrisma.goal.updateMany({
          where: { id: gr.goalId, companyId, employeeId: entry.employeeId },
          data: { managerRating: gr.managerRating },
        });
      }
    }

    return platformPrisma.appraisalEntry.update({
      where: { id },
      data: {
        managerRating: data.managerRating,
        managerComments: n(data.managerComments),
        ...(data.kraScore !== undefined && { kraScore: data.kraScore }),
        ...(data.competencyScore !== undefined && { competencyScore: data.competencyScore }),
        promotionRecommended: data.promotionRecommended ?? false,
        ...(data.incrementPercent !== undefined && { incrementPercent: data.incrementPercent }),
        status: 'MANAGER_REVIEW',
      },
      include: {
        employee: {
          select: { id: true, employeeId: true, firstName: true, lastName: true },
        },
      },
    });
  }

  async publishEntry(companyId: string, id: string, data: { finalRating: number }) {
    const entry = await platformPrisma.appraisalEntry.findUnique({ where: { id } });
    if (!entry || entry.companyId !== companyId) {
      throw ApiError.notFound('Appraisal entry not found');
    }
    if (entry.status !== 'MANAGER_REVIEW' && entry.status !== 'SKIP_LEVEL' && entry.status !== 'HR_REVIEW') {
      throw ApiError.badRequest('Entry must be in MANAGER_REVIEW, SKIP_LEVEL, or HR_REVIEW status to publish');
    }

    return platformPrisma.appraisalEntry.update({
      where: { id },
      data: {
        finalRating: data.finalRating,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
      include: {
        employee: {
          select: { id: true, employeeId: true, firstName: true, lastName: true },
        },
      },
    });
  }

  async getCalibrationView(companyId: string, cycleId: string, options: ListOptions = {}) {
    const { page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    // Verify cycle
    const cycle = await platformPrisma.appraisalCycle.findUnique({ where: { id: cycleId } });
    if (!cycle || cycle.companyId !== companyId) {
      throw ApiError.notFound('Appraisal cycle not found');
    }

    const ratingScale = cycle.ratingScale;

    // Use groupBy to aggregate rating distribution at DB level (avoids N+1 / memory explosion)
    const [ratingGroups, totalEntries, ratedEntries, totalRated] = await Promise.all([
      platformPrisma.appraisalEntry.groupBy({
        by: ['finalRating'],
        _count: { _all: true },
        where: {
          companyId,
          cycleId,
          OR: [
            { finalRating: { not: null } },
            { managerRating: { not: null } },
          ],
        },
      }),
      platformPrisma.appraisalEntry.count({ where: { companyId, cycleId } }),
      // Paginated entry list for the calibration table
      platformPrisma.appraisalEntry.findMany({
        where: {
          companyId,
          cycleId,
          OR: [
            { finalRating: { not: null } },
            { managerRating: { not: null } },
          ],
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
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.appraisalEntry.count({
        where: {
          companyId,
          cycleId,
          OR: [
            { finalRating: { not: null } },
            { managerRating: { not: null } },
          ],
        },
      }),
    ]);

    // Build distribution from groupBy results
    const distribution: Record<number, number> = {};
    for (let r = 1; r <= ratingScale; r++) {
      distribution[r] = 0;
    }

    for (const group of ratingGroups) {
      if (group.finalRating !== null) {
        const bucket = Math.min(ratingScale, Math.max(1, Math.round(Number(group.finalRating))));
        distribution[bucket] = (distribution[bucket] ?? 0) + group._count._all;
      }
    }

    const distributionPercent: Record<number, number> = {};
    for (const [bucket, count] of Object.entries(distribution)) {
      distributionPercent[Number(bucket)] = totalRated > 0 ? Math.round((count / totalRated) * 100) : 0;
    }

    const entries = ratedEntries.map((entry) => ({
      id: entry.id,
      employee: entry.employee,
      selfRating: entry.selfRating,
      managerRating: entry.managerRating,
      finalRating: entry.finalRating,
      status: entry.status,
    }));

    return {
      cycle: { id: cycle.id, name: cycle.name, ratingScale, bellCurve: cycle.bellCurve },
      totalEntries,
      totalRated,
      distribution,
      distributionPercent,
      entries,
      page,
      limit,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // 360 Feedback
  // ────────────────────────────────────────────────────────────────────

  async listFeedback(companyId: string, cycleId: string, options: FeedbackListOptions = {}) {
    const { page = 1, limit = 25, employeeId } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId, cycleId };
    if (employeeId) where.employeeId = employeeId;

    const [feedback, total] = await Promise.all([
      platformPrisma.feedback360.findMany({
        where,
        include: {
          employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
          rater: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.feedback360.count({ where }),
    ]);

    return { feedback, total, page, limit };
  }

  async getFeedback(companyId: string, id: string) {
    const feedback = await platformPrisma.feedback360.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        rater: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        cycle: { select: { id: true, name: true } },
      },
    });

    if (!feedback || feedback.companyId !== companyId) {
      throw ApiError.notFound('Feedback not found');
    }

    return feedback;
  }

  async createFeedback(companyId: string, data: any) {
    // Validate cycle
    const cycle = await platformPrisma.appraisalCycle.findUnique({ where: { id: data.cycleId } });
    if (!cycle || cycle.companyId !== companyId) {
      throw ApiError.badRequest('Appraisal cycle not found');
    }

    // Validate employee and rater belong to company
    const [employee, rater] = await Promise.all([
      platformPrisma.employee.findUnique({ where: { id: data.employeeId }, select: { id: true, companyId: true } }),
      platformPrisma.employee.findUnique({ where: { id: data.raterId }, select: { id: true, companyId: true } }),
    ]);
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.badRequest('Employee (subject) not found in this company');
    }
    if (!rater || rater.companyId !== companyId) {
      throw ApiError.badRequest('Rater not found in this company');
    }

    // Check uniqueness
    const existing = await platformPrisma.feedback360.findUnique({
      where: { cycleId_employeeId_raterId: { cycleId: data.cycleId, employeeId: data.employeeId, raterId: data.raterId } },
    });
    if (existing) {
      throw ApiError.conflict('Feedback from this rater for this employee in this cycle already exists');
    }

    return platformPrisma.feedback360.create({
      data: {
        companyId,
        cycleId: data.cycleId,
        employeeId: data.employeeId,
        raterId: data.raterId,
        raterType: data.raterType,
        ratings: data.ratings,
        strengths: n(data.strengths),
        improvements: n(data.improvements),
        wouldWorkAgain: n(data.wouldWorkAgain),
        isAnonymous: data.isAnonymous ?? true,
      },
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        rater: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
      },
    });
  }

  async updateFeedback(companyId: string, id: string, data: any) {
    const feedback = await platformPrisma.feedback360.findUnique({ where: { id } });
    if (!feedback || feedback.companyId !== companyId) {
      throw ApiError.notFound('Feedback not found');
    }
    if (feedback.submittedAt) {
      throw ApiError.badRequest('Cannot update already submitted feedback');
    }

    return platformPrisma.feedback360.update({
      where: { id },
      data: {
        ...(data.ratings !== undefined && { ratings: data.ratings }),
        ...(data.strengths !== undefined && { strengths: n(data.strengths) }),
        ...(data.improvements !== undefined && { improvements: n(data.improvements) }),
        ...(data.wouldWorkAgain !== undefined && { wouldWorkAgain: n(data.wouldWorkAgain) }),
      },
    });
  }

  async deleteFeedback(companyId: string, id: string) {
    const feedback = await platformPrisma.feedback360.findUnique({ where: { id } });
    if (!feedback || feedback.companyId !== companyId) {
      throw ApiError.notFound('Feedback not found');
    }
    if (feedback.submittedAt) {
      throw ApiError.badRequest('Cannot delete already submitted feedback');
    }

    await platformPrisma.feedback360.delete({ where: { id } });
    return { message: 'Feedback deleted' };
  }

  async submitFeedback(companyId: string, id: string) {
    const feedback = await platformPrisma.feedback360.findUnique({ where: { id } });
    if (!feedback || feedback.companyId !== companyId) {
      throw ApiError.notFound('Feedback not found');
    }
    if (feedback.submittedAt) {
      throw ApiError.badRequest('Feedback already submitted');
    }

    return platformPrisma.feedback360.update({
      where: { id },
      data: { submittedAt: new Date() },
    });
  }

  async getAggregatedFeedbackReport(companyId: string, employeeId: string, cycleId: string) {
    const feedbacks = await platformPrisma.feedback360.findMany({
      where: { companyId, employeeId, cycleId, submittedAt: { not: null } },
    });

    if (feedbacks.length === 0) {
      return { employeeId, cycleId, totalResponses: 0, dimensions: {}, verbatims: [] };
    }

    // Group by raterType
    const byRaterType: Record<string, typeof feedbacks> = {};
    for (const fb of feedbacks) {
      const type = fb.raterType;
      if (!byRaterType[type]) byRaterType[type] = [];
      byRaterType[type]!.push(fb);
    }

    // Aggregate ratings per dimension per rater type
    // Anonymity rule: suppress dimension results if fewer than 3 responses from a rater type
    const MIN_RESPONSES_FOR_ANONYMITY = 3;
    const dimensionAggregates: Record<string, { sum: number; count: number; byRaterType: Record<string, { avg: number; count: number }> }> = {};

    for (const [raterType, fbs] of Object.entries(byRaterType)) {
      const shouldSuppress = raterType !== 'SELF' && raterType !== 'MANAGER' && fbs.length < MIN_RESPONSES_FOR_ANONYMITY;

      for (const fb of fbs) {
        const ratings = fb.ratings as Record<string, number>;
        if (!ratings || typeof ratings !== 'object') continue;

        for (const [dimension, score] of Object.entries(ratings)) {
          if (!dimensionAggregates[dimension]) {
            dimensionAggregates[dimension] = { sum: 0, count: 0, byRaterType: {} };
          }
          const agg = dimensionAggregates[dimension]!;

          if (!shouldSuppress) {
            agg.sum += Number(score);
            agg.count += 1;

            if (!agg.byRaterType[raterType]) {
              agg.byRaterType[raterType] = { avg: 0, count: 0 };
            }
            const raterAgg = agg.byRaterType[raterType]!;
            raterAgg.avg = ((raterAgg.avg * raterAgg.count) + Number(score)) / (raterAgg.count + 1);
            raterAgg.count += 1;
          }
        }
      }
    }

    const dimensions: Record<string, { average: number; count: number; byRaterType: Record<string, { avg: number; count: number }> }> = {};
    for (const [dim, agg] of Object.entries(dimensionAggregates)) {
      dimensions[dim] = {
        average: agg.count > 0 ? Math.round((agg.sum / agg.count) * 100) / 100 : 0,
        count: agg.count,
        byRaterType: agg.byRaterType,
      };
    }

    // Anonymized verbatims: suppress if fewer than 3 responses from a rater type (non-self/manager)
    const verbatims: { raterType: string; strengths: string | null; improvements: string | null }[] = [];
    for (const [raterType, fbs] of Object.entries(byRaterType)) {
      const isIdentifiable = raterType === 'SELF' || raterType === 'MANAGER';
      const shouldSuppress = !isIdentifiable && fbs.length < MIN_RESPONSES_FOR_ANONYMITY;

      if (!shouldSuppress) {
        for (const fb of fbs) {
          if (fb.strengths || fb.improvements) {
            verbatims.push({
              raterType,
              strengths: fb.strengths,
              improvements: fb.improvements,
            });
          }
        }
      }
    }

    return {
      employeeId,
      cycleId,
      totalResponses: feedbacks.length,
      responsesByType: Object.fromEntries(
        Object.entries(byRaterType).map(([type, fbs]) => [type, fbs.length])
      ),
      dimensions,
      verbatims,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Skill Library
  // ────────────────────────────────────────────────────────────────────

  async listSkills(companyId: string, options: ListOptions = {}) {
    const { page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    const where = { companyId };

    const [skills, total] = await Promise.all([
      platformPrisma.skillLibrary.findMany({
        where,
        include: { _count: { select: { mappings: true } } },
        skip: offset,
        take: limit,
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
      platformPrisma.skillLibrary.count({ where }),
    ]);

    return { skills, total, page, limit };
  }

  async getSkill(companyId: string, id: string) {
    const skill = await platformPrisma.skillLibrary.findUnique({
      where: { id },
      include: { _count: { select: { mappings: true } } },
    });

    if (!skill || skill.companyId !== companyId) {
      throw ApiError.notFound('Skill not found');
    }

    return skill;
  }

  async createSkill(companyId: string, data: any) {
    // Check uniqueness
    const existing = await platformPrisma.skillLibrary.findUnique({
      where: { companyId_name: { companyId, name: data.name } },
    });
    if (existing) {
      throw ApiError.conflict(`Skill "${data.name}" already exists`);
    }

    return platformPrisma.skillLibrary.create({
      data: {
        companyId,
        name: data.name,
        category: data.category,
        description: n(data.description),
      },
    });
  }

  async updateSkill(companyId: string, id: string, data: any) {
    const skill = await platformPrisma.skillLibrary.findUnique({ where: { id } });
    if (!skill || skill.companyId !== companyId) {
      throw ApiError.notFound('Skill not found');
    }

    // If renaming, check uniqueness
    if (data.name && data.name !== skill.name) {
      const existing = await platformPrisma.skillLibrary.findUnique({
        where: { companyId_name: { companyId, name: data.name } },
      });
      if (existing) {
        throw ApiError.conflict(`Skill "${data.name}" already exists`);
      }
    }

    return platformPrisma.skillLibrary.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.description !== undefined && { description: n(data.description) }),
      },
    });
  }

  async deleteSkill(companyId: string, id: string) {
    const skill = await platformPrisma.skillLibrary.findUnique({
      where: { id },
      include: { _count: { select: { mappings: true } } },
    });
    if (!skill || skill.companyId !== companyId) {
      throw ApiError.notFound('Skill not found');
    }

    // Cascade delete will remove mappings
    await platformPrisma.skillLibrary.delete({ where: { id } });
    return { message: 'Skill deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Skill Mappings
  // ────────────────────────────────────────────────────────────────────

  async listSkillMappings(companyId: string, options: SkillMappingListOptions = {}) {
    const { page = 1, limit = 50, employeeId, category } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (employeeId) where.employeeId = employeeId;
    if (category) where.skill = { category };

    const [mappings, total] = await Promise.all([
      platformPrisma.skillMapping.findMany({
        where,
        include: {
          employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
          skill: { select: { id: true, name: true, category: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.skillMapping.count({ where }),
    ]);

    return { mappings, total, page, limit };
  }

  async getSkillMapping(companyId: string, id: string) {
    const mapping = await platformPrisma.skillMapping.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        skill: { select: { id: true, name: true, category: true, description: true } },
      },
    });

    if (!mapping || mapping.companyId !== companyId) {
      throw ApiError.notFound('Skill mapping not found');
    }

    return mapping;
  }

  async createSkillMapping(companyId: string, data: any) {
    // Validate employee
    const employee = await platformPrisma.employee.findUnique({ where: { id: data.employeeId } });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.badRequest('Employee not found in this company');
    }

    // Validate skill
    const skill = await platformPrisma.skillLibrary.findUnique({ where: { id: data.skillId } });
    if (!skill || skill.companyId !== companyId) {
      throw ApiError.badRequest('Skill not found in this company');
    }

    // Check uniqueness
    const existing = await platformPrisma.skillMapping.findUnique({
      where: { employeeId_skillId: { employeeId: data.employeeId, skillId: data.skillId } },
    });
    if (existing) {
      throw ApiError.conflict('Skill mapping for this employee already exists');
    }

    return platformPrisma.skillMapping.create({
      data: {
        companyId,
        employeeId: data.employeeId,
        skillId: data.skillId,
        currentLevel: data.currentLevel ?? 1,
        requiredLevel: data.requiredLevel ?? 3,
        assessedAt: new Date(),
        assessedBy: n(data.assessedBy),
      },
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        skill: { select: { id: true, name: true, category: true } },
      },
    });
  }

  async updateSkillMapping(companyId: string, id: string, data: any) {
    const mapping = await platformPrisma.skillMapping.findUnique({ where: { id } });
    if (!mapping || mapping.companyId !== companyId) {
      throw ApiError.notFound('Skill mapping not found');
    }

    const updated = await platformPrisma.skillMapping.update({
      where: { id },
      data: {
        ...(data.currentLevel !== undefined && { currentLevel: data.currentLevel }),
        ...(data.requiredLevel !== undefined && { requiredLevel: data.requiredLevel }),
        ...(data.assessedBy !== undefined && { assessedBy: n(data.assessedBy) }),
        assessedAt: new Date(),
      },
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        skill: { select: { id: true, name: true, category: true } },
      },
    });

    // Auto-nominate training if skill gap detected
    const newLevel = data.currentLevel ?? mapping.currentLevel;
    await this.checkAndAutoNominateTraining(companyId, mapping.employeeId, mapping.skillId, newLevel);

    return updated;
  }

  async checkAndAutoNominateTraining(companyId: string, employeeId: string, skillId: string, currentLevel: number) {
    // 1. Find the skill mapping for this employee + skill
    const mapping = await platformPrisma.skillMapping.findFirst({
      where: { employeeId, skillId },
    });
    if (!mapping) return null;

    const requiredLevel = (mapping as any).requiredLevel ?? 3;
    if (currentLevel >= requiredLevel) return null; // No gap

    // 2. Find training linked to this skill
    // TrainingCatalogue has linkedSkills (Json array of skill IDs)
    const trainings = await platformPrisma.trainingCatalogue.findMany({
      where: { companyId, isActive: true },
    });

    const matchingTraining = trainings.find(t => {
      const linked = t.linkedSkillIds as string[];
      return Array.isArray(linked) && linked.includes(skillId);
    });

    if (!matchingTraining) return null;

    // 3. Check if already nominated
    const existing = await platformPrisma.trainingNomination.findFirst({
      where: {
        employeeId,
        trainingId: matchingTraining.id,
        status: { in: ['NOMINATED', 'ENROLLED'] },
      },
    });
    if (existing) return null;

    // 4. Auto-create nomination
    return platformPrisma.trainingNomination.create({
      data: {
        companyId,
        employeeId,
        trainingId: matchingTraining.id,
        status: 'NOMINATED',
      },
    });
  }

  async deleteSkillMapping(companyId: string, id: string) {
    const mapping = await platformPrisma.skillMapping.findUnique({ where: { id } });
    if (!mapping || mapping.companyId !== companyId) {
      throw ApiError.notFound('Skill mapping not found');
    }

    await platformPrisma.skillMapping.delete({ where: { id } });
    return { message: 'Skill mapping deleted' };
  }

  async getGapAnalysis(companyId: string, employeeId: string) {
    const mappings = await platformPrisma.skillMapping.findMany({
      where: { companyId, employeeId },
      include: {
        skill: { select: { id: true, name: true, category: true } },
      },
      orderBy: { skill: { category: 'asc' } },
    });

    const gaps = mappings
      .filter((m) => m.currentLevel < m.requiredLevel)
      .map((m) => ({
        skillId: m.skillId,
        skillName: m.skill.name,
        category: m.skill.category,
        currentLevel: m.currentLevel,
        requiredLevel: m.requiredLevel,
        gap: m.requiredLevel - m.currentLevel,
      }));

    const metOrExceeded = mappings
      .filter((m) => m.currentLevel >= m.requiredLevel)
      .map((m) => ({
        skillId: m.skillId,
        skillName: m.skill.name,
        category: m.skill.category,
        currentLevel: m.currentLevel,
        requiredLevel: m.requiredLevel,
        surplus: m.currentLevel - m.requiredLevel,
      }));

    return {
      employeeId,
      totalSkills: mappings.length,
      totalGaps: gaps.length,
      totalMet: metOrExceeded.length,
      gaps,
      metOrExceeded,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Succession Planning
  // ────────────────────────────────────────────────────────────────────

  async listSuccessionPlans(companyId: string, options: SuccessionListOptions = {}) {
    const { page = 1, limit = 25, readiness } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (readiness) where.readiness = readiness;

    const [plans, total] = await Promise.all([
      platformPrisma.successionPlan.findMany({
        where,
        include: {
          successor: {
            select: {
              id: true,
              employeeId: true,
              firstName: true,
              lastName: true,
              department: { select: { id: true, name: true } },
              designation: { select: { id: true, name: true } },
            },
          },
          criticalRoleDesignation: { select: { id: true, name: true, code: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { criticalRoleTitle: 'asc' },
      }),
      platformPrisma.successionPlan.count({ where }),
    ]);

    return { plans, total, page, limit };
  }

  async getSuccessionPlan(companyId: string, id: string) {
    const plan = await platformPrisma.successionPlan.findUnique({
      where: { id },
      include: {
        successor: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            department: { select: { id: true, name: true } },
            designation: { select: { id: true, name: true } },
          },
        },
        criticalRoleDesignation: { select: { id: true, name: true, code: true } },
      },
    });

    if (!plan || plan.companyId !== companyId) {
      throw ApiError.notFound('Succession plan not found');
    }

    return plan;
  }

  async createSuccessionPlan(companyId: string, data: any) {
    // Validate successor
    const successor = await platformPrisma.employee.findUnique({ where: { id: data.successorId } });
    if (!successor || successor.companyId !== companyId) {
      throw ApiError.badRequest('Successor employee not found in this company');
    }

    // Validate designation if provided
    if (data.criticalRoleDesignationId) {
      const designation = await platformPrisma.designation.findUnique({ where: { id: data.criticalRoleDesignationId } });
      if (!designation || designation.companyId !== companyId) {
        throw ApiError.badRequest('Designation not found in this company');
      }
    }

    return platformPrisma.successionPlan.create({
      data: {
        companyId,
        criticalRoleTitle: data.criticalRoleTitle,
        criticalRoleDesignationId: n(data.criticalRoleDesignationId),
        successorId: data.successorId,
        readiness: data.readiness ?? 'NOT_READY',
        developmentPlan: n(data.developmentPlan),
        performanceRating: n(data.performanceRating),
        potentialRating: n(data.potentialRating),
        nineBoxPosition: data.performanceRating && data.potentialRating
          ? classifyNineBox(Number(data.performanceRating), Number(data.potentialRating))
          : n(data.nineBoxPosition),
      },
      include: {
        successor: {
          select: { id: true, employeeId: true, firstName: true, lastName: true },
        },
        criticalRoleDesignation: { select: { id: true, name: true } },
      },
    });
  }

  async updateSuccessionPlan(companyId: string, id: string, data: any) {
    const plan = await platformPrisma.successionPlan.findUnique({ where: { id } });
    if (!plan || plan.companyId !== companyId) {
      throw ApiError.notFound('Succession plan not found');
    }

    // Auto-compute nineBoxPosition if ratings change
    const perfRating = data.performanceRating !== undefined ? data.performanceRating : plan.performanceRating;
    const potRating = data.potentialRating !== undefined ? data.potentialRating : plan.potentialRating;
    let nineBoxPosition = data.nineBoxPosition;
    if ((data.performanceRating !== undefined || data.potentialRating !== undefined) && perfRating && potRating) {
      nineBoxPosition = classifyNineBox(Number(perfRating), Number(potRating));
    }

    return platformPrisma.successionPlan.update({
      where: { id },
      data: {
        ...(data.criticalRoleTitle !== undefined && { criticalRoleTitle: data.criticalRoleTitle }),
        ...(data.criticalRoleDesignationId !== undefined && { criticalRoleDesignationId: n(data.criticalRoleDesignationId) }),
        ...(data.readiness !== undefined && { readiness: data.readiness }),
        ...(data.developmentPlan !== undefined && { developmentPlan: n(data.developmentPlan) }),
        ...(data.performanceRating !== undefined && { performanceRating: n(data.performanceRating) }),
        ...(data.potentialRating !== undefined && { potentialRating: n(data.potentialRating) }),
        ...(nineBoxPosition !== undefined && { nineBoxPosition: n(nineBoxPosition) }),
      },
      include: {
        successor: {
          select: { id: true, employeeId: true, firstName: true, lastName: true },
        },
        criticalRoleDesignation: { select: { id: true, name: true } },
      },
    });
  }

  async deleteSuccessionPlan(companyId: string, id: string) {
    const plan = await platformPrisma.successionPlan.findUnique({ where: { id } });
    if (!plan || plan.companyId !== companyId) {
      throw ApiError.notFound('Succession plan not found');
    }

    await platformPrisma.successionPlan.delete({ where: { id } });
    return { message: 'Succession plan deleted' };
  }

  async getNineBox(companyId: string) {
    const plans = await platformPrisma.successionPlan.findMany({
      where: {
        companyId,
        performanceRating: { not: null },
        potentialRating: { not: null },
      },
      include: {
        successor: {
          select: { id: true, employeeId: true, firstName: true, lastName: true },
        },
      },
    });

    // Group by grid position
    const grid: Record<string, any[]> = {};
    for (const label of Object.keys(NINE_BOX_POSITIONS)) {
      grid[label] = [];
    }

    for (const plan of plans) {
      const position = classifyNineBox(Number(plan.performanceRating), Number(plan.potentialRating));
      if (!grid[position]) grid[position] = [];
      grid[position]!.push({
        id: plan.id,
        successor: plan.successor,
        criticalRoleTitle: plan.criticalRoleTitle,
        readiness: plan.readiness,
        performanceRating: plan.performanceRating,
        potentialRating: plan.potentialRating,
      });
    }

    return {
      totalPlans: plans.length,
      grid,
    };
  }

  async getBenchStrength(companyId: string) {
    // Get all critical roles (unique by designation)
    const plans = await platformPrisma.successionPlan.findMany({
      where: { companyId },
      include: {
        criticalRoleDesignation: { select: { id: true, name: true } },
        successor: {
          select: { id: true, employeeId: true, firstName: true, lastName: true },
        },
      },
    });

    // Group by criticalRoleTitle
    const roleMap: Record<string, {
      title: string;
      designationId: string | null;
      designationName: string | null;
      successors: { id: string; readiness: string; successorName: string }[];
    }> = {};

    for (const plan of plans) {
      const key = plan.criticalRoleTitle;
      if (!roleMap[key]) {
        roleMap[key] = {
          title: plan.criticalRoleTitle,
          designationId: plan.criticalRoleDesignationId,
          designationName: plan.criticalRoleDesignation?.name ?? null,
          successors: [],
        };
      }
      roleMap[key]!.successors.push({
        id: plan.id,
        readiness: plan.readiness,
        successorName: `${plan.successor.firstName} ${plan.successor.lastName}`,
      });
    }

    const roles = Object.values(roleMap);
    const rolesWithReadySuccessors = roles.filter(
      (r) => r.successors.some((s) => s.readiness === 'READY_NOW')
    );
    const rolesWithOneYearSuccessors = roles.filter(
      (r) => r.successors.some((s) => s.readiness === 'READY_NOW' || s.readiness === 'ONE_YEAR')
    );

    return {
      totalCriticalRoles: roles.length,
      rolesWithReadyNow: rolesWithReadySuccessors.length,
      rolesWithinOneYear: rolesWithOneYearSuccessors.length,
      rolesWithoutReady: roles.length - rolesWithReadySuccessors.length,
      coveragePercent: roles.length > 0
        ? Math.round((rolesWithReadySuccessors.length / roles.length) * 100)
        : 0,
      roles,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Dashboard
  // ────────────────────────────────────────────────────────────────────

  async getPerformanceDashboard(companyId: string) {
    // Active cycle
    const activeCycle = await platformPrisma.appraisalCycle.findFirst({
      where: { companyId, status: { in: ['ACTIVE', 'REVIEW', 'CALIBRATION'] } },
      orderBy: { startDate: 'desc' },
    });

    let cycleStats = null;
    if (activeCycle) {
      const entries = await platformPrisma.appraisalEntry.findMany({
        where: { companyId, cycleId: activeCycle.id },
        select: { status: true, finalRating: true, managerRating: true },
      });

      const totalEntries = entries.length;
      const selfReviewDone = entries.filter((e) => e.status !== 'PENDING').length;
      const managerReviewDone = entries.filter(
        (e) => ['MANAGER_REVIEW', 'SKIP_LEVEL', 'HR_REVIEW', 'PUBLISHED'].includes(e.status)
      ).length;
      const published = entries.filter((e) => e.status === 'PUBLISHED').length;

      // Rating distribution for entries that have a final or manager rating
      const ratingScale = activeCycle.ratingScale;
      const distribution: Record<number, number> = {};
      for (let r = 1; r <= ratingScale; r++) distribution[r] = 0;

      for (const entry of entries) {
        const rating = entry.finalRating ?? entry.managerRating;
        if (rating !== null && rating !== undefined) {
          const bucket = Math.min(ratingScale, Math.max(1, Math.round(Number(rating))));
          distribution[bucket] = (distribution[bucket] ?? 0) + 1;
        }
      }

      // Top performers (published, highest rating, top 5)
      const topPerformers = await platformPrisma.appraisalEntry.findMany({
        where: { companyId, cycleId: activeCycle.id, status: 'PUBLISHED', finalRating: { not: null } },
        include: {
          employee: {
            select: { id: true, employeeId: true, firstName: true, lastName: true, department: { select: { name: true } } },
          },
        },
        orderBy: { finalRating: 'desc' },
        take: 5,
      });

      // Pending reviews count
      const pendingSelfReview = entries.filter((e) => e.status === 'PENDING').length;
      const pendingManagerReview = entries.filter((e) => e.status === 'SELF_REVIEW').length;

      cycleStats = {
        cycle: { id: activeCycle.id, name: activeCycle.name, status: activeCycle.status, startDate: activeCycle.startDate, endDate: activeCycle.endDate },
        totalEntries,
        completionPercent: totalEntries > 0 ? Math.round((published / totalEntries) * 100) : 0,
        selfReviewPercent: totalEntries > 0 ? Math.round((selfReviewDone / totalEntries) * 100) : 0,
        managerReviewPercent: totalEntries > 0 ? Math.round((managerReviewDone / totalEntries) * 100) : 0,
        pendingSelfReview,
        pendingManagerReview,
        ratingDistribution: distribution,
        topPerformers: topPerformers.map((tp) => ({
          employee: tp.employee,
          finalRating: tp.finalRating,
          promotionRecommended: tp.promotionRecommended,
        })),
      };
    }

    // Goal stats
    const [totalGoals, activeGoals, completedGoals] = await Promise.all([
      platformPrisma.goal.count({ where: { companyId } }),
      platformPrisma.goal.count({ where: { companyId, status: 'ACTIVE' } }),
      platformPrisma.goal.count({ where: { companyId, status: 'COMPLETED' } }),
    ]);

    // Skill gap summary
    const skillMappings = await platformPrisma.skillMapping.findMany({
      where: { companyId },
      select: { currentLevel: true, requiredLevel: true },
    });
    const totalGaps = skillMappings.filter((m) => m.currentLevel < m.requiredLevel).length;

    // Succession summary
    const successionPlans = await platformPrisma.successionPlan.count({ where: { companyId } });
    const readyNow = await platformPrisma.successionPlan.count({
      where: { companyId, readiness: 'READY_NOW' },
    });

    return {
      cycleStats,
      goals: { total: totalGoals, active: activeGoals, completed: completedGoals },
      skills: { totalMappings: skillMappings.length, totalGaps },
      succession: { totalPlans: successionPlans, readyNow },
    };
  }
}

export const performanceService = new PerformanceService();
