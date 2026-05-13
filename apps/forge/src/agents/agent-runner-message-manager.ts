// =============================================================================
// Message manager state for agent-runner.ts
// Holds the state + delegates to createMessageManager for message logic
// =============================================================================

import type { AgentWakeEvent } from '@forge-runtime/core';
import { createMessageManager, type MessageManagerState } from './agent-runner-messages';


export { type MessageManagerState } from './agent-runner-messages';

export interface RunnerMessageManagerState {
  flushedRunEventKeys: Set<string>;
  flushedRunEventKeyOrder: string[];
  currentFlushSettings: {
    communicationDmFlushingEnabled: boolean;
    communicationGroupFlushingEnabled: boolean;
  };
  pendingRunMessages: Map<string, AgentWakeEvent>;
}

export function createRunnerMessageManagerState(): RunnerMessageManagerState {
  return {
    flushedRunEventKeys: new Set<string>(),
    flushedRunEventKeyOrder: [],
    currentFlushSettings: {
      communicationDmFlushingEnabled: true,
      communicationGroupFlushingEnabled: true,
    },
    pendingRunMessages: new Map<string, AgentWakeEvent>(),
  };
}

export interface RunnerMessageManager {
  appendPendingRunMessages(
    events: AgentWakeEvent[],
    options?: { allowIdleOnly?: boolean },
  ): void;
  flushPendingRunMessages(options?: { allowOriginIdleOnly?: boolean }): string | null;
  reset(): void;
  getPendingCount(): number;
  updateFlushSettings(settings: {
    communicationDmFlushingEnabled?: boolean;
    communicationGroupFlushingEnabled?: boolean;
  }): void;
  getCurrentFlushSettings(): {
    communicationDmFlushingEnabled: boolean;
    communicationGroupFlushingEnabled: boolean;
  };
}

export function createRunnerMessageManager(
  state: RunnerMessageManagerState,
  formatPendingRunEvents: (events: AgentWakeEvent[]) => string,
): RunnerMessageManager {
  const manager = createMessageManager(state, formatPendingRunEvents);

  function reset(): void {
    state.pendingRunMessages.clear();
    manager.resetFlushedRunEventKeys();
  }

  function updateFlushSettings(settings: {
    communicationDmFlushingEnabled?: boolean;
    communicationGroupFlushingEnabled?: boolean;
  }): void {
    if (settings.communicationDmFlushingEnabled !== undefined) {
      state.currentFlushSettings.communicationDmFlushingEnabled = settings.communicationDmFlushingEnabled;
    }
    if (settings.communicationGroupFlushingEnabled !== undefined) {
      state.currentFlushSettings.communicationGroupFlushingEnabled = settings.communicationGroupFlushingEnabled;
    }
  }

  function getCurrentFlushSettings(): {
    communicationDmFlushingEnabled: boolean;
    communicationGroupFlushingEnabled: boolean;
  } {
    return { ...state.currentFlushSettings };
  }

  function getState(): RunnerMessageManagerState {
    return state;
  }

  return {
    appendPendingRunMessages: manager.appendPendingRunMessages,
    flushPendingRunMessages: manager.flushPendingRunMessages,
    reset,
    getPendingCount: manager.getPendingCount,
    updateFlushSettings,
    getCurrentFlushSettings,
    getState,
  };
}