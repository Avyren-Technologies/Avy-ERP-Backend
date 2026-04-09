import { nanoid } from 'nanoid';
import { platformPrisma } from '../../../config/database';
import { logger } from '../../../config/logger';
import { env } from '../../../config/env';
import { loadActiveRules, type LoadedRule } from './rule-loader';
import { resolveRecipients } from './recipient-resolver';
import { checkDedup } from './dedup';
import { guardBackpressure } from './backpressure';
import { enqueueWithBatching } from './enqueue';
import { renderTemplate } from '../templates/renderer';
import { recordEvent } from '../events/event-emitter';
import { emitSocketEvent } from '../events/socket-emitter';
import type { DispatchInput, DispatchResult, QueueablePayload } from './types';
import type { NotificationChannel, NotificationPriority, NotificationTemplate } from '@prisma/client';

/**
 * Build a synthetic "rule" for ad-hoc dispatches that bypass the rule engine.
 * Used by the legacy facade and by test notifications.
 */
function buildAdHocRules(input: DispatchInput): LoadedRule[] {
  if (!input.adHoc) return [];
  const { title, body, channels, priority } = input.adHoc;
  return channels.map((channel) => ({
    id: `adhoc:${input.triggerEvent}:${channel}`,
    triggerEvent: input.triggerEvent,
    category: null,
    templateId: 'adhoc',
    recipientRole: 'EMPLOYEE',
    channel,
    priority: priority ?? input.priority ?? 'MEDIUM',
    version: 1,
    isSystem: false,
    isActive: true,
    companyId: input.companyId,
    createdAt: new Date(),
    updatedAt: new Date(),
    template: {
      id: 'adhoc',
      name: title,
      code: 'ADHOC',
      subject: title,
      body,
      channel,
      priority: priority ?? input.priority ?? 'MEDIUM',
      version: 1,
      variables: [] as any,
      sensitiveFields: [] as any,
      compiledBody: body,
      compiledSubject: title,
      isSystem: false,
      isActive: true,
      companyId: input.companyId,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as NotificationTemplate,
  } as unknown as LoadedRule));
}

/**
 * Build a minimal fallback rule when no configured rules exist for a trigger event.
 * Guarantees at least an in-app notification so nothing is silently dropped.
 */
function buildFallbackRules(input: DispatchInput): LoadedRule[] {
  const title = input.type ?? input.triggerEvent.replace(/_/g, ' ');
  const body = `Event: ${input.triggerEvent}`;
  return buildAdHocRules({
    ...input,
    adHoc: { title, body, channels: ['IN_APP'], priority: 'LOW' },
  });
}

/**
 * PRIMARY entry point. Synchronous, fast, never throws.
 *
 * Flow:
 *   1. Load rules (or ad-hoc/fallback)
 *   2. Resolve recipients per rule
 *   3. Render template + dedup check per recipient
 *   4. Backpressure guard
 *   5. Write Notification rows (system of record)
 *   6. Emit socket event per recipient
 *   7. Enqueue delivery job with batching awareness
 */
export async function dispatch(input: DispatchInput): Promise<DispatchResult> {
  const traceId = input.traceId ?? nanoid(12);

  if (!env.NOTIFICATIONS_ENABLED) {
    logger.info('NOTIFICATIONS_ENABLED=false — dispatch skipped', { traceId, trigger: input.triggerEvent });
    return { traceId, enqueued: 0, notificationIds: [] };
  }

  try {
    let rules: LoadedRule[] = [];
    if (input.adHoc) {
      rules = buildAdHocRules(input);
    } else {
      rules = await loadActiveRules(input.companyId, input.triggerEvent);
      if (rules.length === 0) {
        logger.warn('No rules for trigger event — using fallback IN_APP rule', {
          traceId,
          trigger: input.triggerEvent,
          companyId: input.companyId,
        });
        rules = buildFallbackRules(input);
      }
    }

    const toEnqueue: QueueablePayload[] = [];
    const createdNotificationIds: string[] = [];
    const recipientCache = new Map<string, string[]>();

    for (const rule of rules) {
      const cacheKey = rule.recipientRole;
      let recipients: string[];
      if (input.explicitRecipients && input.explicitRecipients.length > 0) {
        recipients = input.explicitRecipients;
      } else {
        const cached = recipientCache.get(cacheKey);
        recipients = cached ?? (await resolveRecipients(rule.recipientRole, {
          companyId: input.companyId,
          requesterId: input.recipientContext?.requesterId,
          approverIds: input.recipientContext?.approverIds,
          managerId: input.recipientContext?.managerId,
          departmentId: input.recipientContext?.departmentId,
        }));
        recipientCache.set(cacheKey, recipients);
      }
      if (recipients.length === 0) continue;

      const rendered = renderTemplate(rule.template, input.tokens ?? {});

      // Dedup per recipient
      const accepted: string[] = [];
      for (const userId of recipients) {
        const dup = await checkDedup({
          companyId: input.companyId,
          triggerEvent: input.triggerEvent,
          entityType: input.entityType,
          entityId: input.entityId,
          recipientId: userId,
          payload: rendered,
        });
        if (!dup) accepted.push(userId);
      }
      if (accepted.length === 0) continue;

      const priority: NotificationPriority =
        input.priority ?? rule.priority ?? rule.template.priority ?? 'MEDIUM';

      const guard = await guardBackpressure(priority);
      if (guard === 'DROP') {
        logger.warn('Dispatcher drop — backpressure', { traceId, trigger: input.triggerEvent, priority });
        continue;
      }

      const channelForRule: NotificationChannel = rule.channel;

      // Write Notification rows (system of record)
      const createdRows: Array<{ id: string; userId: string }> = [];
      for (const userId of accepted) {
        try {
          const row = await platformPrisma.notification.create({
            data: {
              userId,
              companyId: input.companyId,
              title: rendered.title,
              body: rendered.body,
              type: input.type ?? rule.triggerEvent,
              category: rule.category ?? null,
              entityType: input.entityType ?? null,
              entityId: input.entityId ?? null,
              data: rendered.data as any,
              actionUrl: input.actionUrl ?? null,
              priority,
              status: 'UNREAD',
              isRead: false,
              deliveryStatus: {
                inApp: 'SENT',
                [channelForRule.toLowerCase()]: channelForRule === 'IN_APP' ? 'SENT' : 'PENDING',
              } as any,
              traceId,
              ruleId: rule.id?.startsWith('adhoc:') ? null : rule.id,
              ruleVersion: rule.version ?? null,
              templateId: rule.template.id === 'adhoc' ? null : rule.template.id,
              templateVersion: rule.template.version ?? null,
              dedupHash: rendered.dedupHash,
            },
            select: { id: true, userId: true },
          });
          createdRows.push(row);
          createdNotificationIds.push(row.id);
        } catch (err) {
          logger.error('Failed to create Notification row', { error: err, userId, traceId });
        }
      }

      // Emit socket events + build queue payloads
      for (const row of createdRows) {
        emitSocketEvent(row.userId, { notificationId: row.id, traceId });

        if (channelForRule !== 'IN_APP') {
          toEnqueue.push({
            notificationId: row.id,
            userId: row.userId,
            channels: [channelForRule],
            priority,
            traceId,
            category: rule.category ?? null,
            entityType: input.entityType ?? null,
            systemCritical: input.systemCritical === true || priority === 'CRITICAL',
          });
        }
      }
    }

    // Enqueue delivery jobs
    for (const payload of toEnqueue) {
      try {
        await enqueueWithBatching(payload);
        for (const channel of payload.channels) {
          await recordEvent({
            notificationId: payload.notificationId,
            channel,
            event: 'ENQUEUED',
            traceId,
            source: 'SYSTEM',
          });
        }
      } catch (err) {
        logger.error('Enqueue failed', { error: err, notificationId: payload.notificationId });
      }
    }

    return { traceId, enqueued: toEnqueue.length, notificationIds: createdNotificationIds };
  } catch (err) {
    logger.error('Dispatcher internal error', { error: err, traceId, trigger: input.triggerEvent });
    return { traceId, enqueued: 0, notificationIds: [], error: String(err) };
  }
}
