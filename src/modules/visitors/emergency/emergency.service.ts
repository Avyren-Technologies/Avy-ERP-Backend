import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { logger } from '../../../config/logger';

class EmergencyService {

  async triggerEmergency(companyId: string, plantId: string, triggeredBy: string, isDrill: boolean = false) {
    // Get all on-site visitors
    const onSiteVisitors = await platformPrisma.visit.findMany({
      where: { companyId, plantId, status: 'CHECKED_IN' },
      include: { visitorType: true, checkInGate: true },
    });

    // Send SMS to all on-site visitors (if not a drill)
    if (!isDrill) {
      try {
        const { notificationService } = await import('../../../core/notifications/notification.service');
        for (const visitor of onSiteVisitors) {
          await notificationService.dispatch({
            companyId,
            triggerEvent: 'VMS_EMERGENCY_EVACUATION',
            entityType: 'visit',
            entityId: visitor.id,
            tokens: {
              visitorName: visitor.visitorName,
              companyName: '',
            },
            type: 'critical',
          });
        }
      } catch (err) {
        logger.warn('Failed to dispatch some emergency notifications', { error: err });
      }
    }

    logger.info('Emergency triggered', {
      companyId,
      plantId,
      triggeredBy,
      isDrill,
      totalOnSite: onSiteVisitors.length,
    });

    return {
      emergency: true,
      isDrill,
      triggeredBy,
      plantId,
      totalOnSite: onSiteVisitors.length,
      musterList: onSiteVisitors.map(v => ({
        id: v.id,
        visitorName: v.visitorName,
        visitorCompany: v.visitorCompany,
        visitorPhoto: v.visitorPhoto,
        visitorType: v.visitorType?.name,
        badgeNumber: v.badgeNumber,
        hostEmployeeId: v.hostEmployeeId,
        checkInTime: v.checkInTime,
        checkInGate: v.checkInGate?.name,
        marshalStatus: 'UNKNOWN',
      })),
    };
  }

  async getMusterList(companyId: string, plantId?: string | undefined) {
    const where: any = { companyId, status: 'CHECKED_IN' };
    if (plantId) where.plantId = plantId;
    const visitors = await platformPrisma.visit.findMany({
      where,
      include: { visitorType: true, checkInGate: true },
    });

    return visitors.map(v => ({
      id: v.id,
      visitorName: v.visitorName,
      visitorCompany: v.visitorCompany,
      visitorPhoto: v.visitorPhoto,
      visitorType: v.visitorType?.name,
      badgeColour: v.visitorType?.badgeColour,
      badgeNumber: v.badgeNumber,
      hostEmployeeId: v.hostEmployeeId,
      checkInTime: v.checkInTime,
      checkInGate: v.checkInGate?.name,
      visitorMobile: v.visitorMobile,
    }));
  }

  async markSafe(companyId: string, visitIds: string[], markedBy: string) {
    // Validate all visit IDs belong to the company
    const visits = await platformPrisma.visit.findMany({
      where: { id: { in: visitIds }, companyId, status: 'CHECKED_IN' },
      select: { id: true, visitorName: true, specialInstructions: true },
    });

    if (visits.length === 0) {
      throw ApiError.badRequest('No valid checked-in visits found for the provided IDs');
    }

    const markedAt = new Date().toISOString();

    // Persist safe status in specialInstructions for each visit
    for (const visit of visits) {
      const safeNote = `[EMERGENCY MUSTER] Marked SAFE by ${markedBy} at ${markedAt}`;
      const updatedInstructions = visit.specialInstructions
        ? `${visit.specialInstructions}\n${safeNote}`
        : safeNote;

      await platformPrisma.visit.update({
        where: { id: visit.id },
        data: { specialInstructions: updatedInstructions },
      });
    }

    logger.info('Visitors marked safe during emergency', {
      companyId,
      markedBy,
      visitIds: visits.map(v => v.id),
      visitorNames: visits.map(v => v.visitorName),
      markedAt,
    });

    return {
      markedSafe: visits.length,
      visitors: visits.map(v => ({ id: v.id, visitorName: v.visitorName })),
    };
  }

  async resolveEmergency(companyId: string, plantId: string, resolvedBy: string) {
    logger.info('Emergency resolved', {
      companyId,
      plantId,
      resolvedBy,
      resolvedAt: new Date().toISOString(),
    });

    return { resolved: true, resolvedAt: new Date().toISOString() };
  }
}

export const emergencyService = new EmergencyService();
