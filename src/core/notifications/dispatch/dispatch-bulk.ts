import { nanoid } from 'nanoid';
import type { NotificationChannel, NotificationPriority, Prisma } from '@prisma/client';
import { platformPrisma } from '../../../config/database';
import { env } from '../../../config/env';
import { logger } from '../../../config/logger';
import { loadActiveRules, type LoadedRule } from './rule-loader';
import { renderTemplate } from '../templates/renderer';
import { checkUserRateLimit, checkTenantRateLimit } from './rate-limiter';
import { checkDedup } from './dedup';
import { pickQueueByPriority } from '../queue/queues';
import { emitSocketEvent } from '../events/socket-emitter';
import { recordEvent } from '../events/event-emitter';
import { notificationMetrics } from '../metrics/notification-metrics';
import type { NotificationTemplate } from '@prisma/client';

export interface DispatchBulkInput {
  companyId: string;
  triggerEvent: string;
  type?: string;
  entityType?: string;
  entityId?: string;
  recipients: Array<{ userId: string; tokens?: Record<string, unknown> }>;
  sharedTokens?: Record<string, unknown>;
  priority?: NotificationPriority;
  systemCritical?: boolean;
  actionUrl?: string;
  chunkSize?: number;
}

export interface DispatchBulkResult {
  traceId: string;
  enqueued: number;
  skipped: number;
  notificationIds: string[];
}

/**
 * High-fanout dispatch utility. Required for recipients.length >= 20
 * (e.g. payroll fanouts, ALL-role dispatches, cron fanouts).
 *
 * Optimizations over looping `dispatch()` per recipient:
 *   1. Loads rules ONCE (not N times)
 *   2. Uses Prisma `createManyAndReturn` for batched row insertion
 *   3. Chunks BullMQ jobs into groups of `chunkSize` (default 50)
 *   4. Backpressure awareness — throttles LOW/MEDIUM when queue is overloaded
 *   5. Tenant + user rate limit enforcement before any DB writes
 *
 * Fallback: if no rules exist for the trigger event, delegates to per-recipient
 * `dispatch()` via the normal fallback path (so nothing is silently lost).
 */
