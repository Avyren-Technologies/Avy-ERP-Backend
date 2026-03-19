import { Prisma } from '@prisma/client';
import { platformPrisma } from '../../config/database';
import { ApiError } from '../../shared/errors';
import { hashPassword } from '../../shared/utils';
import { logger } from '../../config/logger';

/** Convert undefined → null so Prisma nullable fields are happy. */
function n<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
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
    if (result.razorpayConfig && typeof result.razorpayConfig === 'object') {
      const rp = { ...result.razorpayConfig } as Record<string, any>;
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

    await platformPrisma.location.delete({ where: { id: locationId } });
    return { message: 'Location deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Shifts (CRUD)
  // ────────────────────────────────────────────────────────────────────

  async listShifts(companyId: string) {
    return platformPrisma.companyShift.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getShift(companyId: string, shiftId: string) {
    const shift = await platformPrisma.companyShift.findUnique({
      where: { id: shiftId },
    });

    if (!shift || shift.companyId !== companyId) {
      throw ApiError.notFound('Shift not found');
    }

    return shift;
  }

  async createShift(companyId: string, data: any) {
    return platformPrisma.companyShift.create({
      data: {
        companyId,
        name: data.name,
        fromTime: data.fromTime,
        toTime: data.toTime,
        noShuffle: data.noShuffle ?? false,
        downtimeSlots: data.downtimeSlots as any ?? Prisma.JsonNull,
      },
    });
  }

  async updateShift(companyId: string, shiftId: string, data: any) {
    const shift = await platformPrisma.companyShift.findUnique({
      where: { id: shiftId },
    });

    if (!shift || shift.companyId !== companyId) {
      throw ApiError.notFound('Shift not found');
    }

    return platformPrisma.companyShift.update({
      where: { id: shiftId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.fromTime !== undefined && { fromTime: data.fromTime }),
        ...(data.toTime !== undefined && { toTime: data.toTime }),
        ...(data.noShuffle !== undefined && { noShuffle: data.noShuffle }),
        ...(data.downtimeSlots !== undefined && { downtimeSlots: data.downtimeSlots as any ?? Prisma.JsonNull }),
      },
    });
  }

  async deleteShift(companyId: string, shiftId: string) {
    const shift = await platformPrisma.companyShift.findUnique({
      where: { id: shiftId },
    });

    if (!shift || shift.companyId !== companyId) {
      throw ApiError.notFound('Shift not found');
    }

    await platformPrisma.companyShift.delete({ where: { id: shiftId } });
    return { message: 'Shift deleted' };
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
    const company = await platformPrisma.company.findUnique({
      where: { id: companyId },
      select: { systemControls: true },
    });

    if (!company) {
      throw ApiError.notFound('Company not found');
    }

    return company.systemControls ?? {};
  }

  async updateControls(companyId: string, data: any) {
    const company = await platformPrisma.company.findUnique({
      where: { id: companyId },
      select: { systemControls: true },
    });

    if (!company) {
      throw ApiError.notFound('Company not found');
    }

    // Merge with existing controls
    const existing = (company.systemControls as Record<string, any>) ?? {};
    const merged = { ...existing, ...data };

    await platformPrisma.company.update({
      where: { id: companyId },
      data: { systemControls: merged as any },
    });

    return merged;
  }

  // ────────────────────────────────────────────────────────────────────
  // Settings (preferences JSON)
  // ────────────────────────────────────────────────────────────────────

  async getSettings(companyId: string) {
    const company = await platformPrisma.company.findUnique({
      where: { id: companyId },
      select: { preferences: true },
    });

    if (!company) {
      throw ApiError.notFound('Company not found');
    }

    return company.preferences ?? {};
  }

  async updateSettings(companyId: string, data: any) {
    const company = await platformPrisma.company.findUnique({
      where: { id: companyId },
      select: { preferences: true },
    });

    if (!company) {
      throw ApiError.notFound('Company not found');
    }

    // Merge with existing preferences
    const existing = (company.preferences as Record<string, any>) ?? {};
    const merged = { ...existing, ...data };

    await platformPrisma.company.update({
      where: { id: companyId },
      data: { preferences: merged as any },
    });

    return merged;
  }

  // ────────────────────────────────────────────────────────────────────
  // Users (CRUD + status toggle)
  // ────────────────────────────────────────────────────────────────────

  async listUsers(companyId: string, options: { page?: number; limit?: number; search?: string; isActive?: boolean } = {}) {
    const { page = 1, limit = 25, search, isActive } = options;
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
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.user.count({ where }),
    ]);

    return { users, total, page, limit };
  }

  async createUser(companyId: string, tenantId: string, data: any) {
    // Check for duplicate email
    const existing = await platformPrisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw ApiError.conflict(`Email "${data.email}" is already in use`);
    }

    const hashed = await hashPassword(data.password);

    const result = await platformPrisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          password: hashed,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: n(data.phone),
          role: 'COMPANY_ADMIN',
          companyId,
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

    // Return without password
    const { password: _, ...userWithoutPassword } = result;
    return userWithoutPassword;
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

    return user;
  }

  async updateUser(companyId: string, userId: string, data: any) {
    const user = await platformPrisma.user.findUnique({ where: { id: userId } });

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
      },
    });

    return updated;
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
      },
    });

    logger.info(`User ${userId} status updated to ${isActive ? 'active' : 'inactive'} by company admin (company: ${companyId})`);

    return updated;
  }

  // ────────────────────────────────────────────────────────────────────
  // Audit Logs (read-only, filtered by tenantId)
  // ────────────────────────────────────────────────────────────────────

  async listAuditLogs(tenantId: string, options: { page?: number; limit?: number; action?: string; entityType?: string } = {}) {
    const { page = 1, limit = 25, action, entityType } = options;
    const offset = (page - 1) * limit;

    const where: any = { tenantId };

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
        orderBy: { timestamp: 'desc' },
      }),
      platformPrisma.auditLog.count({ where }),
    ]);

    return { logs, total, page, limit };
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
