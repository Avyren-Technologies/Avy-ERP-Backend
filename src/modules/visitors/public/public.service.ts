import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { logger } from '../../../config/logger';
import { n } from '../../../shared/utils/prisma-helpers';

export class VisitorPublicService {
  /**
   * Get visit details for pre-arrival form (public — no auth).
   * Returns limited visitor + visit info for the visitor to fill out before arrival.
   */
  async getVisitByCode(visitCode: string) {
    const visit = await platformPrisma.visit.findUnique({
      where: { visitCode },
      include: {
        visitorType: { select: { name: true, code: true, badgeColour: true, requirePhoto: true, requireIdVerification: true, requireNda: true } },
        company: { select: { name: true, displayName: true, logoUrl: true } },
      },
    });

    if (!visit) {
      throw ApiError.notFound('Visit not found. Please check your visit code.');
    }

    // Return only what the visitor needs to see
    return {
      visitCode: visit.visitCode,
      visitorName: visit.visitorName,
      visitorEmail: visit.visitorEmail,
      visitorCompany: visit.visitorCompany,
      expectedDate: visit.expectedDate,
      expectedTime: visit.expectedTime,
      purpose: visit.purpose,
      status: visit.status,
      approvalStatus: visit.approvalStatus,
      visitorType: visit.visitorType,
      company: visit.company,
    };
  }

  /**
   * Submit pre-arrival form data (public — no auth).
   * Visitor fills in additional details before arriving.
   */
  async submitPreArrivalForm(visitCode: string, data: {
    visitorPhoto?: string | undefined;
    governmentIdType?: string | undefined;
    governmentIdNumber?: string | undefined;
    idDocumentPhoto?: string | undefined;
    vehicleRegNumber?: string | undefined;
    vehicleType?: string | undefined;
    emergencyContact?: string | undefined;
    ndaSigned?: boolean | undefined;
  }) {
    const visit = await platformPrisma.visit.findUnique({
      where: { visitCode },
    });

    if (!visit) {
      throw ApiError.notFound('Visit not found.');
    }

    if (visit.status !== 'EXPECTED') {
      throw ApiError.badRequest('This visit is no longer accepting pre-arrival information.');
    }

    const updateData: Record<string, any> = {};
    if (data.visitorPhoto !== undefined) updateData.visitorPhoto = data.visitorPhoto;
    if (data.governmentIdType !== undefined) updateData.governmentIdType = data.governmentIdType;
    if (data.governmentIdNumber !== undefined) updateData.governmentIdNumber = data.governmentIdNumber;
    if (data.idDocumentPhoto !== undefined) updateData.idDocumentPhoto = data.idDocumentPhoto;
    if (data.vehicleRegNumber !== undefined) updateData.vehicleRegNumber = data.vehicleRegNumber;
    if (data.vehicleType !== undefined) updateData.vehicleType = data.vehicleType;
    if (data.emergencyContact !== undefined) updateData.emergencyContact = data.emergencyContact;
    if (data.ndaSigned !== undefined) updateData.ndaSigned = data.ndaSigned;

    await platformPrisma.visit.update({
      where: { visitCode },
      data: updateData,
    });

    return { success: true, message: 'Pre-arrival information submitted successfully.' };
  }

