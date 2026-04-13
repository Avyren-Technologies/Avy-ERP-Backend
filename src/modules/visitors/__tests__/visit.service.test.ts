/**
 * Unit tests for the core VisitService.
 *
 * Source: src/modules/visitors/core/visit.service.ts
 */

// ── Transaction helper ───────────────────────────────────────────────
// The service uses platformPrisma.$transaction(async tx => { ... })
// We mock $transaction to invoke the callback with a fake tx object.

const mockTx = {
  visit: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  deniedEntry: { create: jest.fn() },
  $executeRaw: jest.fn(),
};

jest.mock('../../../config/database', () => ({
  platformPrisma: {
    visitorType: { findFirst: jest.fn() },
    employee: { findFirst: jest.fn() },
    location: { findFirst: jest.fn() },
    visitorWatchlist: { findMany: jest.fn() },
    visit: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    deniedEntry: { create: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(mockTx)),
  },
}));

jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../shared/utils/number-series', () => ({
  generateNextNumber: jest.fn().mockResolvedValue('VIS-000001'),
}));

jest.mock('../../../shared/utils/prisma-helpers', () => ({
  n: (v: any) => (v === undefined ? null : v),
}));

// Mock notification service (dynamic import)
jest.mock('../../../core/notifications/notification.service', () => ({
  notificationService: { dispatch: jest.fn().mockResolvedValue(undefined) },
}));

import { platformPrisma } from '../../../config/database';
import { visitService } from '../core/visit.service';
import { generateNextNumber } from '../../../shared/utils/number-series';

const mockPrisma = platformPrisma as any;
const mockGenerateNextNumber = generateNextNumber as jest.Mock;

const COMPANY_ID = 'company-1';
const USER_ID = 'user-1';
const GUARD_ID = 'guard-1';

const validCreateInput = {
  visitorName: 'John Doe',
  visitorMobile: '9876543210',
  visitorEmail: 'john@example.com',
  visitorCompany: 'Acme Corp',
  visitorTypeId: 'vt-1',
  purpose: 'MEETING',
  expectedDate: '2026-04-15',
  expectedTime: '10:00',
  expectedDurationMinutes: 120,
  hostEmployeeId: 'emp-1',
  plantId: 'plant-1',
};

const sampleVisitorType = {
  id: 'vt-1',
  companyId: COMPANY_ID,
  isActive: true,
  requireHostApproval: true,
  requireSafetyInduction: false,
  defaultMaxDurationMinutes: 480,
};

const sampleVisit = {
  id: 'visit-1',
  companyId: COMPANY_ID,
  visitNumber: 'VIS-000001',
  visitCode: 'ABC123',
  visitorName: 'John Doe',
  visitorMobile: '9876543210',
  visitorCompany: 'Acme Corp',
  status: 'EXPECTED',
  approvalStatus: 'PENDING',
  hostEmployeeId: 'emp-1',
  plantId: 'plant-1',
  checkInTime: null,
  checkOutTime: null,
  extensionCount: 0,
  expectedDurationMinutes: 480,
  originalDurationMinutes: null,
  visitorType: sampleVisitorType,
};

