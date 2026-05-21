// =============================================================================
// Run epoch state management
// Tracks active run/step/generate epochs to detect stale runs.
//
// This file re-exports from agent-runner-epoch-manager for backward compat.
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