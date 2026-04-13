/**
 * Unit tests for VMS Zod validation schemas.
 *
 * Source files:
 *   - src/modules/visitors/core/visit.validators.ts
 *   - src/modules/visitors/config/visitor-type.validators.ts
 *   - src/modules/visitors/security/watchlist.validators.ts
 */

import {
  createVisitSchema,
  updateVisitSchema,
  checkInSchema,
  checkOutSchema,
  extendVisitSchema,
  approveRejectSchema,
  visitListQuerySchema,
  completeInductionSchema,
} from '../core/visit.validators';

import {
  createVisitorTypeSchema,
  updateVisitorTypeSchema,
  visitorTypeListQuerySchema,
} from '../config/visitor-type.validators';

import {
  createWatchlistSchema,
  updateWatchlistSchema,
  watchlistListQuerySchema,
  watchlistCheckSchema,
} from '../security/watchlist.validators';

// ─────────────────────────────────────────────────────────────────────
// Visit schemas
// ─────────────────────────────────────────────────────────────────────

describe('createVisitSchema', () => {
  const validInput = {
    visitorName: 'John Doe',
    visitorMobile: '9876543210',
    visitorTypeId: 'vt-1',
    purpose: 'MEETING',
    expectedDate: '2026-04-15',
    hostEmployeeId: 'emp-1',
    plantId: 'plant-1',
  };

  it('should accept valid complete data', () => {
    const result = createVisitSchema.safeParse({
      ...validInput,
      visitorEmail: 'john@example.com',
      visitorCompany: 'Acme Corp',
      expectedTime: '10:00',
      expectedDurationMinutes: 120,
    });
    expect(result.success).toBe(true);
  });

  it('should accept minimal required fields', () => {
    const result = createVisitSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should reject missing visitorName', () => {
    const { visitorName, ...rest } = validInput;
    const result = createVisitSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing visitorMobile', () => {
    const { visitorMobile, ...rest } = validInput;
    const result = createVisitSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject mobile number shorter than 10 characters', () => {
    const result = createVisitSchema.safeParse({
      ...validInput,
      visitorMobile: '12345',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing visitorTypeId', () => {
    const { visitorTypeId, ...rest } = validInput;
    const result = createVisitSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing hostEmployeeId', () => {
    const { hostEmployeeId, ...rest } = validInput;
    const result = createVisitSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing plantId', () => {
    const { plantId, ...rest } = validInput;
    const result = createVisitSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing expectedDate', () => {
    const { expectedDate, ...rest } = validInput;
    const result = createVisitSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject invalid purpose enum value', () => {
    const result = createVisitSchema.safeParse({
      ...validInput,
      purpose: 'INVALID_PURPOSE',
    });
    expect(result.success).toBe(false);
  });

  it('should accept all valid purpose enum values', () => {
    const validPurposes = ['MEETING', 'DELIVERY', 'MAINTENANCE', 'AUDIT', 'INTERVIEW', 'SITE_TOUR', 'PERSONAL', 'OTHER'];
    for (const purpose of validPurposes) {
      const result = createVisitSchema.safeParse({ ...validInput, purpose });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid expectedTime format', () => {
    const result = createVisitSchema.safeParse({
      ...validInput,
      expectedTime: '10:00:00', // wrong format, should be HH:mm
    });
    expect(result.success).toBe(false);
  });

  it('should accept valid HH:mm expectedTime', () => {
    const result = createVisitSchema.safeParse({
      ...validInput,
      expectedTime: '14:30',
    });
    expect(result.success).toBe(true);
  });

  it('should reject expectedDurationMinutes below 15', () => {
    const result = createVisitSchema.safeParse({
      ...validInput,
      expectedDurationMinutes: 10,
    });
    expect(result.success).toBe(false);
  });

  it('should reject expectedDurationMinutes above 1440', () => {
    const result = createVisitSchema.safeParse({
      ...validInput,
      expectedDurationMinutes: 1500,
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid email format', () => {
    const result = createVisitSchema.safeParse({
      ...validInput,
      visitorEmail: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('should trim whitespace from string fields', () => {
    const result = createVisitSchema.safeParse({
      ...validInput,
      visitorName: '  John Doe  ',
      visitorMobile: '  9876543210  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.visitorName).toBe('John Doe');
      expect(result.data.visitorMobile).toBe('9876543210');
    }
  });
});

describe('updateVisitSchema', () => {
  it('should accept partial data (all fields optional)', () => {
    const result = updateVisitSchema.safeParse({ visitorName: 'Jane Doe' });
    expect(result.success).toBe(true);
  });

  it('should accept empty object', () => {
    const result = updateVisitSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should still validate field constraints on partial data', () => {
    const result = updateVisitSchema.safeParse({
      visitorMobile: '123', // too short
    });
    expect(result.success).toBe(false);
  });
});

describe('checkInSchema', () => {
  it('should accept valid check-in data', () => {
    const result = checkInSchema.safeParse({
      checkInGateId: 'gate-1',
      visitorPhoto: 'https://example.com/photo.jpg',
      governmentIdType: 'AADHAAR',
      governmentIdNumber: '1234-5678-9012',
    });
    expect(result.success).toBe(true);
  });

  it('should require checkInGateId', () => {
    const result = checkInSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should accept minimal data (only gate)', () => {
    const result = checkInSchema.safeParse({ checkInGateId: 'gate-1' });
    expect(result.success).toBe(true);
  });

  it('should reject invalid governmentIdType', () => {
    const result = checkInSchema.safeParse({
      checkInGateId: 'gate-1',
      governmentIdType: 'INVALID_ID',
    });
    expect(result.success).toBe(false);
  });

  it('should accept all valid government ID types', () => {
    const validTypes = ['AADHAAR', 'PAN', 'DRIVING_LICENCE', 'PASSPORT', 'VOTER_ID'];
    for (const idType of validTypes) {
      const result = checkInSchema.safeParse({
        checkInGateId: 'gate-1',
        governmentIdType: idType,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid badgeFormat', () => {
    const result = checkInSchema.safeParse({
      checkInGateId: 'gate-1',
      badgeFormat: 'INVALID',
    });
    expect(result.success).toBe(false);
  });

  it('should accept DIGITAL and PRINTED badge formats', () => {
    expect(
      checkInSchema.safeParse({ checkInGateId: 'gate-1', badgeFormat: 'DIGITAL' }).success,
    ).toBe(true);
    expect(
      checkInSchema.safeParse({ checkInGateId: 'gate-1', badgeFormat: 'PRINTED' }).success,
    ).toBe(true);
  });
});

describe('checkOutSchema', () => {
  it('should accept valid check-out data', () => {
    const result = checkOutSchema.safeParse({
      checkOutMethod: 'SECURITY_DESK',
      badgeReturned: true,
    });
    expect(result.success).toBe(true);
  });

  it('should require checkOutMethod', () => {
    const result = checkOutSchema.safeParse({ badgeReturned: true });
    expect(result.success).toBe(false);
  });

  it('should reject invalid checkOutMethod', () => {
    const result = checkOutSchema.safeParse({ checkOutMethod: 'INVALID' });
    expect(result.success).toBe(false);
  });

  it('should accept all valid checkout methods', () => {
    const methods = ['SECURITY_DESK', 'HOST_INITIATED', 'MOBILE_LINK', 'AUTO_CHECKOUT'];
    for (const method of methods) {
      const result = checkOutSchema.safeParse({ checkOutMethod: method });
      expect(result.success).toBe(true);
    }
  });
});

describe('extendVisitSchema', () => {
  it('should accept valid extend data', () => {
    const result = extendVisitSchema.safeParse({
      additionalMinutes: 60,
      reason: 'Meeting extended',
    });
    expect(result.success).toBe(true);
  });

  it('should require reason', () => {
    const result = extendVisitSchema.safeParse({ additionalMinutes: 60 });
    expect(result.success).toBe(false);
  });

  it('should reject additionalMinutes below 15', () => {
    const result = extendVisitSchema.safeParse({
      additionalMinutes: 10,
      reason: 'Need more time',
    });
    expect(result.success).toBe(false);
  });

  it('should reject additionalMinutes above 1440', () => {
    const result = extendVisitSchema.safeParse({
      additionalMinutes: 1500,
      reason: 'Need more time',
    });
    expect(result.success).toBe(false);
  });
});

describe('approveRejectSchema', () => {
  it('should accept with notes', () => {
    const result = approveRejectSchema.safeParse({ notes: 'Approved by manager' });
    expect(result.success).toBe(true);
  });

  it('should accept without notes', () => {
    const result = approveRejectSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should reject notes exceeding 500 characters', () => {
    const result = approveRejectSchema.safeParse({ notes: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });
});

describe('visitListQuerySchema', () => {
  it('should provide defaults for page and limit', () => {
    const result = visitListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it('should accept all optional filters', () => {
    const result = visitListQuerySchema.safeParse({
      status: 'CHECKED_IN',
      visitorTypeId: 'vt-1',
      hostEmployeeId: 'emp-1',
      search: 'John',
      page: '2',
      limit: '10',
    });
    expect(result.success).toBe(true);
  });

  it('should coerce string page/limit to numbers', () => {
    const result = visitListQuerySchema.safeParse({ page: '3', limit: '15' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.limit).toBe(15);
    }
  });

  it('should reject page less than 1', () => {
    const result = visitListQuerySchema.safeParse({ page: '0' });
    expect(result.success).toBe(false);
  });

  it('should reject limit greater than 100', () => {
    const result = visitListQuerySchema.safeParse({ limit: '101' });
    expect(result.success).toBe(false);
  });
});

describe('completeInductionSchema', () => {
  it('should accept passed=true with score', () => {
    const result = completeInductionSchema.safeParse({ passed: true, score: 85 });
    expect(result.success).toBe(true);
  });

  it('should accept passed=false without score', () => {
    const result = completeInductionSchema.safeParse({ passed: false });
    expect(result.success).toBe(true);
  });

  it('should require passed field', () => {
    const result = completeInductionSchema.safeParse({ score: 85 });
    expect(result.success).toBe(false);
  });

  it('should reject score above 100', () => {
    const result = completeInductionSchema.safeParse({ passed: true, score: 101 });
    expect(result.success).toBe(false);
  });

  it('should reject score below 0', () => {
    const result = completeInductionSchema.safeParse({ passed: true, score: -1 });
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Visitor Type schemas
// ─────────────────────────────────────────────────────────────────────

describe('createVisitorTypeSchema', () => {
  it('should accept valid data with defaults', () => {
    const result = createVisitorTypeSchema.safeParse({
      name: 'Business Guest',
      code: 'BG',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.badgeColour).toBe('#3B82F6'); // default
      expect(result.data.requirePhoto).toBe(true); // default
      expect(result.data.requireHostApproval).toBe(true); // default
    }
  });

  it('should require name', () => {
    const result = createVisitorTypeSchema.safeParse({ code: 'BG' });
    expect(result.success).toBe(false);
  });

  it('should require code', () => {
    const result = createVisitorTypeSchema.safeParse({ name: 'Guest' });
    expect(result.success).toBe(false);
  });

  it('should uppercase the code', () => {
    const result = createVisitorTypeSchema.safeParse({ name: 'Guest', code: 'bg' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe('BG');
    }
  });

  it('should reject code longer than 5 characters', () => {
    const result = createVisitorTypeSchema.safeParse({ name: 'Guest', code: 'TOOLONG' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid hex colour', () => {
    const result = createVisitorTypeSchema.safeParse({
      name: 'Guest',
      code: 'GU',
      badgeColour: 'red',
    });
    expect(result.success).toBe(false);
  });

  it('should accept valid hex colour', () => {
    const result = createVisitorTypeSchema.safeParse({
      name: 'Guest',
      code: 'GU',
      badgeColour: '#FF5733',
    });
    expect(result.success).toBe(true);
  });

  it('should reject defaultMaxDurationMinutes below 15', () => {
    const result = createVisitorTypeSchema.safeParse({
      name: 'Guest',
      code: 'GU',
      defaultMaxDurationMinutes: 5,
    });
    expect(result.success).toBe(false);
  });

  it('should reject defaultMaxDurationMinutes above 1440', () => {
    const result = createVisitorTypeSchema.safeParse({
      name: 'Guest',
      code: 'GU',
      defaultMaxDurationMinutes: 2000,
    });
    expect(result.success).toBe(false);
  });
});

describe('updateVisitorTypeSchema', () => {
  it('should accept partial updates', () => {
    const result = updateVisitorTypeSchema.safeParse({ name: 'Updated' });
    expect(result.success).toBe(true);
  });

  it('should accept empty object', () => {
    const result = updateVisitorTypeSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('visitorTypeListQuerySchema', () => {
  it('should provide defaults', () => {
    const result = visitorTypeListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(50);
    }
  });

  it('should coerce isActive from string', () => {
    const result = visitorTypeListQuerySchema.safeParse({ isActive: 'true' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Watchlist schemas
// ─────────────────────────────────────────────────────────────────────

describe('createWatchlistSchema', () => {
  const validInput = {
    type: 'BLOCKLIST' as const,
    personName: 'Bad Actor',
    reason: 'Theft',
    blockDuration: 'PERMANENT' as const,
  };

  it('should accept valid blocklist entry', () => {
    const result = createWatchlistSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should accept valid watchlist entry', () => {
    const result = createWatchlistSchema.safeParse({
      ...validInput,
      type: 'WATCHLIST',
      blockDuration: 'UNTIL_DATE',
      expiryDate: '2026-12-31',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid type', () => {
    const result = createWatchlistSchema.safeParse({ ...validInput, type: 'INVALID' });
    expect(result.success).toBe(false);
  });

  it('should require personName', () => {
    const { personName, ...rest } = validInput;
    const result = createWatchlistSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should require reason', () => {
    const { reason, ...rest } = validInput;
    const result = createWatchlistSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should require blockDuration', () => {
    const { blockDuration, ...rest } = validInput;
    const result = createWatchlistSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject invalid blockDuration', () => {
    const result = createWatchlistSchema.safeParse({
      ...validInput,
      blockDuration: 'TEMPORARY',
    });
    expect(result.success).toBe(false);
  });

  it('should default appliesToAllPlants to true', () => {
    const result = createWatchlistSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.appliesToAllPlants).toBe(true);
    }
  });

  it('should default plantIds to empty array', () => {
    const result = createWatchlistSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.plantIds).toEqual([]);
    }
  });
});

describe('watchlistCheckSchema', () => {
  it('should accept name-only search', () => {
    const result = watchlistCheckSchema.safeParse({ name: 'John' });
    expect(result.success).toBe(true);
  });

  it('should accept mobile-only search', () => {
    const result = watchlistCheckSchema.safeParse({ mobile: '9876543210' });
    expect(result.success).toBe(true);
  });

  it('should accept idNumber-only search', () => {
    const result = watchlistCheckSchema.safeParse({ idNumber: 'ID-1234' });
    expect(result.success).toBe(true);
  });

  it('should accept all criteria together', () => {
    const result = watchlistCheckSchema.safeParse({
      name: 'John',
      mobile: '9876543210',
      idNumber: 'ID-1234',
    });
    expect(result.success).toBe(true);
  });

  it('should accept empty object (all optional)', () => {
    const result = watchlistCheckSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('watchlistListQuerySchema', () => {
  it('should provide defaults', () => {
    const result = watchlistListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it('should accept type filter', () => {
    const result = watchlistListQuerySchema.safeParse({ type: 'BLOCKLIST' });
    expect(result.success).toBe(true);
  });

  it('should reject invalid type', () => {
    const result = watchlistListQuerySchema.safeParse({ type: 'INVALID' });
    expect(result.success).toBe(false);
  });
});
