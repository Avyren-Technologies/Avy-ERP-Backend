import { Prisma, TenantStatus, CompanySize } from '@prisma/client';
import {
  DEFAULT_ROLES, DEFAULT_DEPARTMENTS, DEFAULT_GRADES, DEFAULT_EMPLOYEE_TYPES,
  DEFAULT_DESIGNATIONS, DEFAULT_LEAVE_TYPES, DEFAULT_SALARY_COMPONENTS,
  DEFAULT_LOAN_POLICIES, DEFAULT_ASSET_CATEGORIES, DEFAULT_GRIEVANCE_CATEGORIES,
  DEFAULT_APPROVAL_WORKFLOWS, DEFAULT_NOTIFICATION_TEMPLATES, DEFAULT_NOTIFICATION_RULES, DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_TAX_CONFIG, DEFAULT_ROSTERS, getDefaultHolidays,
} from '../../shared/constants/company-defaults';
import { platformPrisma } from '../../config/database';
import { cacheRedis, scanAndDelete } from '../../config/redis';
import { ApiError } from '../../shared/errors';
import { createRedisPattern, createTenantCacheKey, hashPassword } from '../../shared/utils';
import { logger } from '../../config/logger';
import { seedCompanyConfigs } from '../../shared/services/config-seeder.service';
import type {
  OnboardTenantPayload,
  CompanySectionKey,
  LocationPayload,
  ContactPayload,
  NoSeriesPayload,
  IotReasonPayload,
  UserPayload,
} from './tenant.types';

export interface CreateTenantData {
  companyId: string;
  slug: string;
  schemaName?: string;
  status?: TenantStatus;
}

export interface UpdateTenantData {
  status?: TenantStatus;
  schemaName?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Convert undefined → null so Prisma nullable fields are happy with exactOptionalPropertyTypes. */
function n<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

/** Map frontend employeeCount string to a Prisma CompanySize enum value. */
function mapCompanySize(employeeCount?: string): CompanySize {
  if (!employeeCount) return 'SMALL';
  const num = parseInt(employeeCount, 10);
  if (isNaN(num)) return 'SMALL';
  if (num <= 10) return 'STARTUP';
  if (num <= 50) return 'SMALL';
  if (num <= 200) return 'MEDIUM';
  if (num <= 500) return 'LARGE';
  return 'ENTERPRISE';
}

/** Map frontend wizard status to Prisma TenantStatus. */
function mapWizardStatusToTenantStatus(wizardStatus?: string): TenantStatus {
  switch (wizardStatus) {
    case 'Active':
      return TenantStatus.ACTIVE;
    case 'Inactive':
      return TenantStatus.SUSPENDED;
    case 'Draft':
    case 'Pilot':
    default:
      return TenantStatus.TRIAL;
  }
}

/** Map userTier string from frontend to the Prisma UserTier enum key. */
function mapUserTier(tier?: string): 'STARTER' | 'GROWTH' | 'SCALE' | 'ENTERPRISE' | 'CUSTOM' {
  const upper = (tier || 'starter').toUpperCase();
  if (['STARTER', 'GROWTH', 'SCALE', 'ENTERPRISE', 'CUSTOM'].includes(upper)) {
    return upper as any;
  }
  return 'STARTER';
}

/** Map billingType string to Prisma BillingType enum. */
function mapBillingType(type?: string): 'MONTHLY' | 'ANNUAL' | 'ONE_TIME_AMC' {
  const upper = type?.toUpperCase();
  if (upper === 'ANNUAL') return 'ANNUAL';
  if (upper === 'ONE_TIME_AMC') return 'ONE_TIME_AMC';
  return 'MONTHLY';
}

/** Split "Full Name" into firstName + lastName. */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] || fullName;
  const lastName = parts.slice(1).join(' ') || '';
  return { firstName, lastName };
}

/** Build a Prisma-compatible Location createMany data entry. */
function buildLocationData(companyId: string, loc: LocationPayload, defaults?: { hqStdCode?: string }) {
  const derivedStateGST = loc.stateGST || (loc.gstin ? loc.gstin.slice(0, 2) : undefined);
  const derivedStdCode = loc.stdCode || (loc.isHQ ? defaults?.hqStdCode : undefined);
  return {
    companyId,
    name: loc.name,
    code: loc.code,
    facilityType: loc.facilityType,
    customFacilityType: n(loc.customFacilityType),
    status: loc.status || 'Active',
    isHQ: loc.isHQ ?? false,
    addressLine1: n(loc.addressLine1),
    addressLine2: n(loc.addressLine2),
    city: n(loc.city),
    district: n(loc.district),
    state: n(loc.state),
    pin: n(loc.pin),
    country: n(loc.country),
    stdCode: n(derivedStdCode),
    gstin: n(loc.gstin),
    stateGST: n(derivedStateGST),
    contactName: n(loc.contactName),
    contactDesignation: n(loc.contactDesignation),
    contactEmail: n(loc.contactEmail),
    contactCountryCode: n(loc.contactCountryCode),
    contactPhone: n(loc.contactPhone),
    geoEnabled: loc.geoEnabled ?? false,
    geoLocationName: n(loc.geoLocationName),
    geoLat: n(loc.geoLat),
    geoLng: n(loc.geoLng),
    geoRadius: loc.geoRadius ?? 50,
    geoShape: n(loc.geoShape) ?? 'circle',
    moduleIds: loc.moduleIds as any ?? Prisma.JsonNull,
    customModulePricing: loc.customModulePricing as any ?? Prisma.JsonNull,
    userTier: n(loc.userTier),
    customUserLimit: n(loc.customUserLimit),
    customTierPrice: n(loc.customTierPrice),
    billingType: n(loc.billingType),
    trialDays: loc.trialDays ?? 0,
  };
}

