import { EventEmitter } from 'events';
import { logger } from '../../config/logger';

class TypedEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  emitEvent<T>(event: string, payload: T): void {
    logger.debug(`Event emitted: ${event}`);
    this.emit(event, payload);
  }

  onEvent<T>(event: string, handler: (payload: T) => void | Promise<void>): void {
    this.on(event, async (payload: T) => {
      try {
        await handler(payload);
      } catch (err) {
        logger.error(`Event handler failed for ${event}`, err);
        // Don't throw — event handler errors shouldn't break the emitter
      }
    });
  }
}

export const eventBus = new TypedEventBus();
