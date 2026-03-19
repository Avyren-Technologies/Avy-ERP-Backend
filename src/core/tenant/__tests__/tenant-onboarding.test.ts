/**
 * Tests for tenant onboarding:
 *   - onboardTenantSchema (tenant.validators.ts) — Zod validation
 *   - TenantService new methods (tenant.service.ts):
 *       onboardTenant, getFullCompanyDetail, updateCompanySection,
 *       updateCompanyStatus, deleteCompany
 *
 * External dependencies mocked:
 *   - src/config/database  (platformPrisma)
 *   - src/config/redis     (cacheRedis + scanAndDelete)
 *   - src/config/logger    (suppress output)
 *
 * The @prisma/client enum values (TenantStatus, CompanySize) are also mocked
 * because Prisma is not connected in unit tests.
 */

// ── Mock Prisma enums before any import touches @prisma/client ───────────────
jest.mock('@prisma/client', () => ({
  Prisma: {
    JsonNull: null,
  },
  TenantStatus: {
    ACTIVE: 'ACTIVE',
    SUSPENDED: 'SUSPENDED',
    TRIAL: 'TRIAL',
  },
  CompanySize: {
    STARTUP: 'STARTUP',
    SMALL: 'SMALL',
    MEDIUM: 'MEDIUM',
    LARGE: 'LARGE',
    ENTERPRISE: 'ENTERPRISE',
  },
}));

// ── Mock infrastructure BEFORE any imports that pull them in ─────────────────
jest.mock('../../../config/database', () => ({
  platformPrisma: {
    company: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    tenant: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    location: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    companyContact: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    companyShift: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    noSeriesConfig: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    iotReason: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    subscription: {
      create: jest.fn(),
    },
    user: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
    $executeRawUnsafe: jest.fn(),
  },
}));

jest.mock('../../../config/redis', () => ({
  cacheRedis: {
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
  },
  scanAndDelete: jest.fn(),
}));

jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { onboardTenantSchema, updateCompanyStatusSchema } from '../tenant.validators';
import { TenantService } from '../tenant.service';
import { platformPrisma } from '../../../config/database';
import { cacheRedis } from '../../../config/redis';
import { ApiError } from '../../../shared/errors';

// ── Typed mock shorthands ─────────────────────────────────────────────────────
// Using `as any` avoids the circular Prisma type reference error that
// jest.Mocked<typeof platformPrisma.company> triggers in ts-jest.
const mockCompany = platformPrisma.company as any;
const mockTenant = platformPrisma.tenant as any;
const mockTransaction = platformPrisma.$transaction as jest.Mock;
const mockExecuteRaw = platformPrisma.$executeRawUnsafe as jest.Mock;
const mockRedis = cacheRedis as any;

// ── Shared fixture builders ───────────────────────────────────────────────────

/** Minimal valid registered address block */
const validAddress = {
  line1: '123 MG Road',
  city: 'Bangalore',
  state: 'Karnataka',
  pin: '560001',
  country: 'India',
};

/** Minimal valid payload that satisfies onboardTenantSchema */
function buildValidPayload(overrides: Record<string, any> = {}) {
  return {
    identity: {
      displayName: 'Acme Corp',
      legalName: 'Acme Corporation Pvt Ltd',
      businessType: 'Private Limited',
      industry: 'Manufacturing',
      companyCode: 'ACME',
      emailDomain: 'acme.com',
    },
    statutory: {
      pan: 'AABCA1234E',
    },
    address: {
      registered: validAddress,
      sameAsRegistered: true,
    },
    fiscal: {
      fyType: 'April-March',
      payrollFreq: 'Monthly',
      cutoffDay: '25',
      disbursementDay: '1',
      weekStart: 'Monday',
      timezone: 'Asia/Kolkata',
      workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    },
    preferences: {
      currency: 'INR',
      language: 'en',
      dateFormat: 'DD/MM/YYYY',
      indiaCompliance: true,
      mobileApp: true,
      webApp: true,
      biometric: false,
      bankIntegration: false,
      emailNotif: true,
    },
    endpoint: {
      endpointType: 'default' as const,
    },
    strategy: {
      multiLocationMode: false,
      locationConfig: 'common' as const,
    },
    locations: [
      {
        name: 'HQ',
        code: 'HQ-001',
        facilityType: 'Head Office',
        status: 'Active',
        isHQ: true,
        geoEnabled: false,
      },
    ],
    contacts: [],
    shifts: { items: [] },
    noSeries: [],
    iotReasons: [],
    controls: {},
    users: [],
    ...overrides,
  };
}

