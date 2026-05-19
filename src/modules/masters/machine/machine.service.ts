import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { auditLog } from '../../../shared/utils/audit';
import { n } from '../../../shared/utils/prisma-helpers';
import { generateNextNumber } from '../../../shared/utils/number-series';
import { MachineListFilters, MachineListResult } from './machine.types';
import {
  CreateMachineInput,
  UpdateMachineInput,
  CreateMachineCategoryInput,
  UpdateMachineCategoryInput,
  CreateMachineTypeInput,
  UpdateMachineTypeInput,
  CreateMachineZoneInput,
  UpdateMachineZoneInput,
} from './machine.validators';

export class MachineService {
  // ════════════════════════════════════════════════════════════════════
  // Machine CRUD
  // ════════════════════════════════════════════════════════════════════

  async listMachines(companyId: string, filters: MachineListFilters): Promise<MachineListResult> {
    const { page = 1, limit = 25, search, status, categoryId, typeId, zoneId, locationId, priority } = filters;
    const offset = (page - 1) * limit;

    const where: any = { companyId };

    if (status) where.status = status;
    if (categoryId) where.categoryId = categoryId;
    if (typeId) where.typeId = typeId;
    if (zoneId) where.zoneId = zoneId;
    if (locationId) where.locationId = locationId;
    if (priority) where.priority = priority;

    if (search) {
      where.OR = [
        { assetCode: { contains: search, mode: 'insensitive' } },
        { assetName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [machines, total] = await Promise.all([
      platformPrisma.machine.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          type: { select: { id: true, name: true } },
          zone: { select: { id: true, name: true, code: true } },
          location: { select: { id: true, name: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.machine.count({ where }),
    ]);

    return { machines, total, page, limit };
  }

  async getMachine(companyId: string, id: string) {
    const machine = await platformPrisma.machine.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        type: { select: { id: true, name: true } },
        zone: { select: { id: true, name: true, code: true } },
        location: { select: { id: true, name: true } },
      },
    });

    if (!machine || machine.companyId !== companyId) {
      throw ApiError.notFound('Machine not found');
    }

    return machine;
  }

  async createMachine(companyId: string, data: CreateMachineInput, userId: string) {
    let assetCode = data.assetCode;

    // Auto-generate asset code if not provided
    if (!assetCode) {
      assetCode = await generateNextNumber(
        platformPrisma,
        companyId,
        ['Machine Master'],
        'Machine',
      );
    } else {
      // Check uniqueness of provided asset code
      const existing = await platformPrisma.machine.findUnique({
        where: { companyId_assetCode: { companyId, assetCode } },
      });
      if (existing) {
        throw ApiError.conflict(`Asset code "${assetCode}" already exists`);
      }
    }

    // Build create payload — only include optional fields when provided
    const createData: Record<string, any> = {
      companyId,
      assetCode,
      assetName: data.assetName,
      createdBy: userId,
      updatedBy: userId,
    };
    if (data.machineCode !== undefined) createData.machineCode = data.machineCode;
    if (data.serialNumber !== undefined) createData.serialNumber = data.serialNumber;
    if (data.categoryId !== undefined) createData.categoryId = data.categoryId;
    if (data.typeId !== undefined) createData.typeId = data.typeId;
    if (data.zoneId !== undefined) createData.zoneId = data.zoneId;
    if (data.departmentId !== undefined) createData.departmentId = data.departmentId;
    if (data.lineWorkCenter !== undefined) createData.lineWorkCenter = data.lineWorkCenter;
    if (data.priority !== undefined) createData.priority = data.priority;
    if (data.capacity !== undefined) createData.capacity = data.capacity;
    if (data.powerRating !== undefined) createData.powerRating = data.powerRating;
    if (data.make !== undefined) createData.make = data.make;
    if (data.model !== undefined) createData.model = data.model;
    if (data.yearOfManufacture !== undefined) createData.yearOfManufacture = data.yearOfManufacture;
    if (data.lastMaintenanceDate !== undefined) createData.lastMaintenanceDate = new Date(data.lastMaintenanceDate);
    if (data.nextMaintenanceDate !== undefined) createData.nextMaintenanceDate = new Date(data.nextMaintenanceDate);
    if (data.maintenanceFrequency !== undefined) createData.maintenanceFrequency = data.maintenanceFrequency;
    if (data.lastCalibrationDate !== undefined) createData.lastCalibrationDate = new Date(data.lastCalibrationDate);
    if (data.nextCalibrationDate !== undefined) createData.nextCalibrationDate = new Date(data.nextCalibrationDate);
    if (data.calibrationFrequency !== undefined) createData.calibrationFrequency = data.calibrationFrequency;
    if (data.vendorId !== undefined) createData.vendorId = data.vendorId;
    if (data.warrantyExpiry !== undefined) createData.warrantyExpiry = new Date(data.warrantyExpiry);
    if (data.amcStartDate !== undefined) createData.amcStartDate = new Date(data.amcStartDate);
    if (data.amcEndDate !== undefined) createData.amcEndDate = new Date(data.amcEndDate);
    if (data.amcVendorId !== undefined) createData.amcVendorId = data.amcVendorId;
    if (data.status !== undefined) createData.status = data.status;
    if (data.idleReason !== undefined) createData.idleReason = data.idleReason;
    if (data.locationId !== undefined) createData.locationId = data.locationId;

    const machine = await platformPrisma.machine.create({
      data: createData as any,
      include: {
        category: { select: { id: true, name: true } },
        type: { select: { id: true, name: true } },
        zone: { select: { id: true, name: true, code: true } },
        location: { select: { id: true, name: true } },
      },
    });

    auditLog({
      entityType: 'Machine',
      entityId: machine.id,
      action: 'CREATE',
      after: machine as any,
      changedBy: userId,
      companyId,
    });

    return machine;
  }

  async updateMachine(companyId: string, id: string, data: UpdateMachineInput, userId: string) {
    const existing = await platformPrisma.machine.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Machine not found');
    }

    // Check assetCode uniqueness if changed
    if (data.assetCode && data.assetCode !== existing.assetCode) {
      const duplicate = await platformPrisma.machine.findUnique({
        where: { companyId_assetCode: { companyId, assetCode: data.assetCode } },
      });
      if (duplicate) {
        throw ApiError.conflict(`Asset code "${data.assetCode}" already exists`);
      }
    }

    // Build update payload — only include fields that were explicitly provided
    const updateData: Record<string, any> = { updatedBy: userId };
    if (data.assetCode !== undefined) updateData.assetCode = data.assetCode;
    if (data.assetName !== undefined) updateData.assetName = data.assetName;
    if ('machineCode' in data) updateData.machineCode = n(data.machineCode);
    if ('serialNumber' in data) updateData.serialNumber = n(data.serialNumber);
    if ('categoryId' in data) updateData.categoryId = n(data.categoryId);
    if ('typeId' in data) updateData.typeId = n(data.typeId);
    if ('zoneId' in data) updateData.zoneId = n(data.zoneId);
    if ('departmentId' in data) updateData.departmentId = n(data.departmentId);
    if ('lineWorkCenter' in data) updateData.lineWorkCenter = n(data.lineWorkCenter);
    if (data.priority !== undefined) updateData.priority = data.priority;
    if ('capacity' in data) updateData.capacity = n(data.capacity);
    if ('powerRating' in data) updateData.powerRating = n(data.powerRating);
    if ('make' in data) updateData.make = n(data.make);
    if ('model' in data) updateData.model = n(data.model);
    if ('yearOfManufacture' in data) updateData.yearOfManufacture = n(data.yearOfManufacture);
    if ('lastMaintenanceDate' in data) updateData.lastMaintenanceDate = data.lastMaintenanceDate ? new Date(data.lastMaintenanceDate) : null;
    if ('nextMaintenanceDate' in data) updateData.nextMaintenanceDate = data.nextMaintenanceDate ? new Date(data.nextMaintenanceDate) : null;
    if ('maintenanceFrequency' in data) updateData.maintenanceFrequency = n(data.maintenanceFrequency);
    if ('lastCalibrationDate' in data) updateData.lastCalibrationDate = data.lastCalibrationDate ? new Date(data.lastCalibrationDate) : null;
    if ('nextCalibrationDate' in data) updateData.nextCalibrationDate = data.nextCalibrationDate ? new Date(data.nextCalibrationDate) : null;
    if ('calibrationFrequency' in data) updateData.calibrationFrequency = n(data.calibrationFrequency);
    if ('vendorId' in data) updateData.vendorId = n(data.vendorId);
    if ('warrantyExpiry' in data) updateData.warrantyExpiry = data.warrantyExpiry ? new Date(data.warrantyExpiry) : null;
    if ('amcStartDate' in data) updateData.amcStartDate = data.amcStartDate ? new Date(data.amcStartDate) : null;
    if ('amcEndDate' in data) updateData.amcEndDate = data.amcEndDate ? new Date(data.amcEndDate) : null;
    if ('amcVendorId' in data) updateData.amcVendorId = n(data.amcVendorId);
    if (data.status !== undefined) updateData.status = data.status;
    if ('idleReason' in data) updateData.idleReason = n(data.idleReason);
    if ('locationId' in data) updateData.locationId = n(data.locationId);

    const machine = await platformPrisma.machine.update({
      where: { id },
      data: updateData,
      include: {
        category: { select: { id: true, name: true } },
        type: { select: { id: true, name: true } },
        zone: { select: { id: true, name: true, code: true } },
        location: { select: { id: true, name: true } },
      },
    });

    auditLog({
      entityType: 'Machine',
      entityId: machine.id,
      action: 'UPDATE',
      before: existing as any,
      after: machine as any,
      changedBy: userId,
      companyId,
    });

    return machine;
  }

  async deleteMachine(companyId: string, id: string, userId: string) {
    const existing = await platformPrisma.machine.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Machine not found');
    }

    // Check if referenced in PipSlabConfig
    const slabCount = await platformPrisma.pipSlabConfig.count({
      where: { machineId: id },
    });
    if (slabCount > 0) {
      throw ApiError.badRequest(
        `Cannot delete machine — it is referenced in ${slabCount} slab configuration(s)`,
      );
    }

    await platformPrisma.machine.delete({ where: { id } });

    auditLog({
      entityType: 'Machine',
      entityId: id,
      action: 'DELETE',
      before: existing as any,
      changedBy: userId,
      companyId,
    });

    return { id };
  }

