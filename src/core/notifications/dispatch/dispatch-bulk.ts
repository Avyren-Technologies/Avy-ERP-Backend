import { nanoid } from 'nanoid';
import type { NotificationChannel, NotificationPriority, Prisma } from '@prisma/client';
import { platformPrisma } from '../../../config/database';
import { env } from '../../../config/env';
import { logger } from '../../../config/logger';
import { loadActiveRules } from './rule-loader';
import { renderTemplate } from '../templates/renderer';
import { checkUserRateLimit, checkTenantRateLimit } from './rate-limiter';
import { checkDedup } from './dedup';
import { pickQueueByPriority } from '../queue/queues';
import { emitSocketEvent } from '../events/socket-emitter';
import { recordEvent } from '../events/event-emitter';
import { notificationMetrics } from '../metrics/notification-metrics';
import type { DispatchInput } from './types';

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
    const rules = await loadActiveRules(input.companyId, input.triggerEvent);
    if (rules.length === 0) {
      // Fall back to per-recipient dispatch via the normal path (which handles
      // the no-rules fallback). This keeps behavior identical for small fanouts
      // without rules configured.
      logger.warn('dispatchBulk: no rules — falling back to per-recipient dispatch', {
        traceId,
        triggerEvent: input.triggerEvent,
      });
      const { dispatch } = await import('./dispatcher');
      let enqueued = 0;
      for (const r of input.recipients) {
        const res = await dispatch({
          companyId: input.companyId,
          triggerEvent: input.triggerEvent,
          ...(input.type !== undefined && { type: input.type }),
          ...(input.entityType !== undefined && { entityType: input.entityType }),
          ...(input.entityId !== undefined && { entityId: input.entityId }),
          explicitRecipients: [r.userId],
          tokens: { ...(input.sharedTokens ?? {}), ...(r.tokens ?? {}) },
          priority,
          ...(input.systemCritical !== undefined && { systemCritical: input.systemCritical }),
          ...(input.actionUrl !== undefined && { actionUrl: input.actionUrl }),
        } as DispatchInput);
        enqueued += res.enqueued;
      }
      return { traceId, enqueued, skipped: 0, notificationIds: [] };
    }

    // 2. Rate-limit filter (per-recipient)
    const allowedRecipients: typeof input.recipients = [];
    for (const r of input.recipients) {
      const ok = await checkUserRateLimit(r.userId, priority);
      if (ok) allowedRecipients.push(r);
    }
    const rateDropped = input.recipients.length - allowedRecipients.length;

    if (allowedRecipients.length === 0) {
      return { traceId, enqueued: 0, skipped: rateDropped, notificationIds: [] };
    }

    // 3. Use the FIRST active rule only (bulk mode = primary channel).
    //    If multiple rules exist for the same trigger event, per-rule fanout
    //    is out of scope for bulk — callers that need multi-channel should
    //    use individual dispatch() calls.
    const primaryRule = rules[0]!;
    const effectivePriority: NotificationPriority =
      priority ?? primaryRule.priority ?? primaryRule.template.priority ?? 'MEDIUM';

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

      const deliveryStatus: Record<string, string> = { inApp: 'SENT' };
      if (primaryRule.channel !== 'IN_APP') {
        deliveryStatus[primaryRule.channel.toLowerCase()] = 'PENDING';
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

    // 7. Chunk into BullMQ bulk-delivery jobs with backpressure throttling
    if (primaryRule.channel !== 'IN_APP') {
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
          channels: [primaryRule.channel],
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

    // 8. Record ENQUEUED events
    for (const row of createdRows) {
      await recordEvent({
        notificationId: row.id,
        channel: primaryRule.channel,
        event: 'ENQUEUED',
        traceId,
        source: 'SYSTEM',
      });
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
