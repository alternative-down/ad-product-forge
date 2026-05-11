/**
 * agent-runner-execute.ts
 *
 * Extracted from agent-runner.ts (#1718).
 * Contains execute, beginRun, and forceIdle — the core run lifecycle functions.
 *
 * agent-runner.ts remains the sole source of state truth.
 * This module receives all state readers/writers as callback parameters,
 * avoiding shared mutable state between modules.
 */
import type { AgentWakeEvent } from '@forge-runtime/core';
import { withTimeout } from '../utils/async';
import { forgeDebug } from '@forge-runtime/core';
import { createId } from '../utils/id';

const RUNNER_AWAIT_TIMEOUT_MS = 30_000;

export type ExecuteDependencies = {
  runtimeId: string;
  getExecutionState(id: string): Promise<'idle' | 'running' | 'absent'>;
  setExecutionState(id: string, state: 'idle' | 'running' | 'absent'): Promise<void>;
  isLocallyIdle(): boolean;
  isStaleRun(runEpoch: number): boolean;
  startNewRunEpoch(): number;

  // Message manager
  appendPendingRunMessages(events: AgentWakeEvent[], options?: { allowIdleOnly?: boolean }): void;
  flushPendingRunMessages(options?: { allowOriginIdleOnly?: boolean }): Promise<void>;
  resetFlushedRunEventKeys(): void;

  // Wake queue
  notifyExternalEvent(event: AgentWakeEvent): void;
  getWakeSnapshot(): { pending: number; waitingForIdle: boolean };
  onRunnerIdle(): Promise<void>;
  stopWakeQueue(): void;

  // Scheduler
  setSchedulerInstant(val: boolean): void;
  resetSchedulerBackoff(): void;

  // Loop detector
  resetLoopDetector(): void;

  // Long-term memory
  onAgentRunning(): void;
  onAgentIdle?(): Promise<void>;

  // Step management
  resetRunLastMessages(): Promise<void>;
  refreshRunFlushSettings(): Promise<void>;
  queueNextStep(runEpoch: number): Promise<void>;
  reloadRuntime?(runEpoch: number): Promise<void>;
  onRuntimeReloaded?(): void;

  // LTM recall
  clearPendingLongTermMemoryRecall(): void;

  // Errors
  notifyError(message: string, error: unknown): void;
};

export async function execute(
  deps: ExecuteDependencies,
  events: AgentWakeEvent[],
  isStopped: () => boolean,
) {
  if (isStopped()) return;

  const executionState = await withTimeout(
    deps.getExecutionState(deps.runtimeId),
    RUNNER_AWAIT_TIMEOUT_MS,
    `Agent execution state lookup timed out for ${deps.runtimeId}`,
  );

  // Check if start is already in progress (caller passes this)
  // Since we don't track startingRun here, we handle it in beginRun itself
  const idleOnlyEvents = events.filter((event) => event.idleOnly);
  const runnableEvents = events.filter((event) => !event.idleOnly);

  if (executionState !== 'idle') {
    deps.appendPendingRunMessages(runnableEvents);
    for (const event of idleOnlyEvents) {
      deps.notifyExternalEvent(event);
    }
    return;
  }

  // executionState === 'idle' — run beginRun logic inline
  await beginRun(deps, {
    reloadRuntime: false,
    wakeStartedAt: Date.now(),
    markRunning: true,
    isStopped,
  });
}

export async function beginRun(
  deps: ExecuteDependencies,
  input: {
    reloadRuntime: boolean;
    wakeStartedAt: number;
    markRunning: boolean;
    isStopped: () => boolean;
  },
) {
  if (input.isStopped()) return;

  // NOTE: startingRun flag is tracked by the caller (agent-runner.ts).
  // This function is called when startingRun is false.
  // The caller manages the startingRun state to prevent concurrent beginRun calls.

  const runEpoch = deps.startNewRunEpoch();

  try {
    // Active state initialization
    deps.setSchedulerInstant(true);
    deps.resetSchedulerBackoff();
    deps.resetLoopDetector();
    deps.resetFlushedRunEventKeys();
    deps.clearPendingLongTermMemoryRecall();
    await deps.refreshRunFlushSettings();
    await deps.resetRunLastMessages();

    if (input.reloadRuntime && deps.reloadRuntime) {
      await deps.reloadRuntime(runEpoch);
    }

    if (deps.isStaleRun(runEpoch)) return;

    deps.onAgentRunning();

    if (input.markRunning) {
      await withTimeout(
        deps.setExecutionState(deps.runtimeId, 'running'),
        RUNNER_AWAIT_TIMEOUT_MS,
        `Agent execution state update timed out for ${deps.runtimeId}`,
      );
    }

    if (deps.isStaleRun(runEpoch)) return;

    await deps.queueNextStep(runEpoch);
  } catch (error) {
    deps.notifyError('failed to begin run', error);
    if (!deps.isStaleRun(runEpoch)) {
      await transitionToIdle(deps, runEpoch);
    }
  }
}

export async function forceIdle(
  deps: ExecuteDependencies,
  runEpoch: number,
  options: {
    preserveQueuedWork?: boolean;
  } = {},
) {
  // Reset step state
  deps.setSchedulerInstant(false);
  deps.resetLoopDetector();

  await withTimeout(
    deps.setExecutionState(deps.runtimeId, 'idle'),
    RUNNER_AWAIT_TIMEOUT_MS,
    `Agent execution state update timed out for ${deps.runtimeId}`,
  );

  if (deps.onAgentIdle) {
    await withTimeout(
      deps.onAgentIdle(),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent long-term memory idle transition timed out for ${deps.runtimeId}`,
    );
  }

  if (deps.isStaleRun(runEpoch)) return;

  deps.resetFlushedRunEventKeys();

  if (!options.preserveQueuedWork) {
    deps.stopWakeQueue();
  }
}

async function transitionToIdle(deps: ExecuteDependencies, runEpoch: number) {
  if (deps.isStaleRun(runEpoch)) return;

  deps.setSchedulerInstant(false);
  deps.resetLoopDetector();

  await withTimeout(
    deps.setExecutionState(deps.runtimeId, 'idle'),
    RUNNER_AWAIT_TIMEOUT_MS,
    `Agent execution state update timed out for ${deps.runtimeId}`,
  );

  if (deps.onAgentIdle) {
    await withTimeout(
      deps.onAgentIdle(),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent long-term memory idle transition timed out for ${deps.runtimeId}`,
    );
  }

  if (deps.isStaleRun(runEpoch)) return;

  await deps.onRunnerIdle();
}