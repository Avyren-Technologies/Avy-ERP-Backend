import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { generateNextNumber } from '../../../shared/utils/number-series';
import { n } from '../../../shared/utils/prisma-helpers';

class VehiclePassService {

  async list(companyId: string, filters: { fromDate?: string | undefined; toDate?: string | undefined; search?: string | undefined; page: number; limit: number }) {
    const { page, limit, fromDate, toDate, search } = filters;
    const offset = (page - 1) * limit;
    const where: any = { companyId };
    if (fromDate || toDate) {
      where.entryTime = {};
      if (fromDate) where.entryTime.gte = new Date(fromDate);
      if (toDate) where.entryTime.lte = new Date(toDate);
    }
    if (search) {
      where.OR = [
        { vehicleRegNumber: { contains: search, mode: 'insensitive' } },
        { driverName: { contains: search, mode: 'insensitive' } },
        { passNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      platformPrisma.vehicleGatePass.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { entryTime: 'desc' },
        include: { entryGate: true, exitGate: true },
      }),
      platformPrisma.vehicleGatePass.count({ where }),
    ]);
    return { data, total };
  }

  async getById(companyId: string, id: string) {
    const pass = await platformPrisma.vehicleGatePass.findFirst({
      where: { id, companyId },
      include: { entryGate: true, exitGate: true },
    });
    if (!pass) throw ApiError.notFound('Vehicle gate pass not found');
    return pass;
  }

  async create(companyId: string, input: any, createdBy: string) {
    return platformPrisma.$transaction(async (tx) => {
      const passNumber = await generateNextNumber(
        tx, companyId, ['Vehicle Gate Pass', 'Gate Pass'], 'Vehicle Gate Pass',
      );

      return tx.vehicleGatePass.create({
        data: {
          companyId,
          passNumber,
          vehicleRegNumber: input.vehicleRegNumber,
          vehicleType: input.vehicleType,
          driverName: input.driverName,
          driverMobile: n(input.driverMobile),
          purpose: input.purpose,
          visitId: n(input.visitId),
          materialDescription: n(input.materialDescription),
          vehiclePhoto: n(input.vehiclePhoto),
          entryGateId: input.entryGateId,
          plantId: input.plantId,
          createdBy,
        },
        include: { entryGate: true },
      });
    });
  }

  async recordExit(companyId: string, id: string, exitGateId: string) {
    const pass = await platformPrisma.vehicleGatePass.findFirst({ where: { id, companyId } });
    if (!pass) throw ApiError.notFound('Vehicle gate pass not found');
    if (pass.exitTime) throw ApiError.conflict('Vehicle has already exited');

    return platformPrisma.vehicleGatePass.update({
      where: { id },
      data: { exitGateId, exitTime: new Date() },
      include: { entryGate: true, exitGate: true },
    });
  }
}

export const vehiclePassService = new VehiclePassService();
