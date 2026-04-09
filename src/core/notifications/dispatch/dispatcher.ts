import { nanoid } from 'nanoid';
import { platformPrisma } from '../../../config/database';
import { logger } from '../../../config/logger';
import { env } from '../../../config/env';
import { loadActiveRules, type LoadedRule } from './rule-loader';
import { resolveRecipients } from './recipient-resolver';
import { checkDedup } from './dedup';
import { guardBackpressure } from './backpressure';
import { enqueueWithBatching } from './enqueue';
import { renderTemplate, type RenderedNotification } from '../templates/renderer';
import { recordEvent } from '../events/event-emitter';
import { emitSocketEvent } from '../events/socket-emitter';
import type { DispatchInput, DispatchResult, QueueablePayload } from './types';
import type { NotificationChannel, NotificationPriority, NotificationTemplate, Prisma } from '@prisma/client';

/**
 * Build a synthetic "rule" for ad-hoc dispatches that bypass the rule engine.
 * Used by the legacy facade and by test notifications.
 */
function buildAdHocRules(input: DispatchInput): LoadedRule[] {
  if (!input.adHoc) return [];
  const { title, body, channels, priority } = input.adHoc;
  return channels.map((channel): LoadedRule => {
    const now = new Date();
    const template: NotificationTemplate = {
      id: 'adhoc',
      name: title,
      code: 'ADHOC',
      subject: title,
      body,
      channel,
      priority: priority ?? input.priority ?? 'MEDIUM',
      version: 1,
      variables: [] as Prisma.JsonValue,
      sensitiveFields: [] as Prisma.JsonValue,
      compiledBody: body,
      compiledSubject: title,
      isSystem: false,
      isActive: true,
      companyId: input.companyId,
      createdAt: now,
      updatedAt: now,
    };
    return {
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
      createdAt: now,
      updatedAt: now,
      template,
    };
  });
}

function buildFallbackRules(input: DispatchInput): LoadedRule[] {
  const title = input.type ?? input.triggerEvent.replace(/_/g, ' ');
  const body = `Event: ${input.triggerEvent}`;
  return buildAdHocRules({
    ...input,
    adHoc: { title, body, channels: ['IN_APP'], priority: 'LOW' },
  });
}

interface RecipientBucket {
  userId: string;
  rendered: RenderedNotification;
  channels: NotificationChannel[];
  priority: NotificationPriority;
  category: string | null;
  ruleId: string | null;
  ruleVersion: number | null;
  templateId: string | null;
  templateVersion: number | null;
}

/**
 * PRIMARY entry point. Synchronous, fast, never throws.
 *
 * Flow:
 *   1. Load rules (or ad-hoc/fallback)
 *   2. Group rules by recipient. For each recipient, aggregate all channels
 *      into a single Notification row (the system of record).
 *   3. Render template + dedup check per recipient (using the first rule's
 *      template — rules targeting the same recipient share the same body).
 *   4. Write ONE Notification row per recipient with deliveryStatus reflecting
 *      each channel: IN_APP=SENT (always), others=PENDING.
 *   5. Emit a single socket event per recipient.
 *   6. Enqueue ONE delivery job per recipient with all non-IN_APP channels.
 */
