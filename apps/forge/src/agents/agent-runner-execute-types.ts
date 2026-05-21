/**
 * agent-runner-execute-types.ts
 *
 * State interfaces and dependency bag for `executeStep` in agent-runner-execute.ts.
 * Extracted from agent-runner-execute.ts (#2321).
 *
 * The state type interfaces (EpochState, BackoffState, ProgressState, LoopState)
 * mirror the same shapes in agent-runner-generate.ts for consistency. These
 * interfaces are intentionally minimal — they only carry the state that
 * `executeStep` needs to track progress, backoff, loop detection, and epoch.
 *
 * `ExecuteStepDeps` is the dependency bag passed to `executeStep`. It includes
 * identity fields, state containers, stores/managers, runner actions, and
 * error-logging helpers. All are injected rather than created internally,
 * so the runner owns the lifecycle.
 */

import type { Database } from '../database/schema';
import type { InternalAgentRuntime } from './runtime/types';
import type { AgentContractStore } from './agent-contract-store';
import type { AgentNotificationStore } from '../notifications/store';
import type { AgentHomeMetricSnapshotStore } from './agent-home-metric-snapshot-store';
import type { AgentRunnerUsage } from './agent-runner-usage';
import type { Scheduler } from './agent-runner-scheduler';
import type { MessageManagerState } from './agent-runner-messages';
import type { GenerateDeps } from './agent-runner-generate';

// ─── State types ────────────────────────────────────────────────────────────────

/** Tracks the current run and step epochs and the active generate token. */
export interface ExecuteEpochState {
  activeRunEpoch: number;
  activeStepEpoch: number;
  activeGenerateToken: number;
  activeRunId: string | null;
}

/** Tracks backoff state between generation attempts. */
export interface ExecuteBackoffState {
  backoffMs: number;
  instant: boolean;
  nextStepAt: number | null;
}

/** Tracks the last step's start time, stage label, and generate progress. */
export interface ExecuteProgressState {
  lastStepStartedAt: number | null;
  lastStepStage: string | null;
  lastGenerateProgress: {
    stage: string;
    at: number;
    detail: Record<string, unknown> | null;
  } | null;
}

/** Tracks loop detection state. */
export interface ExecuteLoopState {
  lastLoopSignature: string | null;
  repeatedLoopCount: number;
}

// ─── Result type ────────────────────────────────────────────────────────────────

/** Shape returned by `generateWithTimeoutRetries`. */
export type GenerateResult = {
  text: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  toolResults: Array<{ name: string; error?: Error }>;
  finishReason: string;
  inputTokens: number;
  outputTokens: number;
  steps?: Array<{
    response?: {
      uiMessages?: Array<{
        parts?: Array<unknown>;
      }>;
    };
  }>;
};

// ─── Dependencies ───────────────────────────────────────────────────────────────

/**
 * Dependency bag for `executeStep`.
 *
 * Includes identity fields, state containers, stores/managers, runner actions,
 * and error-logging helpers. All injected rather than created internally,
 * so the runner owns the lifecycle.
 */
export interface ExecuteStepDeps {
  // ── Identity ──────────────────────────────────────────────────────────────
  contractId: string;
  runEpoch: number;
  runtimeId: string;
  mastraId: string;
  pricingModelKey: string;
  modelProfileId: string;

  // ── Runner state guards ───────────────────────────────────────────────────
  stopped: boolean;
  executingRef: { value: boolean };
  isStaleRun: (runEpoch: number) => boolean;

  // ── State containers (shared with agent-runner.ts) ─────────────────────────
  epochState: ExecuteEpochState;
  backoffState: ExecuteBackoffState;
  progressState: ExecuteProgressState;
  loopState: ExecuteLoopState;

  // ── Stores & managers ─────────────────────────────────────────────────────
  store: AgentContractStore;
  messageManager: MessageManagerState;
  scheduler: Scheduler;
  loopDetector: import('./agent-runner-loop-manager').LoopManager;

  // ── Wake-queue boundary ───────────────────────────────────────────────────
  /** Called when the runner becomes idle and the wake queue should be drained. */
  onRunnerIdle: () => Promise<void>;

  // ── Core runner actions (called by executeStep) ───────────────────────────
  transitionToIdle: (runEpoch: number, opts?: { deferWakeQueueDrain?: boolean }) => Promise<void>;
  queueNextStep: (runEpoch: number) => Promise<void>;
  generateWithTimeoutRetries: (
    prompt: string,
    runEpoch: number,
    contractId: string,
    contract: { id: string; budgetUsd: number; endsAt: number },
    longTermMemoryRecallSystemText: string | null,
    config: GenerateDeps,
  ) => Promise<GenerateResult | undefined>;
  markGenerateProgress: GenerateDeps['markGenerateProgress'];
  setLoopSignature: (sig: string | null) => void;
  loopSignature: string;
  loadAgentContextInstructions: (
    currentRuntime: InternalAgentRuntime,
    db: Database,
  ) => Promise<string | null>;
  currentRuntime: InternalAgentRuntime;
  db: Database;

  // ── Pending messages / LTM (set by runner, consumed by executeStep) ───────
  pendingLongTermMemoryRecallSystemText: string | null;
  flushPendingRunMessages: (opts: { allowOriginIdleOnly: boolean }) => string | null;

  // ── Additional runner state ───────────────────────────────────────────────
  usage: AgentRunnerUsage;
  notifications: AgentNotificationStore;
  homeMetricSnapshots: AgentHomeMetricSnapshotStore;
  runLastMessages: number;
  currentGenerateAbortController: AbortController | null;
  setCurrentGenerateAbortController: (c: AbortController | null) => void;

  // ── Error logging ──────────────────────────────────────────────────────────
  runtime: InternalAgentRuntime;
  forgeDebug: (opts: {
    scope: string;
    level: string;
    runtimeId: string;
    message: string;
    context?: Record<string, unknown>;
  }) => void;
}
