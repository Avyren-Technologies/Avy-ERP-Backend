import { eventBus } from '../event-bus';
import { HR_EVENTS } from '../hr-events';
import { notificationService } from '../../../core/notifications/notification.service';
import { logger } from '../../../config/logger';

export function registerHRListeners() {
  // Offer sent → notify hiring manager
  eventBus.onEvent(HR_EVENTS.OFFER_SENT, async (payload: any) => {
    // We'd need to look up the hiring manager for the requisition
    // For now, just log — the notification infrastructure is ready
    logger.info(`Offer ${payload.offerId} sent for candidate ${payload.candidateId}`);
  });

  // Offer accepted → notify hiring manager + HR
  eventBus.onEvent(HR_EVENTS.OFFER_ACCEPTED, async (payload: any) => {
    logger.info(`Offer ${payload.offerId} accepted by candidate ${payload.candidateId}`);
    // notificationService.send() can be called here when we know recipient IDs
  });

  // Offer rejected → notify hiring manager
  eventBus.onEvent(HR_EVENTS.OFFER_REJECTED, async (payload: any) => {
    logger.info(`Offer ${payload.offerId} rejected by candidate ${payload.candidateId}`);
  });

  // Interview scheduled → notify panelists
  eventBus.onEvent(HR_EVENTS.INTERVIEW_SCHEDULED, async (payload: any) => {
    if (payload.panelistIds?.length > 0) {
      await notificationService.send({
        recipientIds: payload.panelistIds,
        title: 'Interview Scheduled',
        body: 'You have been assigned as a panelist for an upcoming interview.',
        type: 'INTERVIEW_SCHEDULED',
        entityType: 'Interview',
        entityId: payload.interviewId,
        channels: ['in_app', 'push'],
        companyId: payload.companyId,
      });
    }
  });

  // Interview completed → notify (optional, log for now)
  eventBus.onEvent(HR_EVENTS.INTERVIEW_COMPLETED, async (payload: any) => {
    logger.info(`Interview ${payload.interviewId} completed`);
  });

  // Training nomination created → notify employee
  eventBus.onEvent(HR_EVENTS.TRAINING_NOMINATION_CREATED, async (payload: any) => {
    await notificationService.send({
      recipientIds: [payload.employeeId],
      title: 'Training Nomination',
      body: 'You have been nominated for a training program.',
      type: 'TRAINING_NOMINATION',
      entityType: 'TrainingNomination',
      entityId: payload.nominationId,
      channels: ['in_app', 'push'],
      companyId: payload.companyId,
    });
  });

  // Training completed → notify employee
  eventBus.onEvent(HR_EVENTS.TRAINING_COMPLETED, async (payload: any) => {
    await notificationService.send({
      recipientIds: [payload.employeeId],
      title: 'Training Completed',
      body: `Congratulations! You have completed "${payload.trainingName}".`,
      type: 'TRAINING_COMPLETED',
      entityType: 'TrainingNomination',
      entityId: payload.nominationId,
      channels: ['in_app', 'push'],
      companyId: payload.companyId,
    });
  });

  // Certificate expiring → notify employee
  eventBus.onEvent(HR_EVENTS.CERTIFICATE_EXPIRING, async (payload: any) => {
    await notificationService.send({
      recipientIds: [payload.employeeId],
      title: 'Certificate Expiring Soon',
      body: `Your "${payload.trainingName}" certificate expires on ${payload.expiryDate}.`,
      type: 'CERTIFICATE_EXPIRING',
      entityType: 'TrainingNomination',
      entityId: payload.nominationId,
      channels: ['in_app', 'push'],
      companyId: payload.companyId,
    });
  });

  logger.info('HR event listeners registered');
}
