// Mock platformPrisma before importing the service
jest.mock('../../../config/database', () => ({
  platformPrisma: {
    company: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    subscription: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    tenant: {
      update: jest.fn(),
    },
    location: {
      update: jest.fn(),
    },
    platformBillingConfig: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  },
}));

import { platformPrisma } from '../../../config/database';
import { SubscriptionService } from '../subscription.service';

const mockCompany = platformPrisma.company as any;
const mockSubscription = platformPrisma.subscription as any;
const mockTenant = platformPrisma.tenant as any;
const mockLocation = platformPrisma.location as any;
const mockBillingConfig = platformPrisma.platformBillingConfig as any;

// ────────────────────────────────────────────────────────────────────
// Test Fixtures
// ────────────────────────────────────────────────────────────────────

const defaultConfig = {
  id: 'config-1',
  defaultOneTimeMultiplier: 24,
  defaultAmcPercentage: 18,
  defaultCgstRate: 9,
  defaultSgstRate: 9,
  defaultIgstRate: 18,
  platformGstin: '27AABCU9603R1ZM',
};

const baseLocation = {
  id: 'loc-1',
  companyId: 'comp-1',
  name: 'HQ Mumbai',
  code: 'HQ-MUM',
  facilityType: 'Head Office',
  status: 'Active',
  isHQ: true,
  moduleIds: ['hr', 'security'],
  customModulePricing: null,
  userTier: null,
  customUserLimit: null,
  customTierPrice: null,
  billingType: 'MONTHLY',
  oneTimeLicenseFee: null,
  amcAmount: null,
  gstin: '27AAACB1234F1ZN',
};

const baseCompany = {
  id: 'comp-1',
  name: 'Acme Corp',
  industry: 'Manufacturing',
  size: 'MEDIUM',
  endpointType: 'default',
  selectedModuleIds: ['hr', 'security'],
  customModulePricing: null,
  userTier: 'starter',
  customUserLimit: null,
  customTierPrice: null,
  billingType: 'MONTHLY',
  oneTimeMultiplier: null,
  amcPercentage: null,
  locations: [baseLocation],
  tenant: {
    id: 'tenant-1',
    companyId: 'comp-1',
    schemaName: 'acme',
    status: 'ACTIVE',
  },
};

const baseSubscription = {
  id: 'sub-1',
  tenantId: 'tenant-1',
  planId: 'plan-starter',
  userTier: 'STARTER',
  billingType: 'MONTHLY',
  status: 'ACTIVE',
  startDate: new Date('2025-01-01'),
  endDate: null,
  trialEndsAt: null,
  oneTimeLicenseFee: null,
  amcAmount: null,
  amcDueDate: null,
  amcStatus: 'NOT_APPLICABLE',
};

function setupMocks(overrides?: {
  company?: any;
  subscription?: any;
  config?: any;
}) {
  const company = overrides?.company ?? baseCompany;
  const subscription = overrides?.subscription ?? baseSubscription;
  const config = overrides?.config ?? defaultConfig;

  mockCompany.findUnique.mockResolvedValue(company);
  mockSubscription.findUnique.mockResolvedValue(subscription);
  mockBillingConfig.findFirst.mockResolvedValue(config);
  mockSubscription.update.mockResolvedValue({ ...subscription });
  mockTenant.update.mockResolvedValue({ ...company.tenant });
  mockLocation.update.mockResolvedValue({ ...baseLocation });
  mockCompany.update.mockResolvedValue({ ...company });
}

// ────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────

