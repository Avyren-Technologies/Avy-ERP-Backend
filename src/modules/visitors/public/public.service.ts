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

    // If the visitor type requires NDA, fetch the NDA template from VMS config
    let ndaTemplateContent: string | null = null;
    if (visit.visitorType?.requireNda) {
      const vmsConfig = await platformPrisma.visitorManagementConfig.findUnique({
        where: { companyId: visit.companyId },
        select: { ndaTemplateContent: true },
      });
      ndaTemplateContent = vmsConfig?.ndaTemplateContent ?? null;
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
      ndaTemplateContent,
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

    // Get active employees for the company (for host selection dropdown)
    const employees = await platformPrisma.employee.findMany({
      where: {
        companyId: location.companyId,
        status: { in: ['ACTIVE', 'PROBATION', 'CONFIRMED'] },
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: 'asc' },
    });

    return {
      company: location.company,
      plant: { id: location.id, name: location.name, code: location.code },
      visitorTypes,
      employees: employees.map(e => ({
        id: e.id,
        name: `${e.firstName} ${e.lastName}`.trim(),
      })),
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
    visitorEmail?: string | undefined;
    visitorCompany?: string | undefined;
    purpose: string;
    hostEmployeeId?: string | undefined;
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

    // Validate host employee if provided
    let hostEmployeeId = data.hostEmployeeId;
    let hostName: string | undefined;
    if (hostEmployeeId) {
      const hostEmployee = await platformPrisma.employee.findFirst({
        where: { id: hostEmployeeId, companyId },
        select: { id: true, firstName: true, lastName: true },
      });
      if (!hostEmployee) {
        throw ApiError.badRequest('Selected host employee not found. Please contact the facility reception.');
      }
      hostName = `${hostEmployee.firstName} ${hostEmployee.lastName}`.trim();
    }

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
      visitorEmail: data.visitorEmail,
      visitorCompany: data.visitorCompany,
      visitorTypeId,
      purpose: data.purpose as any,
      expectedDate: new Date().toISOString(),
      hostEmployeeId,
      plantId: location.id,
    }, 'system');

    return {
      visitCode: visit.visitCode,
      message: hostEmployeeId
        ? 'Registration submitted. Waiting for host approval.'
        : 'Registration submitted successfully.',
      hostName: hostName ?? undefined,
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
        visitorType: { select: { name: true, code: true, badgeColour: true, requireEscort: true } },
        company: { select: { name: true, displayName: true, logoUrl: true } },
      },
    });

    if (!visit) {
      throw ApiError.notFound('Visit not found.');
    }

    // Badge behavior based on status
    if (visit.status === 'EXPECTED' || visit.status === 'ARRIVED') {
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
        safetyInductionStatus: visit.safetyInductionStatus,
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
   * Get safety induction content for a visit (public — no auth).
   * Returns induction requirements and content based on the visitor type's linked induction.
   */
  async getInductionContent(visitCode: string) {
    const visit = await platformPrisma.visit.findUnique({
      where: { visitCode },
      include: {
        visitorType: {
          select: {
            id: true,
            name: true,
            requireSafetyInduction: true,
            safetyInductionId: true,
          },
        },
      },
    });

    if (!visit) {
      throw ApiError.notFound('Visit not found. Please check your visit code.');
    }

    // If induction is not pending, return current status
    if (visit.safetyInductionStatus !== 'PENDING') {
      return {
        required: false,
        status: visit.safetyInductionStatus,
      };
    }

    // Find the linked safety induction via visitor type
    const inductionId = visit.visitorType?.safetyInductionId;
    let induction = null;

    if (inductionId) {
      induction = await platformPrisma.safetyInduction.findFirst({
        where: { id: inductionId, isActive: true },
        select: {
          id: true,
          name: true,
          type: true,
          contentUrl: true,
          questions: true,
          durationSeconds: true,
          passingScore: true,
        },
      });
    }

    // Fallback: if no specific induction linked, find any active induction for this company
    if (!induction && visit.visitorType?.requireSafetyInduction) {
      induction = await platformPrisma.safetyInduction.findFirst({
        where: { companyId: visit.companyId, isActive: true },
        select: {
          id: true,
          name: true,
          type: true,
          contentUrl: true,
          questions: true,
          durationSeconds: true,
          passingScore: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!induction) {
      return {
        required: true,
        status: 'PENDING',
        message: 'Safety induction is required but no content is configured yet. Please contact the facility.',
      };
    }

    return {
      required: true,
      induction: {
        name: induction.name,
        type: induction.type,
        contentUrl: induction.contentUrl,
        questions: induction.questions,
        durationSeconds: induction.durationSeconds,
        passingScore: induction.passingScore,
      },
    };
  }

  /**
   * Complete safety induction for a visit (public — no auth).
   */
  async completeInduction(visitCode: string, data: { score?: number | undefined; passed: boolean }) {
    const visit = await platformPrisma.visit.findUnique({
      where: { visitCode },
    });

    if (!visit) {
      throw ApiError.notFound('Visit not found.');
    }

    if (visit.safetyInductionStatus !== 'PENDING') {
      throw ApiError.badRequest('Safety induction is not pending for this visit.');
    }

    const updated = await platformPrisma.visit.update({
      where: { visitCode },
      data: {
        safetyInductionStatus: data.passed ? 'COMPLETED' : 'FAILED',
        safetyInductionScore: data.score ?? null,
        safetyInductionTimestamp: new Date(),
      },
    });

    return {
      status: updated.safetyInductionStatus,
      score: updated.safetyInductionScore,
      passed: data.passed,
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
