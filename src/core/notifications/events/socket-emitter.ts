import { emitNotificationNew } from '../../../lib/socket';
import { logger } from '../../../config/logger';

/**
 * Emit a notification:new socket event to a user's room.
 * Payload is intentionally minimal so clients re-fetch via React Query.
 * title/body are included for Electron clients that need native OS notifications
 * without FCM Web Push support.
 */
export function emitSocketEvent(
  userId: string,
  payload: { notificationId: string; traceId: string; title?: string; body?: string },
): void {
  try {
    emitNotificationNew(userId, payload);
  } catch (err) {
    logger.warn('Socket emit failed', { error: err, userId });
  }
}
