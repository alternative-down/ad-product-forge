// =============================================================================
// Run epoch state management
// Tracks active run/step/generate epochs to detect stale runs.
//
// This file re-exports from agent-runner-epoch-manager for backward compat.
// =============================================================================

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
// eslint-disable-next-line reexport-check/no-unnecessary-reexports
} from './agent-runner-epoch-manager';