import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { generateNextNumber } from '../../../shared/utils/number-series';
import { n } from '../../../shared/utils/prisma-helpers';
import QRCode from 'qrcode';
import { logger } from '../../../config/logger';

class MaterialPassService {

  async list(companyId: string, filters: { type?: string | undefined; returnStatus?: string | undefined; fromDate?: string | undefined; toDate?: string | undefined; search?: string | undefined; page: number; limit: number }) {
    const { page, limit, type, returnStatus, fromDate, toDate, search } = filters;
    const offset = (page - 1) * limit;
    const where: any = { companyId };
    if (type) where.type = type;
    if (returnStatus) where.returnStatus = returnStatus;
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) where.createdAt.lte = new Date(toDate);
    }
    if (search) {
      where.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        { passNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      platformPrisma.materialGatePass.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { gate: true },
      }),
      platformPrisma.materialGatePass.count({ where }),
    ]);

    // Resolve authorizedBy employee names from IDs
    const authIds = [...new Set(data.map(p => p.authorizedBy).filter(Boolean))] as string[];
    const employees = authIds.length > 0 ? await platformPrisma.employee.findMany({
      where: { id: { in: authIds } },
      select: { id: true, firstName: true, lastName: true },
    }) : [];
    const empMap = new Map(employees.map(e => [e.id, `${e.firstName} ${e.lastName}`]));

    // Enrich with employee names and QR codes
    const enrichedData = await Promise.all(data.map(async (p) => {
      let qrCode: string | null = null;
      if (p.passNumber) {
        try {
          qrCode = await QRCode.toDataURL(p.passNumber, {
            width: 200,
            margin: 1,
            color: { dark: '#000000', light: '#FFFFFF' },
          });
        } catch (err) {
          logger.warn('Failed to generate QR for material pass', { passId: p.id });
        }
      }
      return {
        ...p,
        authorizedByName: p.authorizedBy ? (empMap.get(p.authorizedBy) ?? null) : null,
        qrCode,
      };
    }));

    return { data: enrichedData, total };
  }

  async getById(companyId: string, id: string) {
    const pass = await platformPrisma.materialGatePass.findFirst({
      where: { id, companyId },
      include: { gate: true },
    });
    if (!pass) throw ApiError.notFound('Material gate pass not found');

    // Resolve authorizedBy employee name
    let authorizedByName: string | null = null;
    if (pass.authorizedBy) {
      const emp = await platformPrisma.employee.findUnique({
        where: { id: pass.authorizedBy },
        select: { firstName: true, lastName: true },
      });
      if (emp) authorizedByName = `${emp.firstName} ${emp.lastName}`;
    }

    // Generate QR code dynamically
    let qrCode: string | null = null;
    if (pass.passNumber) {
      try {
        qrCode = await QRCode.toDataURL(pass.passNumber, {
          width: 300,
          margin: 2,
          color: { dark: '#000000', light: '#FFFFFF' },
        });
      } catch (err) {
        logger.warn('Failed to generate QR for material pass', { passId: pass.id });
      }
    }

    return { ...pass, authorizedByName, qrCode };
  }

  async create(companyId: string, input: any, createdBy: string) {
    return platformPrisma.$transaction(async (tx) => {
      const passNumber = await generateNextNumber(
        tx, companyId, ['Material Gate Pass', 'Gate Pass'], 'Material Gate Pass',
      );

      const returnStatus = input.type === 'RETURNABLE' ? 'PENDING_RETURN' : 'NOT_APPLICABLE';

      return tx.materialGatePass.create({
        data: {
          companyId,
          passNumber,
          type: input.type,
          description: input.description,
          quantityIssued: n(input.quantityIssued),
          visitId: n(input.visitId),
          authorizedBy: input.authorizedBy,
          purpose: input.purpose,
          expectedReturnDate: input.expectedReturnDate ? new Date(input.expectedReturnDate) : null,
          returnStatus: returnStatus as any,
          gateId: input.gateId,
          plantId: input.plantId,
          createdBy,
        },
        include: { gate: true },
      });
    });
  }

  async markReturned(companyId: string, id: string, input: { quantityReturned: string; returnStatus: string }) {
    const pass = await platformPrisma.materialGatePass.findFirst({ where: { id, companyId } });
    if (!pass) throw ApiError.notFound('Material gate pass not found');
    if (pass.returnStatus === 'FULLY_RETURNED') throw ApiError.conflict('Material has already been fully returned');
    if (pass.returnStatus === 'NOT_APPLICABLE') throw ApiError.badRequest('This pass does not require a return');

    return platformPrisma.materialGatePass.update({
      where: { id },
      data: {
        quantityReturned: input.quantityReturned,
        returnStatus: input.returnStatus as any,
        returnedAt: input.returnStatus === 'FULLY_RETURNED' ? new Date() : null,
      },
      include: { gate: true },
    });
  }
}

export const materialPassService = new MaterialPassService();