  // ════════════════════════════════════════════════════════════════════
  // Machine Category CRUD
  // ════════════════════════════════════════════════════════════════════

  async listCategories(companyId: string) {
    return platformPrisma.machineCategory.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(companyId: string, data: CreateMachineCategoryInput) {
    const existing = await platformPrisma.machineCategory.findUnique({
      where: { companyId_name: { companyId, name: data.name } },
    });
    if (existing) {
      throw ApiError.conflict(`Machine category "${data.name}" already exists`);
    }

    return platformPrisma.machineCategory.create({
      data: { companyId, name: data.name },
    });
  }

  async updateCategory(companyId: string, id: string, data: UpdateMachineCategoryInput) {
    const existing = await platformPrisma.machineCategory.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Machine category not found');
    }

    // Check name uniqueness if changed
    if (data.name && data.name !== existing.name) {
      const duplicate = await platformPrisma.machineCategory.findUnique({
        where: { companyId_name: { companyId, name: data.name } },
      });
      if (duplicate) {
        throw ApiError.conflict(`Machine category "${data.name}" already exists`);
      }
    }

    const updateData: Record<string, any> = {};
    if (data.name !== undefined) updateData.name = data.name;

    return platformPrisma.machineCategory.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteCategory(companyId: string, id: string) {
    const existing = await platformPrisma.machineCategory.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Machine category not found');
    }

    const machineCount = await platformPrisma.machine.count({ where: { categoryId: id } });
    if (machineCount > 0) {
      throw ApiError.badRequest(
        `Cannot delete category — it is referenced by ${machineCount} machine(s)`,
      );
    }

    await platformPrisma.machineCategory.delete({ where: { id } });
    return { id };
  }

