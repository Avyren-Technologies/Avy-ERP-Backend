import { Prisma } from '@prisma/client';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { auditLog } from '../../../shared/utils/audit';
import { logger } from '../../../config/logger';
import { calculateIncentive, PartEntry } from './pip-calculation';
import {
  CreateSlabConfigInput,
  BulkCreateSlabConfigInput,
  UpdateSlabConfigInput,
  SaveDailyEntriesInput,
  SimulateIncentiveInput,
  UpdateIncentiveConfigInput,
  GenerateMonthlyReportInput,
} from './pip.validators';
import {
  SlabConfigListFilters,
  SlabConfigListResult,
  DailyEntryListFilters,
  DailyEntryListResult,
  MonthlyReportListFilters,
  MonthlyReportListResult,
} from './pip.types';

/** Round to 2 decimal places */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export class PipService {
  // ════════════════════════════════════════════════════════════════════
  // Incentive Config (singleton per company)
  // ════════════════════════════════════════════════════════════════════

  async getIncentiveConfig(companyId: string) {
    let config = await platformPrisma.pipIncentiveConfig.findUnique({
      where: { companyId },
    });

    if (!config) {
      config = await platformPrisma.pipIncentiveConfig.create({
        data: {
          companyId,
          method1Enabled: false,
          method1Name: 'Excess Ratio Incentive',
          method2Enabled: false,
          method2Name: 'Milestone Rounding Incentive',
        },
      });
    }

    return config;
  }

  async updateIncentiveConfig(companyId: string, data: UpdateIncentiveConfigInput, userId: string) {
    const existing = await this.getIncentiveConfig(companyId);

    // Enforce mutual exclusion: if enabling one method, disable the other
    const updateData: Record<string, any> = {};

    if (data.method1Enabled !== undefined) updateData.method1Enabled = data.method1Enabled;
    if (data.method1Name !== undefined) updateData.method1Name = data.method1Name;
    if (data.method2Enabled !== undefined) updateData.method2Enabled = data.method2Enabled;
    if (data.method2Name !== undefined) updateData.method2Name = data.method2Name;

    // Mutual exclusion logic
    if (data.method1Enabled === true && data.method2Enabled !== true) {
      updateData.method2Enabled = false;
    }
    if (data.method2Enabled === true && data.method1Enabled !== true) {
      updateData.method1Enabled = false;
    }
    if (data.method1Enabled === true && data.method2Enabled === true) {
      throw ApiError.badRequest('Only one incentive method can be enabled at a time');
    }

    const config = await platformPrisma.pipIncentiveConfig.update({
      where: { companyId },
      data: updateData,
    });

    auditLog({
      entityType: 'PipIncentiveConfig',
      entityId: config.id,
      action: 'UPDATE',
      before: existing as any,
      after: config as any,
      changedBy: userId,
      companyId,
    });

    return config;
  }

  // ════════════════════════════════════════════════════════════════════
  // Slab Config CRUD
  // ════════════════════════════════════════════════════════════════════

  async listSlabConfigs(companyId: string, filters: SlabConfigListFilters): Promise<SlabConfigListResult> {
    const { page = 1, limit = 25, search, machineId, partId, locationId, isActive } = filters;
    const offset = (page - 1) * limit;

    const where: any = { companyId };

    if (machineId) where.machineId = machineId;
    if (partId) where.partId = partId;
    if (locationId) where.locationId = locationId;
    if (isActive !== undefined) where.isActive = isActive;

    if (search) {
      where.OR = [
        { machine: { machineCode: { contains: search, mode: 'insensitive' } } },
        { machine: { assetName: { contains: search, mode: 'insensitive' } } },
        { part: { partNumber: { contains: search, mode: 'insensitive' } } },
        { part: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [configs, total] = await Promise.all([
      platformPrisma.pipSlabConfig.findMany({
        where,
        include: {
          machine: { select: { id: true, assetCode: true, machineCode: true, assetName: true } },
          part: { select: { id: true, partNumber: true, name: true } },
          location: { select: { id: true, name: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.pipSlabConfig.count({ where }),
    ]);

    return { configs, total, page, limit };
  }

  async getSlabConfig(companyId: string, id: string) {
    const config = await platformPrisma.pipSlabConfig.findUnique({
      where: { id },
      include: {
        machine: { select: { id: true, assetCode: true, machineCode: true, assetName: true } },
        part: { select: { id: true, partNumber: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    });

    if (!config || config.companyId !== companyId) {
      throw ApiError.notFound('Slab config not found');
    }

    return config;
  }

  async createSlabConfig(companyId: string, data: CreateSlabConfigInput, userId: string) {
    // Validate uniqueness of machine + operation + part combo
    const existing = await platformPrisma.pipSlabConfig.findFirst({
      where: { companyId, machineId: data.machineId, operationId: (data as any).operationId ?? undefined, partId: data.partId },
    });
    if (existing) {
      throw ApiError.conflict('A slab config already exists for this machine + operation + part combination');
    }

    // Validate machine exists
    const machine = await platformPrisma.machine.findUnique({ where: { id: data.machineId } });
    if (!machine || machine.companyId !== companyId) {
      throw ApiError.notFound('Machine not found');
    }

    // Validate part exists
    const part = await platformPrisma.part.findUnique({ where: { id: data.partId } });
    if (!part || part.companyId !== companyId) {
      throw ApiError.notFound('Part not found');
    }

    const createData: Record<string, any> = {
      companyId,
      machineId: data.machineId,
      partId: data.partId,
      shiftTargetQty: data.shiftTargetQty,
      slabTiers: data.slabTiers as any,
    };
    if (data.locationId !== undefined) createData.locationId = data.locationId;

    const config = await platformPrisma.pipSlabConfig.create({
      data: createData as any,
      include: {
        machine: { select: { id: true, assetCode: true, machineCode: true, assetName: true } },
        part: { select: { id: true, partNumber: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    });

    auditLog({
      entityType: 'PipSlabConfig',
      entityId: config.id,
      action: 'CREATE',
      after: config as any,
      changedBy: userId,
      companyId,
    });

    return config;
  }

  async bulkCreateSlabConfigs(companyId: string, data: BulkCreateSlabConfigInput, userId: string) {
    let createdCount = 0;
    const skippedItems: { machineCode: string; partNumber: string; reason: string }[] = [];

    for (const machineId of data.machineIds) {
      // Validate machine exists
      const machine = await platformPrisma.machine.findUnique({ where: { id: machineId } });
      if (!machine || machine.companyId !== companyId) {
        skippedItems.push({ machineCode: machineId, partNumber: '', reason: 'Machine not found' });
        continue;
      }

      for (const config of data.configs) {
        // Fetch and validate part first — skip if not found or wrong company
        const part = await platformPrisma.part.findUnique({
          where: { id: config.partId },
          select: { partNumber: true, companyId: true },
        });

        if (!part || part.companyId !== companyId) {
          skippedItems.push({ machineCode: machine.assetCode ?? machineId, partNumber: config.partId, reason: 'Part not found' });
          continue;
        }

        // Check uniqueness — skip duplicates
        const existing = await platformPrisma.pipSlabConfig.findFirst({
          where: { companyId, machineId, partId: config.partId },
        });
        if (existing) {
          skippedItems.push({
            machineCode: machine.assetCode ?? machineId,
            partNumber: part.partNumber ?? config.partId,
            reason: 'Already exists',
          });
          continue;
        }

        const createData: Record<string, any> = {
          companyId,
          machineId,
          partId: config.partId,
          shiftTargetQty: config.shiftTargetQty,
          slabTiers: config.slabTiers as any,
        };
        if (data.locationId !== undefined) createData.locationId = data.locationId;

        await platformPrisma.pipSlabConfig.create({ data: createData as any });
        createdCount++;
      }
    }

    auditLog({
      entityType: 'PipSlabConfig',
      entityId: 'bulk',
      action: 'CREATE',
      after: { createdCount, skipped: skippedItems } as any,
      changedBy: userId,
      companyId,
    });

    return { createdCount, skippedCount: skippedItems.length, skipped: skippedItems };
  }

  async updateSlabConfig(companyId: string, id: string, data: UpdateSlabConfigInput, userId: string) {
    const existing = await platformPrisma.pipSlabConfig.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Slab config not found');
    }

    const updateData: Record<string, any> = {};
    if (data.shiftTargetQty !== undefined) updateData.shiftTargetQty = data.shiftTargetQty;
    if (data.slabTiers !== undefined) updateData.slabTiers = data.slabTiers as any;
    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
      updateData.status = data.isActive ? 'ACTIVE' : 'INACTIVE';
    }

    const config = await platformPrisma.pipSlabConfig.update({
      where: { id },
      data: updateData,
      include: {
        machine: { select: { id: true, assetCode: true, machineCode: true, assetName: true } },
        part: { select: { id: true, partNumber: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    });

    auditLog({
      entityType: 'PipSlabConfig',
      entityId: config.id,
      action: 'UPDATE',
      before: existing as any,
      after: config as any,
      changedBy: userId,
      companyId,
    });

    return config;
  }

  async deleteSlabConfig(companyId: string, id: string, userId: string) {
    const existing = await platformPrisma.pipSlabConfig.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Slab config not found');
    }

    // Check if referenced by daily entries
    const entryCount = await platformPrisma.pipDailyEntry.count({
      where: { slabConfigId: id },
    });
    if (entryCount > 0) {
      throw ApiError.badRequest(
        `Cannot delete slab config — it is referenced by ${entryCount} daily entry(ies)`,
      );
    }

    await platformPrisma.pipSlabConfig.delete({ where: { id } });

    auditLog({
      entityType: 'PipSlabConfig',
      entityId: id,
      action: 'DELETE',
      before: existing as any,
      changedBy: userId,
      companyId,
    });

    return { id };
  }

  // ════════════════════════════════════════════════════════════════════
  // Daily Entry
  // ════════════════════════════════════════════════════════════════════

  async saveDailyEntries(companyId: string, data: SaveDailyEntriesInput, userId: string) {
    // Validate operator (employee) exists and belongs to company
    const operator = await platformPrisma.employee.findUnique({
      where: { id: data.operatorId },
      select: { id: true, companyId: true, firstName: true, lastName: true, employeeId: true },
    });
    if (!operator || operator.companyId !== companyId) {
      throw ApiError.notFound('Operator (employee) not found');
    }

    // Validate shift exists
    const shift = await platformPrisma.companyShift.findUnique({
      where: { id: data.shiftId },
      select: { id: true, companyId: true, name: true },
    });
    if (!shift || shift.companyId !== companyId) {
      throw ApiError.notFound('Shift not found');
    }

    // Check for existing entries for this operator on this date+shift (PRD 17.3)
    const existingEntries = await platformPrisma.pipDailyEntry.findMany({
      where: {
        companyId,
        operatorId: data.operatorId,
        entryDate: new Date(data.entryDate + 'T00:00:00.000Z'),
        shiftId: data.shiftId,
      },
      select: { id: true, sessionRef: true, machineId: true, partId: true },
    });

    if (existingEntries.length > 0) {
      throw ApiError.conflict(
        `Operator already has ${existingEntries.length} entries for this date and shift. Delete existing entries first or choose a different shift.`
      );
    }

    // Get active incentive config
    const incentiveConfig = await this.getIncentiveConfig(companyId);
    const activeMethodNumber: 1 | 2 | null = incentiveConfig.method1Enabled
      ? 1
      : incentiveConfig.method2Enabled
        ? 2
        : null;
    const activeMethodName = activeMethodNumber === 1
      ? incentiveConfig.method1Name
      : activeMethodNumber === 2
        ? incentiveConfig.method2Name
        : null;

    // Build PartEntry array for calculation engine
    const partEntries: PartEntry[] = [];
    const entryDataList: Array<{
      machineId: string;
      partId: string;
      slabConfigId: string | null;
      qtyProduced: number;
      shiftTargetQty: number;
      ncCount: number;
      ncReason: string | null;
      machineCode: string;
      partNumber: string;
      partName: string;
      slabTiers: any[];
    }> = [];

    for (const entry of data.entries) {
      // Look up slab config for machine + part combo
      let slabConfig: any = null;
      if (entry.slabConfigId) {
        slabConfig = await platformPrisma.pipSlabConfig.findUnique({
          where: { id: entry.slabConfigId },
          include: {
            machine: { select: { assetCode: true, machineCode: true, assetName: true } },
            part: { select: { partNumber: true, name: true } },
          },
        });
      }
      if (!slabConfig) {
        slabConfig = await platformPrisma.pipSlabConfig.findFirst({
          where: { companyId, machineId: entry.machineId, partId: entry.partId },
          include: {
            machine: { select: { assetCode: true, machineCode: true, assetName: true } },
            part: { select: { partNumber: true, name: true } },
          },
        });
      }

      if (!slabConfig) {
        // Fetch machine and part info for the entry even without slab config
        const machine = await platformPrisma.machine.findUnique({
          where: { id: entry.machineId },
          select: { machineCode: true, assetName: true },
        });
        const part = await platformPrisma.part.findUnique({
          where: { id: entry.partId },
          select: { partNumber: true, name: true },
        });
        if (!machine) throw ApiError.notFound(`Machine ${entry.machineId} not found`);
        if (!part) throw ApiError.notFound(`Part ${entry.partId} not found`);

        entryDataList.push({
          machineId: entry.machineId,
          partId: entry.partId,
          slabConfigId: null,
          qtyProduced: entry.qtyProduced,
          shiftTargetQty: 0,
          ncCount: entry.ncCount ?? 0,
          ncReason: entry.ncReason ?? null,
          machineCode: machine.machineCode ?? '',
          partNumber: part.partNumber,
          partName: part.name,
          slabTiers: [],
        });

        // No slab config — still add entry but with 0 target (no incentive)
        partEntries.push({
          partId: entry.partId,
          partNumber: part.partNumber,
          partName: part.name,
          machineId: entry.machineId,
          machineCode: machine.machineCode ?? '',
          qtyProduced: entry.qtyProduced,
          shiftTargetQty: 0,
          slabTiers: [],
        });
        continue;
      }

      const slabTiers = (slabConfig.slabTiers as any[]) || [];

      entryDataList.push({
        machineId: entry.machineId,
        partId: entry.partId,
        slabConfigId: slabConfig.id,
        qtyProduced: entry.qtyProduced,
        shiftTargetQty: slabConfig.shiftTargetQty,
        ncCount: entry.ncCount ?? 0,
        ncReason: entry.ncReason ?? null,
        machineCode: slabConfig.machine.machineCode ?? '',
        partNumber: slabConfig.part.partNumber,
        partName: slabConfig.part.name,
        slabTiers,
      });

      partEntries.push({
        partId: entry.partId,
        partNumber: slabConfig.part.partNumber,
        partName: slabConfig.part.name,
        machineId: entry.machineId,
        machineCode: slabConfig.machine.machineCode ?? '',
        qtyProduced: entry.qtyProduced,
        shiftTargetQty: slabConfig.shiftTargetQty,
        slabTiers,
      });
    }

    // Run calculation if a method is active
    let calcResult = activeMethodNumber
      ? calculateIncentive(partEntries, activeMethodNumber, activeMethodName ?? undefined)
      : null;

    // Generate session ref for grouping
    const sessionRef = `PIP-${data.entryDate}-${data.shiftId.slice(-6)}-${data.operatorId.slice(-6)}-${Date.now()}`;
    const entryDate = new Date(data.entryDate + 'T00:00:00.000Z');

    // Create entries in a transaction
    const savedEntries = await platformPrisma.$transaction(async (tx) => {
      const created: any[] = [];

      for (let i = 0; i < entryDataList.length; i++) {
        const ed = entryDataList[i]!;
        const partResult = calcResult?.parts[i];

        const achievementPct = ed.shiftTargetQty > 0
          ? round2((ed.qtyProduced / ed.shiftTargetQty) * 100)
          : 0;

        const createData: any = {
          companyId,
          entryDate,
          shiftId: data.shiftId,
          operatorId: data.operatorId,
          sessionRef,
          machineId: ed.machineId,
          partId: ed.partId,
          slabConfigId: ed.slabConfigId,
          qtyProduced: ed.qtyProduced,
          shiftTargetQty: ed.shiftTargetQty,
          achievementPct: new Prisma.Decimal(achievementPct),
          ncCount: ed.ncCount,
          ncReason: ed.ncReason,
          methodUsed: calcResult?.methodUsed ?? null,
          methodNumber: calcResult?.methodNumber ?? null,
          cumulativeRatio: partResult
            ? new Prisma.Decimal(partResult.cumulativeRatioAfter)
            : null,
          isEligible: calcResult?.isEligible ?? false,
          incentiveAmount: new Prisma.Decimal(partResult?.incentiveAmount ?? 0),
          totalIncentive: new Prisma.Decimal(calcResult?.totalIncentive ?? 0),
          calcBreakdown: partResult ? {
            case: partResult.case,
            earningQty: partResult.earningQty,
            breakdown: partResult.breakdown,
            milestone: partResult.milestone,
            milestoneQty: partResult.milestoneQty,
          } : null,
          status: 'DRAFT',
        };

        if (data.locationId !== undefined) createData.locationId = data.locationId;

        const entry = await tx.pipDailyEntry.create({ data: createData });
        created.push(entry);
      }

      return created;
    });

    auditLog({
      entityType: 'PipDailyEntry',
      entityId: sessionRef,
      action: 'CREATE',
      after: { sessionRef, entryCount: savedEntries.length, totalIncentive: calcResult?.totalIncentive ?? 0 } as any,
      changedBy: userId,
      companyId,
    });

    return {
      sessionRef,
      entries: savedEntries,
      calculation: calcResult,
    };
  }

  async listDailyEntries(companyId: string, filters: DailyEntryListFilters): Promise<DailyEntryListResult> {
    const { page = 1, limit = 25, entryDate, shiftId, operatorId, machineId, partId, status, locationId } = filters;
    const offset = (page - 1) * limit;

    const where: any = { companyId };

    if (entryDate) {
      // Use date range to handle @db.Date timezone edge cases
      const start = new Date(entryDate + 'T00:00:00.000Z');
      const end = new Date(entryDate + 'T23:59:59.999Z');
      where.entryDate = { gte: start, lte: end };
    }
    if (shiftId) where.shiftId = shiftId;
    if (operatorId) where.operatorId = operatorId;
    if (machineId) where.machineId = machineId;
    if (partId) where.partId = partId;
    if (status) where.status = status;
    if (locationId) where.locationId = locationId;

    const [entries, total] = await Promise.all([
      platformPrisma.pipDailyEntry.findMany({
        where,
        include: {
          operator: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
          slabConfig: {
            select: {
              id: true,
              shiftTargetQty: true,
              slabTiers: true,
              machine: { select: { id: true, assetCode: true, machineCode: true, assetName: true } },
              part: { select: { id: true, partNumber: true, name: true } },
            },
          },
        },
        skip: offset,
        take: limit,
        orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
      }),
      platformPrisma.pipDailyEntry.count({ where }),
    ]);

    return { entries, total, page, limit };
  }

  async getDailyEntrySummary(companyId: string, filters: DailyEntryListFilters) {
    const where: any = { companyId };

    if (filters.entryDate) {
      const start = new Date(filters.entryDate + 'T00:00:00.000Z');
      const end = new Date(filters.entryDate + 'T23:59:59.999Z');
      where.entryDate = { gte: start, lte: end };
    }
    if (filters.shiftId) where.shiftId = filters.shiftId;
    if (filters.operatorId) where.operatorId = filters.operatorId;
    if (filters.locationId) where.locationId = filters.locationId;
    if (filters.status) where.status = filters.status;

    const entries = await platformPrisma.pipDailyEntry.findMany({
      where,
      include: {
        operator: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
      },
      orderBy: [{ operatorId: 'asc' }, { entryDate: 'desc' }],
    });

    // Group by operator
    const operatorMap = new Map<string, {
      operatorId: string;
      operatorName: string;
      employeeId: string;
      totalQtyProduced: number;
      totalIncentive: number;
      entryCount: number;
      entries: any[];
    }>();

    for (const entry of entries) {
      const key = entry.operatorId;
      if (!operatorMap.has(key)) {
        operatorMap.set(key, {
          operatorId: entry.operatorId,
          operatorName: `${entry.operator.firstName} ${entry.operator.lastName}`,
          employeeId: entry.operator.employeeId,
          totalQtyProduced: 0,
          totalIncentive: 0,
          entryCount: 0,
          entries: [],
        });
      }
      const group = operatorMap.get(key)!;
      group.totalQtyProduced += entry.qtyProduced;
      group.totalIncentive = round2(group.totalIncentive + Number(entry.incentiveAmount));
      group.entryCount++;
      group.entries.push(entry);
    }

    const operatorSummaries = Array.from(operatorMap.values());
    const grandTotalIncentive = round2(operatorSummaries.reduce((sum, o) => sum + o.totalIncentive, 0));
    const grandTotalQty = operatorSummaries.reduce((sum, o) => sum + o.totalQtyProduced, 0);

    return {
      operators: operatorSummaries,
      grandTotalIncentive,
      grandTotalQty,
      operatorCount: operatorSummaries.length,
      totalEntries: entries.length,
    };
  }

  async deleteDailyEntries(companyId: string, sessionRef: string, userId: string) {
    const entries = await platformPrisma.pipDailyEntry.findMany({
      where: { companyId, sessionRef },
    });

    if (entries.length === 0) {
      throw ApiError.notFound('No entries found for this session reference');
    }

    // Check none are merged
    const mergedCount = entries.filter((e) => e.status === 'MERGED').length;
    if (mergedCount > 0) {
      throw ApiError.badRequest('Cannot delete entries that have been merged to payroll');
    }

    await platformPrisma.pipDailyEntry.deleteMany({
      where: { companyId, sessionRef },
    });

    auditLog({
      entityType: 'PipDailyEntry',
      entityId: sessionRef,
      action: 'DELETE',
      before: { sessionRef, entryCount: entries.length } as any,
      changedBy: userId,
      companyId,
    });

    return { deletedCount: entries.length, sessionRef };
  }

  // ════════════════════════════════════════════════════════════════════
  // Calculator (Simulation — no DB writes)
  // ════════════════════════════════════════════════════════════════════

  async simulateIncentive(companyId: string, data: SimulateIncentiveInput) {
    const incentiveConfig = await this.getIncentiveConfig(companyId);

    // Use requested method or active method
    const methodNumber: 1 | 2 = data.methodNumber ?? (
      incentiveConfig.method1Enabled ? 1 : incentiveConfig.method2Enabled ? 2 : 1
    );
    const methodName = methodNumber === 1
      ? incentiveConfig.method1Name
      : incentiveConfig.method2Name;

    // Look up slab configs for each part (use first matching config per part)
    const partIds = data.parts.map((p) => p.partId);
    const slabConfigs = await platformPrisma.pipSlabConfig.findMany({
      where: { companyId, partId: { in: partIds }, isActive: true },
      include: {
        machine: { select: { id: true, assetCode: true, machineCode: true, assetName: true } },
        part: { select: { id: true, partNumber: true, name: true } },
      },
    });

    // Build a map: partId → first matching slab config
    const slabMap = new Map<string, typeof slabConfigs[0]>();
    for (const sc of slabConfigs) {
      if (!slabMap.has(sc.partId)) slabMap.set(sc.partId, sc);
    }

    const partEntries: PartEntry[] = [];
    for (const p of data.parts) {
      const sc = slabMap.get(p.partId);
      if (!sc) {
        throw ApiError.badRequest(`No active slab configuration found for part ${p.partId}`);
      }
      partEntries.push({
        partId: p.partId,
        partNumber: sc.part?.partNumber ?? '',
        partName: sc.part?.name ?? '',
        machineId: sc.machineId,
        machineCode: sc.machine?.machineCode ?? '',
        qtyProduced: p.qtyProduced,
        shiftTargetQty: sc.shiftTargetQty,
        slabTiers: sc.slabTiers as unknown as PartEntry['slabTiers'],
      });
    }

    return calculateIncentive(partEntries, methodNumber, methodName);
  }

  // ════════════════════════════════════════════════════════════════════
  // Dashboard
  // ════════════════════════════════════════════════════════════════════

  async getDashboardMetrics(companyId: string, locationId?: string) {
    const locationFilter = locationId ? { locationId } : {};
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [partCount, machineCount, slabConfigCount, todayEntries] = await Promise.all([
      platformPrisma.part.count({ where: { companyId, ...locationFilter } }),
      platformPrisma.machine.count({ where: { companyId, ...locationFilter } }),
      platformPrisma.pipSlabConfig.count({ where: { companyId, isActive: true, ...locationFilter } }),
      platformPrisma.pipDailyEntry.findMany({
        where: { companyId, entryDate: today, ...locationFilter },
        select: { operatorId: true, incentiveAmount: true },
      }),
    ]);

    const todayTotalIncentive = round2(
      todayEntries.reduce((sum, e) => sum + Number(e.incentiveAmount), 0),
    );
    const todayOperatorCount = new Set(todayEntries.map((e) => e.operatorId)).size;

    return {
      partCount,
      machineCount,
      slabConfigCount,
      todayTotalIncentive,
      todayOperatorCount,
      todayEntryCount: todayEntries.length,
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // Monthly Report
  // ════════════════════════════════════════════════════════════════════

  async generateMonthlyReport(companyId: string, data: GenerateMonthlyReportInput, userId: string) {
    const { month, year, locationId } = data;

    // Get all entries for this month/year
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 1));

    const entryWhere: any = {
      companyId,
      entryDate: { gte: startDate, lt: endDate },
    };
    if (locationId) entryWhere.locationId = locationId;

    const entries = await platformPrisma.pipDailyEntry.findMany({
      where: entryWhere,
      include: {
        operator: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
      },
    });

    if (entries.length === 0) {
      throw ApiError.badRequest('No daily entries found for the specified month/year');
    }

    // Compute operator-wise summary
    const operatorMap = new Map<string, {
      operatorId: string;
      operatorName: string;
      employeeId: string;
      totalQtyProduced: number;
      totalIncentive: number;
      entryCount: number;
      workingDays: number;
      dates: Set<string>;
    }>();

    for (const entry of entries) {
      const key = entry.operatorId;
      if (!operatorMap.has(key)) {
        operatorMap.set(key, {
          operatorId: entry.operatorId,
          operatorName: `${entry.operator.firstName} ${entry.operator.lastName}`,
          employeeId: entry.operator.employeeId,
          totalQtyProduced: 0,
          totalIncentive: 0,
          entryCount: 0,
          workingDays: 0,
          dates: new Set(),
        });
      }
      const group = operatorMap.get(key)!;
      group.totalQtyProduced += entry.qtyProduced;
      group.totalIncentive = round2(group.totalIncentive + Number(entry.incentiveAmount));
      group.entryCount++;
      group.dates.add(entry.entryDate.toISOString().slice(0, 10));
    }

    const operatorSummary = Array.from(operatorMap.values()).map((o) => ({
      operatorId: o.operatorId,
      operatorName: o.operatorName,
      employeeId: o.employeeId,
      totalQtyProduced: o.totalQtyProduced,
      totalIncentive: o.totalIncentive,
      entryCount: o.entryCount,
      workingDays: o.dates.size,
    }));

    // Compute part-wise summary
    const partMap = new Map<string, { partId: string; totalQtyProduced: number; totalIncentive: number; entryCount: number }>();
    for (const entry of entries) {
      const key = entry.partId;
      if (!partMap.has(key)) {
        partMap.set(key, { partId: key, totalQtyProduced: 0, totalIncentive: 0, entryCount: 0 });
      }
      const group = partMap.get(key)!;
      group.totalQtyProduced += entry.qtyProduced;
      group.totalIncentive = round2(group.totalIncentive + Number(entry.incentiveAmount));
      group.entryCount++;
    }
    const partSummary = Array.from(partMap.values());

    // Daily trend
    const dailyMap = new Map<string, { date: string; totalIncentive: number; totalQty: number; operatorCount: number; operators: Set<string> }>();
    for (const entry of entries) {
      const dateKey = entry.entryDate.toISOString().slice(0, 10);
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, { date: dateKey, totalIncentive: 0, totalQty: 0, operatorCount: 0, operators: new Set() });
      }
      const group = dailyMap.get(dateKey)!;
      group.totalIncentive = round2(group.totalIncentive + Number(entry.incentiveAmount));
      group.totalQty += entry.qtyProduced;
      group.operators.add(entry.operatorId);
    }
    const dailyTrend = Array.from(dailyMap.values())
      .map((d) => ({ date: d.date, totalIncentive: d.totalIncentive, totalQty: d.totalQty, operatorCount: d.operators.size }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Aggregates
    const totalIncentive = round2(entries.reduce((sum, e) => sum + Number(e.incentiveAmount), 0));
    const operatorCount = operatorMap.size;
    const workingDays = dailyMap.size;
    const avgPerDay = workingDays > 0 ? round2(totalIncentive / workingDays) : 0;

    // Max single day
    let maxSingleDay = 0;
    let maxSingleDayDate: string | null = null;
    for (const d of dailyTrend) {
      if (d.totalIncentive > maxSingleDay) {
        maxSingleDay = d.totalIncentive;
        maxSingleDayDate = d.date;
      }
    }

    // Upsert the report
    const reportData: any = {
      companyId,
      month,
      year,
      status: 'DRAFT',
      totalIncentive: new Prisma.Decimal(totalIncentive),
      operatorCount,
      workingDays,
      avgPerDay: new Prisma.Decimal(avgPerDay),
      maxSingleDay: new Prisma.Decimal(maxSingleDay),
      maxSingleDayDate: maxSingleDayDate ? new Date(maxSingleDayDate + 'T00:00:00.000Z') : null,
      operatorSummary,
      partSummary,
      dailyTrend,
    };
    if (locationId !== undefined) reportData.locationId = locationId;

    // Use the unique constraint for upsert
    const report = await platformPrisma.pipMonthlyReport.upsert({
      where: {
        companyId_locationId_month_year: {
          companyId,
          locationId: locationId ?? '',
          month,
          year,
        },
      },
      create: reportData,
      update: {
        status: 'DRAFT',
        totalIncentive: new Prisma.Decimal(totalIncentive),
        operatorCount,
        workingDays,
        avgPerDay: new Prisma.Decimal(avgPerDay),
        maxSingleDay: new Prisma.Decimal(maxSingleDay),
        maxSingleDayDate: maxSingleDayDate ? new Date(maxSingleDayDate + 'T00:00:00.000Z') : null,
        operatorSummary,
        partSummary,
        dailyTrend,
        submittedBy: null,
        submittedAt: null,
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
        payrollRunId: null,
        mergedAt: null,
      },
    });

    auditLog({
      entityType: 'PipMonthlyReport',
      entityId: report.id,
      action: 'CREATE',
      after: { id: report.id, month, year, totalIncentive, operatorCount } as any,
      changedBy: userId,
      companyId,
    });

    return report;
  }

  async listMonthlyReports(companyId: string, filters: MonthlyReportListFilters): Promise<MonthlyReportListResult> {
    const { page = 1, limit = 25, status, locationId, year } = filters;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (status) where.status = status;
    if (locationId) where.locationId = locationId;
    if (year) where.year = year;

    const [reports, total] = await Promise.all([
      platformPrisma.pipMonthlyReport.findMany({
        where,
        include: {
          location: { select: { id: true, name: true } },
        },
        skip: offset,
        take: limit,
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      }),
      platformPrisma.pipMonthlyReport.count({ where }),
    ]);

    return { reports, total, page, limit };
  }

  async getMonthlyReport(companyId: string, id: string) {
    const report = await platformPrisma.pipMonthlyReport.findUnique({
      where: { id },
      include: {
        location: { select: { id: true, name: true } },
      },
    });

    if (!report || report.companyId !== companyId) {
      throw ApiError.notFound('Monthly report not found');
    }

    return report;
  }

  async submitMonthlyReport(companyId: string, id: string, userId: string) {
    const report = await platformPrisma.pipMonthlyReport.findUnique({ where: { id } });
    if (!report || report.companyId !== companyId) {
      throw ApiError.notFound('Monthly report not found');
    }

    if (report.status !== 'DRAFT' && report.status !== 'REJECTED') {
      throw ApiError.badRequest(`Cannot submit report in ${report.status} status`);
    }

    const updated = await platformPrisma.pipMonthlyReport.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        submittedBy: userId,
        submittedAt: new Date(),
      },
    });

    auditLog({
      entityType: 'PipMonthlyReport',
      entityId: id,
      action: 'UPDATE',
      before: { status: report.status } as any,
      after: { status: 'SUBMITTED' } as any,
      changedBy: userId,
      companyId,
    });

    return updated;
  }

  async approveMonthlyReport(companyId: string, id: string, userId: string) {
    const report = await platformPrisma.pipMonthlyReport.findUnique({ where: { id } });
    if (!report || report.companyId !== companyId) {
      throw ApiError.notFound('Monthly report not found');
    }

    if (report.status !== 'SUBMITTED') {
      throw ApiError.badRequest(`Cannot approve report in ${report.status} status. Must be SUBMITTED.`);
    }

    const updated = await platformPrisma.pipMonthlyReport.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedBy: userId,
        approvedAt: new Date(),
      },
    });

    auditLog({
      entityType: 'PipMonthlyReport',
      entityId: id,
      action: 'UPDATE',
      before: { status: report.status } as any,
      after: { status: 'APPROVED' } as any,
      changedBy: userId,
      companyId,
    });

    return updated;
  }

  async rejectMonthlyReport(companyId: string, id: string, userId: string, reason?: string) {
    const report = await platformPrisma.pipMonthlyReport.findUnique({ where: { id } });
    if (!report || report.companyId !== companyId) {
      throw ApiError.notFound('Monthly report not found');
    }

    if (report.status !== 'SUBMITTED') {
      throw ApiError.badRequest(`Cannot reject report in ${report.status} status. Must be SUBMITTED.`);
    }

    const updated = await platformPrisma.pipMonthlyReport.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectedBy: userId,
        rejectedAt: new Date(),
        rejectionReason: reason ?? null,
      },
    });

    auditLog({
      entityType: 'PipMonthlyReport',
      entityId: id,
      action: 'UPDATE',
      before: { status: report.status } as any,
      after: { status: 'REJECTED', rejectionReason: reason } as any,
      changedBy: userId,
      companyId,
    });

    return updated;
  }

  // ════════════════════════════════════════════════════════════════════
  // Payroll Merge
  // ════════════════════════════════════════════════════════════════════

  async mergeToPayroll(companyId: string, reportId: string, payrollRunId: string, userId: string) {
    const report = await platformPrisma.pipMonthlyReport.findUnique({ where: { id: reportId } });
    if (!report || report.companyId !== companyId) {
      throw ApiError.notFound('Monthly report not found');
    }

    if (report.status !== 'APPROVED') {
      throw ApiError.badRequest(`Cannot merge report in ${report.status} status. Must be APPROVED.`);
    }

    // Validate payroll run exists and is in mergeable status
    const payrollRun = await platformPrisma.payrollRun.findUnique({ where: { id: payrollRunId } });
    if (!payrollRun || payrollRun.companyId !== companyId) {
      throw ApiError.notFound('Payroll run not found');
    }

    if (payrollRun.status !== 'COMPUTED' && payrollRun.status !== 'STATUTORY_DONE') {
      throw ApiError.badRequest(`Cannot merge into payroll run in ${payrollRun.status} status. Must be COMPUTED or STATUTORY_DONE.`);
    }

    const operatorSummary = (report.operatorSummary as any[]) || [];

    return platformPrisma.$transaction(async (tx) => {
      for (const operator of operatorSummary) {
        const entry = await tx.payrollEntry.findFirst({
          where: { payrollRunId, employeeId: operator.operatorId },
        });

        if (entry) {
          const currentEarnings = (entry.earnings as Record<string, number>) ?? {};
          const pipAmount = round2(operator.totalIncentive);
          const updatedEarnings = {
            ...currentEarnings,
            PIP_INCENTIVE: round2((currentEarnings['PIP_INCENTIVE'] ?? 0) + pipAmount),
          };

          const newGross = round2(Number(entry.grossEarnings) + pipAmount);
          const newNet = round2(Number(entry.netPay) + pipAmount);

          await tx.payrollEntry.update({
            where: { id: entry.id },
            data: {
              earnings: updatedEarnings,
              grossEarnings: new Prisma.Decimal(newGross),
              netPay: new Prisma.Decimal(newNet),
            },
          });
        }
      }

      // Update report status to MERGED
      const updated = await tx.pipMonthlyReport.update({
        where: { id: reportId },
        data: {
          status: 'MERGED',
          payrollRunId,
          mergedAt: new Date(),
        },
      });

      // Also update daily entries for this month to MERGED
      const startDate = new Date(Date.UTC(report.year, report.month - 1, 1));
      const endDate = new Date(Date.UTC(report.year, report.month, 1));
      const entryWhere: any = {
        companyId,
        entryDate: { gte: startDate, lt: endDate },
      };
      if (report.locationId) entryWhere.locationId = report.locationId;

      await tx.pipDailyEntry.updateMany({
        where: entryWhere,
        data: {
          status: 'MERGED',
          payrollRunId,
          mergedAt: new Date(),
        },
      });

      return updated;
    });
  }

  async previewPayrollMerge(companyId: string, reportId: string) {
    const report = await platformPrisma.pipMonthlyReport.findUnique({ where: { id: reportId } });
    if (!report || report.companyId !== companyId) {
      throw ApiError.notFound('Monthly report not found');
    }

    const operatorSummary = (report.operatorSummary as any[]) || [];

    return {
      reportId: report.id,
      month: report.month,
      year: report.year,
      status: report.status,
      totalIncentive: Number(report.totalIncentive),
      operatorCount: operatorSummary.length,
      operators: operatorSummary.map((o) => ({
        operatorId: o.operatorId,
        operatorName: o.operatorName,
        employeeId: o.employeeId,
        totalIncentive: o.totalIncentive,
      })),
    };
  }

  async reversePayrollMerge(companyId: string, reportId: string, userId: string) {
    const report = await platformPrisma.pipMonthlyReport.findUnique({ where: { id: reportId } });
    if (!report || report.companyId !== companyId) {
      throw ApiError.notFound('Monthly report not found');
    }

    if (report.status !== 'MERGED') {
      throw ApiError.badRequest(`Cannot reverse merge for report in ${report.status} status. Must be MERGED.`);
    }

    if (!report.payrollRunId) {
      throw ApiError.badRequest('Report has no associated payroll run');
    }

    const operatorSummary = (report.operatorSummary as any[]) || [];

    return platformPrisma.$transaction(async (tx) => {
      // Subtract PIP amounts from PayrollEntries
      for (const operator of operatorSummary) {
        const entry = await tx.payrollEntry.findFirst({
          where: { payrollRunId: report.payrollRunId!, employeeId: operator.operatorId },
        });

        if (entry) {
          const currentEarnings = (entry.earnings as Record<string, number>) ?? {};
          const pipAmount = round2(operator.totalIncentive);
          const newPipAmount = round2((currentEarnings['PIP_INCENTIVE'] ?? 0) - pipAmount);

          const updatedEarnings = { ...currentEarnings };
          if (newPipAmount <= 0) {
            delete updatedEarnings['PIP_INCENTIVE'];
          } else {
            updatedEarnings['PIP_INCENTIVE'] = newPipAmount;
          }

          const newGross = round2(Math.max(0, Number(entry.grossEarnings) - pipAmount));
          const newNet = round2(Math.max(0, Number(entry.netPay) - pipAmount));

          await tx.payrollEntry.update({
            where: { id: entry.id },
            data: {
              earnings: updatedEarnings,
              grossEarnings: new Prisma.Decimal(newGross),
              netPay: new Prisma.Decimal(newNet),
            },
          });
        }
      }

      // Revert report status to APPROVED
      const updated = await tx.pipMonthlyReport.update({
        where: { id: reportId },
        data: {
          status: 'APPROVED',
          payrollRunId: null,
          mergedAt: null,
        },
      });

      // Revert daily entries
      const startDate = new Date(Date.UTC(report.year, report.month - 1, 1));
      const endDate = new Date(Date.UTC(report.year, report.month, 1));
      const entryWhere: any = {
        companyId,
        entryDate: { gte: startDate, lt: endDate },
        status: 'MERGED',
      };
      if (report.locationId) entryWhere.locationId = report.locationId;

      await tx.pipDailyEntry.updateMany({
        where: entryWhere,
        data: {
          status: 'APPROVED',
          payrollRunId: null,
          mergedAt: null,
        },
      });

      auditLog({
        entityType: 'PipMonthlyReport',
        entityId: reportId,
        action: 'UPDATE',
        before: { status: 'MERGED', payrollRunId: report.payrollRunId } as any,
        after: { status: 'APPROVED', payrollRunId: null } as any,
        changedBy: userId,
        companyId,
      });

      return updated;
    });
  }
}

export const pipService = new PipService();
