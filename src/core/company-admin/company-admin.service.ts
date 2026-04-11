import { Prisma } from '@prisma/client';
import { platformPrisma } from '../../config/database';
import { ApiError } from '../../shared/errors';
import { hashPassword } from '../../shared/utils';
import { n } from '../../shared/utils/prisma-helpers';
import { logger } from '../../config/logger';
import { notificationService } from '../notifications/notification.service';
import { MODULE_CATALOGUE, USER_TIERS, pricingService } from '../billing/pricing.service';
import {
  invalidateCompanySettings,
  invalidateSystemControls,
  invalidateShift,
  invalidateShiftBreaks,
} from '../../shared/utils/config-cache';

// ── Module dependency graph + pricing ────────────────────────────────

const MODULE_DEPS: Record<string, string[]> = {
  masters: [],
  security: ['masters'],
  hr: ['security'],
  production: ['machine-maintenance', 'masters'],
  'machine-maintenance': ['masters'],
  inventory: ['masters'],
  vendor: ['inventory', 'masters'],
  sales: ['finance', 'masters'],
  finance: ['masters'],
  visitor: ['security'],
};

const MODULE_NAMES: Record<string, string> = {
  masters: 'Masters',
  security: 'Security',
  hr: 'HR Management',
  production: 'Production',
  'machine-maintenance': 'Machine Maintenance',
  inventory: 'Inventory',
  vendor: 'Vendor Management',
  sales: 'Sales & Invoicing',
  finance: 'Finance',
  visitor: 'Visitor Management',
};

const MODULE_PRICES: Record<string, number> = {
  masters: 0,
  security: 1499,
  hr: 2999,
  production: 2499,
  'machine-maintenance': 1999,
  inventory: 1999,
  vendor: 1499,
  sales: 1999,
  finance: 2499,
  visitor: 999,
};

function resolveDeps(moduleIds: string[]): string[] {
  const resolved = new Set(moduleIds);
  const queue = [...moduleIds];
  while (queue.length) {
    const id = queue.shift()!;
    for (const dep of MODULE_DEPS[id] ?? []) {
      if (!resolved.has(dep)) {
        resolved.add(dep);
        queue.push(dep);
      }
    }
  }
  return Array.from(resolved);
}

function getDependents(moduleId: string): string[] {
  return Object.entries(MODULE_DEPS)
    .filter(([, deps]) => deps.includes(moduleId))
    .map(([id]) => id);
}


export class CompanyAdminService {
  // ────────────────────────────────────────────────────────────────────
  // Company Profile
  // ────────────────────────────────────────────────────────────────────

