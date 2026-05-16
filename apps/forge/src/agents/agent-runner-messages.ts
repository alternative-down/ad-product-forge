import type { AgentWakeEvent } from '@forge-runtime/core';

export type MessageManagerState = {
  pendingRunMessages: Map<string, AgentWakeEvent>;
  flushedRunEventKeys: Set<string>;
  flushedRunEventKeyOrder: string[];
  currentFlushSettings: {
    communicationDmFlushingEnabled: boolean;
    communicationGroupFlushingEnabled: boolean;
  };
};

const MAX_FLUSHED_RUN_EVENT_KEYS = 2_000;

export function createMessageManager(
  state: MessageManagerState,
  formatPendingRunEvents: (events: AgentWakeEvent[]) => string,
) {
  function appendPendingRunMessages(
    events: AgentWakeEvent[],
    options: {
      allowIdleOnly?: boolean;
    } = {},
  ) {
    for (const event of events) {
      if (event.idleOnly && !options.allowIdleOnly) {
        continue;
      }

      if (!event.text.trim()) {
        continue;
      }

      state.pendingRunMessages.set(event.idempotencyKey, {
        ...event,
        originIdleOnly: event.originIdleOnly ?? event.idleOnly ?? false,
        idleOnly: options.allowIdleOnly ? false : event.idleOnly,
      });
    }
  }

  function shouldIncludePendingRunEventInFlush(event: AgentWakeEvent): boolean {
    if (!event.type.startsWith('message:')) {
      return true;
    }

    const conversationType = event.groupMetadata?.ConversationType;

    if (conversationType === 'group') {
      return state.currentFlushSettings.communicationGroupFlushingEnabled;
    }

    return state.currentFlushSettings.communicationDmFlushingEnabled;
  }

  function resetFlushedRunEventKeys() {
    state.flushedRunEventKeys = new Set<string>();
    state.flushedRunEventKeyOrder = [];
  }

  function rememberFlushedRunEventKey(idempotencyKey: string) {
    if (state.flushedRunEventKeys.has(idempotencyKey)) {
      return;
    }

    state.flushedRunEventKeys.add(idempotencyKey);
    state.flushedRunEventKeyOrder.push(idempotencyKey);

    while (state.flushedRunEventKeyOrder.length > MAX_FLUSHED_RUN_EVENT_KEYS) {
      const oldestIdempotencyKey = state.flushedRunEventKeyOrder.shift();

      if (!oldestIdempotencyKey) {
        return;
      }

      state.flushedRunEventKeys.delete(oldestIdempotencyKey);
    }
  }

  function flushPendingRunMessages(options: {
    allowOriginIdleOnly?: boolean;
  } = {}): string | null {
    if (state.pendingRunMessages.size === 0) {
      return null;
    }

    const allEvents = Array.from(state.pendingRunMessages.values()).sort(
      (left, right) => left.timestamp - right.timestamp,
    );
    const deferredEvents: AgentWakeEvent[] = [];

    const events = allEvents.filter((event) => {
      if (state.flushedRunEventKeys.has(event.idempotencyKey)) {
        return false;
      }

      if (event.originIdleOnly && !options.allowOriginIdleOnly) {
        deferredEvents.push(event);
        return false;
      }

      return shouldIncludePendingRunEventInFlush(event);
    });

    state.pendingRunMessages.clear();

    for (const event of deferredEvents) {
      state.pendingRunMessages.set(event.idempotencyKey, event);
    }

    if (events.length === 0) {
      return null;
    }

    for (const event of events) {
      rememberFlushedRunEventKey(event.idempotencyKey);
    }

    return formatPendingRunEvents(events);
  }

  function updateFlushSettings(settings: {
    communicationDmFlushingEnabled: boolean;
    communicationGroupFlushingEnabled: boolean;
  }) {
    state.currentFlushSettings = {
      communicationDmFlushingEnabled: settings.communicationDmFlushingEnabled,
      communicationGroupFlushingEnabled: settings.communicationGroupFlushingEnabled,
    };
  }

  function getPendingCount(): number {
    return state.pendingRunMessages.size;
  }

  return {
    appendPendingRunMessages,
    flushPendingRunMessages,
    shouldIncludePendingRunEventInFlush,
    resetFlushedRunEventKeys,
    rememberFlushedRunEventKey,
    updateFlushSettings,
    getPendingCount,
  };
}
