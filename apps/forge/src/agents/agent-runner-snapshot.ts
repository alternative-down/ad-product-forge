import type { Scheduler } from './agent-runner-scheduler';
import type { RunnerMessageManager } from './agent-runner-message-manager';
import type { AgentWakeEvent } from '@forge-runtime/core';

/** Snapshot shape for agent-runner health/debug. */
export interface AgentRunnerSnapshot {
  stopped: boolean;
  instant: boolean;
  startingRun: boolean;
  startingRunStartedAt: number | null;
  executing: boolean;
  activeRunEpoch: number;
  activeStepEpoch: number;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wakeQueue: any,
  extra: {
    stopped: boolean;
    startingRun: boolean;
    startingRunStartedAt: number | null;
    executing: boolean;
    lastStepStartedAt: number | null;
    lastStepStage: string | null;
    lastWakeStartedAt: number | null;
    timer: ReturnType<typeof setTimeout> | null;
  },
): AgentRunnerSnapshot {
  const s = scheduler.getState();
  return {
    stopped: extra.stopped,
    instant: s.instant,
    startingRun: extra.startingRun,
    startingRunStartedAt: extra.startingRunStartedAt,
    executing: extra.executing,
    activeRunEpoch: s.activeRunEpoch,
    activeStepEpoch: s.activeStepEpoch,
    scheduled: extra.timer !== null,
    backoffMs: s.backoffMs,
    nextStepAt: s.nextStepAt,
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    estimatedDelayMs: s.nextStepAt ? Math.max(s.nextStepAt - Date.now(), 0) : null,
    lastStepStartedAt: extra.lastStepStartedAt,
    lastStepStage: extra.lastStepStage,
    pendingRunEvents: Array.from(messageManager.getState().pendingRunMessages.values()),
    wake: wakeQueue.getSnapshot(),
    lastWakeStartedAt: extra.lastWakeStartedAt,
  };
}
