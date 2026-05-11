/**
 * agent-runner-execute.ts
 *
 * Extracts `executeStep` from `agent-runner.ts`.
 *
 * This function is the core execution loop unit. It:
 *   1. Validates execution state (idle / stale / stopped / executing)
 *   2. Loads the current runnable contract
 *   3. Calls generateWithTimeoutRetries (the LLM step)
 *   4. Interprets the control directive (STOP_AND_IDLE / NO_ACTION_NEEDED)
 *   5. On error, schedules exponential backoff
 *   6. On success, decides whether to queue the next step
 *
 * All state is passed as explicit parameters rather than captured in closure
 * scope, making the function fully testable in isolation.
 *
 * Design rationale:
 * - Uses the same state-object pattern as generateWithTimeoutRetries
 *   (EpochState, BackoffState, ProgressState, LoopState) for consistency.
 * - messageManager, scheduler, and onRunnerIdle are passed as injected deps
 *   rather than created internally, so the runner owns the lifecycle.
 * - The wake-queue callback (onRunnerIdle) is the boundary between this
 *   module and the agent-runner orchestration layer.
 */
import { withTimeout } from '../utils/async';
import {
  extractRunnerControlDirective,
  serializeError,
  formatAbsentExecutionError,
} from './agent-runner-helpers';
import { nextExponentialBackoffMs } from './agent-runner-delay';
import { RUNNER_AWAIT_TIMEOUT_MS } from './agent-runner-constants';

// ─── State types (same shapes as agent-runner-generate.ts) ────────────────────

export interface ExecuteEpochState {
  activeRunEpoch: number;
  activeStepEpoch: number;
  activeGenerateToken: number;
  activeRunId: string | null;
}

export interface ExecuteBackoffState {
  backoffMs: number;
  instant: boolean;
  nextStepAt: number | null;
}

export interface ExecuteProgressState {
  lastStepStartedAt: number | null;
  lastStepStage: string | null;
  lastGenerateProgress: {
    stage: string;
    at: number;
    detail: Record<string, unknown> | null;
  } | null;
}

export interface ExecuteLoopState {
  lastLoopSignature: string | null;
  repeatedLoopCount: number;
}

// ─── Dependencies ─────────────────────────────────────────────────────────────

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
  executing: boolean;
  isStaleRun: (runEpoch: number) => boolean;

  // ── State containers (shared with agent-runner.ts) ─────────────────────────
  epochState: ExecuteEpochState;
  backoffState: ExecuteBackoffState;
  progressState: ExecuteProgressState;
  loopState: ExecuteLoopState;

  // ── Stores & managers ─────────────────────────────────────────────────────
  store: AgentContractStore;
  messageManager: MessageManager;
  scheduler: Scheduler;
  loopDetector: LoopDetector;

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
  markGenerateProgress: ExecuteDeps['markGenerateProgress'];
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
  forgeDebug: (opts: { scope: string; level: string; runtimeId: string; message: string; context?: Record<string, unknown> }) => void;
}