  /**
   * Get self-registration form config for a plant/gate (public — no auth).
   * Returns the form configuration for the QR poster self-registration.
   */
  async getSelfRegistrationConfig(plantCode: string) {
    // Find location by code
    const location = await platformPrisma.location.findFirst({
      where: { code: plantCode, status: 'Active' },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            displayName: true,
            logoUrl: true,
          },
        },
      },
    });

    if (!location) {
      throw ApiError.notFound('Facility not found. Please check the QR code.');
    }

    // Get VMS config for the company
    const config = await platformPrisma.visitorManagementConfig.findUnique({
      where: { companyId: location.companyId },
    });

    if (!config?.qrSelfRegistrationEnabled) {
      throw ApiError.badRequest('Self-registration is not enabled at this facility.');
    }

    // Get active visitor types for this company
    const visitorTypes = await platformPrisma.visitorType.findMany({
      where: { companyId: location.companyId, isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      company: location.company,
      plant: { id: location.id, name: location.name, code: location.code },
      visitorTypes,
      config: {
        photoRequired: config.photoCapture === 'ALWAYS',
        privacyConsentText: config.privacyConsentText,
      },
    };
  }

  /**
   * Submit self-registration (public — no auth).
   * Visitor scans QR poster and fills in their details.
   */
  async submitSelfRegistration(plantCode: string, data: {
    visitorName: string;
    visitorMobile: string;
    visitorCompany?: string | undefined;
    purpose: string;
    hostEmployeeName: string;
    visitorPhoto?: string | undefined;
    visitorTypeId?: string | undefined;
  }) {
    // Find location
    const location = await platformPrisma.location.findFirst({
      where: { code: plantCode, status: 'Active' },
    });

    if (!location) {
      throw ApiError.notFound('Facility not found.');
    }

    const companyId = location.companyId;

    // Try to find host employee by name (fuzzy match)
    const employees = await platformPrisma.employee.findMany({
      where: {
        companyId,
        status: { in: ['ACTIVE', 'PROBATION', 'CONFIRMED'] },
        OR: [
          { firstName: { contains: data.hostEmployeeName, mode: 'insensitive' } },
          { lastName: { contains: data.hostEmployeeName, mode: 'insensitive' } },
        ],
      },
      take: 5,
      select: { id: true, firstName: true, lastName: true, departmentId: true },
    });

    if (employees.length === 0) {
      throw ApiError.badRequest(`Could not find employee "${data.hostEmployeeName}". Please contact the facility reception.`);
    }

    const hostEmployee = employees[0]!; // Best match (guaranteed by length check above)

    // Get default visitor type if not specified
    let visitorTypeId = data.visitorTypeId;
    if (!visitorTypeId) {
      const defaultType = await platformPrisma.visitorType.findFirst({
        where: { companyId, code: 'BG', isActive: true },
      });
      visitorTypeId = defaultType?.id;
    }

    if (!visitorTypeId) {
      throw ApiError.badRequest('No visitor types configured. Please contact the facility reception.');
    }

    // Import visit service to create the registration
    const { visitService } = await import('../core/visit.service');

    const visit = await visitService.createVisit(companyId, {
      visitorName: data.visitorName,
      visitorMobile: data.visitorMobile,
      visitorCompany: data.visitorCompany,
      visitorTypeId,
      purpose: data.purpose as any,
      expectedDate: new Date().toISOString(),
      hostEmployeeId: hostEmployee.id,
      plantId: location.id,
    }, 'system');

    return {
      visitCode: visit.visitCode,
      message: 'Registration submitted. Waiting for host approval.',
      hostName: `${hostEmployee.firstName} ${hostEmployee.lastName}`,
    };
  }

  /**
   * Get visit approval status (public — no auth).
   */
  async getVisitStatus(visitCode: string) {
    const visit = await platformPrisma.visit.findUnique({
      where: { visitCode },
      select: {
        visitCode: true,
        visitorName: true,
        status: true,
        approvalStatus: true,
        expectedDate: true,
        expectedTime: true,
      },
    });

    if (!visit) {
      throw ApiError.notFound('Visit not found.');
    }

    return visit;
  }

  /**
   * Get digital badge (public — no auth).
   * Returns badge information based on visit status.
   */
  async getDigitalBadge(visitCode: string) {
    const visit = await platformPrisma.visit.findUnique({
      where: { visitCode },
      include: {
        visitorType: { select: { name: true, code: true, badgeColour: true } },
        company: { select: { name: true, displayName: true, logoUrl: true } },
      },
    });

    if (!visit) {
      throw ApiError.notFound('Visit not found.');
    }

    // Badge behavior based on status
    if (visit.status === 'EXPECTED') {
      return {
        status: 'NOT_STARTED',
        message: 'Visit not yet started. Please check in at the gate.',
      };
    }

    if (visit.status === 'CHECKED_IN') {
      return {
        status: 'ACTIVE',
        visitorName: visit.visitorName,
        visitorCompany: visit.visitorCompany,
        badgeNumber: visit.badgeNumber,
        visitorType: visit.visitorType,
        company: visit.company,
        checkInTime: visit.checkInTime,
        expectedDurationMinutes: visit.expectedDurationMinutes,
        qrCodeData: visit.visitCode,
      };
    }

    if (['CHECKED_OUT', 'AUTO_CHECKED_OUT'].includes(visit.status)) {
      return {
        status: 'ENDED',
        message: 'Visit ended.',
        visitorName: visit.visitorName,
        visitDate: visit.expectedDate,
      };
    }

    if (['CANCELLED', 'REJECTED'].includes(visit.status)) {
      return {
        status: 'CANCELLED',
        message: 'This visit has been cancelled.',
      };
    }

    return {
      status: visit.status,
      message: 'Visit status: ' + visit.status,
    };
  }

  /**
   * Self check-out (public — no auth).
   * Visitor clicks check-out link from SMS.
   * Uses atomic conditional update to prevent race conditions.
   */
  async selfCheckOut(visitCode: string) {
    const result = await platformPrisma.$executeRaw`
      UPDATE visits SET status = 'CHECKED_OUT', "checkOutTime" = NOW(), "checkOutMethod" = 'MOBILE_LINK',
      "visitDurationMinutes" = EXTRACT(EPOCH FROM (NOW() - "checkInTime"))::int / 60
      WHERE "visitCode" = ${visitCode} AND status = 'CHECKED_IN'
    `;

    if (result === 0) {
      throw ApiError.badRequest('This visit is not currently checked in or has already been checked out.');
    }

    const visit = await platformPrisma.visit.findUnique({
      where: { visitCode },
      select: { checkOutTime: true, visitDurationMinutes: true },
    });

    return {
      message: 'You have been checked out. Thank you for visiting!',
      checkOutTime: visit?.checkOutTime,
      visitDurationMinutes: visit?.visitDurationMinutes,
    };
  }
}

export const visitorPublicService = new VisitorPublicService();
