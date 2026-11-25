/**
 * Application events delivered in the same process: the EventPublisher adapter the apps run
 * today. A broker adapter replaces it without the publishers or subscribers changing.
 */
import type { AppEvent, EventPublisher, Unsubscribe } from "@tutors/application/ports";

export function inProcessPublisher(onError: (error: unknown) => void = () => {}): EventPublisher {
  const listeners = new Set<(event: AppEvent) => void>();
  return {
    async publish(event) {
      for (const listener of [...listeners]) {
        try {
          listener(event);
        } catch (error) {
          // One subscriber's failure never stops delivery to the others or the publisher.
          onError(error);
        }
      }
    },
    subscribe(listener): Unsubscribe {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
