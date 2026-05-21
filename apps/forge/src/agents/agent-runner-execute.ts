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
import { extractRunnerControlDirective } from './agent-runner-control-directives';
import { serializeError, formatAbsentExecutionError } from './agent-runner-error-formatting';
import { nextExponentialBackoffMs } from './agent-runner-delay';

import type {} from /*unused*/ '../database/schema';
import type {} from /*unused*/ './runtime/types';
import type {} from /*unused*/ './agent-contract-store';
import type {} from /*unused*/ '../notifications/store';
import type {} from /*unused*/ './agent-home-metric-snapshot-store';
import type { AgentRunnerUsage as _AgentRunnerUsage } from './agent-runner-usage';
import type { Scheduler as _Scheduler } from './agent-runner-scheduler';
import type {} from /*unused*/ './agent-runner-messages';
import type { LoopDetector as _LoopDetector } from './agent-runner-loop-detector';
import { RUNNER_AWAIT_TIMEOUT_MS } from './agent-runner-generate';
import type {
  ExecuteStepDeps,
  ExecuteEpochState,
  ExecuteBackoffState,
  ExecuteProgressState,
  ExecuteLoopState,
  GenerateResult,
} from './agent-runner-execute-types';

// Re-export types for consumers of this module
export type {
  ExecuteStepDeps,
  ExecuteEpochState,
  ExecuteBackoffState,
  ExecuteProgressState,
  ExecuteLoopState,
  GenerateResult,
};

// ─── Implementation ───────────────────────────────────────────────────────────

export async function executeStep(deps: ExecuteStepDeps): Promise<void> {
  const {
    contractId,
    runEpoch,
    stopped,
    executingRef,
    isStaleRun,
    epochState,
    backoffState,
    progressState,
    loopState,
    store,
    messageManager,
    scheduler,
    loopDetector,
    onRunnerIdle,
    transitionToIdle,
    queueNextStep,
    generateWithTimeoutRetries,
    markGenerateProgress,
    setLoopSignature,
    loopSignature,
    loadAgentContextInstructions,
    currentRuntime,
    db,
    forgeDebug,
    runtime,
    usage,
    notifications,
    homeMetricSnapshots,
    runLastMessages,
    flushPendingRunMessages,
    currentGenerateAbortController,
    setCurrentGenerateAbortController,
    pendingLongTermMemoryRecallSystemText,
  } = deps;

  if (stopped || executingRef.value || isStaleRun(runEpoch)) {
    return;
  }

  // Mark step active
  epochState.activeStepEpoch = runEpoch;
  progressState.lastStepStartedAt = Date.now();
  progressState.lastStepStage = 'step-started';

  let continueRunning = false;
  let drainWakeQueueAfterStep = false;
  let prompt = '';

  // Check execution state BEFORE taking the executing lock.
  // If already idle, exit without ever setting executingRef,
  // so the runner stays in a consistent state (no stale lock).
  progressState.lastStepStage = 'checking-execution-state';
  const executionState = await withTimeout(
    store.getExecutionState(deps.runtimeId),
    RUNNER_AWAIT_TIMEOUT_MS,
    `Agent execution state lookup timed out for ${deps.runtimeId}`,
  );

  if (executionState === 'idle' || isStaleRun(runEpoch)) {
    progressState.lastStepStartedAt = null;
    progressState.lastStepStage = null;
    return;
  }

  // Now take the lock — we're committed to executing
  executingRef.value = true;

  try {
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
    const stepLongTermMemoryRecallSystemText = pendingLongTermMemoryRecallSystemText;
    progressState.lastStepStage = 'flushing-pending-run-messages';
    prompt = flushPendingRunMessages({ allowOriginIdleOnly: true }) ?? '';

    forgeDebug({
      scope: 'agent-runner',
      level: 'debug',
      runtimeId: deps.runtimeId,
      message: 'executing step',
    });

    progressState.lastStepStage = 'agent-generate';
    const result = await generateWithTimeoutRetries(
      prompt,
      runEpoch,
      contractId,
      contract,
      stepLongTermMemoryRecallSystemText,
      {
        db,
        runtime,
        currentRuntime,
        store,
        usage,
        notifications,
        homeMetricSnapshots,
        messageManager: messageManager,
        runLastMessages,
        flushPendingRunMessages,
        scheduler,
        epochState,
        backoffState,
        progressState,
        loopState,
        loopDetector,
        currentGenerateAbortController,
        setCurrentGenerateAbortController,
        markGenerateProgress,
        setBackoffMs: (ms: number) => {
          backoffState.backoffMs = ms;
        },
        setInstant: (v: boolean) => {
          backoffState.instant = v;
        },
        setNextStepAt: (v: number | null) => {
          backoffState.nextStepAt = v;
        },
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
    const controlDirective = result ? extractRunnerControlDirective(result) : null;
    const stopRequested = controlDirective === 'stop';

    if (stopRequested) {
      // Signal the finally block to drain the wake queue.
      // Only call transitionToIdle when there are no pending messages.
      // With pending messages, we stop generating but stay available.
      if (messageManager.getPendingCount() === 0) {
        backoffState.nextStepAt = null;
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (loopDetector?.reset) {
          loopDetector.reset();
        }
        await transitionToIdle(runEpoch, { deferWakeQueueDrain: true });
      }
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
      store.setExecutionAbsent(
        deps.runtimeId,
        formatAbsentExecutionError({
          stage: progressState.lastStepStage,
          lastGenerateProgress: progressState.lastGenerateProgress,
          error,
        }),
      ),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent execution state update timed out for ${deps.runtimeId}`,
    ).catch((stateError) => {
      forgeDebug({
        scope: 'agent-runner',
        level: 'error',
        runtimeId: deps.runtimeId,
        message: 'failed to set absent state',
        context: { stateError },
      });
    });
    scheduler.scheduleNextStep(nextExponentialBackoffMs(backoffState.backoffMs).current, () =>
      executeStep({ ...deps, stopped: false, executingRef: { value: false } }),
    );
  } finally {
    progressState.lastStepStartedAt = null;
    progressState.lastStepStage = null;
    progressState.lastGenerateProgress = null;
    if (epochState.activeStepEpoch === runEpoch) {
      epochState.activeStepEpoch = 0;
      executingRef.value = false;
    }

    if (drainWakeQueueAfterStep && !isStaleRun(runEpoch)) {
      // Drain the wake queue so new incoming messages can wake the agent.
      // loopDetector.reset() and backoffState.nextStepAt = null are already
      // set in the STOP block before this finally runs.
      await onRunnerIdle();
    }

    if (continueRunning && !isStaleRun(runEpoch)) {
      await queueNextStep(runEpoch);
    }
  }
}