describe('SubscriptionService', () => {
  let service: SubscriptionService;

  beforeEach(() => {
    service = new SubscriptionService();
    jest.clearAllMocks();
  });

  // ── getSubscriptionDetail ─────────────────────────────────────────
  describe('getSubscriptionDetail', () => {
    it('should return subscription detail with per-location cost breakdowns', async () => {
      setupMocks();

      const result = await service.getSubscriptionDetail('comp-1');

      expect(result.subscription.id).toBe('sub-1');
      expect(result.subscription.billingType).toBe('MONTHLY');
      expect(result.company.id).toBe('comp-1');
      expect(result.company.name).toBe('Acme Corp');
      expect(result.locationBreakdowns).toHaveLength(1);
      expect(result.locationBreakdowns[0].locationId).toBe('loc-1');
      expect(result.locationBreakdowns[0].locationName).toBe('HQ Mumbai');
      expect(result.locationBreakdowns[0].costSummary.monthly).toBe(9497); // hr(2999)+security(1499)+starter(4999)
      expect(result.totalMonthlyCost).toBe(9497);
      expect(result.totalAnnualCost).toBe(94970);
    });

    it('should throw NOT_FOUND when company does not exist', async () => {
      mockCompany.findUnique.mockResolvedValue(null);

      await expect(service.getSubscriptionDetail('nonexistent')).rejects.toThrow('Company not found');
    });

    it('should throw NOT_FOUND when tenant does not exist', async () => {
      mockCompany.findUnique.mockResolvedValue({ ...baseCompany, tenant: null });

      await expect(service.getSubscriptionDetail('comp-1')).rejects.toThrow('No tenant found');
    });

    it('should throw NOT_FOUND when subscription does not exist', async () => {
      mockCompany.findUnique.mockResolvedValue(baseCompany);
      mockSubscription.findUnique.mockResolvedValue(null);

      await expect(service.getSubscriptionDetail('comp-1')).rejects.toThrow('No subscription found');
    });

    it('should handle multiple locations', async () => {
      const secondLocation = {
        ...baseLocation,
        id: 'loc-2',
        name: 'Plant Pune',
        code: 'PLT-PNE',
        moduleIds: ['production', 'inventory'],
      };
      setupMocks({
        company: { ...baseCompany, locations: [baseLocation, secondLocation] },
      });

      const result = await service.getSubscriptionDetail('comp-1');

      expect(result.locationBreakdowns).toHaveLength(2);
      expect(result.totalMonthlyCost).toBeGreaterThan(9497);
    });
  });

  // ── getCostPreview ────────────────────────────────────────────────
  describe('getCostPreview', () => {
    it('should return preview for different billing types', async () => {
      setupMocks();

      const preview = await service.getCostPreview('comp-1', 'ANNUAL');

      expect(preview.currentCost).toBeGreaterThan(0);
      expect(preview.newCost).toBeGreaterThan(0);
      expect(typeof preview.difference).toBe('number');
      expect(preview.perLocationBreakdown).toHaveLength(1);
      expect(preview.perLocationBreakdown[0].costSummary.billingType).toBe('ANNUAL');
    });

    it('should return preview for a specific location', async () => {
      setupMocks();

      const preview = await service.getCostPreview('comp-1', 'ANNUAL', 'loc-1');

      expect(preview.perLocationBreakdown).toHaveLength(1);
      expect(preview.perLocationBreakdown[0].locationId).toBe('loc-1');
    });

    it('should calculate ONE_TIME_AMC preview', async () => {
      setupMocks();

      const preview = await service.getCostPreview('comp-1', 'ONE_TIME_AMC');

      expect(preview.perLocationBreakdown[0].costSummary.billingType).toBe('ONE_TIME_AMC');
      // ONE_TIME_AMC taxable amount is the one-time fee, which is larger
      expect(preview.newCost).toBeGreaterThan(0);
    });
  });

  // ── changeBillingType ─────────────────────────────────────────────
  describe('changeBillingType', () => {
    it('should update to ONE_TIME_AMC and set AMC fields when endpointType=default', async () => {
      setupMocks();

      // The second call to getSubscriptionDetail after update
      // needs mocks to be set up again
      await service.changeBillingType('comp-1', {
        billingType: 'ONE_TIME_AMC',
      });

      expect(mockSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sub-1' },
          data: expect.objectContaining({
            billingType: 'ONE_TIME_AMC',
            amcStatus: 'ACTIVE',
            oneTimeLicenseFee: expect.any(Number),
            amcAmount: expect.any(Number),
            amcDueDate: expect.any(Date),
          }),
        }),
      );
    });

    it('should clear AMC fields when changing to MONTHLY', async () => {
      setupMocks({
        subscription: {
          ...baseSubscription,
          billingType: 'ONE_TIME_AMC',
          oneTimeLicenseFee: 100000,
          amcAmount: 18000,
          amcDueDate: new Date('2026-01-01'),
          amcStatus: 'ACTIVE',
        },
      });

      await service.changeBillingType('comp-1', {
        billingType: 'MONTHLY',
      });

      expect(mockSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            billingType: 'MONTHLY',
            oneTimeLicenseFee: null,
            amcAmount: null,
            amcDueDate: null,
            amcStatus: 'NOT_APPLICABLE',
          }),
        }),
      );
    });

    it('should update a specific location when locationId is provided', async () => {
      setupMocks();

      await service.changeBillingType('comp-1', {
        billingType: 'ANNUAL',
        locationId: 'loc-1',
      });

      expect(mockLocation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'loc-1' },
          data: expect.objectContaining({
            billingType: 'ANNUAL',
          }),
        }),
      );
      // Should NOT update subscription
      expect(mockSubscription.update).not.toHaveBeenCalled();
    });

    it('should throw NOT_FOUND for non-existent location', async () => {
      setupMocks();

      await expect(
        service.changeBillingType('comp-1', {
          billingType: 'ANNUAL',
          locationId: 'nonexistent',
        }),
      ).rejects.toThrow('Location not found');
    });

    it('should use oneTimeOverride when provided', async () => {
      setupMocks();

      await service.changeBillingType('comp-1', {
        billingType: 'ONE_TIME_AMC',
        oneTimeOverride: 200000,
        amcOverride: 36000,
      });

      expect(mockSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            oneTimeLicenseFee: 200000,
            amcAmount: 36000,
          }),
        }),
      );
    });
  });

  // ── changeTier ────────────────────────────────────────────────────
  describe('changeTier', () => {
    it('should update subscription and company tier', async () => {
      setupMocks();

      await service.changeTier('comp-1', { newTier: 'growth' });

      expect(mockSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userTier: 'GROWTH',
          }),
        }),
      );

      expect(mockCompany.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'comp-1' },
          data: expect.objectContaining({
            userTier: 'growth',
          }),
        }),
      );
    });

    it('should update location tier when locationId is provided', async () => {
      setupMocks();

      await service.changeTier('comp-1', {
        newTier: 'scale',
        locationId: 'loc-1',
      });

      expect(mockLocation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'loc-1' },
          data: expect.objectContaining({
            userTier: 'scale',
          }),
        }),
      );
      // Should NOT update subscription directly
      expect(mockSubscription.update).not.toHaveBeenCalled();
    });

    it('should throw NOT_FOUND for non-existent location', async () => {
      setupMocks();

      await expect(
        service.changeTier('comp-1', {
          newTier: 'growth',
          locationId: 'nonexistent',
        }),
      ).rejects.toThrow('Location not found');
    });

    it('should pass custom tier fields', async () => {
      setupMocks();

      await service.changeTier('comp-1', {
        newTier: 'custom',
        customUserLimit: '5000',
        customTierPrice: '75000',
      });

      expect(mockCompany.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userTier: 'custom',
            customUserLimit: '5000',
            customTierPrice: '75000',
          }),
        }),
      );
    });
  });

  // ── extendTrial ───────────────────────────────────────────────────
  describe('extendTrial', () => {
    it('should update trialEndsAt and endDate', async () => {
      setupMocks({
        subscription: {
          ...baseSubscription,
          status: 'TRIAL',
          trialEndsAt: new Date('2025-02-01'),
        },
      });

      await service.extendTrial('comp-1', { newEndDate: '2025-06-01' });

      expect(mockSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            trialEndsAt: new Date('2025-06-01'),
            endDate: new Date('2025-06-01'),
          }),
        }),
      );
    });

    it('should throw for invalid date format', async () => {
      setupMocks();

      await expect(
        service.extendTrial('comp-1', { newEndDate: 'not-a-date' }),
      ).rejects.toThrow('Invalid date format');
    });
  });

  // ── cancelSubscription ────────────────────────────────────────────
  describe('cancelSubscription', () => {
    it('should set subscription to CANCELLED with 30-day export window', async () => {
      setupMocks();

      const result = await service.cancelSubscription('comp-1');

      expect(result.status).toBe('CANCELLED');
      expect(result.endDate).toBeDefined();

      // Verify the end date is approximately 30 days from now
      const now = new Date();
      const endDate = new Date(result.endDate);
      const daysDiff = Math.round((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBe(30);

      expect(mockSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'CANCELLED',
            endDate: expect.any(Date),
          }),
        }),
      );
    });

    it('should set tenant status to CANCELLED', async () => {
      setupMocks();

      await service.cancelSubscription('comp-1');

      expect(mockTenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tenant-1' },
          data: { status: 'CANCELLED' },
        }),
      );
    });

    it('should return a message about the data export window', async () => {
      setupMocks();

      const result = await service.cancelSubscription('comp-1');

      expect(result.message).toContain('Data export window');
    });
  });

  // ── reactivateSubscription ────────────────────────────────────────
  describe('reactivateSubscription', () => {
    it('should set subscription to ACTIVE and clear endDate', async () => {
      setupMocks({
        subscription: {
          ...baseSubscription,
          status: 'CANCELLED',
          endDate: new Date('2025-03-01'),
        },
      });

      await service.reactivateSubscription('comp-1');

      expect(mockSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ACTIVE',
            endDate: null,
          }),
        }),
      );
    });

    it('should set tenant status to ACTIVE', async () => {
      setupMocks({
        subscription: {
          ...baseSubscription,
          status: 'CANCELLED',
        },
      });

      await service.reactivateSubscription('comp-1');

      expect(mockTenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tenant-1' },
          data: { status: 'ACTIVE' },
        }),
      );
    });
  });
});
