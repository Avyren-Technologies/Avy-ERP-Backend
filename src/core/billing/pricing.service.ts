import { platformPrisma } from '../../config/database';
import { roundToDecimal } from '../../shared/utils';

// ────────────────────────────────────────────────────────────────────
// Constants (mirrored from mobile/web)
// ────────────────────────────────────────────────────────────────────

export const MODULE_CATALOGUE = [
  { id: 'hr', name: 'HR', price: 2999 },
  { id: 'security', name: 'Security', price: 1499 },
  { id: 'production', name: 'Production', price: 3499 },
  { id: 'machine-maintenance', name: 'Machine Maintenance', price: 2499 },
  { id: 'inventory', name: 'Inventory', price: 1999 },
  { id: 'vendor', name: 'Vendor', price: 2499 },
  { id: 'sales', name: 'Sales & Invoicing', price: 2999 },
  { id: 'finance', name: 'Finance', price: 2999 },
  { id: 'visitor', name: 'Visitor', price: 999 },
  { id: 'masters', name: 'Masters', price: 499 },
];

export const USER_TIERS: { key: string; label: string; basePrice: number; perUserPrice: number }[] = [
  { key: 'starter', label: 'Starter', basePrice: 4999, perUserPrice: 49 },
  { key: 'growth', label: 'Growth', basePrice: 8999, perUserPrice: 44 },
  { key: 'scale', label: 'Scale', basePrice: 18999, perUserPrice: 38 },
  { key: 'enterprise', label: 'Enterprise', basePrice: 34999, perUserPrice: 32 },
  { key: 'custom', label: 'Custom', basePrice: 0, perUserPrice: 0 },
];

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

export interface LocationPricingInput {
  moduleIds?: string[] | string | null;
  customModulePricing?: Record<string, number> | string | null;
  oneTimeLicenseFee?: number | null;
  amcAmount?: number | null;
  gstin?: string | null;
  billingType?: string | null;
}

export interface CompanyPricingInput {
  selectedModuleIds?: string[] | string | null;
  customModulePricing?: Record<string, number> | string | null;
  userTier?: string | null;
  customTierPrice?: number | null;
  oneTimeMultiplier?: number | null;
  amcPercentage?: number | null;
}

export interface PlatformBillingConfigInput {
  defaultOneTimeMultiplier: number;
  defaultAmcPercentage: number;
  defaultCgstRate: number;
  defaultSgstRate: number;
  defaultIgstRate: number;
  platformGstin?: string | null;
}

export interface GstBreakdown {
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  gstNotApplicable: boolean;
}

export interface LocationCostSummary {
  monthly: number;
  annual: number;
  oneTime: number;
  amc: number;
  billingType: string;
  gst: GstBreakdown;
  totalWithTax: number;
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function parseJsonArray(value: string[] | string | null | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: Record<string, number> | string | null | undefined): Record<string, number> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value as string);
    return typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// ────────────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────────────

export class PricingService {
  // ──────────────────────────────────────────────────────────────────
  // 1. Monthly cost for a single location
  // ──────────────────────────────────────────────────────────────────
  calculateLocationMonthlyCost(
    location: LocationPricingInput,
    company: CompanyPricingInput,
  ): number {
    const moduleIds = parseJsonArray(location.moduleIds ?? company.selectedModuleIds ?? null);
    const customPricing = parseJsonObject(location.customModulePricing ?? company.customModulePricing ?? null);

    // Sum module prices
    let modulesTotal = 0;
    for (const id of moduleIds) {
      if (customPricing[id] != null) {
        modulesTotal += customPricing[id];
      } else {
        const catalogueEntry = MODULE_CATALOGUE.find((m) => m.id === id);
        if (catalogueEntry) {
          modulesTotal += catalogueEntry.price;
        }
      }
    }

    // Add tier base price
    const tierKey = company.userTier ?? 'starter';
    const tier = USER_TIERS.find((t) => t.key === tierKey);
    let tierBasePrice = tier?.basePrice ?? 0;

    // Custom tier: use company's customTierPrice
    if (tierKey === 'custom') {
      tierBasePrice = company.customTierPrice ?? 0;
    }

    return roundToDecimal(modulesTotal + tierBasePrice, 2);
  }

  // ──────────────────────────────────────────────────────────────────
  // 2. Annual cost (10 months)
  // ──────────────────────────────────────────────────────────────────
  calculateAnnualCost(
    location: LocationPricingInput,
    company: CompanyPricingInput,
  ): number {
    return roundToDecimal(this.calculateLocationMonthlyCost(location, company) * 10, 2);
  }

