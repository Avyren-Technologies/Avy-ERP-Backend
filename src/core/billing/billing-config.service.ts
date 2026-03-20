import { platformPrisma } from '../../config/database';

export class BillingConfigService {
  async getConfig() {
    // Return existing or create with defaults.
    // Use try-catch to handle race condition where two concurrent calls
    // both pass the findFirst check — the loser's create will fail,
    // so we fall back to findFirst again.
    let config = await platformPrisma.platformBillingConfig.findFirst();
    if (config) return config;

    try {
      config = await platformPrisma.platformBillingConfig.create({ data: {} });
      return config;
    } catch {
      // Another concurrent call likely created the config first
      config = await platformPrisma.platformBillingConfig.findFirst();
      if (config) return config;
      throw new Error('Failed to create or retrieve platform billing config');
    }
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
    // Validate IGST = CGST + SGST when any tax rate is updated
    if (
      data.defaultCgstRate !== undefined ||
      data.defaultSgstRate !== undefined ||
      data.defaultIgstRate !== undefined
    ) {
      // Fetch current config to merge with partial update
      const current = await this.getConfig();
      const cgst = data.defaultCgstRate ?? current.defaultCgstRate;
      const sgst = data.defaultSgstRate ?? current.defaultSgstRate;
      const igst = data.defaultIgstRate ?? current.defaultIgstRate;

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