export async function dispatchBulk(input: DispatchBulkInput): Promise<DispatchBulkResult> {
  const traceId = nanoid(12);
  const chunkSize = input.chunkSize ?? env.NOTIFICATIONS_BULK_CHUNK_SIZE;
  const priority: NotificationPriority = input.priority ?? 'MEDIUM';

  if (!env.NOTIFICATIONS_ENABLED) {
    return { traceId, enqueued: 0, skipped: 0, notificationIds: [] };
  }

  // Tenant-level rate limit (single check, not per-recipient)
  const tenantAllowed = await checkTenantRateLimit(input.companyId, priority);
  if (!tenantAllowed) {
    logger.warn('Bulk dispatch dropped — tenant rate limit', {
      traceId,
      companyId: input.companyId,
      recipients: input.recipients.length,
    });
    return { traceId, enqueued: 0, skipped: input.recipients.length, notificationIds: [] };
  }

  try {
    // 1. Load rules once
    let rules = await loadActiveRules(input.companyId, input.triggerEvent);
    if (rules.length === 0) {
      // No rules for this trigger — synthesize an in-process IN_APP fallback
      // rule so the bulk fanout still produces a Notification row per recipient.
      // This avoids C2 (double-incrementing the tenant rate limit via re-entering
      // dispatch()) and C3 (sequential N-recipient dispatch loop that blocks the
      // event loop for large fanouts).
      logger.warn('dispatchBulk: no rules — synthesizing IN_APP fallback rule', {
        traceId,
        triggerEvent: input.triggerEvent,
        companyId: input.companyId,
        recipients: input.recipients.length,
      });
      rules = [buildFallbackRule(input)];
    }

    // 2. Aggregate ALL channels from all rules. The first rule provides
    //    the template for rendering; additional rules contribute their
    //    channels to the delivery set. This mirrors what the single
    //    dispatch() does per-recipient with its RecipientBucket merge.
    const primaryRule = rules[0]!;
    const allChannels = Array.from(new Set(rules.map((r) => r.channel)));
    const nonInAppChannels = allChannels.filter((c) => c !== 'IN_APP');
    const effectivePriority: NotificationPriority =
      priority ?? primaryRule.priority ?? primaryRule.template.priority ?? 'MEDIUM';

    if (allChannels.length > 1) {
      logger.info('dispatchBulk: aggregated channels from multiple rules', {
        traceId,
        triggerEvent: input.triggerEvent,
        channels: allChannels,
      });
    }

    // 3. Rate-limit filter (per-recipient)
    const allowedRecipients: typeof input.recipients = [];
    for (const r of input.recipients) {
      const ok = await checkUserRateLimit(r.userId, priority);
      if (ok) allowedRecipients.push(r);
    }
    const rateDropped = input.recipients.length - allowedRecipients.length;

    if (allowedRecipients.length === 0) {
      return { traceId, enqueued: 0, skipped: rateDropped, notificationIds: [] };
    }

    // 4. Build per-recipient Notification rows with dedup filter
    const createInputs: Prisma.NotificationCreateManyInput[] = [];
    let dedupDropped = 0;

    for (const r of allowedRecipients) {
      const tokens = { ...(input.sharedTokens ?? {}), ...(r.tokens ?? {}) };
      const rendered = renderTemplate(primaryRule.template, tokens);
      const dup = await checkDedup({
        companyId: input.companyId,
        triggerEvent: input.triggerEvent,
        entityType: input.entityType,
        entityId: input.entityId,
        recipientId: r.userId,
        payload: rendered,
      });
      if (dup) {
        dedupDropped++;
        continue;
      }

      // Build deliveryStatus reflecting ALL channels: IN_APP=SENT (instant),
      // every other channel=PENDING (delivered async by the worker).
      const deliveryStatus: Record<string, string> = { inApp: 'SENT' };
      for (const ch of nonInAppChannels) {
        deliveryStatus[ch.toLowerCase()] = 'PENDING';
      }

      createInputs.push({
        userId: r.userId,
        companyId: input.companyId,
        title: rendered.title,
        body: rendered.body,
        type: input.type ?? input.triggerEvent,
        category: primaryRule.category ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        data: rendered.data as Prisma.InputJsonValue,
        actionUrl: input.actionUrl ?? null,
        priority: effectivePriority,
        status: 'UNREAD',
        isRead: false,
        deliveryStatus: deliveryStatus as Prisma.InputJsonValue,
        traceId,
        ruleId: primaryRule.isAdHoc ? null : primaryRule.id,
        ruleVersion: primaryRule.isAdHoc ? null : (primaryRule.version ?? null),
        templateId: primaryRule.isAdHoc ? null : primaryRule.template.id,
        templateVersion: primaryRule.isAdHoc ? null : (primaryRule.template.version ?? null),
        dedupHash: rendered.dedupHash,
      });
    }

    const totalSkipped = rateDropped + dedupDropped;

    if (createInputs.length === 0) {
      return { traceId, enqueued: 0, skipped: totalSkipped, notificationIds: [] };
    }

    // 5. Batch insert
    const createdRows = await platformPrisma.notification.createManyAndReturn({
      data: createInputs,
      select: { id: true, userId: true },
    });

    notificationMetrics.histogram('notifications.bulk_batch_size', createdRows.length, {
      triggerEvent: input.triggerEvent,
    });

    // 6. Emit socket events
    for (const row of createdRows) {
      emitSocketEvent(row.userId, { notificationId: row.id, traceId });
    }

    // 7. Chunk into BullMQ bulk-delivery jobs with backpressure throttling.
    //    Only enqueue if there are non-IN_APP channels to deliver on.
    if (nonInAppChannels.length > 0) {
      const queue = pickQueueByPriority(effectivePriority);
      const highWater = env.NOTIFICATIONS_BULK_QUEUE_HIGH_WATER;
      const isThrottlable =
        effectivePriority === 'LOW' || effectivePriority === 'MEDIUM';

      for (let i = 0; i < createdRows.length; i += chunkSize) {
        // Backpressure check — throttle LOW/MEDIUM when queue is overloaded.
        // HIGH/CRITICAL never throttle (they use the high-priority queue).
        if (isThrottlable) {
          try {
            const waiting = await queue.getWaitingCount();
            if (waiting > highWater) {
              logger.warn('Bulk dispatch throttled — queue overloaded', {
                queueName: queue.name,
                waiting,
                highWater,
              });
              notificationMetrics.increment('notifications.bulk_throttled', {
                queue: queue.name,
                reason: 'queue_high_water',
              });
              await new Promise((resolve) => setTimeout(resolve, 200));
            }
          } catch {
            // Redis error — proceed without throttling
          }
        }

        const chunk = createdRows.slice(i, i + chunkSize);
        await queue.add('deliver-bulk', {
          isBulk: true,
          notificationIds: chunk.map((r) => r.id),
          userIds: chunk.map((r) => r.userId),
          channels: nonInAppChannels,
          traceId,
          priority: effectivePriority,
          category: primaryRule.category ?? null,
          systemCritical: input.systemCritical === true || effectivePriority === 'CRITICAL',
        });

        notificationMetrics.histogram('notifications.bulk_chunk_size', chunk.length, {
          triggerEvent: input.triggerEvent,
        });
      }
    }

    // 8. Record ENQUEUED events — one per (notification, channel).
    for (const row of createdRows) {
      for (const ch of nonInAppChannels) {
        await recordEvent({
          notificationId: row.id,
          channel: ch,
          event: 'ENQUEUED',
          traceId,
          source: 'SYSTEM',
        });
      }
    }

    notificationMetrics.increment('notifications.dispatched', {
      triggerEvent: input.triggerEvent,
      priority: effectivePriority,
      mode: 'bulk',
    }, createdRows.length);

    return {
      traceId,
      enqueued: createdRows.length,
      skipped: totalSkipped,
      notificationIds: createdRows.map((r) => r.id),
    };
  } catch (err) {
    logger.error('dispatchBulk internal error', {
      error: err,
      traceId,
      trigger: input.triggerEvent,
    });
    notificationMetrics.increment('notifications.dispatch_error', {
      triggerEvent: input.triggerEvent,
      mode: 'bulk',
    });
    return {
      traceId,
      enqueued: 0,
      skipped: input.recipients.length,
      notificationIds: [],
    };
  }
}