  // ──────────────────────────────────────────────────────────────────
  // 3. One-time license fee
  // ──────────────────────────────────────────────────────────────────
  calculateOneTimeFee(
    location: LocationPricingInput,
    company: CompanyPricingInput,
    config: PlatformBillingConfigInput,
  ): number {
    // Manual override at location level
    if (location.oneTimeLicenseFee != null) {
      return roundToDecimal(location.oneTimeLicenseFee, 2);
    }

    const monthly = this.calculateLocationMonthlyCost(location, company);
    const multiplier = company.oneTimeMultiplier ?? config.defaultOneTimeMultiplier;
    return roundToDecimal(monthly * multiplier, 2);
  }

  // ──────────────────────────────────────────────────────────────────
  // 4. AMC fee
  // ──────────────────────────────────────────────────────────────────
  calculateAmcFee(
    location: LocationPricingInput,
    company: CompanyPricingInput,
    config: PlatformBillingConfigInput,
  ): number {
    // Manual override at location level
    if (location.amcAmount != null) {
      return roundToDecimal(location.amcAmount, 2);
    }

    const oneTimeFee = this.calculateOneTimeFee(location, company, config);
    const amcPercentage = company.amcPercentage ?? config.defaultAmcPercentage;
    return roundToDecimal(oneTimeFee * (amcPercentage / 100), 2);
  }

  // ──────────────────────────────────────────────────────────────────
  // 5. GST calculation
  // ──────────────────────────────────────────────────────────────────
  calculateGST(
    platformGstin: string | null | undefined,
    locationGstin: string | null | undefined,
    amount: number,
    config: PlatformBillingConfigInput,
  ): GstBreakdown {
    // Null guard — if either GSTIN is missing, GST is not applicable
    if (!platformGstin || !locationGstin) {
      return { cgst: 0, sgst: 0, igst: 0, totalTax: 0, gstNotApplicable: true };
    }

    const platformState = platformGstin.substring(0, 2);
    const locationState = locationGstin.substring(0, 2);

    if (platformState === locationState) {
      // Intra-state: CGST + SGST
      const cgst = roundToDecimal(amount * (config.defaultCgstRate / 100), 2);
      const sgst = roundToDecimal(amount * (config.defaultSgstRate / 100), 2);
      return { cgst, sgst, igst: 0, totalTax: roundToDecimal(cgst + sgst, 2), gstNotApplicable: false };
    } else {
      // Inter-state: IGST
      const igst = roundToDecimal(amount * (config.defaultIgstRate / 100), 2);
      return { cgst: 0, sgst: 0, igst, totalTax: igst, gstNotApplicable: false };
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 6. Full cost summary for a location
  // ──────────────────────────────────────────────────────────────────
  calculateLocationCostSummary(
    location: LocationPricingInput,
    company: CompanyPricingInput,
    config: PlatformBillingConfigInput,
  ): LocationCostSummary {
    const monthly = this.calculateLocationMonthlyCost(location, company);
    const annual = this.calculateAnnualCost(location, company);
    const oneTime = this.calculateOneTimeFee(location, company, config);
    const amc = this.calculateAmcFee(location, company, config);
    const billingType = location.billingType ?? 'MONTHLY';

    // Determine the taxable amount based on billing type
    let taxableAmount: number;
    switch (billingType) {
      case 'ANNUAL':
        taxableAmount = annual;
        break;
      case 'ONE_TIME_AMC':
        taxableAmount = oneTime;
        break;
      case 'MONTHLY':
      default:
        taxableAmount = monthly;
        break;
    }

    const gst = this.calculateGST(config.platformGstin, location.gstin, taxableAmount, config);
    const totalWithTax = roundToDecimal(taxableAmount + gst.totalTax, 2);

    return { monthly, annual, oneTime, amc, billingType, gst, totalWithTax };
  }

  // ──────────────────────────────────────────────────────────────────
  // 7. Fetch (or create) platform billing config
  // ──────────────────────────────────────────────────────────────────
  async getConfig(): Promise<PlatformBillingConfigInput & { id: string }> {
    const existing = await platformPrisma.platformBillingConfig.findFirst();
    if (existing) {
      return existing;
    }

    // Create with defaults if none exists.
    // Use try-catch to handle race condition where two concurrent calls
    // both pass the findFirst check — the second create will fail with
    // a unique constraint error, so we retry the findFirst.
    try {
      const created = await platformPrisma.platformBillingConfig.create({
        data: {
          defaultOneTimeMultiplier: 24,
          defaultAmcPercentage: 18,
          defaultCgstRate: 9,
          defaultSgstRate: 9,
          defaultIgstRate: 18,
          platformGstin: null,
          invoicePrefix: 'INV',
        },
      });
      return created;
    } catch {
      // Another concurrent call likely created the config first — fetch it
      const fallback = await platformPrisma.platformBillingConfig.findFirst();
      if (fallback) return fallback;
      throw new Error('Failed to create or retrieve platform billing config');
    }
  }
}

export const pricingService = new PricingService();
