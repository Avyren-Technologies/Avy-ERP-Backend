import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { auditLog } from '../../../shared/utils/audit';
import { n } from '../../../shared/utils/prisma-helpers';
import { generateNextNumber } from '../../../shared/utils/number-series';
import { PartListFilters, PartListResult } from './part.types';
import {
  CreatePartInput,
  UpdatePartInput,
  CreatePartCategoryInput,
  UpdatePartCategoryInput,
  CreateProductModelInput,
  UpdateProductModelInput,
  CreateUomInput,
  UpdateUomInput,
  CreatePartComponentTypeInput,
  UpdatePartComponentTypeInput,
} from './part.validators';

export class PartService {
  // ════════════════════════════════════════════════════════════════════
  // Part CRUD
  // ════════════════════════════════════════════════════════════════════

  async listParts(companyId: string, filters: PartListFilters): Promise<PartListResult> {
    const { page = 1, limit = 25, search, status, categoryId, locationId, partType } = filters;
    const offset = (page - 1) * limit;

    const where: any = { companyId };

    if (status) where.status = status;
    if (categoryId) where.categoryId = categoryId;
    if (locationId) where.locationId = locationId;
    if (partType) where.partType = partType;

    if (search) {
      where.OR = [
        { partNumber: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [parts, total] = await Promise.all([
      platformPrisma.part.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, code: true } },
          productModel: { select: { id: true, name: true, code: true } },
          componentType: { select: { id: true, name: true, code: true } },
          uom: { select: { id: true, name: true, abbreviation: true } },
          location: { select: { id: true, name: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.part.count({ where }),
    ]);

    return { parts, total, page, limit };
  }

  async getPart(companyId: string, id: string) {
    const part = await platformPrisma.part.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, code: true } },
        productModel: { select: { id: true, name: true, code: true } },
        uom: { select: { id: true, name: true, abbreviation: true } },
        location: { select: { id: true, name: true } },
      },
    });

    if (!part || part.companyId !== companyId) {
      throw ApiError.notFound('Part not found');
    }

    return part;
  }

  async createPart(companyId: string, data: CreatePartInput, userId: string) {
    let partNumber = data.partNumber;

    // Auto-generate part number if not provided
    if (!partNumber) {
      partNumber = await generateNextNumber(
        platformPrisma,
        companyId,
        ['Part Master'],
        'Part',
      );
    } else {
      // Check uniqueness of provided part number
      const existing = await platformPrisma.part.findUnique({
        where: { companyId_partNumber: { companyId, partNumber } },
      });
      if (existing) {
        throw ApiError.conflict(`Part number "${partNumber}" already exists`);
      }
    }

    // Build create payload — only include optional fields when provided
    const createData: Record<string, any> = {
      companyId,
      partNumber,
      name: data.name,
      createdBy: userId,
      updatedBy: userId,
    };
    if (data.engineeringPartNo !== undefined) createData.engineeringPartNo = data.engineeringPartNo;
    if (data.categoryId !== undefined) createData.categoryId = data.categoryId;
    if (data.productModelId !== undefined) createData.productModelId = data.productModelId;
    if (data.uomId !== undefined) createData.uomId = data.uomId;
    if (data.componentTypeId !== undefined) createData.componentTypeId = data.componentTypeId;
    if (data.partType !== undefined) createData.partType = data.partType;
    if (data.revision !== undefined) createData.revision = data.revision;
    if (data.drawingReference !== undefined) createData.drawingReference = data.drawingReference;
    if (data.hsnCode !== undefined) createData.hsnCode = data.hsnCode;
    if (data.weight !== undefined) createData.weight = data.weight;
    if (data.dimensions !== undefined) createData.dimensions = data.dimensions;
    if (data.isBatchTracked !== undefined) createData.isBatchTracked = data.isBatchTracked;
    if (data.isSerialTracked !== undefined) createData.isSerialTracked = data.isSerialTracked;
    if (data.isBomEnabled !== undefined) createData.isBomEnabled = data.isBomEnabled;
    if (data.isQcRequired !== undefined) createData.isQcRequired = data.isQcRequired;
    if (data.isInventoryItem !== undefined) createData.isInventoryItem = data.isInventoryItem;
    if (data.preferredVendorId !== undefined) createData.preferredVendorId = data.preferredVendorId;
    if (data.status !== undefined) createData.status = data.status;
    if (data.locationId !== undefined) createData.locationId = data.locationId;

    const part = await platformPrisma.part.create({
      data: createData as any,
      include: {
        category: { select: { id: true, name: true, code: true } },
        productModel: { select: { id: true, name: true, code: true } },
        uom: { select: { id: true, name: true, abbreviation: true } },
        location: { select: { id: true, name: true } },
      },
    });

    auditLog({
      entityType: 'Part',
      entityId: part.id,
      action: 'CREATE',
      after: part as any,
      changedBy: userId,
      companyId,
    });

    return part;
  }

  async updatePart(companyId: string, id: string, data: UpdatePartInput, userId: string) {
    const existing = await platformPrisma.part.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Part not found');
    }

    // Check partNumber uniqueness if changed
    if (data.partNumber && data.partNumber !== existing.partNumber) {
      const duplicate = await platformPrisma.part.findUnique({
        where: { companyId_partNumber: { companyId, partNumber: data.partNumber } },
      });
      if (duplicate) {
        throw ApiError.conflict(`Part number "${data.partNumber}" already exists`);
      }
    }

    // Build update payload — only include fields that were explicitly provided
    const updateData: Record<string, any> = { updatedBy: userId };
    if (data.partNumber !== undefined) updateData.partNumber = data.partNumber;
    if (data.name !== undefined) updateData.name = data.name;
    if ('engineeringPartNo' in data) updateData.engineeringPartNo = n(data.engineeringPartNo);
    if ('categoryId' in data) updateData.categoryId = n(data.categoryId);
    if ('productModelId' in data) updateData.productModelId = n(data.productModelId);
    if ('uomId' in data) updateData.uomId = n(data.uomId);
    if ('componentTypeId' in data) updateData.componentTypeId = n(data.componentTypeId);
    if (data.partType !== undefined) updateData.partType = data.partType;
    if ('revision' in data) updateData.revision = n(data.revision);
    if ('drawingReference' in data) updateData.drawingReference = n(data.drawingReference);
    if ('hsnCode' in data) updateData.hsnCode = n(data.hsnCode);
    if ('weight' in data) updateData.weight = n(data.weight);
    if ('dimensions' in data) updateData.dimensions = n(data.dimensions);
    if (data.isBatchTracked !== undefined) updateData.isBatchTracked = data.isBatchTracked;
    if (data.isSerialTracked !== undefined) updateData.isSerialTracked = data.isSerialTracked;
    if (data.isBomEnabled !== undefined) updateData.isBomEnabled = data.isBomEnabled;
    if (data.isQcRequired !== undefined) updateData.isQcRequired = data.isQcRequired;
    if (data.isInventoryItem !== undefined) updateData.isInventoryItem = data.isInventoryItem;
    if ('preferredVendorId' in data) updateData.preferredVendorId = n(data.preferredVendorId);
    if (data.status !== undefined) updateData.status = data.status;
    if ('locationId' in data) updateData.locationId = n(data.locationId);

    const part = await platformPrisma.part.update({
      where: { id },
      data: updateData,
      include: {
        category: { select: { id: true, name: true, code: true } },
        productModel: { select: { id: true, name: true, code: true } },
        uom: { select: { id: true, name: true, abbreviation: true } },
        location: { select: { id: true, name: true } },
      },
    });

    auditLog({
      entityType: 'Part',
      entityId: part.id,
      action: 'UPDATE',
      before: existing as any,
      after: part as any,
      changedBy: userId,
      companyId,
    });

    return part;
  }

  async deletePart(companyId: string, id: string, userId: string) {
    const existing = await platformPrisma.part.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Part not found');
    }

    // Check if referenced in PipSlabConfig
    const slabCount = await platformPrisma.pipSlabConfig.count({
      where: { partId: id },
    });
    if (slabCount > 0) {
      throw ApiError.badRequest(
        `Cannot delete part — it is referenced in ${slabCount} slab configuration(s)`,
      );
    }

    await platformPrisma.part.delete({ where: { id } });

    auditLog({
      entityType: 'Part',
      entityId: id,
      action: 'DELETE',
      before: existing as any,
      changedBy: userId,
      companyId,
    });

    return { id };
  }

  // ════════════════════════════════════════════════════════════════════
  // Part Category CRUD
  // ════════════════════════════════════════════════════════════════════

  async listCategories(companyId: string) {
    return platformPrisma.partCategory.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(companyId: string, data: CreatePartCategoryInput) {
    const existing = await platformPrisma.partCategory.findUnique({
      where: { companyId_name: { companyId, name: data.name } },
    });
    if (existing) {
      throw ApiError.conflict(`Category "${data.name}" already exists`);
    }

    // Auto-generate code: CAT-001, CAT-002, ...
    const count = await platformPrisma.partCategory.count({ where: { companyId } });
    let seq = count + 1;
    let code = `CAT-${String(seq).padStart(3, '0')}`;
    while (await platformPrisma.partCategory.findFirst({ where: { companyId, code } })) {
      seq++;
      code = `CAT-${String(seq).padStart(3, '0')}`;
    }

    return platformPrisma.partCategory.create({
      data: { companyId, name: data.name, code },
    });
  }

  async updateCategory(companyId: string, id: string, data: UpdatePartCategoryInput) {
    const existing = await platformPrisma.partCategory.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Category not found');
    }

    // Check name uniqueness if changed
    if (data.name && data.name !== existing.name) {
      const duplicate = await platformPrisma.partCategory.findUnique({
        where: { companyId_name: { companyId, name: data.name } },
      });
      if (duplicate) {
        throw ApiError.conflict(`Category "${data.name}" already exists`);
      }
    }

    const updateData: Record<string, any> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if ('code' in data) updateData.code = n(data.code);

    return platformPrisma.partCategory.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteCategory(companyId: string, id: string) {
    const existing = await platformPrisma.partCategory.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Category not found');
    }

    const partCount = await platformPrisma.part.count({ where: { categoryId: id } });
    if (partCount > 0) {
      throw ApiError.badRequest(
        `Cannot delete category — it is referenced by ${partCount} part(s)`,
      );
    }

    await platformPrisma.partCategory.delete({ where: { id } });
    return { id };
  }

  // ════════════════════════════════════════════════════════════════════
  // Product Model CRUD
  // ════════════════════════════════════════════════════════════════════

  async listProductModels(companyId: string) {
    return platformPrisma.productModel.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createProductModel(companyId: string, data: CreateProductModelInput) {
    const existing = await platformPrisma.productModel.findUnique({
      where: { companyId_name: { companyId, name: data.name } },
    });
    if (existing) {
      throw ApiError.conflict(`Product model "${data.name}" already exists`);
    }

    // Auto-generate code: MDL-001, MDL-002, ...
    const count = await platformPrisma.productModel.count({ where: { companyId } });
    let seq = count + 1;
    let code = `MDL-${String(seq).padStart(3, '0')}`;
    while (await platformPrisma.productModel.findFirst({ where: { companyId, code } })) {
      seq++;
      code = `MDL-${String(seq).padStart(3, '0')}`;
    }

    return platformPrisma.productModel.create({
      data: { companyId, name: data.name, code },
    });
  }

  async updateProductModel(companyId: string, id: string, data: UpdateProductModelInput) {
    const existing = await platformPrisma.productModel.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Product model not found');
    }

    if (data.name && data.name !== existing.name) {
      const duplicate = await platformPrisma.productModel.findUnique({
        where: { companyId_name: { companyId, name: data.name } },
      });
      if (duplicate) {
        throw ApiError.conflict(`Product model "${data.name}" already exists`);
      }
    }

    const updateData: Record<string, any> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if ('code' in data) updateData.code = n(data.code);

    return platformPrisma.productModel.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteProductModel(companyId: string, id: string) {
    const existing = await platformPrisma.productModel.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Product model not found');
    }

    const partCount = await platformPrisma.part.count({ where: { productModelId: id } });
    if (partCount > 0) {
      throw ApiError.badRequest(
        `Cannot delete product model — it is referenced by ${partCount} part(s)`,
      );
    }

    await platformPrisma.productModel.delete({ where: { id } });
    return { id };
  }

  // ════════════════════════════════════════════════════════════════════
  // Unit of Measure CRUD
  // ════════════════════════════════════════════════════════════════════

  async listUoms(companyId: string) {
    return platformPrisma.unitOfMeasure.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createUom(companyId: string, data: CreateUomInput) {
    const existing = await platformPrisma.unitOfMeasure.findUnique({
      where: { companyId_abbreviation: { companyId, abbreviation: data.abbreviation } },
    });
    if (existing) {
      throw ApiError.conflict(`UOM abbreviation "${data.abbreviation}" already exists`);
    }

    return platformPrisma.unitOfMeasure.create({
      data: {
        companyId,
        name: data.name,
        abbreviation: data.abbreviation,
      },
    });
  }

  async updateUom(companyId: string, id: string, data: UpdateUomInput) {
    const existing = await platformPrisma.unitOfMeasure.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Unit of measure not found');
    }

    if (data.abbreviation && data.abbreviation !== existing.abbreviation) {
      const duplicate = await platformPrisma.unitOfMeasure.findUnique({
        where: { companyId_abbreviation: { companyId, abbreviation: data.abbreviation } },
      });
      if (duplicate) {
        throw ApiError.conflict(`UOM abbreviation "${data.abbreviation}" already exists`);
      }
    }

    const updateData: Record<string, any> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.abbreviation !== undefined) updateData.abbreviation = data.abbreviation;

    return platformPrisma.unitOfMeasure.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteUom(companyId: string, id: string) {
    const existing = await platformPrisma.unitOfMeasure.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Unit of measure not found');
    }

    const partCount = await platformPrisma.part.count({ where: { uomId: id } });
    if (partCount > 0) {
      throw ApiError.badRequest(
        `Cannot delete unit of measure — it is referenced by ${partCount} part(s)`,
      );
    }

    await platformPrisma.unitOfMeasure.delete({ where: { id } });
    return { id };
  }

  // ════════════════════════════════════════════════════════════════════
  // Part Component Type CRUD
  // ════════════════════════════════════════════════════════════════════

  async listPartComponentTypes(companyId: string) {
    return platformPrisma.partComponentType.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createPartComponentType(companyId: string, data: CreatePartComponentTypeInput) {
    const existing = await platformPrisma.partComponentType.findUnique({
      where: { companyId_name: { companyId, name: data.name } },
    });
    if (existing) {
      throw ApiError.conflict(`Component type "${data.name}" already exists`);
    }

    const count = await platformPrisma.partComponentType.count({ where: { companyId } });
    let seq = count + 1;
    let code = `CMP-${String(seq).padStart(3, '0')}`;
    while (await platformPrisma.partComponentType.findFirst({ where: { companyId, code } })) {
      seq++;
      code = `CMP-${String(seq).padStart(3, '0')}`;
    }

    return platformPrisma.partComponentType.create({
      data: { companyId, name: data.name, code },
    });
  }

  async updatePartComponentType(companyId: string, id: string, data: UpdatePartComponentTypeInput) {
    const existing = await platformPrisma.partComponentType.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Component type not found');
    }

    if (data.name && data.name !== existing.name) {
      const duplicate = await platformPrisma.partComponentType.findUnique({
        where: { companyId_name: { companyId, name: data.name } },
      });
      if (duplicate) {
        throw ApiError.conflict(`Component type "${data.name}" already exists`);
      }
    }

    const updateData: Record<string, any> = {};
    if (data.name !== undefined) updateData.name = data.name;

    return platformPrisma.partComponentType.update({
      where: { id },
      data: updateData,
    });
  }

  async deletePartComponentType(companyId: string, id: string) {
    const existing = await platformPrisma.partComponentType.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Component type not found');
    }

    const partCount = await platformPrisma.part.count({ where: { componentTypeId: id } });
    if (partCount > 0) {
      throw ApiError.badRequest(
        `Cannot delete component type — it is referenced by ${partCount} part(s)`,
      );
    }

    await platformPrisma.partComponentType.delete({ where: { id } });
    return { id };
  }
}

export const partService = new PartService();
