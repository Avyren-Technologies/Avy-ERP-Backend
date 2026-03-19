import { platformPrisma } from '../../config/database';
import { ApiError } from '../../shared/errors';
import { HttpStatus } from '../../shared/types';
import { addDays } from '../../shared/utils';
import { pricingService, LocationCostSummary, LocationPricingInput, CompanyPricingInput } from './pricing.service';

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

export interface LocationCostBreakdown {
  locationId: string;
  locationName: string;
  locationCode: string;
  costSummary: LocationCostSummary;
}

export interface SubscriptionDetail {
  subscription: {
    id: string;
    tenantId: string;
    planId: string;
    userTier: string;
    billingType: string;
    status: string;
    startDate: Date;
    endDate: Date | null;
    trialEndsAt: Date | null;
    oneTimeLicenseFee: number | null;
    amcAmount: number | null;
    amcDueDate: Date | null;
    amcStatus: string;
  };
  company: {
    id: string;
    name: string;
    endpointType: string;
  };
  locationBreakdowns: LocationCostBreakdown[];
  totalMonthlyCost: number;
  totalAnnualCost: number;
}

export interface CostPreview {
  currentCost: number;
  newCost: number;
  difference: number;
  perLocationBreakdown: LocationCostBreakdown[];
}

export interface ChangeBillingTypeData {
  billingType: 'MONTHLY' | 'ANNUAL' | 'ONE_TIME_AMC';
  locationId?: string;
  oneTimeOverride?: number;
  amcOverride?: number;
}

export interface ChangeTierData {
  locationId?: string;
  newTier: string;
  customUserLimit?: string;
  customTierPrice?: string;
}