  // ════════════════════════════════════════════════════════════════════
  // Machine Type CRUD
  // ════════════════════════════════════════════════════════════════════

  async listTypes(companyId: string) {
    return platformPrisma.machineType.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createType(companyId: string, data: CreateMachineTypeInput) {
    const existing = await platformPrisma.machineType.findUnique({
      where: { companyId_name: { companyId, name: data.name } },
    });
    if (existing) {
      throw ApiError.conflict(`Machine type "${data.name}" already exists`);
    }

    return platformPrisma.machineType.create({
      data: { companyId, name: data.name },
    });
  }

  async updateType(companyId: string, id: string, data: UpdateMachineTypeInput) {
    const existing = await platformPrisma.machineType.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Machine type not found');
    }

    if (data.name && data.name !== existing.name) {
      const duplicate = await platformPrisma.machineType.findUnique({
        where: { companyId_name: { companyId, name: data.name } },
      });
      if (duplicate) {
        throw ApiError.conflict(`Machine type "${data.name}" already exists`);
      }
    }

    const updateData: Record<string, any> = {};
    if (data.name !== undefined) updateData.name = data.name;

    return platformPrisma.machineType.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteType(companyId: string, id: string) {
    const existing = await platformPrisma.machineType.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Machine type not found');
    }

    const machineCount = await platformPrisma.machine.count({ where: { typeId: id } });
    if (machineCount > 0) {
      throw ApiError.badRequest(
        `Cannot delete type — it is referenced by ${machineCount} machine(s)`,
      );
    }

    await platformPrisma.machineType.delete({ where: { id } });
    return { id };
  }

