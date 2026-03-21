import { Prisma } from '@prisma/client';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';

/** Convert undefined to null for Prisma nullable fields. */
function n<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

interface ListOptions {
  page?: number;
  limit?: number;
  search?: string;
}

interface BalanceListOptions extends ListOptions {
  employeeId?: string;
  year?: number;
}

interface RequestListOptions extends ListOptions {
  employeeId?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
}

export class LeaveService {
  // ────────────────────────────────────────────────────────────────────
  // Leave Types
  // ────────────────────────────────────────────────────────────────────

  async listLeaveTypes(companyId: string, options: ListOptions = {}) {
    const { page = 1, limit = 25, search } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [leaveTypes, total] = await Promise.all([
      platformPrisma.leaveType.findMany({
        where,
        include: {
          _count: {
            select: {
              policies: true,
              balances: true,
              requests: true,
            },
          },
        },
        skip: offset,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      platformPrisma.leaveType.count({ where }),
    ]);

    return { leaveTypes, total, page, limit };
  }

  async getLeaveType(companyId: string, id: string) {
    const leaveType = await platformPrisma.leaveType.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            policies: true,
            balances: true,
            requests: true,
          },
        },
      },
    });

    if (!leaveType || leaveType.companyId !== companyId) {
      throw ApiError.notFound('Leave type not found');
    }

    return leaveType;
  }

  async createLeaveType(companyId: string, data: any) {
    // Validate unique code within company
    const existing = await platformPrisma.leaveType.findUnique({
      where: { companyId_code: { companyId, code: data.code } },
    });
    if (existing) {
      throw ApiError.conflict(`Leave type code "${data.code}" already exists`);
    }

    return platformPrisma.leaveType.create({
      data: {
        companyId,
        name: data.name,
        code: data.code,
        category: data.category,
        annualEntitlement: data.annualEntitlement,
        accrualFrequency: n(data.accrualFrequency),
        accrualDay: n(data.accrualDay),
        carryForwardAllowed: data.carryForwardAllowed ?? false,
        maxCarryForwardDays: n(data.maxCarryForwardDays),
        encashmentAllowed: data.encashmentAllowed ?? false,
        maxEncashableDays: n(data.maxEncashableDays),
        encashmentRate: n(data.encashmentRate),
        applicableTypeIds: data.applicableTypeIds ?? Prisma.JsonNull,
        applicableGender: n(data.applicableGender),
        probationRestricted: data.probationRestricted ?? false,
        minTenureDays: n(data.minTenureDays),
        minAdvanceNotice: n(data.minAdvanceNotice),
        minDaysPerApplication: n(data.minDaysPerApplication),
        maxConsecutiveDays: n(data.maxConsecutiveDays),
        allowHalfDay: data.allowHalfDay ?? true,
        weekendSandwich: data.weekendSandwich ?? false,
        holidaySandwich: data.holidaySandwich ?? false,
        documentRequired: data.documentRequired ?? false,
        documentAfterDays: n(data.documentAfterDays),
        lopOnExcess: data.lopOnExcess ?? true,
      },
    });
  }

  async updateLeaveType(companyId: string, id: string, data: any) {
    const leaveType = await platformPrisma.leaveType.findUnique({ where: { id } });
    if (!leaveType || leaveType.companyId !== companyId) {
      throw ApiError.notFound('Leave type not found');
    }

    // If code is changing, check uniqueness
    if (data.code && data.code !== leaveType.code) {
      const existing = await platformPrisma.leaveType.findUnique({
        where: { companyId_code: { companyId, code: data.code } },
      });
      if (existing) {
        throw ApiError.conflict(`Leave type code "${data.code}" already exists`);
      }
    }

    return platformPrisma.leaveType.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.code !== undefined && { code: data.code }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.annualEntitlement !== undefined && { annualEntitlement: data.annualEntitlement }),
        ...(data.accrualFrequency !== undefined && { accrualFrequency: n(data.accrualFrequency) }),
        ...(data.accrualDay !== undefined && { accrualDay: n(data.accrualDay) }),
        ...(data.carryForwardAllowed !== undefined && { carryForwardAllowed: data.carryForwardAllowed }),
        ...(data.maxCarryForwardDays !== undefined && { maxCarryForwardDays: n(data.maxCarryForwardDays) }),
        ...(data.encashmentAllowed !== undefined && { encashmentAllowed: data.encashmentAllowed }),
        ...(data.maxEncashableDays !== undefined && { maxEncashableDays: n(data.maxEncashableDays) }),
        ...(data.encashmentRate !== undefined && { encashmentRate: n(data.encashmentRate) }),
        ...(data.applicableTypeIds !== undefined && { applicableTypeIds: data.applicableTypeIds ?? Prisma.JsonNull }),
        ...(data.applicableGender !== undefined && { applicableGender: n(data.applicableGender) }),
        ...(data.probationRestricted !== undefined && { probationRestricted: data.probationRestricted }),
        ...(data.minTenureDays !== undefined && { minTenureDays: n(data.minTenureDays) }),
        ...(data.minAdvanceNotice !== undefined && { minAdvanceNotice: n(data.minAdvanceNotice) }),
        ...(data.minDaysPerApplication !== undefined && { minDaysPerApplication: n(data.minDaysPerApplication) }),
        ...(data.maxConsecutiveDays !== undefined && { maxConsecutiveDays: n(data.maxConsecutiveDays) }),
        ...(data.allowHalfDay !== undefined && { allowHalfDay: data.allowHalfDay }),
        ...(data.weekendSandwich !== undefined && { weekendSandwich: data.weekendSandwich }),
        ...(data.holidaySandwich !== undefined && { holidaySandwich: data.holidaySandwich }),
        ...(data.documentRequired !== undefined && { documentRequired: data.documentRequired }),
        ...(data.documentAfterDays !== undefined && { documentAfterDays: n(data.documentAfterDays) }),
        ...(data.lopOnExcess !== undefined && { lopOnExcess: data.lopOnExcess }),
      },
    });
  }

  async deleteLeaveType(companyId: string, id: string) {
    const leaveType = await platformPrisma.leaveType.findUnique({ where: { id } });
    if (!leaveType || leaveType.companyId !== companyId) {
      throw ApiError.notFound('Leave type not found');
    }

    // Check for active balances
    const balanceCount = await platformPrisma.leaveBalance.count({
      where: { leaveTypeId: id, balance: { gt: 0 } },
    });
    if (balanceCount > 0) {
      throw ApiError.badRequest(`Cannot delete: ${balanceCount} employees have active balances for this leave type`);
    }

    // Check for pending requests
    const pendingCount = await platformPrisma.leaveRequest.count({
      where: { leaveTypeId: id, status: { in: ['PENDING', 'APPROVED'] } },
    });
    if (pendingCount > 0) {
      throw ApiError.badRequest(`Cannot delete: ${pendingCount} pending/approved requests exist for this leave type`);
    }

    await platformPrisma.leaveType.delete({ where: { id } });
    return { message: 'Leave type deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Leave Policies
  // ────────────────────────────────────────────────────────────────────

  async listPolicies(companyId: string, options: ListOptions & { leaveTypeId?: string } = {}) {
    const { page = 1, limit = 25, leaveTypeId } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (leaveTypeId) {
      where.leaveTypeId = leaveTypeId;
    }

    const [policies, total] = await Promise.all([
      platformPrisma.leavePolicy.findMany({
        where,
        include: {
          leaveType: { select: { id: true, name: true, code: true, category: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.leavePolicy.count({ where }),
    ]);

    return { policies, total, page, limit };
  }

  async createPolicy(companyId: string, data: any) {
    // Validate leaveTypeId belongs to company
    const leaveType = await platformPrisma.leaveType.findUnique({
      where: { id: data.leaveTypeId },
    });
    if (!leaveType || leaveType.companyId !== companyId) {
      throw ApiError.badRequest('Leave type not found');
    }

    return platformPrisma.leavePolicy.create({
      data: {
        companyId,
        leaveTypeId: data.leaveTypeId,
        assignmentLevel: data.assignmentLevel,
        assignmentId: n(data.assignmentId),
        overrides: data.overrides ?? Prisma.JsonNull,
      },
      include: {
        leaveType: { select: { id: true, name: true, code: true, category: true } },
      },
    });
  }

  async updatePolicy(companyId: string, id: string, data: any) {
    const policy = await platformPrisma.leavePolicy.findUnique({ where: { id } });
    if (!policy || policy.companyId !== companyId) {
      throw ApiError.notFound('Leave policy not found');
    }

    // Validate leaveTypeId if changing
    if (data.leaveTypeId && data.leaveTypeId !== policy.leaveTypeId) {
      const leaveType = await platformPrisma.leaveType.findUnique({
        where: { id: data.leaveTypeId },
      });
      if (!leaveType || leaveType.companyId !== companyId) {
        throw ApiError.badRequest('Leave type not found');
      }
    }

    return platformPrisma.leavePolicy.update({
      where: { id },
      data: {
        ...(data.leaveTypeId !== undefined && { leaveTypeId: data.leaveTypeId }),
        ...(data.assignmentLevel !== undefined && { assignmentLevel: data.assignmentLevel }),
        ...(data.assignmentId !== undefined && { assignmentId: n(data.assignmentId) }),
        ...(data.overrides !== undefined && { overrides: data.overrides ?? Prisma.JsonNull }),
      },
      include: {
        leaveType: { select: { id: true, name: true, code: true, category: true } },
      },
    });
  }

  async deletePolicy(companyId: string, id: string) {
    const policy = await platformPrisma.leavePolicy.findUnique({ where: { id } });
    if (!policy || policy.companyId !== companyId) {
      throw ApiError.notFound('Leave policy not found');
    }

    await platformPrisma.leavePolicy.delete({ where: { id } });
    return { message: 'Leave policy deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Leave Balances
  // ────────────────────────────────────────────────────────────────────

  async listBalances(companyId: string, options: BalanceListOptions = {}) {
    const { page = 1, limit = 25, employeeId, year } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (employeeId) where.employeeId = employeeId;
    if (year) where.year = year;

    const [balances, total] = await Promise.all([
      platformPrisma.leaveBalance.findMany({
        where,
        include: {
          employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
          leaveType: { select: { id: true, name: true, code: true, category: true } },
        },
        skip: offset,
        take: limit,
        orderBy: [{ employee: { firstName: 'asc' } }, { leaveType: { name: 'asc' } }],
      }),
      platformPrisma.leaveBalance.count({ where }),
    ]);

    return { balances, total, page, limit };
  }

  async adjustBalance(companyId: string, data: any) {
    const { employeeId, leaveTypeId, year, action, days, reason } = data;

    // Validate employee belongs to company
    const employee = await platformPrisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.badRequest('Employee not found');
    }

    // Validate leave type belongs to company
    const leaveType = await platformPrisma.leaveType.findUnique({ where: { id: leaveTypeId } });
    if (!leaveType || leaveType.companyId !== companyId) {
      throw ApiError.badRequest('Leave type not found');
    }

    // Find or create balance record
    let balance = await platformPrisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year },
      },
    });

    if (!balance) {
      // Create balance record first
      balance = await platformPrisma.leaveBalance.create({
        data: {
          companyId,
          employeeId,
          leaveTypeId,
          year,
          openingBalance: 0,
          accrued: 0,
          taken: 0,
          adjusted: 0,
          balance: 0,
        },
      });
    }

    const adjustmentDelta = action === 'credit' ? days : -days;
    const newAdjusted = Number(balance.adjusted) + adjustmentDelta;
    const newBalance = Number(balance.openingBalance) + Number(balance.accrued) - Number(balance.taken) + newAdjusted;

    if (newBalance < 0 && action === 'debit') {
      throw ApiError.badRequest('Insufficient balance for debit adjustment');
    }

    const updated = await platformPrisma.leaveBalance.update({
      where: { id: balance.id },
      data: {
        adjusted: newAdjusted,
        balance: newBalance,
      },
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        leaveType: { select: { id: true, name: true, code: true } },
      },
    });

    return { ...updated, adjustmentAction: action, adjustmentDays: days, adjustmentReason: reason };
  }

  async initializeBalances(companyId: string, data: { employeeId: string; year: number }) {
    const { employeeId, year } = data;

    // Validate employee
    const employee = await platformPrisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.badRequest('Employee not found');
    }

    // Get all active leave types for the company
    const leaveTypes = await platformPrisma.leaveType.findMany({
      where: { companyId, isActive: true },
    });

    const results: any[] = [];
    const joiningDate = new Date(employee.joiningDate);
    const yearStart = new Date(year, 0, 1);

    for (const lt of leaveTypes) {
      // Check if balance already exists
      const existing = await platformPrisma.leaveBalance.findUnique({
        where: {
          employeeId_leaveTypeId_year: { employeeId, leaveTypeId: lt.id, year },
        },
      });

      if (existing) {
        results.push({ leaveTypeId: lt.id, leaveTypeCode: lt.code, status: 'already_exists' });
        continue;
      }

      // Pro-rata calculation: if joining mid-year
      let entitlement = Number(lt.annualEntitlement);
      if (joiningDate > yearStart && joiningDate.getFullYear() === year) {
        const joiningMonth = joiningDate.getMonth(); // 0-indexed
        const remainingMonths = 12 - joiningMonth;
        entitlement = Math.round((entitlement / 12) * remainingMonths * 10) / 10; // round to 1 decimal
      }

      const balance = await platformPrisma.leaveBalance.create({
        data: {
          companyId,
          employeeId,
          leaveTypeId: lt.id,
          year,
          openingBalance: 0,
          accrued: entitlement,
          taken: 0,
          adjusted: 0,
          balance: entitlement,
        },
      });

      results.push({
        leaveTypeId: lt.id,
        leaveTypeCode: lt.code,
        status: 'created',
        entitlement,
        balanceId: balance.id,
      });
    }

    return { employeeId, year, results };
  }

  // ────────────────────────────────────────────────────────────────────
  // Leave Requests
  // ────────────────────────────────────────────────────────────────────

  async listRequests(companyId: string, options: RequestListOptions = {}) {
    const { page = 1, limit = 25, employeeId, status, fromDate, toDate } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status.toUpperCase();
    if (fromDate || toDate) {
      where.fromDate = {};
      if (fromDate) where.fromDate.gte = new Date(fromDate);
      if (toDate) where.fromDate.lte = new Date(toDate);
    }

    const [requests, total] = await Promise.all([
      platformPrisma.leaveRequest.findMany({
        where,
        include: {
          employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
          leaveType: { select: { id: true, name: true, code: true, category: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.leaveRequest.count({ where }),
    ]);

    return { requests, total, page, limit };
  }

  async getRequest(companyId: string, id: string) {
    const request = await platformPrisma.leaveRequest.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true, departmentId: true } },
        leaveType: true,
      },
    });

    if (!request || request.companyId !== companyId) {
      throw ApiError.notFound('Leave request not found');
    }

    return request;
  }

  async createRequest(companyId: string, data: any) {
    const { employeeId, leaveTypeId, fromDate, toDate, days, isHalfDay, halfDayType, reason } = data;

    // Validate employee
    const employee = await platformPrisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.badRequest('Employee not found');
    }

    // Validate leave type
    const leaveType = await platformPrisma.leaveType.findUnique({ where: { id: leaveTypeId } });
    if (!leaveType || leaveType.companyId !== companyId) {
      throw ApiError.badRequest('Leave type not found');
    }

    if (!leaveType.isActive) {
      throw ApiError.badRequest('This leave type is no longer active');
    }

    const from = new Date(fromDate);
    const to = new Date(toDate);

    // Validate date range
    if (from > to) {
      throw ApiError.badRequest('From date must be before or equal to to date');
    }

    // Validate half-day: must be single day
    if (isHalfDay && from.getTime() !== to.getTime()) {
      throw ApiError.badRequest('Half-day leave must be for a single day');
    }

    if (isHalfDay && !leaveType.allowHalfDay) {
      throw ApiError.badRequest('Half-day is not allowed for this leave type');
    }

    // Check min advance notice
    if (leaveType.minAdvanceNotice) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((from.getTime() - today.getTime()) / (1000 * 3600 * 24));
      if (diffDays < leaveType.minAdvanceNotice) {
        throw ApiError.badRequest(`Minimum ${leaveType.minAdvanceNotice} days advance notice required`);
      }
    }

    // Check max consecutive days
    if (leaveType.maxConsecutiveDays && days > leaveType.maxConsecutiveDays) {
      throw ApiError.badRequest(`Maximum ${leaveType.maxConsecutiveDays} consecutive days allowed`);
    }

    // Calculate actual days considering sandwich rules
    let actualDays = days;
    if (leaveType.weekendSandwich || leaveType.holidaySandwich) {
      actualDays = await this.calculateLeaveDays(companyId, from, to, leaveType);
    }

    // Check balance
    const currentYear = from.getFullYear();
    const balance = await platformPrisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year: currentYear },
      },
    });

    if (!balance) {
      throw ApiError.badRequest('No leave balance found. Please initialize balances first');
    }

    if (Number(balance.balance) < actualDays && leaveType.category !== 'UNPAID') {
      throw ApiError.badRequest(
        `Insufficient balance. Available: ${balance.balance}, Requested: ${actualDays}`
      );
    }

    // Check for overlapping requests
    const overlapping = await platformPrisma.leaveRequest.findFirst({
      where: {
        employeeId,
        status: { in: ['PENDING', 'APPROVED'] },
        OR: [
          { fromDate: { lte: to }, toDate: { gte: from } },
        ],
      },
    });

    if (overlapping) {
      throw ApiError.badRequest('Overlapping leave request already exists');
    }

    // Create request and deduct balance (optimistic)
    const [request] = await platformPrisma.$transaction([
      platformPrisma.leaveRequest.create({
        data: {
          companyId,
          employeeId,
          leaveTypeId,
          fromDate: from,
          toDate: to,
          days: actualDays,
          isHalfDay: isHalfDay ?? false,
          halfDayType: n(halfDayType),
          reason,
          status: 'PENDING',
        },
        include: {
          employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
          leaveType: { select: { id: true, name: true, code: true } },
        },
      }),
      platformPrisma.leaveBalance.update({
        where: { id: balance.id },
        data: {
          taken: { increment: actualDays },
          balance: { decrement: actualDays },
        },
      }),
    ]);

    return request;
  }

  async approveRequest(companyId: string, id: string, userId: string) {
    const request = await platformPrisma.leaveRequest.findUnique({ where: { id } });
    if (!request || request.companyId !== companyId) {
      throw ApiError.notFound('Leave request not found');
    }

    if (request.status !== 'PENDING') {
      throw ApiError.badRequest(`Cannot approve a request with status "${request.status}"`);
    }

    return platformPrisma.leaveRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedBy: userId,
        approvedAt: new Date(),
      },
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        leaveType: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async rejectRequest(companyId: string, id: string, userId: string, note: string) {
    const request = await platformPrisma.leaveRequest.findUnique({ where: { id } });
    if (!request || request.companyId !== companyId) {
      throw ApiError.notFound('Leave request not found');
    }

    if (request.status !== 'PENDING') {
      throw ApiError.badRequest(`Cannot reject a request with status "${request.status}"`);
    }

    // Refund balance
    const currentYear = new Date(request.fromDate).getFullYear();
    const balance = await platformPrisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          year: currentYear,
        },
      },
    });

    const operations: any[] = [
      platformPrisma.leaveRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          approvedBy: userId,
          rejectionNote: note,
        },
        include: {
          employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
          leaveType: { select: { id: true, name: true, code: true } },
        },
      }),
    ];

    if (balance) {
      operations.push(
        platformPrisma.leaveBalance.update({
          where: { id: balance.id },
          data: {
            taken: { decrement: Number(request.days) },
            balance: { increment: Number(request.days) },
          },
        })
      );
    }

    const [updatedRequest] = await platformPrisma.$transaction(operations);
    return updatedRequest;
  }

  async cancelRequest(companyId: string, id: string) {
    const request = await platformPrisma.leaveRequest.findUnique({ where: { id } });
    if (!request || request.companyId !== companyId) {
      throw ApiError.notFound('Leave request not found');
    }

    if (!['PENDING', 'APPROVED'].includes(request.status)) {
      throw ApiError.badRequest(`Cannot cancel a request with status "${request.status}"`);
    }

    // If APPROVED, check that fromDate is in the future
    if (request.status === 'APPROVED') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (new Date(request.fromDate) <= today) {
        throw ApiError.badRequest('Cannot cancel an approved request whose start date has passed');
      }
    }

    // Refund balance
    const currentYear = new Date(request.fromDate).getFullYear();
    const balance = await platformPrisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          year: currentYear,
        },
      },
    });

    const operations: any[] = [
      platformPrisma.leaveRequest.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
        },
        include: {
          employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
          leaveType: { select: { id: true, name: true, code: true } },
        },
      }),
    ];

    if (balance) {
      operations.push(
        platformPrisma.leaveBalance.update({
          where: { id: balance.id },
          data: {
            taken: { decrement: Number(request.days) },
            balance: { increment: Number(request.days) },
          },
        })
      );
    }

    const [updatedRequest] = await platformPrisma.$transaction(operations);
    return updatedRequest;
  }

  // ────────────────────────────────────────────────────────────────────
  // Summary
  // ────────────────────────────────────────────────────────────────────

  async getLeaveSummary(companyId: string) {
    const currentYear = new Date().getFullYear();

    const [pendingCount, leaveTypeDistribution, topAbsentees] = await Promise.all([
      // Pending approvals count
      platformPrisma.leaveRequest.count({
        where: { companyId, status: 'PENDING' },
      }),

      // Leave type distribution (approved + taken leaves in current year)
      platformPrisma.leaveRequest.groupBy({
        by: ['leaveTypeId'],
        where: {
          companyId,
          status: { in: ['APPROVED', 'AUTO_APPROVED'] },
          fromDate: { gte: new Date(currentYear, 0, 1) },
        },
        _sum: { days: true },
        _count: true,
      }),

      // Top absentees (most leave days taken this year)
      platformPrisma.leaveBalance.findMany({
        where: {
          companyId,
          year: currentYear,
          taken: { gt: 0 },
        },
        select: {
          employeeId: true,
          taken: true,
          employee: { select: { employeeId: true, firstName: true, lastName: true } },
          leaveType: { select: { name: true, code: true } },
        },
        orderBy: { taken: 'desc' },
        take: 10,
      }),
    ]);

    // Enrich leave type distribution with names
    const leaveTypeIds = leaveTypeDistribution.map((d) => d.leaveTypeId);
    const leaveTypes = await platformPrisma.leaveType.findMany({
      where: { id: { in: leaveTypeIds } },
      select: { id: true, name: true, code: true },
    });
    const leaveTypeMap = new Map(leaveTypes.map((lt) => [lt.id, lt]));

    const distribution = leaveTypeDistribution.map((d) => ({
      leaveType: leaveTypeMap.get(d.leaveTypeId) || { id: d.leaveTypeId },
      totalDays: d._sum.days,
      requestCount: d._count,
    }));

    return {
      pendingApprovals: pendingCount,
      leaveTypeDistribution: distribution,
      topAbsentees,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────────

  /**
   * Calculate actual leave days considering sandwich rules.
   * If weekendSandwich=true, weekends between from and to are counted as leave.
   * If holidaySandwich=true, company holidays between from and to are counted as leave.
   * If both are false, weekends and holidays are excluded.
   */
  private async calculateLeaveDays(
    companyId: string,
    from: Date,
    to: Date,
    leaveType: { weekendSandwich: boolean; holidaySandwich: boolean }
  ): Promise<number> {
    let days = 0;
    const current = new Date(from);
    current.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(0, 0, 0, 0);

    // Get holidays in the date range if needed
    let holidayDates: Set<string> = new Set();
    if (leaveType.holidaySandwich) {
      const holidays = await platformPrisma.holidayCalendar.findMany({
        where: {
          companyId,
          date: { gte: from, lte: to },
        },
        select: { date: true },
      });
      holidayDates = new Set(holidays.map((h) => h.date.toISOString().split('T')[0] as string));
    }

    while (current <= end) {
      const dayOfWeek = current.getDay(); // 0=Sunday, 6=Saturday
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const dateStr = current.toISOString().split('T')[0];
      const isHoliday = holidayDates.has(dateStr!);

      if (isWeekend) {
        // Count weekend as leave day if sandwich rule applies
        if (leaveType.weekendSandwich) {
          days++;
        }
      } else if (isHoliday) {
        // Count holiday as leave day if sandwich rule applies
        if (leaveType.holidaySandwich) {
          days++;
        }
      } else {
        // Regular working day — always counts
        days++;
      }

      current.setDate(current.getDate() + 1);
    }

    return days;
  }
}

export const leaveService = new LeaveService();
