/**
 * agent-runner-flush-manager.ts
 *
 * Extracted from agent-runner-scheduler.ts (#2257).
 * Manages flush settings, run-event deduplication, and run-last-messages count.
 */
import { withTimeout } from '../utils/async';
import { RUNNER_AWAIT_TIMEOUT_MS } from './agent-runner-generate';

const DEFAULT_RUN_LAST_MESSAGES = 20;
const FULL_MEMORY_LOAD_LAST_MESSAGES = Number.MAX_SAFE_INTEGER;
const MAX_FLUSHED_RUN_EVENT_KEYS = 2_000;

export type FlushManagerSettings = {
  communicationDmFlushingEnabled: boolean;
  communicationGroupFlushingEnabled: boolean;
};

export type FlushManagerDependencies = {
  runtimeId: string;
  getSystemSettings(): Promise<{
    stepDelayEnabled: boolean;
    memoryLastMessagesFullEnabled: boolean;
    memoryLastMessagesCount?: number;
    communicationDmFlushingEnabled: boolean;
    communicationGroupFlushingEnabled: boolean;
  }>;
};

export type FlushManager = {
  refreshRunFlushSettings(): Promise<void>;
  resetFlushedRunEventKeys(): void;
  rememberFlushedRunEventKey(idempotencyKey: string): void;
  isFlushed(key: string): boolean;
  clearFlushHistory(): void;
  getFlushSettings(): FlushManagerSettings;
  getRunLastMessages(): number;
};

export function createFlushManager(deps: FlushManagerDependencies): FlushManager {
  let runLastMessages = DEFAULT_RUN_LAST_MESSAGES;

  let currentFlushSettings: FlushManagerSettings = {
    communicationDmFlushingEnabled: true,
    communicationGroupFlushingEnabled: true,
  };

  const flushedRunEventKeys = new Set<string>();
  const flushedRunEventKeyOrder: string[] = [];

  async function refreshRunFlushSettings() {
    try {
      const settings = await withTimeout(
        deps.getSystemSettings(),
        RUNNER_AWAIT_TIMEOUT_MS,
        `System settings lookup timed out for ${deps.runtimeId}`,
      );

      currentFlushSettings = {
        communicationDmFlushingEnabled: settings.communicationDmFlushingEnabled,
        communicationGroupFlushingEnabled: settings.communicationGroupFlushingEnabled,
      };

      if (settings.memoryLastMessagesFullEnabled) {
        runLastMessages = FULL_MEMORY_LOAD_LAST_MESSAGES;
        return;
      }

      runLastMessages = settings.memoryLastMessagesCount || DEFAULT_RUN_LAST_MESSAGES;
    } catch {
      // non-fatal — swallow errors so flush manager never breaks the scheduler
    }
  }

  function resetFlushedRunEventKeys() {
    flushedRunEventKeys.clear();
    flushedRunEventKeyOrder.length = 0;
  }

  function rememberFlushedRunEventKey(idempotencyKey: string) {
    if (flushedRunEventKeys.has(idempotencyKey)) {
      return;
    }

    flushedRunEventKeys.add(idempotencyKey);
    flushedRunEventKeyOrder.push(idempotencyKey);

    while (flushedRunEventKeyOrder.length > MAX_FLUSHED_RUN_EVENT_KEYS) {
      const oldestIdempotencyKey = flushedRunEventKeyOrder.shift();
      if (!oldestIdempotencyKey) {
        return;
      }
      flushedRunEventKeys.delete(oldestIdempotencyKey);
    }
  }

  function isFlushed(key: string): boolean {
    return flushedRunEventKeys.has(key);
  }

  function clearFlushHistory() {
    resetFlushedRunEventKeys();
  }

  function getFlushSettings(): FlushManagerSettings {
    return { ...currentFlushSettings };
  }

  function getRunLastMessages(): number {
    return runLastMessages;
  }

  return {
    refreshRunFlushSettings,
    resetFlushedRunEventKeys,
    rememberFlushedRunEventKey,
    isFlushed,
    clearFlushHistory,
    getFlushSettings,
    getRunLastMessages,
  };
}