/** A minimal DB company record returned by Prisma mocks */
const dbCompany = {
  id: 'company-uuid-1',
  companyCode: 'ACME',
  displayName: 'Acme Corp',
  name: 'Acme Corp',
  wizardStatus: 'Draft',
  tenant: {
    id: 'tenant-uuid-1',
    schemaName: 'tenant_company_uuid_1',
  },
};

/** A full company record with relations for getFullCompanyDetail */
const dbCompanyFull = {
  ...dbCompany,
  locations: [],
  contacts: [],
  shifts: [],
  noSeries: [],
  iotReasons: [],
  users: [],
  tenant: {
    id: 'tenant-uuid-1',
    schemaName: 'tenant_company_uuid_1',
    subscriptions: [],
  },
};

// =============================================================================
// Schema validation: onboardTenantSchema
// =============================================================================

describe('onboardTenantSchema', () => {
  describe('valid payload', () => {
    it('should pass with a minimal valid payload', () => {
      const result = onboardTenantSchema.safeParse(buildValidPayload());
      expect(result.success).toBe(true);
    });

    it('should pass with all optional fields populated', () => {
      const result = onboardTenantSchema.safeParse(
        buildValidPayload({
          identity: {
            displayName: 'Acme Corp',
            legalName: 'Acme Corporation Pvt Ltd',
            businessType: 'Private Limited',
            industry: 'Manufacturing',
            companyCode: 'ACME',
            emailDomain: 'acme.com',
            shortName: 'Acme',
            cin: 'U12345MH2020PTC123456',
            website: 'https://acme.com',
            employeeCount: '150',
            logoUrl: 'https://acme.com/logo.png',
            wizardStatus: 'Pilot',
          },
          statutory: {
            pan: 'AABCA1234E',
            tan: 'BLRA12345B',
            gstin: '29AABCA1234E1Z5',
            pfRegNo: 'KA/BAN/0001234',
            esiCode: 'ESI12345',
          },
          commercial: {
            selectedModuleIds: ['hr', 'payroll'],
            userTier: 'growth',
            billingCycle: 'annual',
            trialDays: 30,
          },
          contacts: [
            {
              name: 'Alice Smith',
              type: 'Primary',
              email: 'alice@acme.com',
              mobile: '+919876543210',
              designation: 'HR Manager',
            },
          ],
          shifts: {
            dayStartTime: '09:00',
            dayEndTime: '18:00',
            weeklyOffs: ['Sunday'],
            items: [
              {
                name: 'General',
                fromTime: '09:00',
                toTime: '18:00',
                noShuffle: false,
              },
            ],
          },
          noSeries: [
            {
              code: 'EMP',
              linkedScreen: 'Employee',
              prefix: 'EMP',
              numberCount: 5,
              startNumber: 1,
            },
          ],
          iotReasons: [
            {
              reasonType: 'Breakdown',
              reason: 'Machine failure',
              planned: false,
            },
          ],
          users: [
            {
              fullName: 'Bob Jones',
              username: 'bjones',
              password: 'Secret123',
              role: 'COMPANY_ADMIN',
              email: 'bob@acme.com',
            },
          ],
          controls: {
            mfa: true,
            payrollLock: false,
          },
        })
      );
      expect(result.success).toBe(true);
    });

    it('should apply default status="Active" to a location that omits it', () => {
      const payload = buildValidPayload({
        locations: [
          {
            name: 'Branch',
            code: 'BR-001',
            facilityType: 'Branch Office',
            isHQ: false,
            geoEnabled: false,
            // status intentionally omitted
          },
        ],
      });
      const result = onboardTenantSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.locations[0].status).toBe('Active');
      }
    });

    it('should apply default isHQ=false to a location that omits it', () => {
      const payload = buildValidPayload({
        locations: [
          {
            name: 'Plant A',
            code: 'PLT-001',
            facilityType: 'Manufacturing Plant',
            geoEnabled: false,
            // isHQ intentionally omitted
          },
        ],
      });
      const result = onboardTenantSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.locations[0].isHQ).toBe(false);
      }
    });

    it('should accept endpointType "custom" with a custom URL', () => {
      const result = onboardTenantSchema.safeParse(
        buildValidPayload({
          endpoint: {
            endpointType: 'custom',
            customBaseUrl: 'https://erp.acme.internal',
          },
        })
      );
      expect(result.success).toBe(true);
    });

    it('should accept locationConfig "per-location"', () => {
      const result = onboardTenantSchema.safeParse(
        buildValidPayload({
          strategy: {
            multiLocationMode: true,
            locationConfig: 'per-location',
          },
        })
      );
      expect(result.success).toBe(true);
    });

    it('should accept a location contactEmail as empty string (valid edge case)', () => {
      const result = onboardTenantSchema.safeParse(
        buildValidPayload({
          locations: [
            {
              name: 'HQ',
              code: 'HQ-001',
              facilityType: 'Head Office',
              isHQ: true,
              geoEnabled: false,
              contactEmail: '', // empty string is allowed via .or(z.literal(''))
            },
          ],
        })
      );
      expect(result.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Missing required fields
  // ---------------------------------------------------------------------------

  describe('missing required fields', () => {
    it('should fail when identity.displayName is missing', () => {
      const payload = buildValidPayload();
      delete (payload as any).identity.displayName;
      const result = onboardTenantSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should fail when identity.legalName is missing', () => {
      const payload = buildValidPayload();
      delete (payload as any).identity.legalName;
      const result = onboardTenantSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should fail when identity.companyCode is missing', () => {
      const payload = buildValidPayload();
      delete (payload as any).identity.companyCode;
      const result = onboardTenantSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should fail when identity.emailDomain is missing', () => {
      const payload = buildValidPayload();
      delete (payload as any).identity.emailDomain;
      const result = onboardTenantSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should fail when statutory.pan is missing', () => {
      const payload = buildValidPayload();
      delete (payload as any).statutory.pan;
      const result = onboardTenantSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should fail when address.registered.line1 is missing', () => {
      const payload = buildValidPayload({
        address: {
          registered: { ...validAddress, line1: '' },
          sameAsRegistered: true,
        },
      });
      const result = onboardTenantSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should fail when address.registered.city is missing', () => {
      const payload = buildValidPayload({
        address: {
          registered: { ...validAddress, city: '' },
          sameAsRegistered: true,
        },
      });
      const result = onboardTenantSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should fail when fiscal.workingDays is an empty array', () => {
      const payload = buildValidPayload({
        fiscal: {
          fyType: 'April-March',
          payrollFreq: 'Monthly',
          cutoffDay: '25',
          disbursementDay: '1',
          weekStart: 'Monday',
          timezone: 'Asia/Kolkata',
          workingDays: [], // min(1) violated
        },
      });
      const result = onboardTenantSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should fail when locations array is empty', () => {
      const payload = buildValidPayload({ locations: [] }); // min(1) violated
      const result = onboardTenantSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should fail when a location is missing its name', () => {
      const payload = buildValidPayload({
        locations: [
          {
            code: 'HQ-001',
            facilityType: 'Head Office',
            isHQ: true,
            geoEnabled: false,
            // name missing
          },
        ],
      });
      const result = onboardTenantSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should fail when a contact has an invalid email', () => {
      const payload = buildValidPayload({
        contacts: [
          {
            name: 'Alice',
            type: 'Primary',
            email: 'not-an-email', // invalid
            mobile: '+919876543210',
          },
        ],
      });
      const result = onboardTenantSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should fail when a contact is missing required mobile', () => {
      const payload = buildValidPayload({
        contacts: [
          {
            name: 'Alice',
            type: 'Primary',
            email: 'alice@acme.com',
            // mobile missing
          },
        ],
      });
      const result = onboardTenantSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should fail when a user fullName is too short (min 2)', () => {
      const payload = buildValidPayload({
        users: [
          {
            fullName: 'A', // less than min(2)
            username: 'auser',
            password: 'Secret123',
            role: 'COMPANY_ADMIN',
            email: 'a@acme.com',
          },
        ],
      });
      const result = onboardTenantSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should fail when a user password is too short (min 6)', () => {
      const payload = buildValidPayload({
        users: [
          {
            fullName: 'Bob Jones',
            username: 'bjones',
            password: '123', // less than min(6)
            role: 'COMPANY_ADMIN',
            email: 'bob@acme.com',
          },
        ],
      });
      const result = onboardTenantSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Invalid formats / boundary values
  // ---------------------------------------------------------------------------

  describe('invalid formats and boundary values', () => {
    it('should fail when endpointType is not "default" or "custom"', () => {
      const payload = buildValidPayload({
        endpoint: { endpointType: 'cloud' }, // not in enum
      });
      const result = onboardTenantSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should fail when locationConfig is not "common" or "per-location"', () => {
      const payload = buildValidPayload({
        strategy: { multiLocationMode: false, locationConfig: 'global' },
      });
      const result = onboardTenantSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should fail when noSeries.numberCount is less than 1', () => {
      const payload = buildValidPayload({
        noSeries: [
          {
            code: 'EMP',
            linkedScreen: 'Employee',
            prefix: 'EMP',
            numberCount: 0, // min(1) violated
          },
        ],
      });
      const result = onboardTenantSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should fail when commercial.trialDays is negative', () => {
      const payload = buildValidPayload({
        commercial: {
          trialDays: -1, // min(0) violated
        },
      });
      const result = onboardTenantSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should fail when identity.displayName is a single character (min 2)', () => {
      const payload = buildValidPayload({
        identity: {
          ...buildValidPayload().identity,
          displayName: 'A',
        },
      });
      const result = onboardTenantSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should pass when identity.displayName is exactly 2 characters (boundary)', () => {
      const result = onboardTenantSchema.safeParse(
        buildValidPayload({
          identity: {
            ...buildValidPayload().identity,
            displayName: 'AB',
          },
        })
      );
      expect(result.success).toBe(true);
    });

    it('should fail when a location contactEmail is provided but is invalid', () => {
      const result = onboardTenantSchema.safeParse(
        buildValidPayload({
          locations: [
            {
              name: 'HQ',
              code: 'HQ-001',
              facilityType: 'Head Office',
              isHQ: true,
              geoEnabled: false,
              contactEmail: 'not-a-valid-email',
            },
          ],
        })
      );
      expect(result.success).toBe(false);
    });

    it('should fail when a shift item is missing fromTime', () => {
      const payload = buildValidPayload({
        shifts: {
          items: [
            {
              name: 'General',
              toTime: '18:00',
              // fromTime missing
            },
          ],
        },
      });
      const result = onboardTenantSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should accept commercial with zero trialDays (boundary)', () => {
      const result = onboardTenantSchema.safeParse(
        buildValidPayload({
          commercial: { trialDays: 0 },
        })
      );
      expect(result.success).toBe(true);
    });
  });
});

// =============================================================================
// updateCompanyStatusSchema
// =============================================================================

describe('updateCompanyStatusSchema', () => {
  it('should pass for each valid status value', () => {
    for (const status of ['Draft', 'Pilot', 'Active', 'Inactive']) {
      const result = updateCompanyStatusSchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it('should fail for an unknown status string', () => {
    const result = updateCompanyStatusSchema.safeParse({ status: 'Suspended' });
    expect(result.success).toBe(false);
  });

  it('should fail when status field is missing', () => {
    const result = updateCompanyStatusSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// TenantService — onboardTenant
// =============================================================================

describe('TenantService', () => {
  let service: TenantService;

  beforeEach(() => {
    service = new TenantService();
    mockRedis.setex.mockResolvedValue('OK');
    mockExecuteRaw.mockResolvedValue(undefined);
  });

  // ── onboardTenant ──────────────────────────────────────────────────────────

  describe('onboardTenant', () => {
    function buildTransactionMocks(companyId = 'company-uuid-1', tenantId = 'tenant-uuid-1') {
      const txCompany = { id: companyId, companyCode: 'ACME', displayName: 'Acme Corp' };
      const txTenant = { id: tenantId, schemaName: `tenant_${companyId.replace(/-/g, '_')}` };

      mockTransaction.mockImplementationOnce(async (cb: any) =>
        cb({
          company: { create: jest.fn().mockResolvedValue(txCompany) },
          tenant: { create: jest.fn().mockResolvedValue(txTenant) },
          location: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
          companyContact: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
          companyShift: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
          noSeriesConfig: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
          iotReason: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
          subscription: { create: jest.fn().mockResolvedValue({}) },
          user: { create: jest.fn().mockResolvedValue({}) },
        })
      );

      // getFullCompanyDetail call after transaction completes
      mockCompany.findUnique.mockResolvedValueOnce(dbCompanyFull as any);

      return { txCompany, txTenant };
    }

    it('should throw conflict when company code already exists', async () => {
      mockCompany.findUnique.mockResolvedValueOnce(dbCompany as any);

      await expect(service.onboardTenant(buildValidPayload() as any)).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it('should run the full transaction when company code is unique', async () => {
      // No existing company with that code
      mockCompany.findUnique.mockResolvedValueOnce(null);
      buildTransactionMocks();

      const result = await service.onboardTenant(buildValidPayload() as any);

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      // Returns the full company detail after onboarding
      expect(result).toMatchObject({ id: 'company-uuid-1' });
    });

    it('should create a tenant schema after the transaction', async () => {
      mockCompany.findUnique.mockResolvedValueOnce(null);
      buildTransactionMocks();

      await service.onboardTenant(buildValidPayload() as any);

      expect(mockExecuteRaw).toHaveBeenCalledWith(
        expect.stringContaining('CREATE SCHEMA IF NOT EXISTS')
      );
    });

    it('should cache the tenant data after schema creation', async () => {
      mockCompany.findUnique.mockResolvedValueOnce(null);
      buildTransactionMocks();

      await service.onboardTenant(buildValidPayload() as any);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('tenant'),
        86400,
        expect.any(String)
      );
    });

    it('should default wizardStatus to "Draft" when identity.wizardStatus is omitted', async () => {
      mockCompany.findUnique.mockResolvedValueOnce(null);

      let capturedCompanyData: any;
      mockTransaction.mockImplementationOnce(async (cb: any) => {
        const txCompany = { id: 'c-1', companyCode: 'ACME', displayName: 'Acme Corp' };
        const txTenant = { id: 't-1', schemaName: 'tenant_c_1' };
        const mockTxCompanyCreate = jest.fn().mockImplementation(async ({ data }) => {
          capturedCompanyData = data;
          return txCompany;
        });
        return cb({
          company: { create: mockTxCompanyCreate },
          tenant: { create: jest.fn().mockResolvedValue(txTenant) },
          location: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
          companyContact: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
          companyShift: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
          noSeriesConfig: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
          iotReason: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
          subscription: { create: jest.fn().mockResolvedValue({}) },
          user: { create: jest.fn().mockResolvedValue({}) },
        });
      });
      mockCompany.findUnique.mockResolvedValueOnce(dbCompanyFull as any);

      await service.onboardTenant(buildValidPayload() as any);

      expect(capturedCompanyData.wizardStatus).toBe('Draft');
    });

    it('should create a TRIAL subscription when wizardStatus is "Pilot"', async () => {
      mockCompany.findUnique.mockResolvedValueOnce(null);

      let capturedSubscriptionData: any;
      mockTransaction.mockImplementationOnce(async (cb: any) => {
        const txCompany = { id: 'c-1', companyCode: 'ACME' };
        const txTenant = { id: 't-1', schemaName: 'tenant_c_1' };
        const mockSubCreate = jest.fn().mockImplementation(async ({ data }) => {
          capturedSubscriptionData = data;
          return {};
        });
        return cb({
          company: { create: jest.fn().mockResolvedValue(txCompany) },
          tenant: { create: jest.fn().mockResolvedValue(txTenant) },
          location: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
          companyContact: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
          companyShift: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
          noSeriesConfig: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
          iotReason: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
          subscription: { create: mockSubCreate },
          user: { create: jest.fn().mockResolvedValue({}) },
        });
      });
      mockCompany.findUnique.mockResolvedValueOnce(dbCompanyFull as any);

      const payload = buildValidPayload({
        identity: { ...buildValidPayload().identity, wizardStatus: 'Pilot' },
      });

      await service.onboardTenant(payload as any);

      expect(capturedSubscriptionData.status).toBe('TRIAL');
    });

    it('should create an ACTIVE subscription when wizardStatus is "Active"', async () => {
      mockCompany.findUnique.mockResolvedValueOnce(null);

      let capturedSubscriptionData: any;
      mockTransaction.mockImplementationOnce(async (cb: any) => {
        const txCompany = { id: 'c-1', companyCode: 'ACME' };
        const txTenant = { id: 't-1', schemaName: 'tenant_c_1' };
        const mockSubCreate = jest.fn().mockImplementation(async ({ data }) => {
          capturedSubscriptionData = data;
          return {};
        });
        return cb({
          company: { create: jest.fn().mockResolvedValue(txCompany) },
          tenant: { create: jest.fn().mockResolvedValue(txTenant) },
          location: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
          companyContact: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
          companyShift: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
          noSeriesConfig: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
          iotReason: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
          subscription: { create: mockSubCreate },
          user: { create: jest.fn().mockResolvedValue({}) },
        });
      });
      mockCompany.findUnique.mockResolvedValueOnce(dbCompanyFull as any);

      const payload = buildValidPayload({
        identity: { ...buildValidPayload().identity, wizardStatus: 'Active' },
      });

      await service.onboardTenant(payload as any);

      expect(capturedSubscriptionData.status).toBe('ACTIVE');
    });

    it('should set trialEndsAt when commercial.trialDays > 0', async () => {
      mockCompany.findUnique.mockResolvedValueOnce(null);

      let capturedSubscriptionData: any;
      mockTransaction.mockImplementationOnce(async (cb: any) => {
        const txCompany = { id: 'c-1', companyCode: 'ACME' };
        const txTenant = { id: 't-1', schemaName: 'tenant_c_1' };
        const mockSubCreate = jest.fn().mockImplementation(async ({ data }) => {
          capturedSubscriptionData = data;
          return {};
        });
        return cb({
          company: { create: jest.fn().mockResolvedValue(txCompany) },
          tenant: { create: jest.fn().mockResolvedValue(txTenant) },
          location: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
          companyContact: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
          companyShift: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
          noSeriesConfig: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
          iotReason: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
          subscription: { create: mockSubCreate },
          user: { create: jest.fn().mockResolvedValue({}) },
        });
      });
      mockCompany.findUnique.mockResolvedValueOnce(dbCompanyFull as any);

      const payload = buildValidPayload({
        commercial: { trialDays: 30 },
      });

      const before = Date.now();
      await service.onboardTenant(payload as any);
      const after = Date.now();

      expect(capturedSubscriptionData.trialEndsAt).toBeInstanceOf(Date);
      const endsAt = capturedSubscriptionData.trialEndsAt.getTime();
      // Should be approximately 30 days from now (±5 seconds tolerance)
      expect(endsAt).toBeGreaterThan(before + 30 * 24 * 60 * 60 * 1000 - 5000);
      expect(endsAt).toBeLessThan(after + 30 * 24 * 60 * 60 * 1000 + 5000);
    });

    it('should set trialEndsAt to null when commercial.trialDays is 0', async () => {
      mockCompany.findUnique.mockResolvedValueOnce(null);

      let capturedSubscriptionData: any;
      mockTransaction.mockImplementationOnce(async (cb: any) => {
        const txCompany = { id: 'c-1', companyCode: 'ACME' };
        const txTenant = { id: 't-1', schemaName: 'tenant_c_1' };
        const mockSubCreate = jest.fn().mockImplementation(async ({ data }) => {
          capturedSubscriptionData = data;
          return {};
        });
        return cb({
          company: { create: jest.fn().mockResolvedValue(txCompany) },
          tenant: { create: jest.fn().mockResolvedValue(txTenant) },
          location: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
          companyContact: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
          companyShift: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
          noSeriesConfig: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
          iotReason: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
          subscription: { create: mockSubCreate },
          user: { create: jest.fn().mockResolvedValue({}) },
        });
      });
      mockCompany.findUnique.mockResolvedValueOnce(dbCompanyFull as any);

      const payload = buildValidPayload({
        commercial: { trialDays: 0 },
      });

      await service.onboardTenant(payload as any);

      expect(capturedSubscriptionData.trialEndsAt).toBeNull();
    });
  });

  // ── getFullCompanyDetail ───────────────────────────────────────────────────

  describe('getFullCompanyDetail', () => {
    it('should return the company with all relations', async () => {
      mockCompany.findUnique.mockResolvedValueOnce(dbCompanyFull as any);

      const result = await service.getFullCompanyDetail('company-uuid-1');

      expect(result.id).toBe('company-uuid-1');
      expect(result).toHaveProperty('locations');
      expect(result).toHaveProperty('contacts');
      expect(result).toHaveProperty('shifts');
      expect(result).toHaveProperty('users');
      expect(result).toHaveProperty('tenant');
    });

    it('should throw notFound (404) when the company does not exist', async () => {
      mockCompany.findUnique.mockResolvedValueOnce(null);

      await expect(service.getFullCompanyDetail('ghost-id')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  // ── updateCompanySection ───────────────────────────────────────────────────

  describe('updateCompanySection', () => {
    beforeEach(() => {
      // Most section updates do findUnique then update then getFullCompanyDetail
      mockCompany.findUnique
        .mockResolvedValueOnce(dbCompany as any) // existence check
        .mockResolvedValueOnce(dbCompanyFull as any); // getFullCompanyDetail at end
      mockCompany.update.mockResolvedValue(dbCompany as any);
    });

    it('should throw notFound when company does not exist', async () => {
      // Override: company not found
      mockCompany.findUnique.mockReset();
      mockCompany.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.updateCompanySection('ghost-id', 'identity', {})
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('should update identity section fields on the company', async () => {
      await service.updateCompanySection('company-uuid-1', 'identity', {
        displayName: 'Updated Corp',
        legalName: 'Updated Corp Pvt Ltd',
        businessType: 'Private Limited',
        industry: 'Technology',
        companyCode: 'UPDT',
        emailDomain: 'updated.com',
      });

      expect(mockCompany.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'company-uuid-1' },
          data: expect.objectContaining({ displayName: 'Updated Corp' }),
        })
      );
    });

    it('should update statutory section fields', async () => {
      await service.updateCompanySection('company-uuid-1', 'statutory', {
        pan: 'NEWPA1234Z',
        gstin: '29NEWPA1234Z1Z5',
      });

      expect(mockCompany.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ pan: 'NEWPA1234Z' }),
        })
      );
    });

    it('should update endpoint section fields', async () => {
      await service.updateCompanySection('company-uuid-1', 'endpoint', {
        endpointType: 'custom',
        customBaseUrl: 'https://erp.internal.acme.com',
      });

      expect(mockCompany.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            endpointType: 'custom',
            customEndpointUrl: 'https://erp.internal.acme.com',
          }),
        })
      );
    });

    it('should replace all locations in a transaction for "locations" section', async () => {
      // Reset mocks — locations uses $transaction and ends with getFullCompanyDetail
      mockCompany.findUnique.mockReset();
      mockCompany.findUnique
        .mockResolvedValueOnce(dbCompany as any)
        .mockResolvedValueOnce(dbCompanyFull as any);

      mockTransaction.mockImplementationOnce(async (cb: any) => {
        return cb({
          location: {
            deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
            createMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
        });
      });

      await service.updateCompanySection('company-uuid-1', 'locations', [
        { name: 'New HQ', code: 'NHQ', facilityType: 'Head Office', isHQ: true, geoEnabled: false },
      ]);

      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it('should throw badRequest for an unknown section key', async () => {
      await expect(
        service.updateCompanySection('company-uuid-1', 'unknown_section' as any, {})
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('should update controls section', async () => {
      await service.updateCompanySection('company-uuid-1', 'controls', {
        mfa: true,
        payrollLock: true,
      });

      expect(mockCompany.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ systemControls: { mfa: true, payrollLock: true } }),
        })
      );
    });

    it('should keep preferences separate from razorpay config', async () => {
      await service.updateCompanySection('company-uuid-1', 'preferences', {
        currency: 'INR',
        language: 'en',
        dateFormat: 'DD/MM/YYYY',
        indiaCompliance: true,
        mobileApp: true,
        webApp: true,
        biometric: false,
        bankIntegration: true,
        emailNotif: true,
        razorpayEnabled: true,
        razorpayKeyId: 'rzp_test_key',
        razorpayKeySecret: 'rzp_secret',
        razorpayWebhookSecret: 'wh_secret',
        razorpayAccountNumber: '1234567890',
      });

      const updateCall = mockCompany.update.mock.calls[0][0];
      // razorpayConfig stored separately
      expect(updateCall.data.razorpayConfig).toMatchObject({ enabled: true, keyId: 'rzp_test_key' });
      // razorpay fields stripped from preferences object
      expect(updateCall.data.preferences).not.toHaveProperty('razorpayKeyId');
    });
  });

  // ── updateCompanyStatus ────────────────────────────────────────────────────

  describe('updateCompanyStatus', () => {
    it('should throw notFound when company does not exist', async () => {
      mockCompany.findUnique.mockResolvedValueOnce(null);

      await expect(service.updateCompanyStatus('ghost-id', 'Active')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('should update company wizardStatus and tenant status in a transaction', async () => {
      mockCompany.findUnique.mockResolvedValueOnce({
        ...dbCompany,
        tenant: { id: 'tenant-uuid-1' },
      } as any);

      mockTransaction.mockImplementationOnce(async (cb: any) =>
        cb({
          company: { update: jest.fn().mockResolvedValue({}) },
          tenant: { update: jest.fn().mockResolvedValue({}) },
        })
      );

      // getFullCompanyDetail after status update
      mockCompany.findUnique.mockResolvedValueOnce(dbCompanyFull as any);

      await service.updateCompanyStatus('company-uuid-1', 'Active');

      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it('should map "Active" wizard status to ACTIVE tenant status', async () => {
      mockCompany.findUnique.mockResolvedValueOnce({
        ...dbCompany,
        tenant: { id: 'tenant-uuid-1' },
      } as any);

      let capturedTenantUpdate: any;
      mockTransaction.mockImplementationOnce(async (cb: any) =>
        cb({
          company: { update: jest.fn().mockResolvedValue({}) },
          tenant: {
            update: jest.fn().mockImplementation(async (args) => {
              capturedTenantUpdate = args;
              return {};
            }),
          },
        })
      );
      mockCompany.findUnique.mockResolvedValueOnce(dbCompanyFull as any);

      await service.updateCompanyStatus('company-uuid-1', 'Active');

      expect(capturedTenantUpdate.data.status).toBe('ACTIVE');
    });

    it('should map "Inactive" wizard status to SUSPENDED tenant status', async () => {
      mockCompany.findUnique.mockResolvedValueOnce({
        ...dbCompany,
        tenant: { id: 'tenant-uuid-1' },
      } as any);

      let capturedTenantUpdate: any;
      mockTransaction.mockImplementationOnce(async (cb: any) =>
        cb({
          company: { update: jest.fn().mockResolvedValue({}) },
          tenant: {
            update: jest.fn().mockImplementation(async (args) => {
              capturedTenantUpdate = args;
              return {};
            }),
          },
        })
      );
      mockCompany.findUnique.mockResolvedValueOnce(dbCompanyFull as any);

      await service.updateCompanyStatus('company-uuid-1', 'Inactive');

      expect(capturedTenantUpdate.data.status).toBe('SUSPENDED');
    });

    it('should map "Draft" wizard status to TRIAL tenant status', async () => {
      mockCompany.findUnique.mockResolvedValueOnce({
        ...dbCompany,
        tenant: { id: 'tenant-uuid-1' },
      } as any);

      let capturedTenantUpdate: any;
      mockTransaction.mockImplementationOnce(async (cb: any) =>
        cb({
          company: { update: jest.fn().mockResolvedValue({}) },
          tenant: {
            update: jest.fn().mockImplementation(async (args) => {
              capturedTenantUpdate = args;
              return {};
            }),
          },
        })
      );
      mockCompany.findUnique.mockResolvedValueOnce(dbCompanyFull as any);

      await service.updateCompanyStatus('company-uuid-1', 'Draft');

      expect(capturedTenantUpdate.data.status).toBe('TRIAL');
    });
  });

  // ── deleteCompany ──────────────────────────────────────────────────────────

  describe('deleteCompany', () => {
    it('should throw notFound when company does not exist', async () => {
      mockCompany.findUnique.mockResolvedValueOnce(null);

      await expect(service.deleteCompany('ghost-id')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('should drop the tenant schema and delete the company', async () => {
      mockCompany.findUnique.mockResolvedValueOnce({
        ...dbCompany,
        tenant: { id: 'tenant-uuid-1', schemaName: 'tenant_company_uuid_1' },
      } as any);
      mockCompany.delete.mockResolvedValue(dbCompany as any);

      const result = await service.deleteCompany('company-uuid-1');

      expect(mockExecuteRaw).toHaveBeenCalledWith(
        expect.stringContaining('DROP SCHEMA IF EXISTS')
      );
      expect(mockCompany.delete).toHaveBeenCalledWith({
        where: { id: 'company-uuid-1' },
      });
      expect(result).toMatchObject({ message: 'Company deleted' });
    });

    it('should skip schema drop when company has no tenant', async () => {
      mockCompany.findUnique.mockResolvedValueOnce({
        ...dbCompany,
        tenant: null, // no tenant record
      } as any);
      mockCompany.delete.mockResolvedValue(dbCompany as any);

      await service.deleteCompany('company-uuid-1');

      // DROP SCHEMA should NOT have been called
      expect(mockExecuteRaw).not.toHaveBeenCalledWith(
        expect.stringContaining('DROP SCHEMA')
      );
      expect(mockCompany.delete).toHaveBeenCalledTimes(1);
    });
  });
});