export interface ExtendTrialData {
  newEndDate: string;
  locationId?: string;
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

async function resolveCompanyTenantSubscription(companyId: string) {
  const company = await platformPrisma.company.findUnique({
    where: { id: companyId },
    include: { tenant: true, locations: true },
  });

  if (!company) {
    throw ApiError.notFound('Company not found', 'COMPANY_NOT_FOUND');
  }

  if (!company.tenant) {
    throw ApiError.notFound('No tenant found for this company', 'TENANT_NOT_FOUND');
  }

  const subscription = await platformPrisma.subscription.findUnique({
    where: { tenantId: company.tenant.id },
  });

  if (!subscription) {
    throw ApiError.notFound('No subscription found for this tenant', 'SUBSCRIPTION_NOT_FOUND');
  }

  return { company, tenant: company.tenant, subscription, locations: company.locations };
}

function buildLocationBreakdowns(
  locations: any[],
  company: any,
  config: any,
  billingTypeOverride?: string,
): LocationCostBreakdown[] {
  return locations.map((loc) => {
    const locationInput = {
      moduleIds: loc.moduleIds,
      customModulePricing: loc.customModulePricing,
      oneTimeLicenseFee: loc.oneTimeLicenseFee,
      amcAmount: loc.amcAmount,
      gstin: loc.gstin,
      billingType: billingTypeOverride ?? loc.billingType ?? company.billingType,
    };
    const companyInput = {
      selectedModuleIds: company.selectedModuleIds,
      customModulePricing: company.customModulePricing,
      userTier: loc.userTier ?? company.userTier,
      customTierPrice: loc.customTierPrice != null ? Number(loc.customTierPrice) : (company.customTierPrice != null ? Number(company.customTierPrice) : null),
      oneTimeMultiplier: company.oneTimeMultiplier,
      amcPercentage: company.amcPercentage,
    };
    return {
      locationId: loc.id,
      locationName: loc.name,
      locationCode: loc.code,
      costSummary: pricingService.calculateLocationCostSummary(locationInput, companyInput, config),
    };
  });
}

// ────────────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────────────

export class SubscriptionService {
  // ──────────────────────────────────────────────────────────────────
  // 1. Get subscription detail with per-location cost breakdowns
  // ──────────────────────────────────────────────────────────────────
  async getSubscriptionDetail(companyId: string): Promise<SubscriptionDetail> {
    const { company, subscription, locations } = await resolveCompanyTenantSubscription(companyId);
    const config = await pricingService.getConfig();

    const locationBreakdowns = buildLocationBreakdowns(locations, company, config);

    const totalMonthlyCost = locationBreakdowns.reduce((sum, lb) => sum + lb.costSummary.monthly, 0);
    const totalAnnualCost = locationBreakdowns.reduce((sum, lb) => sum + lb.costSummary.annual, 0);

    return {
      subscription: {
        id: subscription.id,
        tenantId: subscription.tenantId,
        planId: subscription.planId,
        userTier: subscription.userTier,
        billingType: subscription.billingType,
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        trialEndsAt: subscription.trialEndsAt,
        oneTimeLicenseFee: subscription.oneTimeLicenseFee,
        amcAmount: subscription.amcAmount,
        amcDueDate: subscription.amcDueDate,
        amcStatus: subscription.amcStatus,
      },
      company: {
        id: company.id,
        name: company.name,
        endpointType: company.endpointType,
      },
      locationBreakdowns,
      totalMonthlyCost,
      totalAnnualCost,
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // 2. Get cost preview for a billing type change
  // ──────────────────────────────────────────────────────────────────
  async getCostPreview(
    companyId: string,
    billingType: string,
    locationId?: string,
  ): Promise<CostPreview> {
    const { company, locations } = await resolveCompanyTenantSubscription(companyId);
    const config = await pricingService.getConfig();

    // Current breakdowns
    const currentBreakdowns = buildLocationBreakdowns(locations, company, config);
    const currentCost = currentBreakdowns.reduce((sum, lb) => sum + lb.costSummary.totalWithTax, 0);

    // New breakdowns: if locationId is provided, only that location gets new billingType
    let targetLocations: any[];
    if (locationId) {
      targetLocations = locations.map((loc) =>
        loc.id === locationId ? { ...loc, billingType } : loc,
      );
    } else {
      targetLocations = locations;
    }

    const newBreakdowns = locationId
      ? buildLocationBreakdowns(targetLocations, company, config)
      : buildLocationBreakdowns(locations, company, config, billingType);

    const newCost = newBreakdowns.reduce((sum, lb) => sum + lb.costSummary.totalWithTax, 0);

    return {
      currentCost,
      newCost,
      difference: newCost - currentCost,
      perLocationBreakdown: newBreakdowns,
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // 3. Change billing type
  // ──────────────────────────────────────────────────────────────────
  async changeBillingType(companyId: string, data: ChangeBillingTypeData) {
    const { company, tenant, subscription, locations } = await resolveCompanyTenantSubscription(companyId);
    const config = await pricingService.getConfig();

    if (data.locationId) {
      // Update a specific location's billing type
      const location = locations.find((l) => l.id === data.locationId);
      if (!location) {
        throw ApiError.notFound('Location not found', 'LOCATION_NOT_FOUND');
      }

      const updateData: any = { billingType: data.billingType };

      if (data.billingType === 'ONE_TIME_AMC' && company.endpointType === 'default') {
        const locationInput: LocationPricingInput = {
          moduleIds: location.moduleIds as string[] | null,
          customModulePricing: location.customModulePricing as Record<string, number> | null,
          oneTimeLicenseFee: data.oneTimeOverride ?? location.oneTimeLicenseFee,
          amcAmount: data.amcOverride ?? location.amcAmount,
          gstin: location.gstin,
          billingType: data.billingType,
        };
        const companyInput: CompanyPricingInput = {
          selectedModuleIds: company.selectedModuleIds as string[] | null,
          customModulePricing: company.customModulePricing as Record<string, number> | null,
          userTier: location.userTier ?? company.userTier,
          customTierPrice: location.customTierPrice != null ? Number(location.customTierPrice) : (company.customTierPrice != null ? Number(company.customTierPrice) : null),
          oneTimeMultiplier: company.oneTimeMultiplier,
          amcPercentage: company.amcPercentage,
        };

        updateData.oneTimeLicenseFee = data.oneTimeOverride ?? pricingService.calculateOneTimeFee(locationInput, companyInput, config);
        updateData.amcAmount = data.amcOverride ?? pricingService.calculateAmcFee(locationInput, companyInput, config);
      }

      await platformPrisma.location.update({
        where: { id: data.locationId },
        data: updateData,
      });
    } else {
      // Update subscription-level billing type
      const updateData: any = { billingType: data.billingType };

      if (data.billingType === 'ONE_TIME_AMC' && company.endpointType === 'default') {
        // Calculate totals across all locations
        const breakdowns = buildLocationBreakdowns(locations, company, config, data.billingType);
        const totalOneTime = data.oneTimeOverride ?? breakdowns.reduce((sum, lb) => sum + lb.costSummary.oneTime, 0);
        const totalAmc = data.amcOverride ?? breakdowns.reduce((sum, lb) => sum + lb.costSummary.amc, 0);

        updateData.oneTimeLicenseFee = totalOneTime;
        updateData.amcAmount = totalAmc;
        updateData.amcDueDate = addDays(new Date(), 365);
        updateData.amcStatus = 'ACTIVE';
      } else {
        // Clear AMC fields for non-ONE_TIME_AMC billing
        updateData.oneTimeLicenseFee = null;
        updateData.amcAmount = null;
        updateData.amcDueDate = null;
        updateData.amcStatus = 'NOT_APPLICABLE';
      }

      await platformPrisma.subscription.update({
        where: { id: subscription.id },
        data: updateData,
      });
    }

    return this.getSubscriptionDetail(companyId);
  }

  // ──────────────────────────────────────────────────────────────────
  // 4. Change tier
  // ──────────────────────────────────────────────────────────────────
  async changeTier(companyId: string, data: ChangeTierData) {
    const { company, subscription, locations } = await resolveCompanyTenantSubscription(companyId);
    const config = await pricingService.getConfig();

    if (data.locationId) {
      // Update tier on a specific location
      const location = locations.find((l) => l.id === data.locationId);
      if (!location) {
        throw ApiError.notFound('Location not found', 'LOCATION_NOT_FOUND');
      }

      await platformPrisma.location.update({
        where: { id: data.locationId },
        data: {
          userTier: data.newTier,
          customUserLimit: data.customUserLimit ?? location.customUserLimit,
          customTierPrice: data.customTierPrice ?? location.customTierPrice,
        },
      });
    } else {
      // Update subscription-level tier
      const tierEnum = data.newTier.toUpperCase() as any;
      await platformPrisma.subscription.update({
        where: { id: subscription.id },
        data: { userTier: tierEnum },
      });

      // Also update company-level tier
      await platformPrisma.company.update({
        where: { id: companyId },
        data: {
          userTier: data.newTier,
          customUserLimit: data.customUserLimit ?? company.customUserLimit,
          customTierPrice: data.customTierPrice ?? company.customTierPrice ?? null,
        },
      });
    }

    return this.getSubscriptionDetail(companyId);
  }

  // ──────────────────────────────────────────────────────────────────
  // 5. Extend trial
  // ──────────────────────────────────────────────────────────────────
  async extendTrial(companyId: string, data: ExtendTrialData) {
    const { subscription } = await resolveCompanyTenantSubscription(companyId);

    const newEndDate = new Date(data.newEndDate);

    if (isNaN(newEndDate.getTime())) {
      throw ApiError.badRequest('Invalid date format for newEndDate', 'INVALID_DATE');
    }

    await platformPrisma.subscription.update({
      where: { id: subscription.id },
      data: {
        trialEndsAt: newEndDate,
        endDate: newEndDate,
      },
    });

    return this.getSubscriptionDetail(companyId);
  }

  // ──────────────────────────────────────────────────────────────────
  // 6. Cancel subscription
  // ──────────────────────────────────────────────────────────────────
  async cancelSubscription(companyId: string) {
    const { tenant, subscription } = await resolveCompanyTenantSubscription(companyId);

    const exportWindowEnd = addDays(new Date(), 30);

    await platformPrisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'CANCELLED',
        endDate: exportWindowEnd,
      },
    });

    await platformPrisma.tenant.update({
      where: { id: tenant.id },
      data: { status: 'CANCELLED' },
    });

    return {
      status: 'CANCELLED',
      endDate: exportWindowEnd,
      message: 'Subscription cancelled. Data export window ends on ' + exportWindowEnd.toISOString().split('T')[0],
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // 7. Reactivate subscription
  // ──────────────────────────────────────────────────────────────────
  async reactivateSubscription(companyId: string) {
    const { tenant, subscription } = await resolveCompanyTenantSubscription(companyId);

    await platformPrisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'ACTIVE',
        endDate: null,
      },
    });

    await platformPrisma.tenant.update({
      where: { id: tenant.id },
      data: { status: 'ACTIVE' },
    });

    return this.getSubscriptionDetail(companyId);
  }
}

export const subscriptionService = new SubscriptionService();
