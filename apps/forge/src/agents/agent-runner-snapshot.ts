import type { Scheduler } from './agent-runner-scheduler';
import type { RunnerMessageManager } from './agent-runner-message-manager';
import type { AgentWakeEvent, AgentWakeQueue } from '@forge-runtime/core';
import type { RunnerLifecycleState } from './agent-runner-state';

/** Snapshot shape for agent-runner health/debug. */
export interface AgentRunnerSnapshot {
  stopped: boolean;
  instant: boolean;
  startingRun: boolean;
  startingRunStartedAt: number | null;
  executing: boolean;
  activeRunEpoch: number;
  activeStepEpoch: number;
  /** True iff a next-step is currently scheduled (i.e. scheduler.getState().nextStepAt !== null).
   *  Previously this was sourced from a `timer: NodeJS.Timeout | null` constant that was
   *  never reassigned (D49 #6534 — dead code from D47 scheduler decomposition). */
  scheduled: boolean;
  backoffMs: number;
  nextStepAt: number | null;
  estimatedDelayMs: number | null;
  lastStepStartedAt: number | null;
  lastStepStage: string | null;
  pendingRunEvents: AgentWakeEvent[];
  wake: {
    queued: number;
    executing: boolean;
    lastExecuteAt: number | null;
    events?: Array<unknown>;
  };
  lastWakeStartedAt: number | null;
}

export function buildRunnerSnapshot(
  scheduler: Pick<Scheduler, 'getState'>,
  messageManager: Pick<RunnerMessageManager, 'getState'>,
  wakeQueue: Pick<AgentWakeQueue, 'getSnapshot'>,
  lifecycle: Pick<
    RunnerLifecycleState,
    | 'stopped'
    | 'startingRun'
    | 'startingRunStartedAt'
    | 'executing'
    | 'lastStepStartedAt'
    | 'lastStepStage'
    | 'lastWakeStartedAt'
  >,
): AgentRunnerSnapshot {
  const s = scheduler.getState();
  return {
    stopped: lifecycle.stopped,
    instant: s.instant,
    startingRun: lifecycle.startingRun,
    startingRunStartedAt: lifecycle.startingRunStartedAt,
    executing: lifecycle.executing,
    activeRunEpoch: s.activeRunEpoch,
    activeStepEpoch: s.activeStepEpoch,
    scheduled: s.nextStepAt !== null,
    backoffMs: s.backoffMs,
    nextStepAt: s.nextStepAt,
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    estimatedDelayMs: s.nextStepAt ? Math.max(s.nextStepAt - Date.now(), 0) : null,
    lastStepStartedAt: lifecycle.lastStepStartedAt,
    lastStepStage: lifecycle.lastStepStage,
    pendingRunEvents: Array.from(messageManager.getState().pendingRunMessages.values()),
    wake: wakeQueue.getSnapshot() as unknown as AgentRunnerSnapshot['wake'],
    lastWakeStartedAt: lifecycle.lastWakeStartedAt,
  };
}
