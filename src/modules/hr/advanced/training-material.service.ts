import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { n } from '../../../shared/utils/prisma-helpers';

export class TrainingMaterialService {
  // ════════════════════════════════════════════════════════════════
  // Helpers
  // ════════════════════════════════════════════════════════════════

  private async assertTrainingExists(companyId: string, trainingId: string) {
    const training = await platformPrisma.trainingCatalogue.findUnique({
      where: { id: trainingId },
      select: { id: true, companyId: true },
    });
    if (!training || training.companyId !== companyId) {
      throw ApiError.notFound('Training catalogue not found');
    }
    return training;
  }

  // ════════════════════════════════════════════════════════════════
  // CRUD
  // ════════════════════════════════════════════════════════════════

  async listMaterials(companyId: string, trainingId: string) {
    await this.assertTrainingExists(companyId, trainingId);

    return platformPrisma.trainingMaterial.findMany({
      where: { trainingId, companyId },
      orderBy: { sequenceOrder: 'asc' },
    });
  }

  async createMaterial(companyId: string, trainingId: string, data: any) {
    await this.assertTrainingExists(companyId, trainingId);

    return platformPrisma.trainingMaterial.create({
      data: {
        trainingId,
        companyId,
        name: data.name,
        type: data.type,
        url: data.url,
        description: n(data.description),
        sequenceOrder: n(data.sequenceOrder),
        isMandatory: data.isMandatory ?? true,
      },
    });
  }

  async updateMaterial(companyId: string, id: string, data: any) {
    const existing = await platformPrisma.trainingMaterial.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Training material not found');
    }

    return platformPrisma.trainingMaterial.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.url !== undefined && { url: data.url }),
        ...(data.description !== undefined && { description: n(data.description) }),
        ...(data.sequenceOrder !== undefined && { sequenceOrder: n(data.sequenceOrder) }),
        ...(data.isMandatory !== undefined && { isMandatory: data.isMandatory }),
      },
    });
  }

  async deleteMaterial(companyId: string, id: string) {
    const existing = await platformPrisma.trainingMaterial.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Training material not found');
    }

    await platformPrisma.trainingMaterial.delete({ where: { id } });
    return { deleted: true };
  }
}

export const trainingMaterialService = new TrainingMaterialService();
