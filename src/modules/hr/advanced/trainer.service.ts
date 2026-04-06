import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';

/** Convert undefined to null for Prisma nullable fields. */
function n<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

interface TrainerListOptions {
  page?: number;
  limit?: number;
  isInternal?: boolean;
  isActive?: boolean;
}

class TrainerService {
  // ════════════════════════════════════════════════════════════════
  // LIST
  // ════════════════════════════════════════════════════════════════

  async listTrainers(companyId: string, options: TrainerListOptions = {}) {
    const { page = 1, limit = 25, isInternal, isActive } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (isInternal !== undefined) where.isInternal = isInternal;
    if (isActive !== undefined) where.isActive = isActive;

    const [trainers, total] = await Promise.all([
      platformPrisma.trainer.findMany({
        where,
        include: {
          employee: {
            select: { id: true, employeeId: true, firstName: true, lastName: true },
          },
          _count: { select: { sessions: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.trainer.count({ where }),
    ]);

    return { trainers, total, page, limit };
  }

  // ════════════════════════════════════════════════════════════════
  // GET
  // ════════════════════════════════════════════════════════════════

  async getTrainer(companyId: string, id: string) {
    const trainer = await platformPrisma.trainer.findUnique({
      where: { id },
      include: {
        employee: {
          select: { id: true, employeeId: true, firstName: true, lastName: true },
        },
        sessions: {
          select: {
            id: true,
            sessionNumber: true,
            batchName: true,
            startDateTime: true,
            endDateTime: true,
            status: true,
            training: { select: { id: true, name: true, type: true } },
          },
          orderBy: { startDateTime: 'desc' },
          take: 20,
        },
        _count: { select: { sessions: true } },
      },
    });

    if (!trainer || trainer.companyId !== companyId) {
      throw ApiError.notFound('Trainer not found');
    }

    return trainer;
  }

  // ════════════════════════════════════════════════════════════════
  // CREATE
  // ════════════════════════════════════════════════════════════════

  async createTrainer(companyId: string, data: any) {
    // Validate employee exists if internal
    if (data.employeeId) {
      const employee = await platformPrisma.employee.findUnique({
        where: { id: data.employeeId },
      });
      if (!employee || employee.companyId !== companyId) {
        throw ApiError.notFound('Employee not found');
      }
    }

    const trainer = await platformPrisma.trainer.create({
      data: {
        companyId,
        employeeId: n(data.employeeId),
        externalName: n(data.externalName),
        email: data.email,
        phone: n(data.phone),
        specializations: data.specializations ?? [],
        qualifications: n(data.qualifications),
        experienceYears: n(data.experienceYears),
        isInternal: data.isInternal ?? (!!data.employeeId),
      },
      include: {
        employee: {
          select: { id: true, employeeId: true, firstName: true, lastName: true },
        },
        _count: { select: { sessions: true } },
      },
    });

    return trainer;
  }

  // ════════════════════════════════════════════════════════════════
  // UPDATE
  // ════════════════════════════════════════════════════════════════

  async updateTrainer(companyId: string, id: string, data: any) {
    const trainer = await platformPrisma.trainer.findUnique({ where: { id } });
    if (!trainer || trainer.companyId !== companyId) {
      throw ApiError.notFound('Trainer not found');
    }

    // Validate employee if changing
    if (data.employeeId) {
      const employee = await platformPrisma.employee.findUnique({
        where: { id: data.employeeId },
      });
      if (!employee || employee.companyId !== companyId) {
        throw ApiError.notFound('Employee not found');
      }
    }

    return platformPrisma.trainer.update({
      where: { id },
      data: {
        ...(data.employeeId !== undefined && { employeeId: n(data.employeeId) }),
        ...(data.externalName !== undefined && { externalName: n(data.externalName) }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.phone !== undefined && { phone: n(data.phone) }),
        ...(data.specializations !== undefined && { specializations: data.specializations }),
        ...(data.qualifications !== undefined && { qualifications: n(data.qualifications) }),
        ...(data.experienceYears !== undefined && { experienceYears: n(data.experienceYears) }),
        ...(data.isInternal !== undefined && { isInternal: data.isInternal }),
      },
      include: {
        employee: {
          select: { id: true, employeeId: true, firstName: true, lastName: true },
        },
        _count: { select: { sessions: true } },
      },
    });
  }

  // ════════════════════════════════════════════════════════════════
  // DELETE (soft)
  // ════════════════════════════════════════════════════════════════

  async deleteTrainer(companyId: string, id: string) {
    const trainer = await platformPrisma.trainer.findUnique({ where: { id } });
    if (!trainer || trainer.companyId !== companyId) {
      throw ApiError.notFound('Trainer not found');
    }

    await platformPrisma.trainer.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: 'Trainer deactivated' };
  }
}

export const trainerService = new TrainerService();