/** Build a Prisma-compatible Contact createMany data entry. */
function buildContactData(companyId: string, c: ContactPayload) {
  return {
    companyId,
    name: c.name,
    designation: n(c.designation),
    department: n(c.department),
    type: c.type,
    email: c.email,
    countryCode: c.countryCode ?? '+91',
    mobile: c.mobile,
    linkedin: n(c.linkedin),
  };
}

/** Build a Prisma-compatible NoSeriesConfig createMany data entry. */
function buildNoSeriesData(companyId: string, ns: NoSeriesPayload) {
  return {
    companyId,
    code: ns.code,
    linkedScreen: ns.linkedScreen,
    description: n(ns.description),
    prefix: ns.prefix,
    suffix: n(ns.suffix),
    numberCount: ns.numberCount ?? 5,
    startNumber: ns.startNumber ?? 1,
  };
}

/** Build a Prisma-compatible IotReason createMany data entry. */
function buildIotReasonData(companyId: string, r: IotReasonPayload) {
  return {
    companyId,
    reasonType: r.reasonType,
    reason: r.reason,
    description: n(r.description),
    department: n(r.department),
    planned: r.planned ?? false,
    duration: n(r.duration),
  };
}

// ── Service ──────────────────────────────────────────────────────────

export class TenantService {
  // ────────────────────────────────────────────────────────────────────
  // Full wizard onboarding (atomic transaction)
  // ────────────────────────────────────────────────────────────────────
  async onboardTenant(payload: OnboardTenantPayload) {
    const { identity, statutory, address, fiscal, preferences, endpoint, strategy, commercial, shifts } = payload;

    // Check for duplicate company code
    const existing = await platformPrisma.company.findUnique({ where: { companyCode: identity.companyCode } });
    if (existing) {
      throw ApiError.conflict(`Company code "${identity.companyCode}" is already in use`);
    }

    const wizardStatus = identity.wizardStatus || 'Draft';
    const tenantStatus = mapWizardStatusToTenantStatus(wizardStatus);

    const hqStdCode = address.sameAsRegistered
      ? address.registered?.stdCode
      : address.corporate?.stdCode || address.registered?.stdCode;
    const perLocationModuleIds = payload.locations.flatMap((loc) => loc.moduleIds ?? []);
    const dedupedPerLocationModuleIds = Array.from(new Set(perLocationModuleIds));
    const perLocationBillingCycles = payload.locations.map((loc) => loc.billingType).filter(Boolean) as string[];
    const effectiveBillingCycle = strategy.locationConfig === 'per-location'
      ? (perLocationBillingCycles[0] ?? 'monthly')
      : (commercial?.billingType ?? 'monthly');
    const effectiveTrialDays = strategy.locationConfig === 'per-location'
      ? (payload.locations[0]?.trialDays ?? 14)
      : (commercial?.trialDays ?? 14);
    const effectiveUserTier = strategy.locationConfig === 'per-location'
      ? (payload.locations[0]?.userTier ?? undefined)
      : commercial?.userTier;

    // Build razorpay config JSON (only when relevant)
    const razorpayConfig = preferences.razorpayEnabled
      ? {
          enabled: true,
          keyId: preferences.razorpayKeyId,
          keySecret: preferences.razorpayKeySecret,
          webhookSecret: preferences.razorpayWebhookSecret,
          accountNumber: preferences.razorpayAccountNumber,
          autoDisbursement: preferences.razorpayAutoDisbursement ?? false,
          testMode: preferences.razorpayTestMode ?? true,
        }
      : null;

    // Preferences are now saved to CompanySettings by seedCompanyConfigs() after the transaction.

    const result = await platformPrisma.$transaction(async (tx) => {
      // ── 1. Create Company ──────────────────────────────────────
      const company = await tx.company.create({
        data: {
          name: identity.displayName,
          industry: identity.industry,
          size: mapCompanySize(identity.employeeCount),
          website: n(identity.website),
          gstNumber: n(statutory.gstin),
          // Step 1 – Identity
          displayName: identity.displayName,
          legalName: identity.legalName,
          shortName: n(identity.shortName),
          businessType: identity.businessType,
          companyCode: identity.companyCode,
          cin: n(identity.cin),
          incorporationDate: n(identity.incorporationDate),
          employeeCount: n(identity.employeeCount),
          emailDomain: identity.emailDomain,
          logoUrl: n(identity.logoUrl),
          // Step 2 – Statutory
          pan: n(statutory.pan),
          tan: n(statutory.tan),
          gstin: n(statutory.gstin),
          pfRegNo: n(statutory.pfRegNo),
          esiCode: n(statutory.esiCode),
          ptReg: n(statutory.ptReg),
          lwfrNo: n(statutory.lwfrNo),
          rocState: n(statutory.rocState),
          // Step 3 – Address
          registeredAddress: address.registered as any,
          corporateAddress: address.sameAsRegistered ? Prisma.JsonNull : (address.corporate as any) ?? Prisma.JsonNull,
          sameAsRegistered: address.sameAsRegistered,
          // Step 4 – Fiscal
          fiscalConfig: fiscal as any,
          // Step 5 – Preferences (saved to CompanySettings by seedCompanyConfigs)
          razorpayConfig: razorpayConfig as any ?? Prisma.JsonNull,
          // Step 6 – Endpoint
          endpointType: endpoint.endpointType,
          customEndpointUrl: n(endpoint.customBaseUrl),
          // Step 7 – Strategy
          multiLocationMode: strategy.multiLocationMode,
          locationConfig: strategy.locationConfig,
          // Company-level commercial (common mode)
          selectedModuleIds: strategy.locationConfig === 'per-location'
            ? dedupedPerLocationModuleIds as any
            : commercial?.selectedModuleIds as any ?? Prisma.JsonNull,
          customModulePricing: strategy.locationConfig === 'per-location'
            ? Prisma.JsonNull
            : commercial?.customModulePricing as any ?? Prisma.JsonNull,
          userTier: n(effectiveUserTier),
          customUserLimit: strategy.locationConfig === 'per-location' ? null : n(commercial?.customUserLimit),
          customTierPrice: strategy.locationConfig === 'per-location' ? null : n(commercial?.customTierPrice),
          billingType: effectiveBillingCycle,
          trialDays: effectiveTrialDays,
          // Step 12 – Shifts (company-level fields)
          dayStartTime: n(shifts.dayStartTime),
          dayEndTime: n(shifts.dayEndTime),
          weeklyOffs: shifts.weeklyOffs as any ?? Prisma.JsonNull,
          // Step 15 – Controls (saved to SystemControls by seedCompanyConfigs)
          // Wizard status
          wizardStatus,
        },
      });

      // ── 2. Create Tenant ───────────────────────────────────────
      const slug = identity.slug;
      const schemaName = `tenant_${slug.replace(/-/g, '_')}`;
      const tenant = await tx.tenant.create({
        data: {
          companyId: company.id,
          schemaName,
          slug,
          status: tenantStatus,
        },
      });

      // ── 3. Locations (batch) ───────────────────────────────────
      if (payload.locations.length > 0) {
        await tx.location.createMany({
          data: payload.locations.map((loc) => buildLocationData(
            company.id,
            loc,
            hqStdCode ? { hqStdCode } : undefined,
          )),
        });
      }

      // ── 4. Contacts (batch) ────────────────────────────────────
      if (payload.contacts.length > 0) {
        await tx.companyContact.createMany({
          data: payload.contacts.map((c) => buildContactData(company.id, c)),
        });
      }

      // ── 5. Shifts (batch) ──────────────────────────────────────
      if (shifts.items.length > 0) {
        await tx.companyShift.createMany({
          data: shifts.items.map((s) => ({
            companyId: company.id,
            name: s.name,
            startTime: s.fromTime,
            endTime: s.toTime,
            noShuffle: s.noShuffle ?? false,
          })),
        });
      }

      // ── 6. No. Series (custom from wizard + auto-seed defaults) ──
      // First create any custom series from the wizard
      if (payload.noSeries.length > 0) {
        await tx.noSeriesConfig.createMany({
          data: payload.noSeries.map((ns) => buildNoSeriesData(company.id, ns)),
        });
      }

      // Auto-seed default number series for any linked screens not already configured
      const { LINKED_SCREENS } = await import('../../shared/constants/linked-screens');
      const configuredScreens = new Set(payload.noSeries.map((ns) => ns.linkedScreen));
      const missingDefaults = LINKED_SCREENS
        .filter((ls) => !configuredScreens.has(ls.value))
        .map((ls) => ({
          companyId: company.id,
          code: ls.defaultPrefix.replace(/-$/, ''), // strip trailing dash for code
          linkedScreen: ls.value,
          description: ls.description,
          prefix: ls.defaultPrefix,
          suffix: null as string | null,
          numberCount: 5,
          startNumber: 1,
        }));

      if (missingDefaults.length > 0) {
        await tx.noSeriesConfig.createMany({ data: missingDefaults });
        logger.info(`Auto-seeded ${missingDefaults.length} default number series for company ${company.id}`);
      }

      // ── 7. IOT Reasons (batch) ─────────────────────────────────
      if (payload.iotReasons.length > 0) {
        await tx.iotReason.createMany({
          data: payload.iotReasons.map((r) => buildIotReasonData(company.id, r)),
        });
      }

      // ── 8. Subscription (default TRIAL) ────────────────────────
      const moduleIds = strategy.locationConfig === 'per-location'
        ? dedupedPerLocationModuleIds
        : (commercial?.selectedModuleIds ?? []);
      const modulesJson: Record<string, boolean> = {};
      moduleIds.forEach((m) => { modulesJson[m] = true; });

      const trialDays = effectiveTrialDays;
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: effectiveUserTier ?? 'starter',
          userTier: mapUserTier(effectiveUserTier),
          billingType: mapBillingType(effectiveBillingCycle),
          modules: modulesJson as any,
          status: tenantStatus === TenantStatus.ACTIVE ? 'ACTIVE' : 'TRIAL',
          trialEndsAt: trialDays > 0 ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000) : null,
        },
      });

      // ── 9. Create default RBAC Role for this tenant ──────────
      const companyAdminRole = await tx.role.create({
        data: {
          tenantId: tenant.id,
          name: 'Company Admin',
          description: 'Full company access — all modules and actions',
          permissions: [
            'company:*', 'hr:*', 'production:*', 'inventory:*', 'sales:*',
            'finance:*', 'maintenance:*', 'vendor:*', 'security:*', 'visitors:*',
            'masters:*', 'user:*', 'role:*', 'reports:*', 'audit:*',
          ],
          isSystem: true,
        },
      });

      // ── Seed company defaults (roles, org structure, leave, holidays, payroll, etc.) ──
      // All records are editable by company admin — none are system-locked.

      // Default roles (Employee + Manager)
      for (const role of DEFAULT_ROLES) {
        await tx.role.create({
          data: { tenantId: tenant.id, ...role },
        });
      }

      // Departments
      for (const dept of DEFAULT_DEPARTMENTS) {
        await tx.department.create({
          data: { companyId: company.id, ...dept },
        });
      }

      // Grades
      for (const grade of DEFAULT_GRADES) {
        await tx.grade.create({
          data: { companyId: company.id, ...grade },
        });
      }

      // Employee Types
      for (const et of DEFAULT_EMPLOYEE_TYPES) {
        await tx.employeeType.create({
          data: { companyId: company.id, ...et },
        });
      }

      // Designations (no department/grade linking — admin can configure later)
      for (const desig of DEFAULT_DESIGNATIONS) {
        await tx.designation.create({
          data: { companyId: company.id, ...desig },
        });
      }

      // Leave Types
      for (const lt of DEFAULT_LEAVE_TYPES) {
        const leaveType = await tx.leaveType.create({
          data: { companyId: company.id, ...lt },
        });
        // Create company-wide leave policy for each type
        await tx.leavePolicy.create({
          data: {
            companyId: company.id,
            leaveTypeId: leaveType.id,
            assignmentLevel: 'company',
          },
        });
      }

      // Holidays (current year)
      const currentYear = new Date().getFullYear();
      const holidays = getDefaultHolidays(currentYear);
      for (const h of holidays) {
        await tx.holidayCalendar.create({
          data: {
            companyId: company.id,
            name: h.name,
            date: new Date(h.date),
            type: h.type,
            year: currentYear,
            description: h.description,
          },
        });
      }

      // Salary Components
      for (const sc of DEFAULT_SALARY_COMPONENTS) {
        await tx.salaryComponent.create({
          data: {
            companyId: company.id,
            name: sc.name,
            code: sc.code,
            type: sc.type,
            calculationMethod: sc.calculationMethod,
            formulaValue: (sc as any).formulaValue ?? null,
            taxable: sc.taxable,
            exemptionSection: (sc as any).exemptionSection ?? null,
            exemptionLimit: (sc as any).exemptionLimit ?? null,
            pfInclusion: sc.pfInclusion ?? false,
            esiInclusion: sc.esiInclusion ?? false,
            gratuityInclusion: (sc as any).gratuityInclusion ?? false,
            bonusInclusion: (sc as any).bonusInclusion ?? false,
            showOnPayslip: (sc as any).showOnPayslip ?? true,
            payslipOrder: sc.payslipOrder,
          },
        });
      }

      // Loan Policies
      for (const lp of DEFAULT_LOAN_POLICIES) {
        await tx.loanPolicy.create({
          data: { companyId: company.id, ...lp },
        });
      }

      // Asset Categories
      for (const ac of DEFAULT_ASSET_CATEGORIES) {
        await tx.assetCategory.create({
          data: { companyId: company.id, ...ac },
        });
      }

      // Grievance Categories
      for (const gc of DEFAULT_GRIEVANCE_CATEGORIES) {
        await tx.grievanceCategory.create({
          data: { companyId: company.id, ...gc },
        });
      }

      // Approval Workflows
      for (const aw of DEFAULT_APPROVAL_WORKFLOWS) {
        await tx.approvalWorkflow.create({
          data: { companyId: company.id, ...aw },
        });
      }

      // Notification Templates + Rules
      for (const tmpl of DEFAULT_NOTIFICATION_TEMPLATES) {
        const template = await tx.notificationTemplate.create({
          data: {
            companyId: company.id,
            name: tmpl.name,
            subject: tmpl.subject,
            body: tmpl.body,
            channel: tmpl.channel,
          },
        });
        // Link notification rule if one exists for this template
        const rule = DEFAULT_NOTIFICATION_RULES.find(r => r.templateName === tmpl.name);
        if (rule) {
          await tx.notificationRule.create({
            data: {
              companyId: company.id,
              triggerEvent: rule.triggerEvent,
              templateId: template.id,
              recipientRole: rule.recipientRole,
              channel: rule.channel,
            },
          });
        }
      }

      // AttendanceRule, OvertimeRule, ESSConfig, CompanySettings, SystemControls
      // are now seeded AFTER the transaction by seedCompanyConfigs() — see below.

      // Statutory Configs (PF, ESI, Gratuity, Bonus) — use Prisma model defaults
      await tx.pFConfig.create({ data: { companyId: company.id } });
      await tx.eSIConfig.create({ data: { companyId: company.id } });
      await tx.gratuityConfig.create({ data: { companyId: company.id } });
      await tx.bonusConfig.create({ data: { companyId: company.id } });

      // Tax Config (FY 2025-26 Indian slabs)
      await tx.taxConfig.create({
        data: {
          companyId: company.id,
          defaultRegime: DEFAULT_TAX_CONFIG.defaultRegime,
          newRegimeSlabs: DEFAULT_TAX_CONFIG.newRegimeSlabs,
          oldRegimeSlabs: DEFAULT_TAX_CONFIG.oldRegimeSlabs,
          cessRate: DEFAULT_TAX_CONFIG.cessRate,
        },
      });

      // Rosters
      for (const roster of DEFAULT_ROSTERS) {
        await tx.roster.create({
          data: {
            companyId: company.id,
            name: roster.name,
            pattern: roster.pattern,
            weekOff1: roster.weekOff1,
            weekOff2: roster.weekOff2,
            effectiveFrom: new Date(),
            isDefault: roster.isDefault,
          },
        });
      }

      // Cost Centres (one per department — created after departments)
      const departments = await tx.department.findMany({ where: { companyId: company.id } });
      for (const dept of departments) {
        await tx.costCentre.create({
          data: {
            companyId: company.id,
            code: `CC-${dept.code}`,
            name: `${dept.name} Cost Centre`,
            departmentId: dept.id,
          },
        });
      }

      // Expense Categories (default set)
      for (const ec of DEFAULT_EXPENSE_CATEGORIES) {
        await tx.expenseCategory.create({
          data: {
            companyId: company.id,
            name: ec.name,
            code: ec.code,
            description: ec.description,
            requiresReceipt: ec.requiresReceipt,
            receiptThreshold: (ec as any).receiptThreshold ?? null,
          },
        });
      }

      // ── 10. Users + TenantUser bridge ─────────────────────────
      // Check for duplicate user emails before creation
      if (payload.users.length > 0) {
        const emails = payload.users.map(u => u.email.toLowerCase());
        const existingUsers = await tx.user.findMany({
          where: { email: { in: emails } },
          select: { email: true },
        });
        if (existingUsers.length > 0) {
          const dupes = existingUsers.map(u => u.email).join(', ');
          throw ApiError.conflict(`User email(s) already exist: ${dupes}`);
        }
      }

      if (payload.users.length > 0) {
        for (const u of payload.users) {
          const { firstName, lastName } = splitName(u.fullName);
          const hashed = await hashPassword(u.password);
          const newUser = await tx.user.create({
            data: {
              email: u.email,
              password: hashed,
              firstName,
              lastName,
              phone: n(u.mobile),
              role: 'COMPANY_ADMIN',
              companyId: company.id,
            },
          });

          // Create TenantUser bridge — links user to role with permissions
          await tx.tenantUser.create({
            data: {
              userId: newUser.id,
              tenantId: tenant.id,
              roleId: companyAdminRole.id,
            },
          });
        }
      }

      return { company, tenant };
    });

    // Create the PostgreSQL schema for tenant isolation.
    // If this fails, roll back the committed transaction records.
    try {
      await this.createTenantSchema(result.tenant.schemaName);
    } catch (schemaError) {
      logger.error(`Schema creation failed for ${result.tenant.schemaName}, rolling back tenant records`);
      try {
        await platformPrisma.company.delete({ where: { id: result.company.id } });
      } catch (rollbackError) {
        logger.error(`Rollback also failed for company ${result.company.id}:`, rollbackError);
      }
      throw schemaError;
    }

    // Seed HRMS config models (CompanySettings, SystemControls, AttendanceRule,
    // OvertimeRule, ESSConfig) with industry-appropriate defaults.
    // Uses upsert — idempotent and safe to re-run.
    await seedCompanyConfigs(result.company.id, result.company.businessType ?? undefined);

    // Cache
    await this.cacheTenantData(result.tenant.id, result);

    logger.info(`Tenant onboarded: ${result.tenant.id} (${result.company.companyCode})`);

    // Return full detail
    return this.getFullCompanyDetail(result.company.id);
  }

  // ────────────────────────────────────────────────────────────────────
  // Full company detail (for company detail screen)
  // ────────────────────────────────────────────────────────────────────
  async getFullCompanyDetail(companyId: string) {
    const company = await platformPrisma.company.findUnique({
      where: { id: companyId },
      include: {
        locations: { orderBy: { createdAt: 'asc' } },
        contacts: { orderBy: { createdAt: 'asc' } },
        shifts: { orderBy: { createdAt: 'asc' } },
        noSeries: { orderBy: { createdAt: 'asc' } },
        iotReasons: { orderBy: { createdAt: 'asc' } },
        tenant: {
          include: {
            subscriptions: true,
          },
        },
        users: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            role: true,
            isActive: true,
            lastLogin: true,
            createdAt: true,
          },
        },
      },
    });

    if (!company) {
      throw ApiError.notFound('Company not found');
    }

    // Strip sensitive secrets from response
    return this.sanitizeCompanyResponse(company);
  }

  /** Remove Razorpay secrets and mask sensitive fields before returning to client. */
  private sanitizeCompanyResponse(company: any) {
    company = {
      ...company,
      // Remove legacy fields completely from response contract.
      address: undefined,
      contactPerson: undefined,
    };

    const registeredStdCode = (company?.registeredAddress as any)?.stdCode;
    const corporateStdCode = (company?.corporateAddress as any)?.stdCode;

    if (Array.isArray(company?.locations)) {
      company = {
        ...company,
        locations: company.locations.map((loc: any) => ({
          ...loc,
          // Backward-safe read fallback for old rows where stdCode/stateGST were stored null.
          stdCode: loc.stdCode ?? (loc.isHQ ? (company.sameAsRegistered ? registeredStdCode : (corporateStdCode || registeredStdCode)) : null),
          stateGST: loc.stateGST ?? (loc.gstin ? String(loc.gstin).slice(0, 2) : null),
        })),
      };
    }

    if (Array.isArray(company?.users)) {
      company = {
        ...company,
        users: company.users.map((u: any) => ({
          ...u,
          // Username is not yet a persisted DB field; expose stable fallback from email.
          username: u.username ?? (u.email ? String(u.email).split('@')[0] : undefined),
          // Keep explicit placeholders so clients can render a predictable "—" fallback.
          department: u.department ?? null,
          location: u.location ?? null,
        })),
      };
    }

    if (company.razorpayConfig && typeof company.razorpayConfig === 'object') {
      const rp = { ...company.razorpayConfig } as Record<string, any>;
      if (rp.keySecret) rp.keySecret = '••••••••';
      if (rp.webhookSecret) rp.webhookSecret = '••••••••';
      company = { ...company, razorpayConfig: rp };
    }
    if (company.locationConfig === 'per-location') {
      company = {
        ...company,
        selectedModuleIds: undefined,
        customModulePricing: undefined,
        userTier: undefined,
        customUserLimit: undefined,
        customTierPrice: undefined,
        billingType: undefined,
        trialDays: undefined,
      };
    }
    return company;
  }

  // ────────────────────────────────────────────────────────────────────
  // Section-based partial update
  // ────────────────────────────────────────────────────────────────────
  async updateCompanySection(companyId: string, section: CompanySectionKey, data: any) {
    // Ensure company exists
    const company = await platformPrisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw ApiError.notFound('Company not found');
    }

    switch (section) {
      // ── Simple field updates on Company ─────────────────────────
      case 'identity':
        await platformPrisma.company.update({
          where: { id: companyId },
          data: {
            displayName: data.displayName,
            legalName: data.legalName,
            name: data.displayName, // keep legacy name in sync
            shortName: n(data.shortName),
            businessType: data.businessType,
            industry: data.industry,
            companyCode: data.companyCode,
            cin: n(data.cin),
            incorporationDate: n(data.incorporationDate),
            employeeCount: n(data.employeeCount),
            size: mapCompanySize(data.employeeCount),
            emailDomain: data.emailDomain,
            logoUrl: n(data.logoUrl),
            website: n(data.website),
            wizardStatus: data.wizardStatus ?? company.wizardStatus,
          },
        });
        break;

      case 'statutory':
        await platformPrisma.company.update({
          where: { id: companyId },
          data: {
            pan: n(data.pan),
            tan: n(data.tan),
            gstin: n(data.gstin),
            gstNumber: n(data.gstin), // legacy field
            pfRegNo: n(data.pfRegNo),
            esiCode: n(data.esiCode),
            ptReg: n(data.ptReg),
            lwfrNo: n(data.lwfrNo),
            rocState: n(data.rocState),
          },
        });
        break;

      case 'address':
        await platformPrisma.company.update({
          where: { id: companyId },
          data: {
            registeredAddress: data.registered as any,
            corporateAddress: data.sameAsRegistered ? Prisma.JsonNull : (data.corporate as any) ?? Prisma.JsonNull,
            sameAsRegistered: data.sameAsRegistered,
          },
        });
        break;

      case 'fiscal':
        await platformPrisma.company.update({
          where: { id: companyId },
          data: { fiscalConfig: data as any },
        });
        break;

      case 'preferences': {
        const { razorpayEnabled, razorpayKeyId, razorpayKeySecret, razorpayWebhookSecret, razorpayAccountNumber, razorpayAutoDisbursement, razorpayTestMode, ...prefs } = data;
        const rpConfig = razorpayEnabled
          ? { enabled: true, keyId: razorpayKeyId, keySecret: razorpayKeySecret, webhookSecret: razorpayWebhookSecret, accountNumber: razorpayAccountNumber, autoDisbursement: razorpayAutoDisbursement ?? false, testMode: razorpayTestMode ?? true }
          : null;

        // Razorpay config stays on Company
        await platformPrisma.company.update({
          where: { id: companyId },
          data: {
            razorpayConfig: rpConfig as any ?? Prisma.JsonNull,
          },
        });

        // Preferences are now stored in CompanySettings
        const settingsData = {
          currency: prefs.currency,
          language: prefs.language,
          dateFormat: prefs.dateFormat,
          timeFormat: prefs.timeFormat,
          numberFormat: prefs.numberFormat,
          indiaCompliance: prefs.indiaCompliance,
          bankIntegration: prefs.bankIntegration,
          emailNotifications: prefs.emailNotif,
          whatsappNotifications: prefs.whatsapp,
          eSignIntegration: prefs.eSign,
          biometricIntegration: prefs.biometric,
        };
        await platformPrisma.companySettings.upsert({
          where: { companyId },
          create: { companyId, ...settingsData },
          update: settingsData,
        });
        break;
      }

      case 'endpoint':
        await platformPrisma.company.update({
          where: { id: companyId },
          data: {
            endpointType: data.endpointType,
            customEndpointUrl: n(data.customBaseUrl),
          },
        });
        break;

      case 'strategy':
        await platformPrisma.company.update({
          where: { id: companyId },
          data: {
            multiLocationMode: data.multiLocationMode,
            locationConfig: data.locationConfig,
          },
        });
        break;

      case 'controls':
        await platformPrisma.systemControls.upsert({
          where: { companyId },
          create: { companyId, ...(data as any) },
          update: data as any,
        });
        break;

      case 'commercial':
        await platformPrisma.company.update({
          where: { id: companyId },
          data: {
            selectedModuleIds: data.selectedModuleIds as any ?? Prisma.JsonNull,
            customModulePricing: data.customModulePricing as any ?? Prisma.JsonNull,
            userTier: n(data.userTier),
            customUserLimit: n(data.customUserLimit),
            customTierPrice: n(data.customTierPrice),
            billingType: data.billingType ?? 'monthly',
            trialDays: data.trialDays ?? 0,
          },
        });
        break;

      // ── Array sections: delete-all + re-create ──────────────────
      case 'locations':
        await platformPrisma.$transaction(async (tx) => {
          const currentCompany = await tx.company.findUnique({
            where: { id: companyId },
            select: { registeredAddress: true, corporateAddress: true, sameAsRegistered: true },
          });
          const regStdCode = (currentCompany?.registeredAddress as any)?.stdCode as string | undefined;
          const corpStdCode = (currentCompany?.corporateAddress as any)?.stdCode as string | undefined;
          const hqStdCode = currentCompany?.sameAsRegistered ? regStdCode : (corpStdCode || regStdCode);
          await tx.location.deleteMany({ where: { companyId } });
          if (Array.isArray(data) && data.length > 0) {
            await tx.location.createMany({
              data: (data as LocationPayload[]).map((loc) => buildLocationData(
                companyId,
                loc,
                hqStdCode ? { hqStdCode } : undefined,
              )),
            });
          }
        });
        break;

      case 'contacts':
        await platformPrisma.$transaction(async (tx) => {
          await tx.companyContact.deleteMany({ where: { companyId } });
          if (Array.isArray(data) && data.length > 0) {
            await tx.companyContact.createMany({
              data: (data as ContactPayload[]).map((c) => buildContactData(companyId, c)),
            });
          }
        });
        break;

      case 'shifts': {
        const shiftsData = data as OnboardTenantPayload['shifts'];
        await platformPrisma.$transaction(async (tx) => {
          // Update company-level shift fields
          await tx.company.update({
            where: { id: companyId },
            data: {
              dayStartTime: n(shiftsData.dayStartTime),
              dayEndTime: n(shiftsData.dayEndTime),
              weeklyOffs: shiftsData.weeklyOffs as any ?? Prisma.JsonNull,
            },
          });
          // Replace shift items
          await tx.companyShift.deleteMany({ where: { companyId } });
          if (shiftsData.items && shiftsData.items.length > 0) {
            await tx.companyShift.createMany({
              data: shiftsData.items.map((s) => ({
                companyId,
                name: s.name,
                startTime: s.fromTime,
                endTime: s.toTime,
                noShuffle: s.noShuffle ?? false,
              })),
            });
          }
        });
        break;
      }

      case 'noSeries':
        await platformPrisma.$transaction(async (tx) => {
          await tx.noSeriesConfig.deleteMany({ where: { companyId } });
          if (Array.isArray(data) && data.length > 0) {
            await tx.noSeriesConfig.createMany({
              data: (data as NoSeriesPayload[]).map((ns) => buildNoSeriesData(companyId, ns)),
            });
          }
        });
        break;

      case 'iotReasons':
        await platformPrisma.$transaction(async (tx) => {
          await tx.iotReason.deleteMany({ where: { companyId } });
          if (Array.isArray(data) && data.length > 0) {
            await tx.iotReason.createMany({
              data: (data as IotReasonPayload[]).map((r) => buildIotReasonData(companyId, r)),
            });
          }
        });
        break;

      case 'users':
        // Users are additive — we don't delete existing users.
        // Wrapped in transaction so partial failures don't leave orphan users.
        if (Array.isArray(data) && data.length > 0) {
          const usersToCreate = data as UserPayload[];
          // Pre-hash all passwords before entering the transaction
          const prepared = await Promise.all(
            usersToCreate.map(async (u) => {
              const { firstName, lastName } = splitName(u.fullName);
              const hashed = await hashPassword(u.password);
              return { email: u.email, password: hashed, firstName, lastName, phone: n(u.mobile), companyId };
            }),
          );
          await platformPrisma.$transaction(async (tx) => {
            for (const p of prepared) {
              await tx.user.create({
                data: { ...p, role: 'COMPANY_ADMIN' },
              });
            }
          });
        }
        break;

      default:
        throw ApiError.badRequest(`Unknown section key: ${section}`);
    }

    // Return updated full detail
    return this.getFullCompanyDetail(companyId);
  }

  // ────────────────────────────────────────────────────────────────────
  // Update company wizard status (+ tenant status)
  // ────────────────────────────────────────────────────────────────────
  async updateCompanyStatus(companyId: string, status: string) {
    const company = await platformPrisma.company.findUnique({
      where: { id: companyId },
      include: { tenant: true },
    });

    if (!company) {
      throw ApiError.notFound('Company not found');
    }

    const tenantStatus = mapWizardStatusToTenantStatus(status);

    await platformPrisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: companyId },
        data: { wizardStatus: status },
      });

      if (company.tenant) {
        await tx.tenant.update({
          where: { id: company.tenant.id },
          data: { status: tenantStatus },
        });
      }
    });

    logger.info(`Company ${companyId} status updated to ${status}`);
    return this.getFullCompanyDetail(companyId);
  }

  // ────────────────────────────────────────────────────────────────────
  // Delete company (cascade) + drop tenant schema
  // ────────────────────────────────────────────────────────────────────
  async deleteCompany(companyId: string) {
    const company = await platformPrisma.company.findUnique({
      where: { id: companyId },
      include: { tenant: true },
    });

    if (!company) {
      throw ApiError.notFound('Company not found');
    }

    // Delete DB records first (cascade deletes locations, contacts, etc.)
    // If this fails, schema is still intact and can be retried.
    const schemaName = company.tenant?.schemaName;
    const tenantId = company.tenant?.id;

    await platformPrisma.company.delete({ where: { id: companyId } });

    // Now drop the PostgreSQL schema (safe — DB records already gone)
    if (schemaName) {
      await this.dropTenantSchema(schemaName);
    }
    if (tenantId) {
      await this.clearTenantCache(tenantId);
    }

    logger.info(`Company deleted: ${companyId}`);
    return { message: 'Company deleted' };
  }

  // ════════════════════════════════════════════════════════════════════
  // Existing CRUD methods (unchanged)
  // ════════════════════════════════════════════════════════════════════

  // Create new tenant
  async createTenant(tenantData: CreateTenantData) {
    const { companyId, slug, schemaName, status = TenantStatus.ACTIVE } = tenantData;

    // Check if company already has a tenant
    const existingTenant = await platformPrisma.tenant.findUnique({
      where: { companyId },
    });

    if (existingTenant) {
      throw ApiError.conflict('Company already has a tenant');
    }

    // Generate schema name from slug if not provided
    const finalSchemaName = schemaName || `tenant_${slug.replace(/-/g, '_')}`;

    // Check if schema name is unique
    const existingSchema = await platformPrisma.tenant.findUnique({
      where: { schemaName: finalSchemaName },
    });

    if (existingSchema) {
      throw ApiError.conflict('Schema name already exists');
    }

    // Check if slug is unique
    const existingSlug = await platformPrisma.tenant.findUnique({
      where: { slug },
    });

    if (existingSlug) {
      throw ApiError.conflict('Slug already exists');
    }

    // Create tenant
    const createData: Prisma.TenantUncheckedCreateInput = {
      companyId,
      schemaName: finalSchemaName,
      slug,
      status,
    };

    const tenant = await platformPrisma.tenant.create({
      data: createData,
      include: {
        company: true,
      },
    });

    // TODO: Create database schema and run migrations
    await this.createTenantSchema(tenant.schemaName);

    // Cache tenant data
    await this.cacheTenantData(tenant.id, tenant);

    logger.info(`Tenant created: ${tenant.id} (${tenant.schemaName})`);

    return tenant;
  }

  // Get tenant by ID
  async getTenantById(tenantId: string) {
    // Check cache first
    const cacheKey = createTenantCacheKey(tenantId);
    const cachedData = await cacheRedis.get(cacheKey);

    if (cachedData) {
      return JSON.parse(cachedData);
    }

    // Fetch from database
    const tenant = await platformPrisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        company: true,
      },
    });

    if (!tenant) {
      throw ApiError.notFound('Tenant not found');
    }

    // Cache the data
    await this.cacheTenantData(tenantId, tenant);

    return tenant;
  }

  // Get tenant by company ID
  async getTenantByCompanyId(companyId: string) {
    const tenant = await platformPrisma.tenant.findUnique({
      where: { companyId },
      include: {
        company: true,
      },
    });

    if (!tenant) {
      throw ApiError.notFound('Tenant not found for this company');
    }

    return tenant;
  }

  // Get tenant by schema name
  async getTenantBySchema(schemaName: string) {
    const tenant = await platformPrisma.tenant.findUnique({
      where: { schemaName },
      include: {
        company: true,
      },
    });

    if (!tenant) {
      throw ApiError.notFound('Tenant not found for this schema');
    }

    return tenant;
  }

  // Update tenant
  async updateTenant(tenantId: string, updateData: UpdateTenantData) {
    const data: Prisma.TenantUncheckedUpdateInput = {
      ...(typeof updateData.schemaName !== 'undefined' ? { schemaName: updateData.schemaName } : {}),
      ...(typeof updateData.status !== 'undefined' ? { status: updateData.status } : {}),
    };

    const tenant = await platformPrisma.tenant.update({
      where: { id: tenantId },
      data,
      include: {
        company: true,
      },
    });

    // Update cache
    await this.cacheTenantData(tenantId, tenant);

    // Clear related caches
    await cacheRedis.del(createTenantCacheKey(tenantId, 'config'));

    logger.info(`Tenant updated: ${tenantId}`);

    return tenant;
  }

  // Delete tenant
  async deleteTenant(tenantId: string) {
    // Get tenant info before deletion
    const tenant = await this.getTenantById(tenantId);

    // TODO: Drop database schema
    await this.dropTenantSchema(tenant.schemaName);

    // Delete tenant
    await platformPrisma.tenant.delete({
      where: { id: tenantId },
    });

    // Clear cache
    await this.clearTenantCache(tenantId);

    logger.info(`Tenant deleted: ${tenantId}`);

    return { message: 'Tenant deleted successfully' };
  }

  // List tenants with pagination
  async listTenants(options: {
    page?: number;
    limit?: number;
    status?: TenantStatus;
    search?: string;
  } = {}) {
    const { page = 1, limit = 25, status, search } = options;
    const offset = (page - 1) * limit;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (search) {
      where.company = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { displayName: { contains: search, mode: 'insensitive' } },
          { emailDomain: { contains: search, mode: 'insensitive' } },
          { companyCode: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const [tenants, total] = await Promise.all([
      platformPrisma.tenant.findMany({
        where,
        include: {
          company: true,
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.tenant.count({ where }),
    ]);

    return {
      tenants,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Provision tenant schema
  private async createTenantSchema(schemaName: string): Promise<void> {
    try {
      // Create schema
      await platformPrisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

      // TODO: Run tenant-specific migrations
      // This would typically involve running migration scripts for the tenant schema

      logger.info(`Tenant schema created: ${schemaName}`);
    } catch (error) {
      logger.error(`Failed to create tenant schema ${schemaName}:`, error);
      throw ApiError.internal('Failed to create tenant schema');
    }
  }

  // Drop tenant schema
  private async dropTenantSchema(schemaName: string): Promise<void> {
    try {
      // Drop schema and all its contents
      await platformPrisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);

      logger.info(`Tenant schema dropped: ${schemaName}`);
    } catch (error) {
      logger.error(`Failed to drop tenant schema ${schemaName}:`, error);
      throw ApiError.internal('Failed to drop tenant schema');
    }
  }

  // Cache tenant data
  private async cacheTenantData(tenantId: string, tenantData: any): Promise<void> {
    const cacheKey = createTenantCacheKey(tenantId);
    await cacheRedis.setex(cacheKey, 86400, JSON.stringify(tenantData)); // 24 hours
  }

  // Clear tenant cache
  private async clearTenantCache(tenantId: string): Promise<void> {
    await scanAndDelete(cacheRedis, createRedisPattern('tenant', tenantId, '*'));
  }

  // Get tenant statistics
  async getTenantStats(): Promise<{
    total: number;
    active: number;
    suspended: number;
    trial: number;
  }> {
    const stats = await platformPrisma.tenant.groupBy({
      by: ['status'],
      _count: {
        status: true,
      },
    });

    const result = {
      total: 0,
      active: 0,
      suspended: 0,
      trial: 0,
    };

    stats.forEach((stat: any) => {
      result.total += stat._count.status;
      switch (stat.status) {
        case 'ACTIVE':
          result.active = stat._count.status;
          break;
        case 'SUSPENDED':
          result.suspended = stat._count.status;
          break;
        case 'TRIAL':
          result.trial = stat._count.status;
          break;
      }
    });

    return result;
  }
}

export const tenantService = new TenantService();
