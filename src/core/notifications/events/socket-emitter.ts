import { emitNotificationNew } from '../../../lib/socket';
import { logger } from '../../../config/logger';

/**
 * Emit a notification:new socket event to a user's room.
 * Payload is intentionally minimal ({ notificationId, unreadCountHint: null })
 * so clients are forced to re-fetch via React Query rather than trust the
 * socket payload as a source of truth.
 */
export function emitSocketEvent(userId: string, payload: { notificationId: string; traceId: string }): void {
  try {
    emitNotificationNew(userId, payload);
  } catch (err) {
    logger.warn('Socket emit failed', { error: err, userId });
  }
}