/**
 * Construct a synthetic IN_APP LoadedRule for bulk dispatch when no rules
 * exist for the trigger event. Keeps the bulk path self-contained and avoids
 * re-entering dispatch() (which would double-count the tenant rate limit).
 */
function buildFallbackRule(input: DispatchBulkInput): LoadedRule {
  const now = new Date();
  const title = input.type ?? input.triggerEvent.replace(/_/g, ' ');
  const body = `Event: ${input.triggerEvent}`;
  const template: NotificationTemplate = {
    id: 'adhoc',
    name: title,
    code: 'ADHOC',
    subject: title,
    body,
    channel: 'IN_APP',
    priority: input.priority ?? 'LOW',
    version: 1,
    variables: [] as Prisma.JsonValue,
    sensitiveFields: [] as Prisma.JsonValue,
    compiledBody: body,
    compiledSubject: title,
    whatsappTemplateName: null,
    isSystem: false,
    isActive: true,
    companyId: input.companyId,
    createdAt: now,
    updatedAt: now,
  };
  return {
    id: `adhoc:${input.triggerEvent}:IN_APP`,
    triggerEvent: input.triggerEvent,
    category: null,
    templateId: 'adhoc',
    recipientRole: 'EMPLOYEE',
    channel: 'IN_APP',
    priority: input.priority ?? 'LOW',
    version: 1,
    isSystem: false,
    isActive: true,
    companyId: input.companyId,
    createdAt: now,
    updatedAt: now,
    template,
    isAdHoc: true,
  };
}