  // ════════════════════════════════════════════════════════════════════
  // Machine Zone CRUD
  // ════════════════════════════════════════════════════════════════════

  async listZones(companyId: string, locationId?: string) {
    const where: any = { companyId, isActive: true };
    if (locationId) where.locationId = locationId;

    return platformPrisma.machineZone.findMany({
      where,
      include: {
        location: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createZone(companyId: string, data: CreateMachineZoneInput) {
    const existing = await platformPrisma.machineZone.findUnique({
      where: { companyId_name: { companyId, name: data.name } },
    });
    if (existing) {
      throw ApiError.conflict(`Machine zone "${data.name}" already exists`);
    }

    // Auto-generate code: ZN-001, ZN-002, ...
    const count = await platformPrisma.machineZone.count({ where: { companyId } });
    let seq = count + 1;
    let code = `ZN-${String(seq).padStart(3, '0')}`;
    let retries = 0;
    while (await platformPrisma.machineZone.findFirst({ where: { companyId, code } })) {
      seq++; retries++;
      code = `ZN-${String(seq).padStart(3, '0')}`;
      if (retries > 100) break;
    }

    const createData: Record<string, any> = { companyId, name: data.name, code };
    if (data.locationId !== undefined) createData.locationId = data.locationId;

    return platformPrisma.machineZone.create({
      data: createData as any,
      include: {
        location: { select: { id: true, name: true } },
      },
    });
  }

  async updateZone(companyId: string, id: string, data: UpdateMachineZoneInput) {
    const existing = await platformPrisma.machineZone.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Machine zone not found');
    }

    if (data.name && data.name !== existing.name) {
      const duplicate = await platformPrisma.machineZone.findUnique({
        where: { companyId_name: { companyId, name: data.name } },
      });
      if (duplicate) {
        throw ApiError.conflict(`Machine zone "${data.name}" already exists`);
      }
    }

    const updateData: Record<string, any> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if ('code' in data) updateData.code = n(data.code);
    if ('locationId' in data) updateData.locationId = n(data.locationId);

    return platformPrisma.machineZone.update({
      where: { id },
      data: updateData,
      include: {
        location: { select: { id: true, name: true } },
      },
    });
  }

  async deleteZone(companyId: string, id: string) {
    const existing = await platformPrisma.machineZone.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Machine zone not found');
    }

    const machineCount = await platformPrisma.machine.count({ where: { zoneId: id } });
    if (machineCount > 0) {
      throw ApiError.badRequest(
        `Cannot delete zone — it is referenced by ${machineCount} machine(s)`,
      );
    }

    await platformPrisma.machineZone.delete({ where: { id } });
    return { id };
  }
}

export const machineService = new MachineService();