type GenerateResult = {
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

// ─── Implementation ───────────────────────────────────────────────────────────

export async function executeStep(deps: ExecuteStepDeps): Promise<void> {
  const {
    contractId, runEpoch, stopped, executing, isStaleRun,
    epochState, backoffState, progressState, loopState,
    store, messageManager, scheduler, onRunnerIdle,
    transitionToIdle, queueNextStep, generateWithTimeoutRetries,
    markGenerateProgress, setLoopSignature, loopSignature,
    loadAgentContextInstructions, currentRuntime, db,
    forgeDebug,
  } = deps;

  if (stopped || executing || isStaleRun(runEpoch)) {
    return;
  }

  // Mark step active
  epochState.activeStepEpoch = runEpoch;
  progressState.lastStepStartedAt = Date.now();
  progressState.lastStepStage = 'step-started';

  let continueRunning = false;
  let drainWakeQueueAfterStep = false;
  let prompt = '';

  try {
    // ── Phase 1: check execution state ──────────────────────────────────────
    progressState.lastStepStage = 'checking-execution-state';
    const executionState = await withTimeout(
      store.getExecutionState(deps.runtimeId),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent execution state lookup timed out for ${deps.runtimeId}`,
    );

    if (executionState === 'idle' || isStaleRun(runEpoch)) {
      return;
    }

    if (executionState === 'absent') {
      await withTimeout(
        store.setExecutionState(deps.runtimeId, 'running'),
        RUNNER_AWAIT_TIMEOUT_MS,
        `Agent execution state update timed out for ${deps.runtimeId}`,
      );
    }

    // ── Phase 2: load contract ───────────────────────────────────────────────
    progressState.lastStepStage = 'loading-runnable-contract';
    const contract = await withTimeout(
      store.getRunnableContract(deps.runtimeId),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent runnable contract lookup timed out for ${deps.runtimeId}`,
    );

    if (isStaleRun(runEpoch)) {
      return;
    }

    if (contract === undefined || contract === null) {
      await transitionToIdle(runEpoch, { deferWakeQueueDrain: true });
      drainWakeQueueAfterStep = true;
      return;
    }

    if (contract.id !== contractId) {
      await queueNextStep(runEpoch);
      return;
    }

    // ── Phase 3: build prompt and run generation ────────────────────────────
    const stepLongTermMemoryRecallSystemText = null; // TODO: extract from agent-runner.ts
    progressState.lastStepStage = 'flushing-pending-run-messages';
    prompt = ''; // TODO: wire flushPendingRunMessages from agent-runner.ts

    progressState.lastStepStage = 'agent-generate';
    const result = await generateWithTimeoutRetries(
      prompt,
      runEpoch,
      contractId,
      contract,
      stepLongTermMemoryRecallSystemText,
      {
        db,
        runtime: null as never,         // TODO: wire from agent-runner.ts
        currentRuntime,
        store,
        usage: null as never,         // TODO: wire from agent-runner.ts
        notifications: null as never, // TODO: wire from agent-runner.ts
        homeMetricSnapshots: null as never, // TODO: wire from agent-runner.ts
        messageManager,
        runLastMessages: 0,            // TODO: wire from agent-runner.ts
        flushPendingRunMessages: () => null, // TODO: wire from agent-runner.ts
        scheduler,
        epochState,
        backoffState,
        progressState,
        loopState,
        loopDetector: null as never,  // TODO: wire from agent-runner.ts
        currentGenerateAbortController: null,
        setCurrentGenerateAbortController: () => {},
        markGenerateProgress,
        setBackoffMs: (ms: number) => { backoffState.backoffMs = ms; },
        setInstant: (v: boolean) => { backoffState.instant = v; },
        setNextStepAt: (v: number | null) => { backoffState.nextStepAt = v; },
        setLoopSignature,
        loopSignature,
        activeRunId: null,
        loadAgentContextInstructions,
        isStopped: () => stopped,
      },
    );

    if (isStaleRun(runEpoch)) {
      return;
    }

    // ── Phase 4: interpret result ────────────────────────────────────────────
    progressState.lastStepStage = 'finalizing-run';
    const controlDirective = extractRunnerControlDirective(result ?? { text: '' });
    const stopRequested = controlDirective === 'stop';

    if (stopRequested && messageManager.getPendingCount() === 0) {
      backoffState.nextStepAt = null;
      loopState.repeatedLoopCount = 0;
      await transitionToIdle(runEpoch, { deferWakeQueueDrain: true });
      drainWakeQueueAfterStep = true;
      return;
    }

    scheduler.resetBackoff();
    continueRunning = messageManager.getPendingCount() > 0;
  } catch (error) {
    if (isStaleRun(runEpoch)) {
      return;
    }

    forgeDebug({
      scope: 'agent-runner',
      level: 'error',
      runtimeId: deps.runtimeId,
      message: 'step failed',
      context: {
        mastraId: deps.mastraId,
        pricingModelKey: deps.pricingModelKey,
        modelProfileId: deps.modelProfileId,
        stepStartedAt: progressState.lastStepStartedAt,
        stepStage: progressState.lastStepStage,
        lastGenerateProgress: progressState.lastGenerateProgress,
        prompt,
        error: serializeError(error),
      },
    });

    await withTimeout(
      store.setExecutionAbsent(deps.runtimeId, formatAbsentExecutionError({
        stage: progressState.lastStepStage ?? 'unknown',
        lastGenerateProgress: progressState.lastGenerateProgress,
        error,
      })),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent execution state update timed out for ${deps.runtimeId}`,
    ).catch((stateError) => {
      forgeDebug({
        scope: 'agent-runner', level: 'error',
        runtimeId: deps.runtimeId,
        message: 'failed to set absent state',
        context: { stateError },
      });
    });

    scheduler.scheduleNextStep(
      nextExponentialBackoffMs(backoffState.backoffMs).current,
    );
  } finally {
    progressState.lastStepStartedAt = null;
    progressState.lastStepStage = null;
    progressState.lastGenerateProgress = null;

    if (epochState.activeStepEpoch === runEpoch) {
      epochState.activeStepEpoch = 0;
    }

    if (drainWakeQueueAfterStep && !isStaleRun(runEpoch)) {
      await onRunnerIdle();
    }

    if (continueRunning && !isStaleRun(runEpoch)) {
      await queueNextStep(runEpoch);
    }
  }
}
