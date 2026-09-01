// =============================================================================
// Run epoch + lifecycle state management
// Tracks active run/step/generate epochs (RunEpochState) AND the runner's
// lifecycle flags (RunnerLifecycleState) to detect stale runs and consolidate
// previously-scattered `let` declarations in agent-runner.ts.
//
// This file re-exports from agent-runner-epoch-manager for backward compat.
// =============================================================================
/* eslint-disable reexport-check/no-unnecessary-reexports */
export {
  createRunEpochState,
  createBackoffState,
  createProgressState,
  advanceRunEpoch,
  advanceStepEpoch,
  advanceGenerateToken,
  isStaleRun,
  nextBackoff,
  resetBackoff,
  calculateDelayMs,
  type RunEpochState,
  type BackoffState,
  type ProgressState,
} from './agent-runner-epoch-manager';

// =============================================================================
// Runner lifecycle state (D49 #6534 — Pattern L analog for state extraction)
// Mirrors the SchedulerState extraction from agent-runner-scheduler.ts:110-117
// (D47 gold standard: L#NN-Agent-Runner-Scheduler-Decomposition-Gold-Standard v1).
//
// Previously 11 `let` statements scattered through agent-runner.ts:72-83. The
// extracted type makes mutations explicit, enables test coverage via factory
// pattern, and eliminates whole-class bugs (forgotten fields, drift between
// state and snapshot).
//
// NOTE: `timer` was removed (was `const timer: NodeJS.Timeout | null = null`
// at agent-runner.ts:71 pre-#6534, never reassigned). The `scheduled` snapshot
// field is now computed from scheduler.getState().nextStepAt instead.
// =============================================================================
export type RunnerLifecycleState = {
  stopped: boolean;
  startingRun: boolean;
  startingRunStartedAt: number | null;
  executing: boolean;
  lastWakeStartedAt: number | null;
  lastStepStartedAt: number | null;
  lastStepStage: string | null;
  activeRunId: string | null;
  currentGenerateAbortController: AbortController | null;
  runLastMessages: number;
  pendingLongTermMemoryRecallSystemText: string | null;
};

export function createRunnerLifecycleState(): RunnerLifecycleState {
  return {
    stopped: false,
    startingRun: false,
    startingRunStartedAt: null,
    executing: false,
    lastWakeStartedAt: null,
    lastStepStartedAt: null,
    lastStepStage: null,
    activeRunId: null,
    currentGenerateAbortController: null,
    runLastMessages: 20,
    pendingLongTermMemoryRecallSystemText: null,
  };
}