export async function dispatch(input: DispatchInput): Promise<DispatchResult> {
  const traceId = input.traceId ?? nanoid(12);

  if (!env.NOTIFICATIONS_ENABLED) {
    logger.info('NOTIFICATIONS_ENABLED=false — dispatch skipped', { traceId, trigger: input.triggerEvent });
    return { traceId, enqueued: 0, notificationIds: [] };
  }

  try {
    // Load rules (or synthesize ad-hoc/fallback)
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

    // Group by recipient → aggregated RecipientBucket
    const recipientCache = new Map<string, string[]>();
    const buckets = new Map<string, RecipientBucket>();

    for (const rule of rules) {
      // Resolve recipients for this rule (cached per recipientRole)
      let recipients: string[];
      if (input.explicitRecipients && input.explicitRecipients.length > 0) {
        recipients = input.explicitRecipients;
      } else {
        const cached = recipientCache.get(rule.recipientRole);
        recipients = cached ?? (await resolveRecipients(rule.recipientRole, {
          companyId: input.companyId,
          requesterId: input.recipientContext?.requesterId,
          approverIds: input.recipientContext?.approverIds,
          managerId: input.recipientContext?.managerId,
          departmentId: input.recipientContext?.departmentId,
        }));
        recipientCache.set(rule.recipientRole, recipients);
      }
      if (recipients.length === 0) continue;

      for (const userId of recipients) {
        const existing = buckets.get(userId);
        if (existing) {
          // Merge: add this rule's channel to the user's bucket (deduplicated).
          if (!existing.channels.includes(rule.channel)) {
            existing.channels.push(rule.channel);
          }
          // Upgrade priority if this rule is higher priority
          const thisPriority: NotificationPriority =
            input.priority ?? rule.priority ?? rule.template.priority ?? 'MEDIUM';
          if (priorityRank(thisPriority) > priorityRank(existing.priority)) {
            existing.priority = thisPriority;
          }
        } else {
          const rendered = renderTemplate(rule.template, input.tokens ?? {});
          buckets.set(userId, {
            userId,
            rendered,
            channels: [rule.channel],
            priority: input.priority ?? rule.priority ?? rule.template.priority ?? 'MEDIUM',
            category: rule.category ?? null,
            ruleId: rule.id?.startsWith('adhoc:') ? null : rule.id,
            ruleVersion: rule.version ?? null,
            templateId: rule.template.id === 'adhoc' ? null : rule.template.id,
            templateVersion: rule.template.version ?? null,
          });
        }
      }
    }

    if (buckets.size === 0) {
      return { traceId, enqueued: 0, notificationIds: [] };
    }

    // Dedup + create rows + emit sockets + enqueue, all per recipient
    const createdNotificationIds: string[] = [];
    const toEnqueue: QueueablePayload[] = [];

    for (const bucket of buckets.values()) {
      // Dedup on (companyId, triggerEvent, entityType, entityId, userId, payloadHash)
      const dup = await checkDedup({
        companyId: input.companyId,
        triggerEvent: input.triggerEvent,
        entityType: input.entityType,
        entityId: input.entityId,
        recipientId: bucket.userId,
        payload: bucket.rendered,
      });
      if (dup) continue;

      const guard = await guardBackpressure(bucket.priority);
      if (guard === 'DROP') {
        logger.warn('Dispatcher drop — backpressure', {
          traceId,
          trigger: input.triggerEvent,
          priority: bucket.priority,
        });
        continue;
      }

      // Build deliveryStatus: IN_APP always SENT, rest PENDING
      const deliveryStatus: Record<string, string> = { inApp: 'SENT' };
      for (const channel of bucket.channels) {
        if (channel !== 'IN_APP') {
          deliveryStatus[channel.toLowerCase()] = 'PENDING';
        }
      }

      let row: { id: string; userId: string };
      try {
        row = await platformPrisma.notification.create({
          data: {
            userId: bucket.userId,
            companyId: input.companyId,
            title: bucket.rendered.title,
            body: bucket.rendered.body,
            type: input.type ?? input.triggerEvent,
            category: bucket.category,
            entityType: input.entityType ?? null,
            entityId: input.entityId ?? null,
            data: bucket.rendered.data as Prisma.InputJsonValue,
            actionUrl: input.actionUrl ?? null,
            priority: bucket.priority,
            status: 'UNREAD',
            isRead: false,
            deliveryStatus: deliveryStatus as Prisma.InputJsonValue,
            traceId,
            ruleId: bucket.ruleId,
            ruleVersion: bucket.ruleVersion,
            templateId: bucket.templateId,
            templateVersion: bucket.templateVersion,
            dedupHash: bucket.rendered.dedupHash,
          },
          select: { id: true, userId: true },
        });
      } catch (err) {
        logger.error('Failed to create Notification row', {
          error: err,
          userId: bucket.userId,
          traceId,
        });
        continue;
      }

      createdNotificationIds.push(row.id);
      emitSocketEvent(row.userId, { notificationId: row.id, traceId });

      // Enqueue one job for all non-IN_APP channels (IN_APP is already delivered)
      const deliveryChannels = bucket.channels.filter((c) => c !== 'IN_APP');
      if (deliveryChannels.length > 0) {
        toEnqueue.push({
          notificationId: row.id,
          userId: row.userId,
          channels: deliveryChannels,
          priority: bucket.priority,
          traceId,
          category: bucket.category,
          entityType: input.entityType ?? null,
          systemCritical: input.systemCritical === true || bucket.priority === 'CRITICAL',
        });
      }
    }

    // Enqueue with batching
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

function priorityRank(p: NotificationPriority): number {
  switch (p) {
    case 'CRITICAL': return 4;
    case 'HIGH': return 3;
    case 'MEDIUM': return 2;
    case 'LOW': return 1;
    default: return 0;
  }
}
