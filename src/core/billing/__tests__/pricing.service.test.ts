// Mock platformPrisma before importing the service
jest.mock('../../../config/database', () => ({
  platformPrisma: {
    platformBillingConfig: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  },
}));

import { platformPrisma } from '../../../config/database';
import {
  PricingService,
  MODULE_CATALOGUE,
  USER_TIERS,
  PlatformBillingConfigInput,
  LocationPricingInput,
  CompanyPricingInput,
} from '../pricing.service';

const mockPlatformBillingConfig = platformPrisma.platformBillingConfig as any;

describe('PricingService', () => {
  let service: PricingService;

  const defaultConfig: PlatformBillingConfigInput = {
    defaultOneTimeMultiplier: 24,
    defaultAmcPercentage: 18,
    defaultCgstRate: 9,
    defaultSgstRate: 9,
    defaultIgstRate: 18,
    platformGstin: '27AABCU9603R1ZM', // Maharashtra
  };

  beforeEach(() => {
    service = new PricingService();
  });

  // ──────────────────────────────────────────────────────────────────
  // Constants sanity checks
  // ──────────────────────────────────────────────────────────────────
  describe('constants', () => {
    it('should have 10 modules in MODULE_CATALOGUE', () => {
      expect(MODULE_CATALOGUE).toHaveLength(10);
    });

    it('should have 5 tiers in USER_TIERS', () => {
      expect(USER_TIERS).toHaveLength(5);
    });

    it('should have custom tier with zero base price', () => {
      const custom = USER_TIERS.find((t) => t.key === 'custom');
      expect(custom?.basePrice).toBe(0);
      expect(custom?.perUserPrice).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // calculateLocationMonthlyCost
  // ──────────────────────────────────────────────────────────────────
  describe('calculateLocationMonthlyCost', () => {
    it('should sum standard module prices + tier base price', () => {
      const location: LocationPricingInput = {
        moduleIds: ['hr', 'security'],
      };
      const company: CompanyPricingInput = {
        userTier: 'starter',
      };

      // hr=2999 + security=1499 + starter base=4999
      const result = service.calculateLocationMonthlyCost(location, company);
      expect(result).toBe(9497);
    });

    it('should fall back to company.selectedModuleIds when location.moduleIds is null', () => {
      const location: LocationPricingInput = {};
      const company: CompanyPricingInput = {
        selectedModuleIds: ['masters', 'visitor'],
        userTier: 'growth',
      };

      // masters=499 + visitor=999 + growth base=8999
      const result = service.calculateLocationMonthlyCost(location, company);
      expect(result).toBe(10497);
    });

    it('should use custom pricing when available', () => {
      const location: LocationPricingInput = {
        moduleIds: ['hr', 'security'],
        customModulePricing: { hr: 1500 },
      };
      const company: CompanyPricingInput = {
        userTier: 'starter',
      };

      // hr=1500 (custom) + security=1499 + starter base=4999
      const result = service.calculateLocationMonthlyCost(location, company);
      expect(result).toBe(7998);
    });

    it('should cascade custom pricing from company when location has none', () => {
      const location: LocationPricingInput = {
        moduleIds: ['hr'],
      };
      const company: CompanyPricingInput = {
        userTier: 'starter',
        customModulePricing: { hr: 2000 },
      };

      // hr=2000 (company custom) + starter base=4999
      const result = service.calculateLocationMonthlyCost(location, company);
      expect(result).toBe(6999);
    });

    it('should return 0 modules cost when no modules selected', () => {
      const location: LocationPricingInput = {};
      const company: CompanyPricingInput = {
        userTier: 'starter',
      };

      // no modules + starter base=4999
      const result = service.calculateLocationMonthlyCost(location, company);
      expect(result).toBe(4999);
    });

    it('should handle custom tier with customTierPrice', () => {
      const location: LocationPricingInput = {
        moduleIds: ['hr'],
      };
      const company: CompanyPricingInput = {
        userTier: 'custom',
        customTierPrice: 50000,
      };

      // hr=2999 + custom base=50000
      const result = service.calculateLocationMonthlyCost(location, company);
      expect(result).toBe(52999);
    });

    it('should handle custom tier with no customTierPrice (defaults to 0)', () => {
      const location: LocationPricingInput = {
        moduleIds: ['hr'],
      };
      const company: CompanyPricingInput = {
        userTier: 'custom',
      };

      // hr=2999 + custom base=0
      const result = service.calculateLocationMonthlyCost(location, company);
      expect(result).toBe(2999);
    });

    it('should parse JSON string moduleIds', () => {
      const location: LocationPricingInput = {
        moduleIds: JSON.stringify(['hr', 'security']),
      };
      const company: CompanyPricingInput = {
        userTier: 'starter',
      };

      const result = service.calculateLocationMonthlyCost(location, company);
      expect(result).toBe(9497);
    });

    it('should parse JSON string customModulePricing', () => {
      const location: LocationPricingInput = {
        moduleIds: ['hr'],
        customModulePricing: JSON.stringify({ hr: 1000 }),
      };
      const company: CompanyPricingInput = {
        userTier: 'starter',
      };

      // hr=1000 (custom) + starter=4999
      const result = service.calculateLocationMonthlyCost(location, company);
      expect(result).toBe(5999);
    });

    it('should ignore unknown module IDs', () => {
      const location: LocationPricingInput = {
        moduleIds: ['hr', 'nonexistent'],
      };
      const company: CompanyPricingInput = {
        userTier: 'starter',
      };

      // hr=2999 + starter=4999
      const result = service.calculateLocationMonthlyCost(location, company);
      expect(result).toBe(7998);
    });

    it('should default to starter tier when userTier is null', () => {
      const location: LocationPricingInput = {
        moduleIds: ['masters'],
      };
      const company: CompanyPricingInput = {};

      // masters=499 + starter=4999
      const result = service.calculateLocationMonthlyCost(location, company);
      expect(result).toBe(5498);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // calculateAnnualCost
  // ──────────────────────────────────────────────────────────────────
  describe('calculateAnnualCost', () => {
    it('should return monthly × 10', () => {
      const location: LocationPricingInput = {
        moduleIds: ['hr'],
      };
      const company: CompanyPricingInput = {
        userTier: 'starter',
      };

      const monthly = service.calculateLocationMonthlyCost(location, company);
      const annual = service.calculateAnnualCost(location, company);
      expect(annual).toBe(monthly * 10);
    });

    it('should return 0 for empty modules + custom tier with no price', () => {
      const location: LocationPricingInput = {};
      const company: CompanyPricingInput = {
        userTier: 'custom',
      };

      const result = service.calculateAnnualCost(location, company);
      expect(result).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // calculateOneTimeFee
  // ──────────────────────────────────────────────────────────────────
  describe('calculateOneTimeFee', () => {
    it('should use default 24× multiplier', () => {
      const location: LocationPricingInput = {
        moduleIds: ['masters'], // 499
      };
      const company: CompanyPricingInput = {
        userTier: 'starter', // 4999
      };

      // monthly = 5498, one-time = 5498 * 24 = 131952
      const result = service.calculateOneTimeFee(location, company, defaultConfig);
      expect(result).toBe(131952);
    });

    it('should use company override multiplier', () => {
      const location: LocationPricingInput = {
        moduleIds: ['masters'],
      };
      const company: CompanyPricingInput = {
        userTier: 'starter',
        oneTimeMultiplier: 12,
      };

      // monthly = 5498, one-time = 5498 * 12 = 65976
      const result = service.calculateOneTimeFee(location, company, defaultConfig);
      expect(result).toBe(65976);
    });

    it('should use location manual override', () => {
      const location: LocationPricingInput = {
        moduleIds: ['masters'],
        oneTimeLicenseFee: 100000,
      };
      const company: CompanyPricingInput = {
        userTier: 'starter',
      };

      const result = service.calculateOneTimeFee(location, company, defaultConfig);
      expect(result).toBe(100000);
    });

    it('should prefer location override over company multiplier', () => {
      const location: LocationPricingInput = {
        oneTimeLicenseFee: 50000,
      };
      const company: CompanyPricingInput = {
        userTier: 'starter',
        oneTimeMultiplier: 36,
      };

      const result = service.calculateOneTimeFee(location, company, defaultConfig);
      expect(result).toBe(50000);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // calculateAmcFee
  // ──────────────────────────────────────────────────────────────────
  describe('calculateAmcFee', () => {
    it('should use default 18% of one-time fee', () => {
      const location: LocationPricingInput = {
        moduleIds: ['masters'],
      };
      const company: CompanyPricingInput = {
        userTier: 'starter',
      };

      const oneTime = service.calculateOneTimeFee(location, company, defaultConfig);
      const amc = service.calculateAmcFee(location, company, defaultConfig);
      expect(amc).toBe(roundToDecimal(oneTime * 0.18, 2));
    });

    it('should use company override AMC percentage', () => {
      const location: LocationPricingInput = {
        moduleIds: ['masters'],
      };
      const company: CompanyPricingInput = {
        userTier: 'starter',
        amcPercentage: 25,
      };

      const oneTime = service.calculateOneTimeFee(location, company, defaultConfig);
      const amc = service.calculateAmcFee(location, company, defaultConfig);
      expect(amc).toBe(roundToDecimal(oneTime * 0.25, 2));
    });

    it('should use location manual override', () => {
      const location: LocationPricingInput = {
        moduleIds: ['masters'],
        amcAmount: 20000,
      };
      const company: CompanyPricingInput = {
        userTier: 'starter',
      };

      const result = service.calculateAmcFee(location, company, defaultConfig);
      expect(result).toBe(20000);
    });

    it('should prefer location amcAmount over company amcPercentage', () => {
      const location: LocationPricingInput = {
        amcAmount: 15000,
      };
      const company: CompanyPricingInput = {
        userTier: 'starter',
        amcPercentage: 50,
      };

      const result = service.calculateAmcFee(location, company, defaultConfig);
      expect(result).toBe(15000);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // calculateGST
  // ──────────────────────────────────────────────────────────────────
  describe('calculateGST', () => {
    it('should return CGST + SGST for same-state (intra-state)', () => {
      // Both Maharashtra (27)
      const result = service.calculateGST('27AABCU9603R1ZM', '27AAACB1234F1ZN', 10000, defaultConfig);

      expect(result.cgst).toBe(900);
      expect(result.sgst).toBe(900);
      expect(result.igst).toBe(0);
      expect(result.totalTax).toBe(1800);
      expect(result.gstNotApplicable).toBe(false);
    });

    it('should return IGST for different-state (inter-state)', () => {
      // Platform: Maharashtra (27), Location: Karnataka (29)
      const result = service.calculateGST('27AABCU9603R1ZM', '29AAACB1234F1ZN', 10000, defaultConfig);

      expect(result.cgst).toBe(0);
      expect(result.sgst).toBe(0);
      expect(result.igst).toBe(1800);
      expect(result.totalTax).toBe(1800);
      expect(result.gstNotApplicable).toBe(false);
    });

    it('should return gstNotApplicable when platformGstin is null', () => {
      const result = service.calculateGST(null, '27AAACB1234F1ZN', 10000, defaultConfig);

      expect(result.cgst).toBe(0);
      expect(result.sgst).toBe(0);
      expect(result.igst).toBe(0);
      expect(result.totalTax).toBe(0);
      expect(result.gstNotApplicable).toBe(true);
    });

    it('should return gstNotApplicable when locationGstin is null', () => {
      const result = service.calculateGST('27AABCU9603R1ZM', null, 10000, defaultConfig);

      expect(result.totalTax).toBe(0);
      expect(result.gstNotApplicable).toBe(true);
    });

    it('should return gstNotApplicable when both GSTINs are null', () => {
      const result = service.calculateGST(null, null, 10000, defaultConfig);

      expect(result.totalTax).toBe(0);
      expect(result.gstNotApplicable).toBe(true);
    });

    it('should return gstNotApplicable when platformGstin is empty string', () => {
      const result = service.calculateGST('', '27AAACB1234F1ZN', 10000, defaultConfig);

      expect(result.gstNotApplicable).toBe(true);
    });

    it('should round GST amounts to 2 decimal places', () => {
      const result = service.calculateGST('27AABCU9603R1ZM', '27AAACB1234F1ZN', 999.99, defaultConfig);

      expect(result.cgst).toBe(90);
      expect(result.sgst).toBe(90);
      expect(result.totalTax).toBe(180);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // calculateLocationCostSummary
  // ──────────────────────────────────────────────────────────────────
  describe('calculateLocationCostSummary', () => {
    it('should return complete summary for MONTHLY billing', () => {
      const location: LocationPricingInput = {
        moduleIds: ['hr', 'security'],
        gstin: '27AAACB1234F1ZN', // Same state as platform
        billingType: 'MONTHLY',
      };
      const company: CompanyPricingInput = {
        userTier: 'starter',
      };

      const result = service.calculateLocationCostSummary(location, company, defaultConfig);

      expect(result.monthly).toBe(9497); // hr(2999)+security(1499)+starter(4999)
      expect(result.annual).toBe(94970); // 9497 * 10
      expect(result.oneTime).toBe(227928); // 9497 * 24
      expect(result.billingType).toBe('MONTHLY');

      // GST on monthly amount (same state: CGST+SGST)
      expect(result.gst.cgst).toBe(854.73);
      expect(result.gst.sgst).toBe(854.73);
      expect(result.gst.igst).toBe(0);
      expect(result.gst.gstNotApplicable).toBe(false);
      expect(result.totalWithTax).toBe(9497 + 854.73 + 854.73);
    });

    it('should return complete summary for ANNUAL billing', () => {
      const location: LocationPricingInput = {
        moduleIds: ['masters'],
        gstin: '29AAACB1234F1ZN', // Karnataka — different state
        billingType: 'ANNUAL',
      };
      const company: CompanyPricingInput = {
        userTier: 'starter',
      };

      const result = service.calculateLocationCostSummary(location, company, defaultConfig);

      // monthly=5498, annual=54980
      expect(result.monthly).toBe(5498);
      expect(result.annual).toBe(54980);
      expect(result.billingType).toBe('ANNUAL');

      // GST on annual amount (inter-state: IGST)
      expect(result.gst.igst).toBe(9896.4);
      expect(result.gst.cgst).toBe(0);
      expect(result.gst.sgst).toBe(0);
      expect(result.totalWithTax).toBe(54980 + 9896.4);
    });

    it('should return complete summary for ONE_TIME_AMC billing', () => {
      const location: LocationPricingInput = {
        moduleIds: ['masters'],
        gstin: '27AAACB1234F1ZN',
        billingType: 'ONE_TIME_AMC',
      };
      const company: CompanyPricingInput = {
        userTier: 'starter',
      };

      const result = service.calculateLocationCostSummary(location, company, defaultConfig);

      // monthly=5498, oneTime=5498*24=131952
      expect(result.oneTime).toBe(131952);
      expect(result.billingType).toBe('ONE_TIME_AMC');

      // GST on one-time amount (same state)
      expect(result.gst.cgst).toBe(11875.68);
      expect(result.gst.sgst).toBe(11875.68);
      expect(result.totalWithTax).toBe(131952 + 11875.68 + 11875.68);
    });

    it('should default billing type to MONTHLY when not specified', () => {
      const location: LocationPricingInput = {
        moduleIds: ['masters'],
        gstin: '27AAACB1234F1ZN',
      };
      const company: CompanyPricingInput = {
        userTier: 'starter',
      };

      const result = service.calculateLocationCostSummary(location, company, defaultConfig);
      expect(result.billingType).toBe('MONTHLY');
    });

    it('should handle no GST when GSTIN is missing', () => {
      const location: LocationPricingInput = {
        moduleIds: ['masters'],
        billingType: 'MONTHLY',
      };
      const company: CompanyPricingInput = {
        userTier: 'starter',
      };

      const result = service.calculateLocationCostSummary(location, company, defaultConfig);

      expect(result.gst.gstNotApplicable).toBe(true);
      expect(result.gst.totalTax).toBe(0);
      expect(result.totalWithTax).toBe(result.monthly);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // getConfig
  // ──────────────────────────────────────────────────────────────────
  describe('getConfig', () => {
    it('should return existing config when found', async () => {
      const existingConfig = {
        id: 'config-1',
        ...defaultConfig,
      };
      mockPlatformBillingConfig.findFirst.mockResolvedValue(existingConfig);

      const result = await service.getConfig();
      expect(result).toEqual(existingConfig);
      expect(mockPlatformBillingConfig.create).not.toHaveBeenCalled();
    });

    it('should create config with defaults when none exists', async () => {
      const createdConfig = {
        id: 'config-new',
        defaultOneTimeMultiplier: 24,
        defaultAmcPercentage: 18,
        defaultCgstRate: 9,
        defaultSgstRate: 9,
        defaultIgstRate: 18,
        platformGstin: null,
        invoicePrefix: 'INV',
      };
      mockPlatformBillingConfig.findFirst.mockResolvedValue(null);
      mockPlatformBillingConfig.create.mockResolvedValue(createdConfig);

      const result = await service.getConfig();
      expect(result).toEqual(createdConfig);
      expect(mockPlatformBillingConfig.create).toHaveBeenCalledWith({
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
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// Helper: roundToDecimal (imported to verify test expectations)
// ────────────────────────────────────────────────────────────────────
import { roundToDecimal } from '../../../shared/utils';
