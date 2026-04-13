import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { generateNextNumber } from '../../../shared/utils/number-series';
import { n } from '../../../shared/utils/prisma-helpers';

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
    return { data, total };
  }

  async getById(companyId: string, id: string) {
    const pass = await platformPrisma.materialGatePass.findFirst({
      where: { id, companyId },
      include: { gate: true },
    });
    if (!pass) throw ApiError.notFound('Material gate pass not found');
    return pass;
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
