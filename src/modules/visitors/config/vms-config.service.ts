import { platformPrisma } from '../../../config/database';
import { logger } from '../../../config/logger';

class VmsConfigService {
  async get(companyId: string) {
    let config = await platformPrisma.visitorManagementConfig.findUnique({
      where: { companyId },
    });
    if (!config) {
      // Create default config on first access
      config = await platformPrisma.visitorManagementConfig.create({
        data: { companyId },
      });
      logger.info(`Created default VMS config for company ${companyId}`);
    }
    return config;
  }

  async update(companyId: string, input: any) {
    const config = await platformPrisma.visitorManagementConfig.upsert({
      where: { companyId },
      create: { companyId, ...input },
      update: input,
    });

    logger.info(`VMS config updated for company ${companyId}`);
    return config;
  }
}

export const vmsConfigService = new VmsConfigService();
