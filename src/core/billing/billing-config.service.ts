import { platformPrisma } from '../../config/database';

export class BillingConfigService {
  async getConfig() {
    // Upsert: return existing or create with defaults
    let config = await platformPrisma.platformBillingConfig.findFirst();
    if (!config) {
      config = await platformPrisma.platformBillingConfig.create({ data: {} });
    }
    return config;
  }

  async updateConfig(data: {
    defaultOneTimeMultiplier?: number;
    defaultAmcPercentage?: number;
    defaultCgstRate?: number;
    defaultSgstRate?: number;
    defaultIgstRate?: number;
    platformGstin?: string;
    invoicePrefix?: string;
  }) {
    // Validate IGST = CGST + SGST if tax rates provided
    const cgst = data.defaultCgstRate;
    const sgst = data.defaultSgstRate;
    const igst = data.defaultIgstRate;
    if (cgst !== undefined && sgst !== undefined && igst !== undefined) {
      if (Math.abs(igst - (cgst + sgst)) > 0.01) {
        throw new Error('IGST rate must equal CGST + SGST');
      }
    }

    const config = await this.getConfig();
    return platformPrisma.platformBillingConfig.update({
      where: { id: config.id },
      data,
    });
  }
}

export const billingConfigService = new BillingConfigService();