  async getCompanyProfile(companyId: string) {
    const company = await platformPrisma.company.findUnique({
      where: { id: companyId },
      include: {
        locations: { orderBy: { createdAt: 'asc' } },
        contacts: { orderBy: { createdAt: 'asc' } },
        shifts: { orderBy: { createdAt: 'asc' } },
        noSeries: { orderBy: { createdAt: 'asc' } },
        iotReasons: { orderBy: { createdAt: 'asc' } },
        tenant: {
          include: { subscriptions: true },
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

    // Strip sensitive fields
    const result: any = { ...company, address: undefined, contactPerson: undefined };
    if (result.razorpayConfig) {
      // Parse JSON string if needed
      let rp: Record<string, any> =
        typeof result.razorpayConfig === 'string'
          ? JSON.parse(result.razorpayConfig)
          : { ...result.razorpayConfig };
      if (rp.keyId && typeof rp.keyId === 'string') {
        rp.keyId = rp.keyId.length > 4 ? '••••' + rp.keyId.slice(-4) : '••••••••';
      }
      if (rp.keySecret) rp.keySecret = '••••••••';
      if (rp.webhookSecret) rp.webhookSecret = '••••••••';
      result.razorpayConfig = rp;
    }

    return result;
  }

  // ────────────────────────────────────────────────────────────────────
  // Profile Section Update (limited fields for company admin)
  // ────────────────────────────────────────────────────────────────────

  async updateCompanySection(companyId: string, sectionKey: string, data: any) {
    const company = await platformPrisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw ApiError.notFound('Company not found');
    }

    switch (sectionKey) {
      case 'identity':
        await platformPrisma.company.update({
          where: { id: companyId },
          data: {
            ...(data.displayName !== undefined && { displayName: data.displayName, name: data.displayName }),
            ...(data.legalName !== undefined && { legalName: data.legalName }),
            ...(data.shortName !== undefined && { shortName: n(data.shortName) }),
            ...(data.logoUrl !== undefined && { logoUrl: n(data.logoUrl) }),
            ...(data.website !== undefined && { website: n(data.website) }),
            ...(data.emailDomain !== undefined && { emailDomain: data.emailDomain }),
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

      case 'contacts':
        await platformPrisma.$transaction(async (tx) => {
          await tx.companyContact.deleteMany({ where: { companyId } });
          if (Array.isArray(data) && data.length > 0) {
            await tx.companyContact.createMany({
              data: data.map((c: any) => ({
                companyId,
                name: c.name,
                designation: n(c.designation),
                department: n(c.department),
                type: c.type,
                email: c.email,
                countryCode: c.countryCode ?? '+91',
                mobile: c.mobile,
                linkedin: n(c.linkedin),
              })),
            });
          }
        });
        break;

      default:
        throw ApiError.badRequest(`Company admins cannot update section: ${sectionKey}. Allowed: identity, address, contacts`);
    }

    return this.getCompanyProfile(companyId);
  }

  // ────────────────────────────────────────────────────────────────────
  // Locations (read, update, delete — NO create)
  // ────────────────────────────────────────────────────────────────────

  async listLocations(companyId: string) {
    return platformPrisma.location.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getLocation(companyId: string, locationId: string) {
    const location = await platformPrisma.location.findUnique({
      where: { id: locationId },
    });

    if (!location || location.companyId !== companyId) {
      throw ApiError.notFound('Location not found');
    }

    return location;
  }

  async updateLocation(companyId: string, locationId: string, data: any) {
    const location = await platformPrisma.location.findUnique({
      where: { id: locationId },
    });

    if (!location || location.companyId !== companyId) {
      throw ApiError.notFound('Location not found');
    }

    return platformPrisma.location.update({
      where: { id: locationId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.facilityType !== undefined && { facilityType: data.facilityType }),
        ...(data.customFacilityType !== undefined && { customFacilityType: n(data.customFacilityType) }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.addressLine1 !== undefined && { addressLine1: n(data.addressLine1) }),
        ...(data.addressLine2 !== undefined && { addressLine2: n(data.addressLine2) }),
        ...(data.city !== undefined && { city: n(data.city) }),
        ...(data.district !== undefined && { district: n(data.district) }),
        ...(data.state !== undefined && { state: n(data.state) }),
        ...(data.pin !== undefined && { pin: n(data.pin) }),
        ...(data.country !== undefined && { country: n(data.country) }),
        ...(data.stdCode !== undefined && { stdCode: n(data.stdCode) }),
        ...(data.gstin !== undefined && { gstin: n(data.gstin) }),
        ...(data.stateGST !== undefined && { stateGST: n(data.stateGST) }),
        ...(data.contactName !== undefined && { contactName: n(data.contactName) }),
        ...(data.contactDesignation !== undefined && { contactDesignation: n(data.contactDesignation) }),
        ...(data.contactEmail !== undefined && { contactEmail: n(data.contactEmail) }),
        ...(data.contactCountryCode !== undefined && { contactCountryCode: n(data.contactCountryCode) }),
        ...(data.contactPhone !== undefined && { contactPhone: n(data.contactPhone) }),
        ...(data.geoEnabled !== undefined && { geoEnabled: data.geoEnabled }),
        ...(data.geoLocationName !== undefined && { geoLocationName: n(data.geoLocationName) }),
        ...(data.geoLat !== undefined && { geoLat: n(data.geoLat) }),
        ...(data.geoLng !== undefined && { geoLng: n(data.geoLng) }),
        ...(data.geoRadius !== undefined && { geoRadius: data.geoRadius }),
        ...(data.geoShape !== undefined && { geoShape: n(data.geoShape) }),
      },
    });
  }

  async deleteLocation(companyId: string, locationId: string) {
    const location = await platformPrisma.location.findUnique({
      where: { id: locationId },
    });

    if (!location || location.companyId !== companyId) {
      throw ApiError.notFound('Location not found');
    }

    if (location.isHQ) {
      throw ApiError.badRequest('Cannot delete the HQ location. Contact Super Admin to reassign HQ first.');
    }

    // Check for assigned employees
    const employeeCount = await platformPrisma.employee.count({ where: { locationId } });
    if (employeeCount > 0) {
      throw ApiError.badRequest(`Cannot delete: ${employeeCount} employee(s) are assigned to this location`);
    }

    // Check for linked cost centres
    const costCentreCount = await platformPrisma.costCentre.count({ where: { locationId } });
    if (costCentreCount > 0) {
      throw ApiError.badRequest(`Cannot delete: ${costCentreCount} cost centre(s) are linked to this location`);
    }

    await platformPrisma.location.delete({ where: { id: locationId } });
    return { message: 'Location deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Shifts (CRUD)
  // ────────────────────────────────────────────────────────────────────

  async listShifts(companyId: string) {
    return platformPrisma.companyShift.findMany({
      where: { companyId },
      include: { breaks: { orderBy: { startTime: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getShift(companyId: string, shiftId: string) {
    const shift = await platformPrisma.companyShift.findUnique({
      where: { id: shiftId },
      include: { breaks: { orderBy: { startTime: 'asc' } } },
    });

    if (!shift || shift.companyId !== companyId) {
      throw ApiError.notFound('Shift not found');
    }

    return shift;
  }

  async createShift(companyId: string, data: any) {
    // Validate: shift name must be unique within the company
    const existingByName = await platformPrisma.companyShift.findFirst({
      where: { companyId, name: { equals: data.name, mode: 'insensitive' } },
    });
    if (existingByName) {
      throw ApiError.conflict(`A shift named "${data.name}" already exists. Please choose a different name.`);
    }

    // Validate: start time and end time must be different
    if (data.startTime === data.endTime) {
      throw ApiError.badRequest('Start time and end time cannot be the same. A shift must have a duration.');
    }

    const shift = await platformPrisma.companyShift.create({
      data: {
        companyId,
        name: data.name,
        shiftType: data.shiftType ?? 'DAY',
        startTime: data.startTime,
        endTime: data.endTime,
        isCrossDay: data.isCrossDay ?? false,
        gracePeriodMinutes: n(data.gracePeriodMinutes),
        earlyExitToleranceMinutes: n(data.earlyExitToleranceMinutes),
        halfDayThresholdHours: n(data.halfDayThresholdHours),
        fullDayThresholdHours: n(data.fullDayThresholdHours),
        maxLateCheckInMinutes: n(data.maxLateCheckInMinutes),
        minWorkingHoursForOT: n(data.minWorkingHoursForOT),
        requireSelfie: n(data.requireSelfie),
        requireGPS: n(data.requireGPS),
        allowedSources: data.allowedSources ?? [],
        noShuffle: data.noShuffle ?? false,
        autoClockOutMinutes: n(data.autoClockOutMinutes),
      },
      include: { breaks: true },
    });

    await invalidateShift(shift.id);
    return shift;
  }

  async updateShift(companyId: string, shiftId: string, data: any) {
    const shift = await platformPrisma.companyShift.findUnique({
      where: { id: shiftId },
    });

    if (!shift || shift.companyId !== companyId) {
      throw ApiError.notFound('Shift not found');
    }

    // Validate: shift name uniqueness (if name is being changed)
    if (data.name !== undefined && data.name.toLowerCase() !== shift.name.toLowerCase()) {
      const existingByName = await platformPrisma.companyShift.findFirst({
        where: { companyId, name: { equals: data.name, mode: 'insensitive' }, id: { not: shiftId } },
      });
      if (existingByName) {
        throw ApiError.conflict(`A shift named "${data.name}" already exists. Please choose a different name.`);
      }
    }

    // Validate: start/end time must differ (check final values after merge)
    const finalStartTime = data.startTime ?? shift.startTime;
    const finalEndTime = data.endTime ?? shift.endTime;
    if (finalStartTime === finalEndTime) {
      throw ApiError.badRequest('Start time and end time cannot be the same. A shift must have a duration.');
    }

    const updated = await platformPrisma.companyShift.update({
      where: { id: shiftId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.shiftType !== undefined && { shiftType: data.shiftType }),
        ...(data.startTime !== undefined && { startTime: data.startTime }),
        ...(data.endTime !== undefined && { endTime: data.endTime }),
        ...(data.isCrossDay !== undefined && { isCrossDay: data.isCrossDay }),
        ...(data.gracePeriodMinutes !== undefined && { gracePeriodMinutes: n(data.gracePeriodMinutes) }),
        ...(data.earlyExitToleranceMinutes !== undefined && { earlyExitToleranceMinutes: n(data.earlyExitToleranceMinutes) }),
        ...(data.halfDayThresholdHours !== undefined && { halfDayThresholdHours: n(data.halfDayThresholdHours) }),
        ...(data.fullDayThresholdHours !== undefined && { fullDayThresholdHours: n(data.fullDayThresholdHours) }),
        ...(data.maxLateCheckInMinutes !== undefined && { maxLateCheckInMinutes: n(data.maxLateCheckInMinutes) }),
        ...(data.minWorkingHoursForOT !== undefined && { minWorkingHoursForOT: n(data.minWorkingHoursForOT) }),
        ...(data.requireSelfie !== undefined && { requireSelfie: n(data.requireSelfie) }),
        ...(data.requireGPS !== undefined && { requireGPS: n(data.requireGPS) }),
        ...(data.allowedSources !== undefined && { allowedSources: data.allowedSources }),
        ...(data.noShuffle !== undefined && { noShuffle: data.noShuffle }),
        ...(data.autoClockOutMinutes !== undefined && { autoClockOutMinutes: n(data.autoClockOutMinutes) }),
      },
      include: { breaks: { orderBy: { startTime: 'asc' } } },
    });

    await invalidateShift(shiftId);
    return updated;
  }

  async deleteShift(companyId: string, shiftId: string) {
    const shift = await platformPrisma.companyShift.findUnique({
      where: { id: shiftId },
    });

    if (!shift || shift.companyId !== companyId) {
      throw ApiError.notFound('Shift not found');
    }

    // Check for assigned employees
    const employeeCount = await platformPrisma.employee.count({ where: { shiftId } });
    if (employeeCount > 0) {
      throw ApiError.badRequest(`Cannot delete: ${employeeCount} employee(s) are assigned to this shift`);
    }

    await platformPrisma.companyShift.delete({ where: { id: shiftId } });
    await invalidateShift(shiftId);
    await invalidateShiftBreaks(shiftId);
    return { message: 'Shift deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Shift Breaks (CRUD)
  // ────────────────────────────────────────────────────────────────────

  async listShiftBreaks(companyId: string, shiftId: string) {
    // Verify shift belongs to company
    const shift = await platformPrisma.companyShift.findUnique({
      where: { id: shiftId },
    });
    if (!shift || shift.companyId !== companyId) {
      throw ApiError.notFound('Shift not found');
    }

    return platformPrisma.shiftBreak.findMany({
      where: { shiftId },
      orderBy: { startTime: 'asc' },
    });
  }

  async createShiftBreak(companyId: string, shiftId: string, data: any) {
    const shift = await platformPrisma.companyShift.findUnique({
      where: { id: shiftId },
      include: { breaks: { orderBy: { startTime: 'asc' } } },
    });
    if (!shift || shift.companyId !== companyId) {
      throw ApiError.notFound('Shift not found');
    }

    // Max break duration: 120 minutes (2 hours)
    const MAX_BREAK_DURATION = 120;
    if (data.duration > MAX_BREAK_DURATION) {
      throw ApiError.badRequest(`Break duration cannot exceed ${MAX_BREAK_DURATION} minutes`);
    }

    // For FIXED breaks, validate startTime is within shift hours
    if (data.type === 'FIXED' && data.startTime) {
      const breakStart = data.startTime; // "HH:mm" format
      const shiftStart = shift.startTime;
      const shiftEnd = shift.endTime;

      // For non-cross-day shifts, break must be between shift start and end
      if (!shift.isCrossDay) {
        if (breakStart < shiftStart || breakStart >= shiftEnd) {
          throw ApiError.badRequest(`Break start time ${breakStart} must be within shift hours (${shiftStart} - ${shiftEnd})`);
        }
      } else {
        // Cross-day: break can be after shiftStart OR before shiftEnd (next day)
        if (breakStart < shiftStart && breakStart >= shiftEnd) {
          throw ApiError.badRequest(`Break start time ${breakStart} must be within shift hours (${shiftStart} - ${shiftEnd} next day)`);
        }
      }

      // Check overlap with existing breaks in the same shift
      for (const existing of shift.breaks) {
        if (!existing.startTime) continue; // Skip flexible breaks
        const existingEnd = this.addMinutesToTime(existing.startTime, existing.duration);
        const newEnd = this.addMinutesToTime(breakStart, data.duration);

        // Overlap: newStart < existingEnd AND existingStart < newEnd
        if (breakStart < existingEnd && existing.startTime < newEnd) {
          throw ApiError.badRequest(`Break overlaps with existing break "${existing.name}" (${existing.startTime} - ${existingEnd})`);
        }
      }
    }

    const shiftBreak = await platformPrisma.shiftBreak.create({
      data: {
        shiftId,
        name: data.name,
        type: data.type,
        startTime: n(data.startTime),
        duration: data.duration,
        isPaid: data.isPaid ?? false,
      },
    });

    await invalidateShiftBreaks(shiftId);
    return shiftBreak;
  }

  /** Helper: add minutes to a "HH:mm" time string and return "HH:mm". */
  private addMinutesToTime(time: string, minutes: number): string {
    const parts = time.split(':').map(Number);
    const h = parts[0] ?? 0;
    const m = parts[1] ?? 0;
    const totalMinutes = h * 60 + m + minutes;
    const newH = Math.floor(totalMinutes / 60) % 24;
    const newM = totalMinutes % 60;
    return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
  }

  async updateShiftBreak(companyId: string, shiftId: string, breakId: string, data: any) {
    const shift = await platformPrisma.companyShift.findUnique({
      where: { id: shiftId },
    });
    if (!shift || shift.companyId !== companyId) {
      throw ApiError.notFound('Shift not found');
    }

    const existing = await platformPrisma.shiftBreak.findUnique({
      where: { id: breakId },
    });
    if (!existing || existing.shiftId !== shiftId) {
      throw ApiError.notFound('Break not found');
    }

    const updated = await platformPrisma.shiftBreak.update({
      where: { id: breakId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.startTime !== undefined && { startTime: n(data.startTime) }),
        ...(data.duration !== undefined && { duration: data.duration }),
        ...(data.isPaid !== undefined && { isPaid: data.isPaid }),
      },
    });

    await invalidateShiftBreaks(shiftId);
    return updated;
  }

  async deleteShiftBreak(companyId: string, shiftId: string, breakId: string) {
    const shift = await platformPrisma.companyShift.findUnique({
      where: { id: shiftId },
    });
    if (!shift || shift.companyId !== companyId) {
      throw ApiError.notFound('Shift not found');
    }

    const existing = await platformPrisma.shiftBreak.findUnique({
      where: { id: breakId },
    });
    if (!existing || existing.shiftId !== shiftId) {
      throw ApiError.notFound('Break not found');
    }

    await platformPrisma.shiftBreak.delete({ where: { id: breakId } });
    await invalidateShiftBreaks(shiftId);
    return { message: 'Break deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Contacts (CRUD)
  // ────────────────────────────────────────────────────────────────────

  async listContacts(companyId: string) {
    return platformPrisma.companyContact.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getContact(companyId: string, contactId: string) {
    const contact = await platformPrisma.companyContact.findUnique({
      where: { id: contactId },
    });

    if (!contact || contact.companyId !== companyId) {
      throw ApiError.notFound('Contact not found');
    }

    return contact;
  }

  async createContact(companyId: string, data: any) {
    return platformPrisma.companyContact.create({
      data: {
        companyId,
        name: data.name,
        designation: n(data.designation),
        department: n(data.department),
        type: data.type,
        email: data.email,
        countryCode: data.countryCode ?? '+91',
        mobile: data.mobile,
        linkedin: n(data.linkedin),
      },
    });
  }

  async updateContact(companyId: string, contactId: string, data: any) {
    const contact = await platformPrisma.companyContact.findUnique({
      where: { id: contactId },
    });

    if (!contact || contact.companyId !== companyId) {
      throw ApiError.notFound('Contact not found');
    }

    return platformPrisma.companyContact.update({
      where: { id: contactId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.designation !== undefined && { designation: n(data.designation) }),
        ...(data.department !== undefined && { department: n(data.department) }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.countryCode !== undefined && { countryCode: data.countryCode }),
        ...(data.mobile !== undefined && { mobile: data.mobile }),
        ...(data.linkedin !== undefined && { linkedin: n(data.linkedin) }),
      },
    });
  }

  async deleteContact(companyId: string, contactId: string) {
    const contact = await platformPrisma.companyContact.findUnique({
      where: { id: contactId },
    });

    if (!contact || contact.companyId !== companyId) {
      throw ApiError.notFound('Contact not found');
    }

    await platformPrisma.companyContact.delete({ where: { id: contactId } });
    return { message: 'Contact deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // No. Series (CRUD)
  // ────────────────────────────────────────────────────────────────────

  async listNoSeries(companyId: string) {
    return platformPrisma.noSeriesConfig.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getNoSeries(companyId: string, noSeriesId: string) {
    const ns = await platformPrisma.noSeriesConfig.findUnique({
      where: { id: noSeriesId },
    });

    if (!ns || ns.companyId !== companyId) {
      throw ApiError.notFound('No. Series not found');
    }

    return ns;
  }

  async createNoSeries(companyId: string, data: any) {
    return platformPrisma.noSeriesConfig.create({
      data: {
        companyId,
        code: data.code,
        linkedScreen: data.linkedScreen,
        description: n(data.description),
        prefix: data.prefix,
        suffix: n(data.suffix),
        numberCount: data.numberCount ?? 5,
        startNumber: data.startNumber ?? 1,
      },
    });
  }

  async updateNoSeries(companyId: string, noSeriesId: string, data: any) {
    const ns = await platformPrisma.noSeriesConfig.findUnique({
      where: { id: noSeriesId },
    });

    if (!ns || ns.companyId !== companyId) {
      throw ApiError.notFound('No. Series not found');
    }

    return platformPrisma.noSeriesConfig.update({
      where: { id: noSeriesId },
      data: {
        ...(data.code !== undefined && { code: data.code }),
        ...(data.linkedScreen !== undefined && { linkedScreen: data.linkedScreen }),
        ...(data.description !== undefined && { description: n(data.description) }),
        ...(data.prefix !== undefined && { prefix: data.prefix }),
        ...(data.suffix !== undefined && { suffix: n(data.suffix) }),
        ...(data.numberCount !== undefined && { numberCount: data.numberCount }),
        ...(data.startNumber !== undefined && { startNumber: data.startNumber }),
      },
    });
  }

  async deleteNoSeries(companyId: string, noSeriesId: string) {
    const ns = await platformPrisma.noSeriesConfig.findUnique({
      where: { id: noSeriesId },
    });

    if (!ns || ns.companyId !== companyId) {
      throw ApiError.notFound('No. Series not found');
    }

    await platformPrisma.noSeriesConfig.delete({ where: { id: noSeriesId } });
    return { message: 'No. Series deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // IoT Reasons (CRUD)
  // ────────────────────────────────────────────────────────────────────

  async listIotReasons(companyId: string) {
    return platformPrisma.iotReason.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getIotReason(companyId: string, reasonId: string) {
    const reason = await platformPrisma.iotReason.findUnique({
      where: { id: reasonId },
    });

    if (!reason || reason.companyId !== companyId) {
      throw ApiError.notFound('IoT Reason not found');
    }

    return reason;
  }

  async createIotReason(companyId: string, data: any) {
    return platformPrisma.iotReason.create({
      data: {
        companyId,
        reasonType: data.reasonType,
        reason: data.reason,
        description: n(data.description),
        department: n(data.department),
        planned: data.planned ?? false,
        duration: n(data.duration),
      },
    });
  }

  async updateIotReason(companyId: string, reasonId: string, data: any) {
    const reason = await platformPrisma.iotReason.findUnique({
      where: { id: reasonId },
    });

    if (!reason || reason.companyId !== companyId) {
      throw ApiError.notFound('IoT Reason not found');
    }

    return platformPrisma.iotReason.update({
      where: { id: reasonId },
      data: {
        ...(data.reasonType !== undefined && { reasonType: data.reasonType }),
        ...(data.reason !== undefined && { reason: data.reason }),
        ...(data.description !== undefined && { description: n(data.description) }),
        ...(data.department !== undefined && { department: n(data.department) }),
        ...(data.planned !== undefined && { planned: data.planned }),
        ...(data.duration !== undefined && { duration: n(data.duration) }),
      },
    });
  }

  async deleteIotReason(companyId: string, reasonId: string) {
    const reason = await platformPrisma.iotReason.findUnique({
      where: { id: reasonId },
    });

    if (!reason || reason.companyId !== companyId) {
      throw ApiError.notFound('IoT Reason not found');
    }

    await platformPrisma.iotReason.delete({ where: { id: reasonId } });
    return { message: 'IoT Reason deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Controls (system controls JSON)
  // ────────────────────────────────────────────────────────────────────

  async getControls(companyId: string) {
    let controls = await platformPrisma.systemControls.findUnique({
      where: { companyId },
    });

    if (!controls) {
      // Auto-seed with Prisma defaults
      logger.info(`SystemControls missing for company ${companyId}, auto-seeding defaults`);
      controls = await platformPrisma.systemControls.create({ data: { companyId } });
    }

    return controls;
  }

  async updateControls(companyId: string, data: any, userId?: string) {
    const controls = await platformPrisma.systemControls.upsert({
      where: { companyId },
      create: {
        companyId,
        ...data,
        updatedBy: userId ?? null,
      },
      update: {
        ...(data.attendanceEnabled !== undefined && { attendanceEnabled: data.attendanceEnabled }),
        ...(data.leaveEnabled !== undefined && { leaveEnabled: data.leaveEnabled }),
        ...(data.payrollEnabled !== undefined && { payrollEnabled: data.payrollEnabled }),
        ...(data.essEnabled !== undefined && { essEnabled: data.essEnabled }),
        ...(data.performanceEnabled !== undefined && { performanceEnabled: data.performanceEnabled }),
        ...(data.recruitmentEnabled !== undefined && { recruitmentEnabled: data.recruitmentEnabled }),
        ...(data.trainingEnabled !== undefined && { trainingEnabled: data.trainingEnabled }),
        ...(data.mobileAppEnabled !== undefined && { mobileAppEnabled: data.mobileAppEnabled }),
        ...(data.aiChatbotEnabled !== undefined && { aiChatbotEnabled: data.aiChatbotEnabled }),
        ...(data.ncEditMode !== undefined && { ncEditMode: data.ncEditMode }),
        ...(data.loadUnload !== undefined && { loadUnload: data.loadUnload }),
        ...(data.cycleTime !== undefined && { cycleTime: data.cycleTime }),
        ...(data.payrollLock !== undefined && { payrollLock: data.payrollLock }),
        ...(data.backdatedEntryControl !== undefined && { backdatedEntryControl: data.backdatedEntryControl }),
        ...(data.leaveCarryForward !== undefined && { leaveCarryForward: data.leaveCarryForward }),
        ...(data.compOffEnabled !== undefined && { compOffEnabled: data.compOffEnabled }),
        ...(data.halfDayLeaveEnabled !== undefined && { halfDayLeaveEnabled: data.halfDayLeaveEnabled }),
        ...(data.mfaRequired !== undefined && { mfaRequired: data.mfaRequired }),
        ...(data.sessionTimeoutMinutes !== undefined && { sessionTimeoutMinutes: data.sessionTimeoutMinutes }),
        ...(data.maxConcurrentSessions !== undefined && { maxConcurrentSessions: data.maxConcurrentSessions }),
        ...(data.passwordMinLength !== undefined && { passwordMinLength: data.passwordMinLength }),
        ...(data.passwordComplexity !== undefined && { passwordComplexity: data.passwordComplexity }),
        ...(data.accountLockThreshold !== undefined && { accountLockThreshold: data.accountLockThreshold }),
        ...(data.accountLockDurationMinutes !== undefined && { accountLockDurationMinutes: data.accountLockDurationMinutes }),
        ...(data.biometricLoginEnabled !== undefined && { biometricLoginEnabled: data.biometricLoginEnabled }),
        ...(data.auditLogRetentionDays !== undefined && { auditLogRetentionDays: data.auditLogRetentionDays }),
        updatedBy: userId ?? null,
      },
    });

    await invalidateSystemControls(companyId);
    return controls;
  }

  // ────────────────────────────────────────────────────────────────────
  // Company Settings (typed model — replaces preferences JSON)
  // ────────────────────────────────────────────────────────────────────

  async getSettings(companyId: string) {
    let settings = await platformPrisma.companySettings.findUnique({
      where: { companyId },
    });

    if (!settings) {
      // Auto-seed with Prisma defaults
      logger.info(`CompanySettings missing for company ${companyId}, auto-seeding defaults`);
      settings = await platformPrisma.companySettings.create({ data: { companyId } });
    }

    return settings;
  }

  async updateSettings(companyId: string, data: any, userId?: string) {
    const settings = await platformPrisma.companySettings.upsert({
      where: { companyId },
      create: {
        companyId,
        ...data,
        updatedBy: userId ?? null,
      },
      update: {
        ...(data.currency !== undefined && { currency: data.currency }),
        ...(data.language !== undefined && { language: data.language }),
        ...(data.timezone !== undefined && { timezone: data.timezone }),
        ...(data.dateFormat !== undefined && { dateFormat: data.dateFormat }),
        ...(data.timeFormat !== undefined && { timeFormat: data.timeFormat }),
        ...(data.numberFormat !== undefined && { numberFormat: data.numberFormat }),
        ...(data.indiaCompliance !== undefined && { indiaCompliance: data.indiaCompliance }),
        ...(data.gdprMode !== undefined && { gdprMode: data.gdprMode }),
        ...(data.auditTrail !== undefined && { auditTrail: data.auditTrail }),
        ...(data.bankIntegration !== undefined && { bankIntegration: data.bankIntegration }),
        ...(data.razorpayEnabled !== undefined && { razorpayEnabled: data.razorpayEnabled }),
        ...(data.emailNotifications !== undefined && { emailNotifications: data.emailNotifications }),
        ...(data.pushNotifications !== undefined && { pushNotifications: data.pushNotifications }),
        ...(data.smsNotifications !== undefined && { smsNotifications: data.smsNotifications }),
        ...(data.inAppNotifications !== undefined && { inAppNotifications: data.inAppNotifications }),
        ...(data.whatsappNotifications !== undefined && { whatsappNotifications: data.whatsappNotifications }),
        ...(data.biometricIntegration !== undefined && { biometricIntegration: data.biometricIntegration }),
        ...(data.eSignIntegration !== undefined && { eSignIntegration: data.eSignIntegration }),
        updatedBy: userId ?? null,
      },
    });

    await invalidateCompanySettings(companyId);
    return settings;
  }

  // ────────────────────────────────────────────────────────────────────
  // Users (CRUD + status toggle)
  // ────────────────────────────────────────────────────────────────────

  async listUsers(companyId: string, options: { page?: number; limit?: number; search?: string; isActive?: boolean; role?: string } = {}) {
    const { page = 1, limit = 25, search, isActive, role } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };

    if (typeof isActive === 'boolean') {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) {
      // Accept either role ID or role name from UI filter.
      where.tenantUsers = {
        some: {
          OR: [
            { roleId: role },
            { role: { name: role } },
          ],
        },
      };
    }

    const [users, total] = await Promise.all([
      platformPrisma.user.findMany({
        where,
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
          updatedAt: true,
          employeeId: true,
          tenantUsers: {
            select: {
              roleId: true,
              role: { select: { id: true, name: true } },
            },
            take: 1,
          },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.user.count({ where }),
    ]);

    // Flatten tenantUser role info into each user for frontend consumption
    const enriched = users.map((u) => {
      const tu = u.tenantUsers[0];
      return {
        ...u,
        tenantUsers: undefined,
        roleId: tu?.role?.id ?? null,
        roleName: tu?.role?.name ?? null,
      };
    });

    return { users: enriched, total, page, limit };
  }

  async createUser(companyId: string, tenantId: string, data: any) {
    // Check for duplicate email
    const existing = await platformPrisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw ApiError.conflict(`Email "${data.email}" is already in use`);
    }

    const hashed = await hashPassword(data.password);

    const result = await platformPrisma.$transaction(async (tx) => {
      // Check if an Employee with this officialEmail already exists (auto-link)
      let employeeId: string | null = null;
      const existingEmployee = await tx.employee.findFirst({
        where: { companyId, officialEmail: data.email },
        select: { id: true },
      });

      if (existingEmployee) {
        // Only link if this employee isn't already linked to another user
        const alreadyLinkedUser = await tx.user.findUnique({
          where: { employeeId: existingEmployee.id },
          select: { id: true },
        });
        if (!alreadyLinkedUser) {
          employeeId = existingEmployee.id;
        }
      }

      // Determine the platform-level UserRole based on the assigned tenant role.
      // Only the system "Company Admin" role gets COMPANY_ADMIN; all others get USER.
      let platformRole: 'COMPANY_ADMIN' | 'USER' = 'USER';
      if (tenantId && data.role) {
        const assignedRole = await tx.role.findFirst({
          where: { id: data.role, tenantId },
          select: { isSystem: true, name: true },
        });
        if (assignedRole?.isSystem && assignedRole.name === 'Company Admin') {
          platformRole = 'COMPANY_ADMIN';
        }
      }

      const user = await tx.user.create({
        data: {
          email: data.email,
          password: hashed,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: n(data.phone),
          role: platformRole,
          companyId,
          employeeId,
        },
      });

      // Create TenantUser bridge if we have a tenantId and a roleId
      if (tenantId) {
        // Find a default role for the tenant or use provided roleId
        let roleId = data.role;
        if (!roleId) {
          const defaultRole = await tx.role.findFirst({
            where: { tenantId, isSystem: true },
          });
          roleId = defaultRole?.id;
        }

        if (roleId) {
          await tx.tenantUser.create({
            data: {
              userId: user.id,
              tenantId,
              roleId,
            },
          });
        }
      }

      return user;
    });

    logger.info(`User created by company admin: ${result.id} (${result.email}) for company ${companyId}`);

    // Return without password, include role info
    const { password: _, ...userWithoutPassword } = result;

    // Fetch the assigned role name for the response
    const tenantUser = await platformPrisma.tenantUser.findFirst({
      where: { userId: result.id },
      select: { role: { select: { id: true, name: true } } },
    });

    return {
      ...userWithoutPassword,
      roleId: tenantUser?.role?.id ?? null,
      roleName: tenantUser?.role?.name ?? null,
    };
  }

  async getUser(companyId: string, userId: string) {
    const user = await platformPrisma.user.findUnique({
      where: { id: userId },
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
        updatedAt: true,
        employeeId: true,
        tenantUsers: {
          select: {
            id: true,
            tenantId: true,
            roleId: true,
            isActive: true,
            role: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!user || (await this.getUserCompanyId(userId)) !== companyId) {
      throw ApiError.notFound('User not found');
    }

    // Flatten tenantUser role info for frontend
    const tu = user.tenantUsers[0];
    return {
      ...user,
      tenantUsers: undefined,
      roleId: tu?.role?.id ?? null,
      roleName: tu?.role?.name ?? null,
    };
  }

  async updateUser(companyId: string, userId: string, data: any) {
    const user = await platformPrisma.user.findUnique({
      where: { id: userId },
      include: { company: { include: { tenant: { select: { id: true } } } } },
    });

    if (!user || user.companyId !== companyId) {
      throw ApiError.notFound('User not found');
    }

    // If email is being changed, check for duplicates
    if (data.email && data.email !== user.email) {
      const existing = await platformPrisma.user.findUnique({ where: { email: data.email } });
      if (existing) {
        throw ApiError.conflict(`Email "${data.email}" is already in use`);
      }
    }

    const updated = await platformPrisma.user.update({
      where: { id: userId },
      data: {
        ...(data.firstName !== undefined && { firstName: data.firstName }),
        ...(data.lastName !== undefined && { lastName: data.lastName }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.phone !== undefined && { phone: n(data.phone) }),
      },
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
        updatedAt: true,
        employeeId: true,
      },
    });

    // Handle role assignment if roleId is provided
    if (data.role) {
      const tenantId = user.company?.tenant?.id;
      if (tenantId) {
        const { rbacService } = await import('../rbac/rbac.service');
        await rbacService.assignRole(tenantId, userId, data.role);
      }
    }

    // Return with role info
    const tenantUser = await platformPrisma.tenantUser.findFirst({
      where: { userId },
      select: { role: { select: { id: true, name: true } } },
    });

    return {
      ...updated,
      roleId: tenantUser?.role?.id ?? null,
      roleName: tenantUser?.role?.name ?? null,
    };
  }

  async updateUserStatus(companyId: string, userId: string, isActive: boolean) {
    const user = await platformPrisma.user.findUnique({ where: { id: userId } });

    if (!user || user.companyId !== companyId) {
      throw ApiError.notFound('User not found');
    }

    const updated = await platformPrisma.user.update({
      where: { id: userId },
      data: { isActive },
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
        updatedAt: true,
        employeeId: true,
      },
    });

    logger.info(`User ${userId} status updated to ${isActive ? 'active' : 'inactive'} by company admin (company: ${companyId})`);

    // Notify the affected user — HIGH + systemCritical because the
    // account status change controls whether they can log in at all.
    try {
      await notificationService.dispatch({
        companyId,
        triggerEvent: isActive ? 'USER_REACTIVATED' : 'USER_DEACTIVATED',
        entityType: 'User',
        entityId: userId,
        explicitRecipients: [userId],
        tokens: {
          user_name: `${updated.firstName ?? ''} ${updated.lastName ?? ''}`.trim(),
        },
        priority: 'HIGH',
        systemCritical: true,
        type: 'AUTH',
      });
    } catch (err) {
      logger.warn('User status change dispatch failed (non-blocking)', { error: err, userId });
    }

    // Include role info
    const tenantUser = await platformPrisma.tenantUser.findFirst({
      where: { userId },
      select: { role: { select: { id: true, name: true } } },
    });

    return {
      ...updated,
      roleId: tenantUser?.role?.id ?? null,
      roleName: tenantUser?.role?.name ?? null,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Audit Logs (read-only, filtered by companyId)
  // ────────────────────────────────────────────────────────────────────

  async listAuditLogs(companyId: string, options: { page?: number; limit?: number; action?: string; entityType?: string } = {}) {
    const { page = 1, limit = 25, action, entityType } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };

    if (action) {
      where.action = { contains: action, mode: 'insensitive' };
    }

    if (entityType) {
      where.entityType = { contains: entityType, mode: 'insensitive' };
    }

    const [logs, total] = await Promise.all([
      platformPrisma.auditLog.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { changedAt: 'desc' },
      }),
      platformPrisma.auditLog.count({ where }),
    ]);

    return { logs, total, page, limit };
  }

  async getAuditFilterOptions(companyId: string) {
    const where = { companyId };

    const [actionResults, entityTypeResults] = await Promise.all([
      platformPrisma.auditLog.findMany({
        where,
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
      }),
      platformPrisma.auditLog.findMany({
        where,
        distinct: ['entityType'],
        select: { entityType: true },
        orderBy: { entityType: 'asc' },
      }),
    ]);

    return {
      actionTypes: actionResults.map((r) => r.action),
      entityTypes: entityTypeResults.map((r) => r.entityType),
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Module Catalogue
  // ────────────────────────────────────────────────────────────────────

  async getModuleCatalogue(companyId: string) {
    const company = await platformPrisma.company.findUnique({
      where: { id: companyId },
      select: {
        selectedModuleIds: true,
        locationConfig: true,
        billingType: true,
        locations: {
          select: { id: true, name: true, moduleIds: true },
        },
      },
    });

    if (!company) {
      throw ApiError.notFound('Company not found');
    }

    // Parse company-level selected module IDs
    let companyModuleIds: string[] = [];
    if (company.selectedModuleIds) {
      const raw = company.selectedModuleIds;
      companyModuleIds = Array.isArray(raw) ? raw as string[] : typeof raw === 'string' ? JSON.parse(raw) : [];
    }

    // If company-level moduleIds is empty, aggregate from locations (fallback)
    // This handles the case where modules were assigned per-location during onboarding
    if (companyModuleIds.length === 0 && company.locations?.length > 0) {
      const allLocationModules = new Set<string>();
      company.locations.forEach((loc) => {
        if (loc.moduleIds) {
          const raw = loc.moduleIds;
          const locIds: string[] = Array.isArray(raw) ? raw as string[] : typeof raw === 'string' ? JSON.parse(raw) : [];
          locIds.forEach((id) => allLocationModules.add(id));
        }
      });
      companyModuleIds = Array.from(allLocationModules);
    }

    // Build catalogue with active status
    const catalogue = MODULE_CATALOGUE.map((mod) => ({
      id: mod.id,
      name: mod.name,
      pricePerMonth: mod.price,
      isActive: companyModuleIds.includes(mod.id),
    }));

    // Per-location module breakdown
    const locationModules = company.locations.map((loc) => {
      let locModuleIds: string[] = [];
      if (loc.moduleIds) {
        const raw = loc.moduleIds;
        locModuleIds = Array.isArray(raw) ? raw as string[] : typeof raw === 'string' ? JSON.parse(raw) : [];
      }
      return {
        locationId: loc.id,
        locationName: loc.name,
        activeModuleIds: locModuleIds,
      };
    });

    return {
      catalogue,
      companyActiveModuleIds: companyModuleIds,
      locationConfig: company.locationConfig,
      billingType: company.billingType ?? 'monthly',
      locationModules,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Billing — My Subscription
  // ────────────────────────────────────────────────────────────────────

  async getMySubscription(companyId: string) {
    const tenant = await platformPrisma.tenant.findFirst({
      where: { companyId },
      select: { id: true },
    });

    if (!tenant) {
      throw ApiError.notFound('No tenant found for this company');
    }

    const subscription = await platformPrisma.subscription.findUnique({
      where: { tenantId: tenant.id },
    });

    if (!subscription) {
      throw ApiError.notFound('No subscription found');
    }

    // Enrich with tier label
    const tier = USER_TIERS.find((t) => t.key === subscription.userTier?.toLowerCase());

    return {
      ...subscription,
      tierLabel: tier?.label ?? subscription.userTier,
      tierBasePrice: tier?.basePrice ?? 0,
      tierPerUserPrice: tier?.perUserPrice ?? 0,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Billing — My Invoices
  // ────────────────────────────────────────────────────────────────────

  async getMyInvoices(companyId: string, page: number = 1, limit: number = 25) {
    const tenant = await platformPrisma.tenant.findFirst({
      where: { companyId },
      select: { id: true },
    });

    if (!tenant) {
      throw ApiError.notFound('No tenant found for this company');
    }

    const subscription = await platformPrisma.subscription.findUnique({
      where: { tenantId: tenant.id },
      select: { id: true },
    });

    if (!subscription) {
      throw ApiError.notFound('No subscription found');
    }

    const offset = (page - 1) * limit;
    const where = { subscriptionId: subscription.id };

    const [invoices, total] = await Promise.all([
      platformPrisma.invoice.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          invoiceNumber: true,
          invoiceType: true,
          amount: true,
          subtotal: true,
          totalTax: true,
          totalAmount: true,
          status: true,
          dueDate: true,
          paidAt: true,
          billingPeriodStart: true,
          billingPeriodEnd: true,
          createdAt: true,
        },
      }),
      platformPrisma.invoice.count({ where }),
    ]);

    return { invoices, total, page, limit };
  }

  // ────────────────────────────────────────────────────────────────────
  // Billing — Invoice Detail
  // ────────────────────────────────────────────────────────────────────

  async getMyInvoiceDetail(companyId: string, invoiceId: string) {
    const tenant = await platformPrisma.tenant.findFirst({
      where: { companyId },
      select: { id: true },
    });

    if (!tenant) {
      throw ApiError.notFound('No tenant found for this company');
    }

    const subscription = await platformPrisma.subscription.findUnique({
      where: { tenantId: tenant.id },
      select: { id: true },
    });

    if (!subscription) {
      throw ApiError.notFound('No subscription found');
    }

    const invoice = await platformPrisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        payments: {
          orderBy: { paidAt: 'desc' },
        },
      },
    });

    if (!invoice || invoice.subscriptionId !== subscription.id) {
      throw ApiError.notFound('Invoice not found');
    }

    return invoice;
  }

  // ────────────────────────────────────────────────────────────────────
  // Billing — My Payments
  // ────────────────────────────────────────────────────────────────────

  async getMyPayments(companyId: string, page: number = 1, limit: number = 25) {
    const tenant = await platformPrisma.tenant.findFirst({
      where: { companyId },
      select: { id: true },
    });

    if (!tenant) {
      throw ApiError.notFound('No tenant found for this company');
    }

    const subscription = await platformPrisma.subscription.findUnique({
      where: { tenantId: tenant.id },
      select: { id: true },
    });

    if (!subscription) {
      throw ApiError.notFound('No subscription found');
    }

    // Get all invoice IDs for this subscription
    const invoiceIds = await platformPrisma.invoice.findMany({
      where: { subscriptionId: subscription.id },
      select: { id: true },
    });

    const ids = invoiceIds.map((i) => i.id);
    const offset = (page - 1) * limit;
    const where = { invoiceId: { in: ids } };

    const [payments, total] = await Promise.all([
      platformPrisma.payment.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { paidAt: 'desc' },
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              amount: true,
              totalAmount: true,
              status: true,
            },
          },
        },
      }),
      platformPrisma.payment.count({ where }),
    ]);

    return { payments, total, page, limit };
  }

  // ────────────────────────────────────────────────────────────────────
  // Billing — Cost Breakdown
  // ────────────────────────────────────────────────────────────────────

  async getMyCostBreakdown(companyId: string) {
    const company = await platformPrisma.company.findUnique({
      where: { id: companyId },
      include: {
        locations: true,
      },
    });

    if (!company) {
      throw ApiError.notFound('Company not found');
    }

    const config = await pricingService.getConfig();

    // Parse company-level module data
    let companyModuleIds: string[] = [];
    if (company.selectedModuleIds) {
      const raw = company.selectedModuleIds;
      companyModuleIds = Array.isArray(raw) ? raw as string[] : typeof raw === 'string' ? JSON.parse(raw) : [];
    }

    let customModulePricing: Record<string, number> = {};
    if (company.customModulePricing) {
      const raw = company.customModulePricing;
      customModulePricing = typeof raw === 'object' && !Array.isArray(raw)
        ? raw as Record<string, number>
        : typeof raw === 'string' ? JSON.parse(raw) : {};
    }

    const companyInput = {
      selectedModuleIds: companyModuleIds,
      customModulePricing,
      userTier: company.userTier,
      customTierPrice: company.customTierPrice ? parseFloat(company.customTierPrice) : null,
      oneTimeMultiplier: company.oneTimeMultiplier ?? null,
      amcPercentage: company.amcPercentage ?? null,
    };

    // Calculate per-location costs
    const locationBreakdowns = company.locations.map((loc) => {
      let locModuleIds: string[] | undefined;
      if (loc.moduleIds) {
        const raw = loc.moduleIds;
        locModuleIds = Array.isArray(raw) ? raw as string[] : typeof raw === 'string' ? JSON.parse(raw) : undefined;
      }

      const locationInput = {
        moduleIds: locModuleIds ?? companyModuleIds,
        customModulePricing: (loc.customModulePricing as Record<string, number>) ?? null,
        oneTimeLicenseFee: loc.oneTimeLicenseFee ?? null,
        amcAmount: loc.amcAmount ?? null,
        gstin: loc.gstin ?? null,
        billingType: loc.billingType ?? null,
      };

      const summary = pricingService.calculateLocationCostSummary(locationInput, companyInput, config);

      return {
        locationId: loc.id,
        locationName: loc.name,
        facilityType: loc.facilityType,
        ...summary,
      };
    });

    // Module-level breakdown
    const moduleBreakdown = companyModuleIds.map((modId) => {
      const catalogueEntry = MODULE_CATALOGUE.find((m) => m.id === modId);
      const customPrice = customModulePricing[modId];
      return {
        moduleId: modId,
        moduleName: catalogueEntry?.name ?? modId,
        cataloguePrice: catalogueEntry?.price ?? 0,
        customPrice: customPrice ?? null,
        effectivePrice: customPrice ?? catalogueEntry?.price ?? 0,
      };
    });

    // Tier info
    const tier = USER_TIERS.find((t) => t.key === (company.userTier ?? 'starter'));

    // Totals
    const totalMonthly = locationBreakdowns.reduce((sum, l) => sum + l.monthly, 0);
    const totalAnnual = locationBreakdowns.reduce((sum, l) => sum + l.annual, 0);

    return {
      tier: {
        key: company.userTier ?? 'starter',
        label: tier?.label ?? company.userTier ?? 'Starter',
        basePrice: tier?.basePrice ?? 0,
        perUserPrice: tier?.perUserPrice ?? 0,
      },
      modules: moduleBreakdown,
      locations: locationBreakdowns,
      totals: {
        monthly: totalMonthly,
        annual: totalAnnual,
        locationCount: company.locations.length,
        moduleCount: companyModuleIds.length,
      },
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Module CRUD
  // ────────────────────────────────────────────────────────────────────

  async addModulesToLocation(companyId: string, locationId: string, moduleIds: string[]) {
    const company = await platformPrisma.company.findUnique({
      where: { id: companyId },
      include: { locations: true },
    });
    if (!company) throw ApiError.notFound('Company not found');

    const location = company.locations.find((l) => l.id === locationId);
    if (!location) throw ApiError.notFound('Location not found');

    // Check billing type — block one-time
    const effectiveBillingType =
      company.locationConfig === 'common' ? company.billingType : location.billingType;
    if (effectiveBillingType === 'one-time') {
      throw ApiError.forbidden(
        'Module changes are not available for one-time billing plans. Contact support.',
        'BILLING_ONE_TIME'
      );
    }

    // Validate moduleIds exist
    for (const id of moduleIds) {
      if (!(id in MODULE_DEPS)) {
        throw ApiError.badRequest(`Unknown module: ${id}`);
      }
    }

    // Resolve deps
    const resolved = resolveDeps(moduleIds);

    // Parse current modules
    let currentModules: string[] = [];
    if (location.moduleIds) {
      const raw = location.moduleIds;
      currentModules = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? JSON.parse(raw) : [];
    }

    const mergedModules = Array.from(new Set([...currentModules, ...resolved]));
    const autoAddedDeps = resolved.filter((m) => !moduleIds.includes(m) && !currentModules.includes(m));
    const addedModules = mergedModules.filter((m) => !currentModules.includes(m));

    // Calculate billing impact
    const monthlyDelta = addedModules.reduce((sum, m) => sum + (MODULE_PRICES[m] ?? 0), 0);

    const result = await platformPrisma.$transaction(async (tx) => {
      if (company.locationConfig === 'common') {
        // Update ALL locations
        await tx.location.updateMany({
          where: { companyId },
          data: { moduleIds: mergedModules },
        });
      } else {
        await tx.location.update({
          where: { id: locationId },
          data: { moduleIds: mergedModules },
        });
      }

      // Re-aggregate company selectedModuleIds
      const allLocations = await tx.location.findMany({
        where: { companyId },
        select: { id: true, moduleIds: true },
      });

      const allModules = new Set<string>();
      for (const loc of allLocations) {
        const locModules: string[] = loc.id === locationId || company.locationConfig === 'common'
          ? mergedModules
          : (() => {
              if (!loc.moduleIds) return [];
              const raw = loc.moduleIds;
              return Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? JSON.parse(raw) : [];
            })();
        locModules.forEach((m) => allModules.add(m));
      }

      await tx.company.update({
        where: { id: companyId },
        data: { selectedModuleIds: Array.from(allModules) },
      });

      const updatedLocation = await tx.location.findUnique({ where: { id: locationId } });
      return updatedLocation;
    });

    return {
      location: result,
      autoAddedDeps: autoAddedDeps.map((id) => ({ id, name: MODULE_NAMES[id] ?? id })),
      billingImpact: {
        addedModules: addedModules.map((id) => ({ id, name: MODULE_NAMES[id] ?? id, price: MODULE_PRICES[id] ?? 0 })),
        monthlyDelta,
      },
    };
  }

  async removeModuleFromLocation(companyId: string, locationId: string, moduleId: string) {
    if (moduleId === 'masters') {
      throw ApiError.badRequest('The Masters module cannot be removed');
    }

    if (!(moduleId in MODULE_DEPS)) {
      throw ApiError.badRequest(`Unknown module: ${moduleId}`);
    }

    const company = await platformPrisma.company.findUnique({
      where: { id: companyId },
      include: { locations: true },
    });
    if (!company) throw ApiError.notFound('Company not found');

    const location = company.locations.find((l) => l.id === locationId);
    if (!location) throw ApiError.notFound('Location not found');

    // Check billing type
    const effectiveBillingType =
      company.locationConfig === 'common' ? company.billingType : location.billingType;
    if (effectiveBillingType === 'one-time') {
      throw ApiError.forbidden(
        'Module changes are not available for one-time billing plans. Contact support.',
        'BILLING_ONE_TIME'
      );
    }

    // Parse current modules
    let currentModules: string[] = [];
    if (location.moduleIds) {
      const raw = location.moduleIds;
      currentModules = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? JSON.parse(raw) : [];
    }

    if (!currentModules.includes(moduleId)) {
      throw ApiError.notFound(`Module "${moduleId}" is not active on this location`);
    }

    // Check dependents
    const dependents = getDependents(moduleId).filter((dep) => currentModules.includes(dep));
    if (dependents.length > 0) {
      const depNames = dependents.map((d) => MODULE_NAMES[d] ?? d).join(', ');
      throw ApiError.conflict(
        `Cannot remove "${MODULE_NAMES[moduleId] ?? moduleId}" — it is required by: ${depNames}. Remove those modules first.`,
        'MODULE_DEPENDENCY_BLOCK'
      );
    }

    const updatedModules = currentModules.filter((m) => m !== moduleId);

    const result = await platformPrisma.$transaction(async (tx) => {
      if (company.locationConfig === 'common') {
        await tx.location.updateMany({
          where: { companyId },
          data: { moduleIds: updatedModules },
        });
      } else {
        await tx.location.update({
          where: { id: locationId },
          data: { moduleIds: updatedModules },
        });
      }

      // Re-aggregate company selectedModuleIds
      const allLocations = await tx.location.findMany({
        where: { companyId },
        select: { id: true, moduleIds: true },
      });

      const allModules = new Set<string>();
      for (const loc of allLocations) {
        const locModules: string[] = loc.id === locationId || company.locationConfig === 'common'
          ? updatedModules
          : (() => {
              if (!loc.moduleIds) return [];
              const raw = loc.moduleIds;
              return Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? JSON.parse(raw) : [];
            })();
        locModules.forEach((m) => allModules.add(m));
      }

      await tx.company.update({
        where: { id: companyId },
        data: { selectedModuleIds: Array.from(allModules) },
      });

      return tx.location.findUnique({ where: { id: locationId } });
    });

    return result;
  }

  // ────────────────────────────────────────────────────────────────────
  // Private helpers
  // ────────────────────────────────────────────────────────────────────

  private async getUserCompanyId(userId: string): Promise<string | null> {
    const user = await platformPrisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });
    return user?.companyId ?? null;
  }
}

export const companyAdminService = new CompanyAdminService();