describe('VisitService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset transaction mock calls
    mockTx.visit.findFirst.mockReset();
    mockTx.visit.findUnique.mockReset();
    mockTx.visit.create.mockReset();
    mockTx.visit.update.mockReset();
    mockTx.deniedEntry.create.mockReset();
    mockTx.$executeRaw.mockReset();
    mockGenerateNextNumber.mockResolvedValue('VIS-000001');
  });

  // ─────────────────────────────────────────────────────────────────────
  // createVisit
  // ─────────────────────────────────────────────────────────────────────

  describe('createVisit', () => {
    beforeEach(() => {
      mockPrisma.visitorType.findFirst.mockResolvedValue(sampleVisitorType);
      mockPrisma.employee.findFirst.mockResolvedValue({ id: 'emp-1', companyId: COMPANY_ID });
      mockPrisma.location.findFirst.mockResolvedValue({ id: 'plant-1', companyId: COMPANY_ID });
      mockPrisma.visitorWatchlist.findMany.mockResolvedValue([]);
      mockPrisma.visit.findUnique.mockResolvedValue(null); // no code collision
      mockTx.visit.create.mockResolvedValue({ ...sampleVisit });
    });

    it('should create a pre-registration with valid data', async () => {
      const result = await visitService.createVisit(COMPANY_ID, validCreateInput, USER_ID);

      expect(result).toBeDefined();
      expect(result.visitorName).toBe('John Doe');
      expect(mockTx.visit.create).toHaveBeenCalledTimes(1);
    });

    it('should set status to EXPECTED and registrationMethod to PRE_REGISTERED', async () => {
      await visitService.createVisit(COMPANY_ID, validCreateInput, USER_ID);

      const createCall = mockTx.visit.create.mock.calls[0][0];
      expect(createCall.data.status).toBe('EXPECTED');
      expect(createCall.data.registrationMethod).toBe('PRE_REGISTERED');
    });

    it('should set approvalStatus to PENDING when host approval is required', async () => {
      await visitService.createVisit(COMPANY_ID, validCreateInput, USER_ID);

      const createCall = mockTx.visit.create.mock.calls[0][0];
      expect(createCall.data.approvalStatus).toBe('PENDING');
    });

    it('should set approvalStatus to AUTO_APPROVED when host approval is NOT required', async () => {
      mockPrisma.visitorType.findFirst.mockResolvedValue({
        ...sampleVisitorType,
        requireHostApproval: false,
      });

      await visitService.createVisit(COMPANY_ID, validCreateInput, USER_ID);

      const createCall = mockTx.visit.create.mock.calls[0][0];
      expect(createCall.data.approvalStatus).toBe('AUTO_APPROVED');
    });

    it('should reject when host employee not found', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(null);

      await expect(
        visitService.createVisit(COMPANY_ID, validCreateInput, USER_ID),
      ).rejects.toThrow('Host employee not found');
    });

    it('should reject when visitor type not found', async () => {
      mockPrisma.visitorType.findFirst.mockResolvedValue(null);

      await expect(
        visitService.createVisit(COMPANY_ID, validCreateInput, USER_ID),
      ).rejects.toThrow('Visitor type not found');
    });

    it('should reject when plant/location not found', async () => {
      mockPrisma.location.findFirst.mockResolvedValue(null);

      await expect(
        visitService.createVisit(COMPANY_ID, validCreateInput, USER_ID),
      ).rejects.toThrow('Plant/location not found');
    });

    it('should generate a unique visit code', async () => {
      await visitService.createVisit(COMPANY_ID, validCreateInput, USER_ID);

      const createCall = mockTx.visit.create.mock.calls[0][0];
      expect(createCall.data.visitCode).toBeDefined();
      expect(typeof createCall.data.visitCode).toBe('string');
      expect(createCall.data.visitCode).toHaveLength(6);
    });

    it('should generate a visit number using the number series utility', async () => {
      await visitService.createVisit(COMPANY_ID, validCreateInput, USER_ID);

      expect(mockGenerateNextNumber).toHaveBeenCalledWith(
        mockTx,
        COMPANY_ID,
        ['Visitor', 'Visitor Registration'],
        'Visitor Registration',
      );
      const createCall = mockTx.visit.create.mock.calls[0][0];
      expect(createCall.data.visitNumber).toBe('VIS-000001');
    });

    it('should reject a blocklisted visitor', async () => {
      mockPrisma.visitorWatchlist.findMany.mockResolvedValue([
        {
          type: 'BLOCKLIST',
          reason: 'Previous misconduct',
          isActive: true,
          mobileNumber: '9876543210',
        },
      ]);

      await expect(
        visitService.createVisit(COMPANY_ID, validCreateInput, USER_ID),
      ).rejects.toThrow('Entry denied');
    });

    it('should set safetyInductionStatus based on visitor type requirements', async () => {
      // When safety induction is required
      mockPrisma.visitorType.findFirst.mockResolvedValue({
        ...sampleVisitorType,
        requireSafetyInduction: true,
      });

      await visitService.createVisit(COMPANY_ID, validCreateInput, USER_ID);

      const createCall = mockTx.visit.create.mock.calls[0][0];
      expect(createCall.data.safetyInductionStatus).toBe('PENDING');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // listVisits
  // ─────────────────────────────────────────────────────────────────────

  describe('listVisits', () => {
    it('should return paginated visits', async () => {
      mockPrisma.visit.findMany.mockResolvedValue([sampleVisit]);
      mockPrisma.visit.count.mockResolvedValue(1);

      const result = await visitService.listVisits(COMPANY_ID, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should apply search filter across multiple fields', async () => {
      mockPrisma.visit.findMany.mockResolvedValue([]);
      mockPrisma.visit.count.mockResolvedValue(0);

      await visitService.listVisits(COMPANY_ID, {
        page: 1,
        limit: 20,
        search: 'John',
      });

      expect(mockPrisma.visit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { visitorName: { contains: 'John', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
    });

    it('should apply status filter', async () => {
      mockPrisma.visit.findMany.mockResolvedValue([]);
      mockPrisma.visit.count.mockResolvedValue(0);

      await visitService.listVisits(COMPANY_ID, {
        page: 1,
        limit: 20,
        status: 'CHECKED_IN',
      });

      expect(mockPrisma.visit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'CHECKED_IN' }),
        }),
      );
    });

    it('should apply date range filter', async () => {
      mockPrisma.visit.findMany.mockResolvedValue([]);
      mockPrisma.visit.count.mockResolvedValue(0);

      await visitService.listVisits(COMPANY_ID, {
        page: 1,
        limit: 20,
        fromDate: '2026-04-01',
        toDate: '2026-04-30',
      });

      expect(mockPrisma.visit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            expectedDate: {
              gte: new Date('2026-04-01'),
              lte: new Date('2026-04-30'),
            },
          }),
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // checkIn
  // ─────────────────────────────────────────────────────────────────────

  describe('checkIn', () => {
    const checkInInput = {
      checkInGateId: 'gate-1',
      visitorPhoto: 'https://example.com/photo.jpg',
      governmentIdType: 'AADHAAR',
      governmentIdNumber: '1234-5678-9012',
    };

    beforeEach(() => {
      // Simulate successful atomic update (1 row updated)
      mockTx.$executeRaw.mockResolvedValue(1);
      mockTx.visit.findUnique.mockResolvedValue({
        ...sampleVisit,
        status: 'CHECKED_IN',
        checkInGate: { name: 'Main Gate' },
      });
      mockTx.visit.update.mockResolvedValue({});
      mockPrisma.visitorWatchlist.findMany.mockResolvedValue([]);
      mockGenerateNextNumber.mockResolvedValue('BADGE-0001');
    });

    it('should check in a visitor with valid status', async () => {
      const result = await visitService.checkIn(COMPANY_ID, 'visit-1', checkInInput, GUARD_ID);

      expect(result).toBeDefined();
      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('should generate a badge number on check-in', async () => {
      await visitService.checkIn(COMPANY_ID, 'visit-1', checkInInput, GUARD_ID);

      expect(mockGenerateNextNumber).toHaveBeenCalledWith(
        mockTx,
        COMPANY_ID,
        ['Visitor Badge', 'Badge'],
        'Visitor Badge',
      );
      expect(mockTx.visit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'visit-1' },
          data: { badgeNumber: 'BADGE-0001' },
        }),
      );
    });

    it('should reject duplicate check-in (already checked in)', async () => {
      // Atomic update affects 0 rows
      mockTx.$executeRaw.mockResolvedValue(0);
      mockTx.visit.findFirst.mockResolvedValue({
        ...sampleVisit,
        status: 'CHECKED_IN',
        checkInTime: new Date('2026-04-15T10:00:00Z'),
      });

      await expect(
        visitService.checkIn(COMPANY_ID, 'visit-1', checkInInput, GUARD_ID),
      ).rejects.toThrow('already checked in');
    });

    it('should reject check-in when visit not found', async () => {
      mockTx.$executeRaw.mockResolvedValue(0);
      mockTx.visit.findFirst.mockResolvedValue(null);

      await expect(
        visitService.checkIn(COMPANY_ID, 'visit-1', checkInInput, GUARD_ID),
      ).rejects.toThrow('Visit not found');
    });

    it('should reject check-in for invalid status (e.g. CANCELLED)', async () => {
      mockTx.$executeRaw.mockResolvedValue(0);
      mockTx.visit.findFirst.mockResolvedValue({
        ...sampleVisit,
        status: 'CANCELLED',
      });

      await expect(
        visitService.checkIn(COMPANY_ID, 'visit-1', checkInInput, GUARD_ID),
      ).rejects.toThrow('Cannot check in a visit with status: CANCELLED');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // checkOut
  // ─────────────────────────────────────────────────────────────────────

  describe('checkOut', () => {
    const checkOutInput = {
      checkOutMethod: 'SECURITY_DESK',
      badgeReturned: true,
    };

    beforeEach(() => {
      // Simulate successful atomic update
      mockTx.$executeRaw.mockResolvedValue(1);
    });

    it('should check out a visitor and calculate duration', async () => {
      const checkInTime = new Date('2026-04-15T10:00:00Z');
      const checkOutTime = new Date('2026-04-15T12:30:00Z');

      mockTx.visit.findUnique
        .mockResolvedValueOnce({
          ...sampleVisit,
          status: 'CHECKED_OUT',
          checkInTime,
          checkOutTime,
        })
        .mockResolvedValueOnce({
          ...sampleVisit,
          status: 'CHECKED_OUT',
          checkInTime,
          checkOutTime,
          visitDurationMinutes: 150,
          visitorType: sampleVisitorType,
        });
      mockTx.visit.update.mockResolvedValue({});

      const result = await visitService.checkOut(COMPANY_ID, 'visit-1', checkOutInput, USER_ID);

      expect(result).toBeDefined();
      // Duration should be calculated: 2.5 hours = 150 minutes
      expect(mockTx.visit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { visitDurationMinutes: 150 },
        }),
      );
    });

    it('should reject check-out when not checked in', async () => {
      mockTx.$executeRaw.mockResolvedValue(0);
      mockTx.visit.findFirst.mockResolvedValue({
        ...sampleVisit,
        status: 'EXPECTED',
      });

      await expect(
        visitService.checkOut(COMPANY_ID, 'visit-1', checkOutInput, USER_ID),
      ).rejects.toThrow('Cannot check out a visit with status: EXPECTED');
    });

    it('should reject check-out when already checked out', async () => {
      mockTx.$executeRaw.mockResolvedValue(0);
      mockTx.visit.findFirst.mockResolvedValue({
        ...sampleVisit,
        status: 'CHECKED_OUT',
      });

      await expect(
        visitService.checkOut(COMPANY_ID, 'visit-1', checkOutInput, USER_ID),
      ).rejects.toThrow('already been checked out');
    });

    it('should reject check-out when visit not found', async () => {
      mockTx.$executeRaw.mockResolvedValue(0);
      mockTx.visit.findFirst.mockResolvedValue(null);

      await expect(
        visitService.checkOut(COMPANY_ID, 'visit-1', checkOutInput, USER_ID),
      ).rejects.toThrow('Visit not found');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // approveVisit / rejectVisit
  // ─────────────────────────────────────────────────────────────────────

  describe('approveVisit', () => {
    it('should approve a pending visit', async () => {
      mockPrisma.visit.findFirst.mockResolvedValue({
        ...sampleVisit,
        approvalStatus: 'PENDING',
      });
      mockPrisma.visit.update.mockResolvedValue({
        ...sampleVisit,
        approvalStatus: 'APPROVED',
      });

      const result = await visitService.approveVisit(COMPANY_ID, 'visit-1', USER_ID, 'Looks good');

      expect(result.approvalStatus).toBe('APPROVED');
      expect(mockPrisma.visit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            approvalStatus: 'APPROVED',
            approvedBy: USER_ID,
          }),
        }),
      );
    });

    it('should reject if visit is not in PENDING approval status', async () => {
      mockPrisma.visit.findFirst.mockResolvedValue({
        ...sampleVisit,
        approvalStatus: 'APPROVED',
      });

      await expect(
        visitService.approveVisit(COMPANY_ID, 'visit-1', USER_ID),
      ).rejects.toThrow('Visit is already approved');
    });

    it('should throw when visit not found', async () => {
      mockPrisma.visit.findFirst.mockResolvedValue(null);

      await expect(
        visitService.approveVisit(COMPANY_ID, 'nonexistent', USER_ID),
      ).rejects.toThrow('Visit not found');
    });
  });

  describe('rejectVisit', () => {
    it('should reject a pending visit and create denied entry', async () => {
      mockPrisma.visit.findFirst.mockResolvedValue({
        ...sampleVisit,
        approvalStatus: 'PENDING',
      });
      mockPrisma.visit.update.mockResolvedValue({
        ...sampleVisit,
        approvalStatus: 'REJECTED',
        status: 'REJECTED',
      });
      mockPrisma.deniedEntry.create.mockResolvedValue({});

      const result = await visitService.rejectVisit(
        COMPANY_ID, 'visit-1', USER_ID, 'Not appropriate',
      );

      expect(result.approvalStatus).toBe('REJECTED');
      expect(mockPrisma.deniedEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: COMPANY_ID,
            denialReason: 'HOST_REJECTED',
          }),
        }),
      );
    });

    it('should reject if visit is not PENDING', async () => {
      mockPrisma.visit.findFirst.mockResolvedValue({
        ...sampleVisit,
        approvalStatus: 'REJECTED',
      });

      await expect(
        visitService.rejectVisit(COMPANY_ID, 'visit-1', USER_ID),
      ).rejects.toThrow('Visit is already rejected');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // extendVisit
  // ─────────────────────────────────────────────────────────────────────

  describe('extendVisit', () => {
    const extendInput = { additionalMinutes: 60, reason: 'Meeting running over' };

    it('should extend an active (checked-in) visit', async () => {
      mockPrisma.visit.findFirst.mockResolvedValue({
        ...sampleVisit,
        status: 'CHECKED_IN',
        expectedDurationMinutes: 480,
        extensionCount: 0,
        originalDurationMinutes: null,
      });
      mockPrisma.visit.update.mockResolvedValue({
        ...sampleVisit,
        expectedDurationMinutes: 540,
        extensionCount: 1,
      });

      const result = await visitService.extendVisit(
        COMPANY_ID, 'visit-1', extendInput, USER_ID,
      );

      expect(result.expectedDurationMinutes).toBe(540);
      expect(result.extensionCount).toBe(1);
      expect(mockPrisma.visit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            expectedDurationMinutes: 540,
            extensionCount: 1,
          }),
        }),
      );
    });

    it('should reject extension when not checked in', async () => {
      mockPrisma.visit.findFirst.mockResolvedValue({
        ...sampleVisit,
        status: 'EXPECTED',
      });

      await expect(
        visitService.extendVisit(COMPANY_ID, 'visit-1', extendInput, USER_ID),
      ).rejects.toThrow('Can only extend an active (checked-in) visit');
    });

    it('should reject after maximum 3 extensions', async () => {
      mockPrisma.visit.findFirst.mockResolvedValue({
        ...sampleVisit,
        status: 'CHECKED_IN',
        extensionCount: 3,
      });

      await expect(
        visitService.extendVisit(COMPANY_ID, 'visit-1', extendInput, USER_ID),
      ).rejects.toThrow('Maximum 3 extensions allowed');
    });

    it('should reject if total duration would exceed 24 hours (1440 minutes)', async () => {
      mockPrisma.visit.findFirst.mockResolvedValue({
        ...sampleVisit,
        status: 'CHECKED_IN',
        expectedDurationMinutes: 1400,
        extensionCount: 1,
      });

      await expect(
        visitService.extendVisit(
          COMPANY_ID,
          'visit-1',
          { additionalMinutes: 60, reason: 'Extra time' },
          USER_ID,
        ),
      ).rejects.toThrow('Total visit duration cannot exceed 24 hours');
    });

    it('should preserve original duration on first extension', async () => {
      mockPrisma.visit.findFirst.mockResolvedValue({
        ...sampleVisit,
        status: 'CHECKED_IN',
        expectedDurationMinutes: 480,
        extensionCount: 0,
        originalDurationMinutes: null,
      });
      mockPrisma.visit.update.mockResolvedValue({});

      await visitService.extendVisit(COMPANY_ID, 'visit-1', extendInput, USER_ID);

      expect(mockPrisma.visit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            originalDurationMinutes: 480,
          }),
        }),
      );
    });

    it('should throw when visit not found', async () => {
      mockPrisma.visit.findFirst.mockResolvedValue(null);

      await expect(
        visitService.extendVisit(COMPANY_ID, 'nonexistent', extendInput, USER_ID),
      ).rejects.toThrow('Visit not found');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // cancelVisit
  // ─────────────────────────────────────────────────────────────────────

  describe('cancelVisit', () => {
    it('should cancel an EXPECTED visit', async () => {
      mockPrisma.visit.findFirst.mockResolvedValue({
        ...sampleVisit,
        status: 'EXPECTED',
      });
      mockPrisma.visit.update.mockResolvedValue({
        ...sampleVisit,
        status: 'CANCELLED',
      });

      const result = await visitService.cancelVisit(COMPANY_ID, 'visit-1', USER_ID);

      expect(result.status).toBe('CANCELLED');
      expect(mockPrisma.visit.update).toHaveBeenCalledWith({
        where: { id: 'visit-1' },
        data: { status: 'CANCELLED', updatedBy: USER_ID },
      });
    });

    it('should reject cancellation of a CHECKED_IN visit', async () => {
      mockPrisma.visit.findFirst.mockResolvedValue({
        ...sampleVisit,
        status: 'CHECKED_IN',
      });

      await expect(
        visitService.cancelVisit(COMPANY_ID, 'visit-1', USER_ID),
      ).rejects.toThrow('Cannot cancel a visit that is already in progress or completed');
    });

    it('should reject cancellation of a CHECKED_OUT visit', async () => {
      mockPrisma.visit.findFirst.mockResolvedValue({
        ...sampleVisit,
        status: 'CHECKED_OUT',
      });

      await expect(
        visitService.cancelVisit(COMPANY_ID, 'visit-1', USER_ID),
      ).rejects.toThrow('Cannot cancel a visit that is already in progress or completed');
    });

    it('should throw when visit not found', async () => {
      mockPrisma.visit.findFirst.mockResolvedValue(null);

      await expect(
        visitService.cancelVisit(COMPANY_ID, 'nonexistent', USER_ID),
      ).rejects.toThrow('Visit not found');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // getVisitById / getVisitByCode
  // ─────────────────────────────────────────────────────────────────────

  describe('getVisitById', () => {
    it('should return visit with relations', async () => {
      mockPrisma.visit.findFirst.mockResolvedValue(sampleVisit);

      const result = await visitService.getVisitById(COMPANY_ID, 'visit-1');

      expect(result).toEqual(sampleVisit);
      expect(mockPrisma.visit.findFirst).toHaveBeenCalledWith({
        where: { id: 'visit-1', companyId: COMPANY_ID },
        include: expect.objectContaining({
          visitorType: true,
          checkInGate: true,
          checkOutGate: true,
        }),
      });
    });

    it('should throw when visit not found', async () => {
      mockPrisma.visit.findFirst.mockResolvedValue(null);

      await expect(
        visitService.getVisitById(COMPANY_ID, 'nonexistent'),
      ).rejects.toThrow('Visit not found');
    });
  });

  describe('getVisitByCode', () => {
    it('should return visit by code', async () => {
      mockPrisma.visit.findUnique.mockResolvedValue(sampleVisit);

      const result = await visitService.getVisitByCode('ABC123');

      expect(result).toEqual(sampleVisit);
      expect(mockPrisma.visit.findUnique).toHaveBeenCalledWith({
        where: { visitCode: 'ABC123' },
        include: { visitorType: true },
      });
    });

    it('should throw when code not found', async () => {
      mockPrisma.visit.findUnique.mockResolvedValue(null);

      await expect(visitService.getVisitByCode('XXXXXX')).rejects.toThrow(
        'Visit not found for the provided code',
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // completeInduction
  // ─────────────────────────────────────────────────────────────────────

  describe('completeInduction', () => {
    it('should mark induction as COMPLETED when passed', async () => {
      mockPrisma.visit.findFirst.mockResolvedValue(sampleVisit);
      mockPrisma.visit.update.mockResolvedValue({
        ...sampleVisit,
        safetyInductionStatus: 'COMPLETED',
        safetyInductionScore: 85,
      });

      const result = await visitService.completeInduction(COMPANY_ID, 'visit-1', 85, true);

      expect(result.safetyInductionStatus).toBe('COMPLETED');
      expect(mockPrisma.visit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            safetyInductionStatus: 'COMPLETED',
            safetyInductionScore: 85,
          }),
        }),
      );
    });

    it('should mark induction as FAILED when not passed', async () => {
      mockPrisma.visit.findFirst.mockResolvedValue(sampleVisit);
      mockPrisma.visit.update.mockResolvedValue({
        ...sampleVisit,
        safetyInductionStatus: 'FAILED',
      });

      await visitService.completeInduction(COMPANY_ID, 'visit-1', 30, false);

      expect(mockPrisma.visit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            safetyInductionStatus: 'FAILED',
          }),
        }),
      );
    });
  });
});
