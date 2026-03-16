import { platformPrisma } from '../../config/database';
import { ApiError } from '../../shared/errors/api-error';
import { HttpStatus } from '../../shared/types';
import { logger } from '../../config/logger';

export interface FeatureToggleEntry {
  feature: string;
  enabled: boolean;
}

export class FeatureToggleService {
  // Get all feature toggles for a user in a tenant
  async getUserToggles(tenantId: string, userId: string): Promise<FeatureToggleEntry[]> {
    const toggles = await platformPrisma.featureToggle.findMany({
      where: { tenantId, userId },
    });

    return toggles.map((t) => ({ feature: t.feature, enabled: t.enabled }));
  }

  // Upsert feature toggles for a user
  async setUserToggles(tenantId: string, userId: string, toggles: FeatureToggleEntry[]): Promise<FeatureToggleEntry[]> {
    // Validate user exists
    const user = await platformPrisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiError('User not found', HttpStatus.NOT_FOUND, true, 'USER_NOT_FOUND');
    }

    // Upsert each toggle
    for (const toggle of toggles) {
      await platformPrisma.featureToggle.upsert({
        where: {
          tenantId_userId_feature: { tenantId, userId, feature: toggle.feature },
        },
        create: {
          tenantId,
          userId,
          feature: toggle.feature,
          enabled: toggle.enabled,
        },
        update: {
          enabled: toggle.enabled,
        },
      });
    }

    logger.info(`Feature toggles updated for user ${userId} in tenant ${tenantId}`);
    return this.getUserToggles(tenantId, userId);
  }

  // Delete a specific feature toggle
  async deleteToggle(tenantId: string, userId: string, feature: string): Promise<void> {
    await platformPrisma.featureToggle.deleteMany({
      where: { tenantId, userId, feature },
    });
  }
}

export const featureToggleService = new FeatureToggleService();
