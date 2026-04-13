import { eventBus } from '../event-bus';
import { HR_EVENTS, HREvent } from '../hr-events';
import { notificationService } from '../../../core/notifications/notification.service';
import { logger } from '../../../config/logger';
import { platformPrisma } from '../../../config/database';

type EventPayload<T extends HREvent['type']> = Extract<HREvent, { type: T }>;

/** Resolve an Employee ID to its linked User ID (returns undefined if none). */
async function resolveEmployeeUserId(employeeId: string): Promise<string | undefined> {
  const employee = await platformPrisma.employee.findUnique({
    where: { id: employeeId },
    select: { user: { select: { id: true } } },
  });
  return employee?.user?.id;
}

/**
 * Register HR event listeners that translate domain events into
 * notification dispatch calls. Each listener uses the rule engine via
 * `notificationService.dispatch()`, which resolves the configured template
 * and recipients from NotificationRule rows seeded per tenant.
 */
export function registerHRListeners() {
  // Candidate stage change → notify HR team via rule engine.
  eventBus.onEvent<EventPayload<'candidate.stage_changed'>>(
    HR_EVENTS.CANDIDATE_STAGE_CHANGED,
    async (payload) => {
      try {
        await notificationService.dispatch({
          companyId: payload.companyId,
          triggerEvent: 'CANDIDATE_STAGE_CHANGED',
          entityType: 'Candidate',
          entityId: payload.candidateId,
          tokens: {
            from_stage: payload.fromStage,
            to_stage: payload.toStage,
          },
          type: 'RECRUITMENT',
          actionUrl: `/company/hr/recruitment/candidates/${payload.candidateId}`,
        });
      } catch (err) {
        logger.warn('Candidate stage changed dispatch failed', { error: err, payload });
      }
    },
  );

  // Offer sent → notify HR team via rule engine.
  eventBus.onEvent<EventPayload<'offer.sent'>>(HR_EVENTS.OFFER_SENT, async (payload) => {
    try {
      await notificationService.dispatch({
        companyId: payload.companyId,
        triggerEvent: 'OFFER_SENT',
        entityType: 'CandidateOffer',
        entityId: payload.offerId,
        tokens: { candidate_id: payload.candidateId },
        type: 'RECRUITMENT',
        actionUrl: `/company/hr/recruitment/offers/${payload.offerId}`,
      });
    } catch (err) {
      logger.warn('Offer sent dispatch failed', { error: err, payload });
    }
  });

  eventBus.onEvent<EventPayload<'offer.accepted'>>(HR_EVENTS.OFFER_ACCEPTED, async (payload) => {
    try {
      await notificationService.dispatch({
        companyId: payload.companyId,
        triggerEvent: 'OFFER_ACCEPTED',
        entityType: 'CandidateOffer',
        entityId: payload.offerId,
        tokens: { candidate_id: payload.candidateId },
        priority: 'HIGH',
        type: 'RECRUITMENT',
        actionUrl: `/company/hr/recruitment/offers/${payload.offerId}`,
      });
    } catch (err) {
      logger.warn('Offer accepted dispatch failed', { error: err, payload });
    }
  });

  eventBus.onEvent<EventPayload<'offer.rejected'>>(HR_EVENTS.OFFER_REJECTED, async (payload) => {
    try {
      await notificationService.dispatch({
        companyId: payload.companyId,
        triggerEvent: 'OFFER_REJECTED',
        entityType: 'CandidateOffer',
        entityId: payload.offerId,
        tokens: { candidate_id: payload.candidateId },
        type: 'RECRUITMENT',
        actionUrl: `/company/hr/recruitment/offers/${payload.offerId}`,
      });
    } catch (err) {
      logger.warn('Offer rejected dispatch failed', { error: err, payload });
    }
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
        type: 'RECRUITMENT',
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
      const userId = await resolveEmployeeUserId(payload.employeeId);
      if (!userId) {
        logger.warn('Training nomination dispatch skipped — no linked user', { employeeId: payload.employeeId });
        return;
      }
      await notificationService.dispatch({
        companyId: payload.companyId,
        triggerEvent: 'TRAINING_NOMINATION',
        entityType: 'TrainingNomination',
        entityId: payload.nominationId,
        explicitRecipients: [userId],
        tokens: {
          training_name: (payload as any).trainingName ?? 'a training program',
        },
        actionUrl: `/company/hr/my-training`,
        type: 'TRAINING',
      });
    },
  );

  // Training completed → notify employee
  eventBus.onEvent<EventPayload<'training.completed'>>(HR_EVENTS.TRAINING_COMPLETED, async (payload) => {
    const userId = await resolveEmployeeUserId(payload.employeeId);
    if (!userId) {
      logger.warn('Training completed dispatch skipped — no linked user', { employeeId: payload.employeeId });
      return;
    }
    await notificationService.dispatch({
      companyId: payload.companyId,
      triggerEvent: 'TRAINING_COMPLETED',
      entityType: 'TrainingNomination',
      entityId: payload.nominationId,
      explicitRecipients: [userId],
      tokens: {
        training_name: payload.trainingName,
      },
      actionUrl: `/company/hr/my-training`,
      type: 'TRAINING',
    });
  });

  // Certificate expiring → notify employee
  eventBus.onEvent<EventPayload<'certificate.expiring'>>(HR_EVENTS.CERTIFICATE_EXPIRING, async (payload) => {
    const userId = await resolveEmployeeUserId(payload.employeeId);
    if (!userId) {
      logger.warn('Certificate expiring dispatch skipped — no linked user', { employeeId: payload.employeeId });
      return;
    }
    await notificationService.dispatch({
      companyId: payload.companyId,
      triggerEvent: 'CERTIFICATE_EXPIRING',
      entityType: 'TrainingNomination',
      entityId: payload.nominationId,
      explicitRecipients: [userId],
      tokens: {
        training_name: payload.trainingName,
        expiry_date: payload.expiryDate,
      },
      actionUrl: `/company/hr/my-training`,
      type: 'TRAINING',
    });
  });

  logger.info('HR event listeners registered');
}
