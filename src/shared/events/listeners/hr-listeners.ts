import { eventBus } from '../event-bus';
import { HR_EVENTS, HREvent } from '../hr-events';
import { notificationService } from '../../../core/notifications/notification.service';
import { logger } from '../../../config/logger';

type EventPayload<T extends HREvent['type']> = Extract<HREvent, { type: T }>;

/**
 * Register HR event listeners that translate domain events into
 * notification dispatch calls. Each listener uses the rule engine via
 * `notificationService.dispatch()`, which resolves the configured template
 * and recipients from NotificationRule rows seeded per tenant.
 */
export function registerHRListeners() {
  // Offer sent/accepted/rejected — notify hiring manager when resolver can find them
  eventBus.onEvent<EventPayload<'offer.sent'>>(HR_EVENTS.OFFER_SENT, async (payload) => {
    logger.info(`Offer ${payload.offerId} sent for candidate ${payload.candidateId}`);
  });

  eventBus.onEvent<EventPayload<'offer.accepted'>>(HR_EVENTS.OFFER_ACCEPTED, async (payload) => {
    logger.info(`Offer ${payload.offerId} accepted by candidate ${payload.candidateId}`);
  });

  eventBus.onEvent<EventPayload<'offer.rejected'>>(HR_EVENTS.OFFER_REJECTED, async (payload) => {
    logger.info(`Offer ${payload.offerId} rejected by candidate ${payload.candidateId}`);
  });

  // Interview scheduled → notify panelists via rule engine (falls back to ad-hoc if no rules).
  eventBus.onEvent<EventPayload<'interview.scheduled'>>(HR_EVENTS.INTERVIEW_SCHEDULED, async (payload) => {
    if (payload.panelistIds?.length > 0) {
      await notificationService.dispatch({
        companyId: payload.companyId,
        triggerEvent: 'INTERVIEW_SCHEDULED',
        entityType: 'Interview',
        entityId: payload.interviewId,
        explicitRecipients: payload.panelistIds,
        tokens: {
          candidate_name: (payload as any).candidateName ?? 'a candidate',
          interview_date: (payload as any).interviewDate ?? '',
        },
        actionUrl: `/company/hr/requisitions`,
        type: 'INTERVIEW_SCHEDULED',
      });
    }
  });

  eventBus.onEvent<EventPayload<'interview.completed'>>(HR_EVENTS.INTERVIEW_COMPLETED, async (payload) => {
    logger.info(`Interview ${payload.interviewId} completed`);
  });

  // Training nomination created → notify employee
  eventBus.onEvent<EventPayload<'training.nomination.created'>>(
    HR_EVENTS.TRAINING_NOMINATION_CREATED,
    async (payload) => {
      await notificationService.dispatch({
        companyId: payload.companyId,
        triggerEvent: 'TRAINING_NOMINATION',
        entityType: 'TrainingNomination',
        entityId: payload.nominationId,
        explicitRecipients: [payload.employeeId],
        tokens: {
          training_name: (payload as any).trainingName ?? 'a training program',
        },
        actionUrl: `/company/hr/my-training`,
        type: 'TRAINING_NOMINATION',
      });
    },
  );

  // Training completed → notify employee
  eventBus.onEvent<EventPayload<'training.completed'>>(HR_EVENTS.TRAINING_COMPLETED, async (payload) => {
    await notificationService.dispatch({
      companyId: payload.companyId,
      triggerEvent: 'TRAINING_COMPLETED',
      entityType: 'TrainingNomination',
      entityId: payload.nominationId,
      explicitRecipients: [payload.employeeId],
      tokens: {
        training_name: payload.trainingName,
      },
      actionUrl: `/company/hr/my-training`,
      type: 'TRAINING_COMPLETED',
    });
  });

  // Certificate expiring → notify employee
  eventBus.onEvent<EventPayload<'certificate.expiring'>>(HR_EVENTS.CERTIFICATE_EXPIRING, async (payload) => {
    await notificationService.dispatch({
      companyId: payload.companyId,
      triggerEvent: 'CERTIFICATE_EXPIRING',
      entityType: 'TrainingNomination',
      entityId: payload.nominationId,
      explicitRecipients: [payload.employeeId],
      tokens: {
        training_name: payload.trainingName,
        expiry_date: payload.expiryDate,
      },
      actionUrl: `/company/hr/my-training`,
      type: 'CERTIFICATE_EXPIRING',
    });
  });

  logger.info('HR event listeners registered');
}
