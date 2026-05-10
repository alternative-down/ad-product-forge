/**
 * Agent Execute Loop — extracted from agent-runner.ts (#1718 iter 2)
 *
 * Stateless module: all mutable state lives in agent-runner.ts.
 * Functions accept an ExecuteDeps interface and a fns callback object
 * to break circular dependencies.
 */

import type { AgentWakeEvent } from '@forge-runtime/core';
import type { Database } from '../database/schema';
import type { InternalAgentRuntime } from './runtime/types';
import type { AgentContractStore } from './agent-contract-store';
import type { SystemSettingsStore } from '../system-settings/store';
import type { AgentNotificationStore } from '../notifications/store';
import type { AgentHomeMetricSnapshotStore } from './agent-home-metric-snapshot-store';
import type { AgentRunnerUsage } from './agent-runner-usage';
import type { Scheduler } from './agent-runner-scheduler';
import type { LoopDetector } from './agent-runner-loop-detector';
import type { MessageManager } from './agent-runner-messages';
import type { AgentWakeQueue } from '@forge-runtime/core';
import type { GenerateDeps } from './agent-runner-generate';

import { withTimeout } from '../utils/async';
import { createId } from '../utils/id';
import {
  forgeDebug,
  serializeError,
  formatAbsentExecutionError,
  extractRunnerControlDirective,
} from './agent-runner-helpers';
import { advanceStepEpoch } from './agent-runner-state';
import { TEN_MINUTES_MS } from './time-constants';
import { RUNNER_AWAIT_TIMEOUT_MS } from './agent-runner-timeouts';

// ─── Shared state types ─────────────────────────────────────────────────────────

export interface EpochState {
  activeRunEpoch: number;
  activeStepEpoch: number;
  activeGenerateToken: number;
  activeRunId: string | null;
}

export interface BackoffState {
  backoffMs: number;
  instant: boolean;
  nextStepAt: number | null;
}

export interface ProgressState {
  lastStepStartedAt: number | null;
  lastStepStage: string | null;
  lastGenerateProgress: {
    stage: string;
    at: number;
    detail: Record<string, unknown> | null;
  } | null;
}

export interface LoopState {
  lastLoopSignature: string | null;
  repeatedLoopCount: number;
}

// Re-export for consumers
export type { GenerateDeps };

// ─── Execute deps ──────────────────────────────────────────────────────────────

/** All mutable runner state — injected by agent-runner.ts */
export interface ExecuteDeps {
  runtime: InternalAgentRuntime;
  currentRuntime: InternalAgentRuntime;
  db: Database;
  store: AgentContractStore;
  notifications: AgentNotificationStore;
  homeMetricSnapshots: AgentHomeMetricSnapshotStore;
  usage: AgentRunnerUsage;
  systemSettings: SystemSettingsStore;
  messageManager: MessageManager;
  scheduler: Scheduler;
  wakeQueue: AgentWakeQueue;
  loopDetector: LoopDetector;

  // Mutable scalar state
  stopped: boolean;
  startingRun: boolean;
  startingRunStartedAt: number | null;
  executing: boolean;
  activeRunId: string | null;
  pendingLongTermMemoryRecallSystemText: string | null;
  lastWakeStartedAt: number | null;
  nextStepAt: number | null;

  // Structured state
  epochState: EpochState;
  backoffState: BackoffState;
  progressState: ProgressState;
  loopState: LoopState;

  // Abort controller ref (for cancellation during generate)
  currentGenerateAbortController: AbortController | null;
  setCurrentGenerateAbortController: (c: AbortController | null) => void;

  // Generate fn from agent-runner-generate.ts
  generateWithTimeoutRetries: GenerateDeps['generateWithTimeoutRetries'];

  // Pre-built generate deps (all fields except currentGenerateAbortController)
  generateDeps: Omit<GenerateDeps, 'currentGenerateAbortController' | 'setCurrentGenerateAbortController'>;
}

// ─── planNextAttempt ───────────────────────────────────────────────────────────

export interface PlanNextAttemptResult {
  execute: 'idle' | false | true;
  delayMs?: number;
  contractId?: string;
  contract?: { id: string; budgetUsd: number; endsAt: number };
}

export async function planNextAttempt(
  deps: ExecuteDeps,
): Promise<PlanNextAttemptResult> {
  const contract = await withTimeout(
    deps.store.getRunnableContract(deps.runtime.id),
    RUNNER_AWAIT_TIMEOUT_MS,
    `Agent runnable contract lookup timed out for ${deps.runtime.id}`,
  );

  if (!contract) {
    return { execute: 'idle' };
  }

  const spentUsd = await withTimeout(
    deps.store.getContractSpend(contract.id),
    RUNNER_AWAIT_TIMEOUT_MS,
    `Agent contract spend lookup timed out for ${deps.runtime.id}`,
  );

  const remainingBudgetUsd = contract.budgetUsd - spentUsd;
  const estimatedStepUsd = await withTimeout(
    deps.usage.estimateStepCostUsd(),
    RUNNER_AWAIT_TIMEOUT_MS,
    `Agent step cost estimate timed out for ${deps.runtime.id}`,
  );

  if (estimatedStepUsd !== null && remainingBudgetUsd < estimatedStepUsd) {
    return { execute: 'idle' };
  }

  deps.scheduler.resetBackoff();
  const settings = await withTimeout(
    deps.systemSettings.getSettings(),
    RUNNER_AWAIT_TIMEOUT_MS,
    `System settings lookup timed out for ${deps.runtime.id}`,
  );

  const delayMs = deps.scheduler.getState().instant || !settings.stepDelayEnabled
    ? 0
    : calculateDelayMs(contract.endsAt, remainingBudgetUsd, estimatedStepUsd);

  return {
    execute: true,
    contractId: contract.id,
    contract,
    delayMs,
  };
}

function calculateDelayMs(
  endsAt: number,
  remainingBudgetUsd: number,
  estimatedStepUsd: number | null,
): number {
  if (estimatedStepUsd === null || estimatedStepUsd <= 0) return 0;
  const remainingTimeMs = endsAt - Date.now();
  const stepsPossible = remainingBudgetUsd / estimatedStepUsd;
  if (remainingTimeMs <= 0 || stepsPossible <= 0) return 0;
  return remainingTimeMs / stepsPossible;
}

// ─── isLocallyIdle ─────────────────────────────────────────────────────────────

export function isLocallyIdle(
  deps: ExecuteDeps,
  timer: ReturnType<typeof setTimeout> | null,
): boolean {
  return !deps.stopped && !deps.startingRun && !deps.executing && timer === null;
}

// ─── transitionToIdle ──────────────────────────────────────────────────────────

export async function transitionToIdle(
  deps: ExecuteDeps,
  runEpoch: number,
  isStaleRun: (runEpoch: number) => boolean,
  options: { deferWakeQueueDrain?: boolean } = {},
): Promise<void> {
  await withTimeout(
    deps.store.setExecutionState(deps.runtime.id, 'idle'),
    RUNNER_AWAIT_TIMEOUT_MS,
    `Agent execution state update timed out for ${deps.runtime.id}`,
  );

  if (!options.deferWakeQueueDrain) {
    await deps.wakeQueue.onRunnerIdle();
  }
}

// ─── beginRun ─────────────────────────────────────────────────────────────────

export interface BeginRunInput {
  reloadRuntime: boolean;
  wakeStartedAt: number;
  markRunning: boolean;
}

export async function beginRun(
  input: BeginRunInput,
  deps: ExecuteDeps,
  fns: {
    isStaleRun: (runEpoch: number) => boolean;
    startNewRunEpoch: () => number;
    refreshRunFlushSettings: () => Promise<void>;
    resetRunLastMessages: () => Promise<void>;
    reloadRuntimeForNewRun: (runEpoch: number) => Promise<void>;
    transitionToIdle: (runEpoch: number, opts?: { deferWakeQueueDrain?: boolean }) => Promise<void>;
    queueNextStep: (runEpoch: number) => Promise<void>;
  },
): Promise<void> {
  const { reloadRuntime, wakeStartedAt, markRunning } = input;

  deps.startingRun = true;
  deps.startingRunStartedAt = Date.now();
  deps.epochState.activeRunId = null;
  const runEpoch = fns.startNewRunEpoch();

  try {
    deps.activeRunId = createId();
    deps.scheduler.setInstant(true);
    deps.scheduler.resetBackoff();
    deps.lastWakeStartedAt = input.wakeStartedAt;
    deps.loopDetector.reset();
    deps.messageManager.resetFlushedRunEventKeys();
    deps.pendingLongTermMemoryRecallSystemText = null;
    await fns.refreshRunFlushSettings();
    await fns.resetRunLastMessages();

    if (reloadRuntime) {
      await fns.reloadRuntimeForNewRun(runEpoch);
    }

    if (fns.isStaleRun(runEpoch)) {
      return;
    }

    deps.currentRuntime.longTermMemory?.onAgentRunning();

    if (markRunning) {
      await withTimeout(
        deps.store.setExecutionState(deps.runtime.id, 'running'),
        RUNNER_AWAIT_TIMEOUT_MS,
        `Agent execution state update timed out for ${deps.runtime.id}`,
      );
    }

    if (fns.isStaleRun(runEpoch)) {
      return;
    }

    await fns.queueNextStep(runEpoch);
  } catch (error) {
    forgeDebug({
      scope: 'agent-runner',
      level: 'error',
      runtimeId: deps.runtime.id,
      message: 'failed to begin run',
      context: { error },
    });
    if (!fns.isStaleRun(runEpoch)) {
      await fns.transitionToIdle(runEpoch);
    }
  } finally {
    deps.startingRun = false;
    deps.startingRunStartedAt = null;
  }
}

// ─── execute ──────────────────────────────────────────────────────────────────

export async function execute(
  events: AgentWakeEvent[],
  deps: ExecuteDeps,
  fns: {
    beginRun: (input: BeginRunInput) => Promise<void>;
  },
): Promise<void> {
  if (deps.stopped) {
    return;
  }

  const executionState = await withTimeout(
    deps.store.getExecutionState(deps.runtime.id),
    RUNNER_AWAIT_TIMEOUT_MS,
    `Agent execution state lookup timed out for ${deps.runtime.id}`,
  );

  const idleOnlyEvents = events.filter((e) => e.idleOnly);
  const runnableEvents = events.filter((e) => !e.idleOnly);

  if (executionState !== 'idle' || deps.startingRun) {
    deps.messageManager.appendPendingRunMessages(runnableEvents);
    for (const event of idleOnlyEvents) {
      deps.wakeQueue.notifyExternalEvent(event);
    }
    return;
  }

  deps.messageManager.appendPendingRunMessages(runnableEvents);

  if (idleOnlyEvents.length > 0) {
    deps.messageManager.appendPendingRunMessages(idleOnlyEvents, {
      allowIdleOnly: true,
    });
  }

  await fns.beginRun({
    reloadRuntime: false,
    wakeStartedAt: Date.now(),
    markRunning: true,
  });
}

// ─── queueNextStep ──────────────────────────────────────────────────────────────

export async function queueNextStep(
  deps: ExecuteDeps,
  fns: {
    planNextAttempt: () => Promise<PlanNextAttemptResult>;
    transitionToIdle: (runEpoch: number, opts?: { deferWakeQueueDrain?: boolean }) => Promise<void>;
    executeStep: (contractId: string, runEpoch: number) => void;
    isStaleRun: (runEpoch: number) => boolean;
  },
  runEpoch = deps.epochState.activeRunEpoch,
): Promise<void> {
  if (deps.stopped || deps.executing) {
    return;
  }

  try {
    const executionState = await withTimeout(
      deps.store.getExecutionState(deps.runtime.id),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent execution state lookup timed out for ${deps.runtime.id}`,
    );

    if (executionState === 'idle' || fns.isStaleRun(runEpoch)) {
      return;
    }

    const nextAttempt = await fns.planNextAttempt();

    if (fns.isStaleRun(runEpoch)) {
      return;
    }

    if (nextAttempt.execute === 'idle') {
      deps.scheduler.setInstant(false);
      await fns.transitionToIdle(runEpoch);
      return;
    }

    if (!nextAttempt.execute) {
      deps.scheduler.setInstant(false);
      return;
    }

    deps.scheduler.setInstant(false);
    deps.scheduler.scheduleNextStep(nextAttempt.delayMs ?? 0, () =>
      fns.executeStep(nextAttempt.contractId!, runEpoch),
    );
  } catch (error) {
    forgeDebug({
      scope: 'agent-runner',
      level: 'error',
      runtimeId: deps.runtime.id,
      message: 'failed to schedule next step',
      context: { error },
    });
    deps.scheduler.setInstant(false);
    const nextMs = nextBackoffMs(deps.backoffState);
    deps.scheduler.scheduleNextStep(nextMs, () =>
      fns.executeStep(nextAttempt.contractId!, runEpoch),
    );
  }
}

// ─── notifyExternalEvent ───────────────────────────────────────────────────────

export function notifyExternalEvent(
  event: AgentWakeEvent,
  deps: ExecuteDeps,
  timer: ReturnType<typeof setTimeout> | null,
  isLocallyIdle: (timer: ReturnType<typeof setTimeout> | null) => boolean,
): void {
  if (deps.stopped) {
    return;
  }

  deps.wakeQueue.notifyExternalEvent(event);

  if (event.idleOnly && isLocallyIdle(timer)) {
    void deps.wakeQueue.onRunnerIdle();
  }
}

// ─── executeStep ─────────────────────────────────────────────────────────────

export async function executeStep(
  contractId: string,
  runEpoch: number,
  deps: ExecuteDeps,
  fns: {
    isStaleRun: (runEpoch: number) => boolean;
    transitionToIdle: (runEpoch: number, opts?: { deferWakeQueueDrain?: boolean }) => Promise<void>;
    queueNextStep: (runEpoch: number) => Promise<void>;
    generateWithTimeoutRetries: GenerateDeps['generateWithTimeoutRetries'];
    generateDeps: Omit<GenerateDeps, 'currentGenerateAbortController' | 'setCurrentGenerateAbortController'>;
  },
): Promise<void> {
  if (deps.stopped || deps.executing || fns.isStaleRun(runEpoch)) {
    return;
  }

  deps.executing = true;
  advanceStepEpoch(deps.epochState);
  deps.activeRunId = deps.epochState.activeRunId;

  let continueRunning = false;
  let drainWakeQueueAfterStep = false;
  let prompt = '';
  deps.progressState.lastStepStartedAt = Date.now();
  deps.progressState.lastStepStage = 'step-started';

  try {
    deps.progressState.lastStepStage = 'checking-execution-state';
    const executionState = await withTimeout(
      deps.store.getExecutionState(deps.runtime.id),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent execution state lookup timed out for ${deps.runtime.id}`,
    );

    if (executionState === 'idle' || fns.isStaleRun(runEpoch)) {
      return;
    }

    if (executionState === 'absent') {
      await withTimeout(
        deps.store.setExecutionState(deps.runtime.id, 'running'),
        RUNNER_AWAIT_TIMEOUT_MS,
        `Agent execution state update timed out for ${deps.runtime.id}`,
      );
    }

    deps.progressState.lastStepStage = 'loading-runnable-contract';
    const contract = await withTimeout(
      deps.store.getRunnableContract(deps.runtime.id),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent runnable contract lookup timed out for ${deps.runtime.id}`,
    );

    if (fns.isStaleRun(runEpoch)) {
      return;
    }

    if (!contract) {
      await fns.transitionToIdle(runEpoch, { deferWakeQueueDrain: true });
      drainWakeQueueAfterStep = true;
      return;
    }

    if (contract.id !== contractId) {
      await fns.queueNextStep(runEpoch);
      return;
    }

    const stepLongTermMemoryRecallSystemText = deps.pendingLongTermMemoryRecallSystemText;
    deps.pendingLongTermMemoryRecallSystemText = null;
    deps.progressState.lastStepStage = 'flushing-pending-run-messages';
    prompt = deps.messageManager.flushPendingRunMessages({
      allowOriginIdleOnly: true,
    }) ?? '';
    forgeDebug({
      scope: 'agent-runner',
      level: 'debug',
      runtimeId: deps.runtime.id,
      message: 'executing step',
    });

    deps.progressState.lastStepStage = 'agent-generate';

    const result = await deps.generateWithTimeoutRetries(
      prompt,
      runEpoch,
      contractId,
      contract,
      stepLongTermMemoryRecallSystemText,
      {
        ...fns.generateDeps,
        currentGenerateAbortController: deps.currentGenerateAbortController,
        setCurrentGenerateAbortController: deps.setCurrentGenerateAbortController,
      },
    );

    if (fns.isStaleRun(runEpoch)) {
      return;
    }
    deps.progressState.lastStepStage = 'finalizing-run';

    const controlDirective = extractRunnerControlDirective(result);
    const stopRequested = controlDirective === 'stop';

    if (stopRequested && deps.messageManager.getPendingCount() === 0) {
      deps.nextStepAt = null;
      deps.loopDetector.reset();
      await fns.transitionToIdle(runEpoch, { deferWakeQueueDrain: true });
      drainWakeQueueAfterStep = true;
      return;
    }

    deps.scheduler.resetBackoff();
    continueRunning = deps.messageManager.getPendingCount() > 0;
  } catch (error) {
    if (fns.isStaleRun(runEpoch)) {
      return;
    }

    forgeDebug({
      scope: 'agent-runner',
      level: 'error',
      runtimeId: deps.runtime.id,
      message: 'step failed',
      context: {
        mastraId: deps.currentRuntime.mastraId,
        pricingModelKey: deps.currentRuntime.pricingModelKey,
        modelProfileId: deps.currentRuntime.modelProfileId,
        stepStartedAt: deps.progressState.lastStepStartedAt,
        stepStage: deps.progressState.lastStepStage,
        lastGenerateProgress: deps.progressState.lastGenerateProgress,
        prompt,
        error: serializeError(error),
      },
    });

    await withTimeout(
      deps.store.setExecutionAbsent(
        deps.runtime.id,
        formatAbsentExecutionError({
          stage: deps.progressState.lastStepStage,
          lastGenerateProgress: deps.progressState.lastGenerateProgress,
          error,
        }),
      ),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent execution state update timed out for ${deps.runtime.id}`,
    ).catch((stateError) => {
      forgeDebug({
        scope: 'agent-runner',
        level: 'error',
        runtimeId: deps.runtime.id,
        message: 'failed to set absent state',
        context: { stateError },
      });
    });

    const nextMs = nextBackoffMs(deps.backoffState);
    deps.scheduler.scheduleNextStep(nextMs, () =>
      fns.executeStep(contractId, runEpoch),
    );
  } finally {
    deps.progressState.lastStepStartedAt = null;
    deps.progressState.lastStepStage = null;
    deps.progressState.lastGenerateProgress = null;

    if (deps.epochState.activeStepEpoch === runEpoch) {
      deps.executing = false;
    }

    if (drainWakeQueueAfterStep && !fns.isStaleRun(runEpoch)) {
      await deps.wakeQueue.onRunnerIdle();
    }

    if (continueRunning && !fns.isStaleRun(runEpoch)) {
      await fns.queueNextStep(runEpoch);
    }
  }
}

function nextBackoffMs(backoffState: BackoffState): number {
  const delayMs = backoffState.backoffMs;
  backoffState.backoffMs = Math.min(delayMs * 2, TEN_MINUTES_MS);
  return delayMs;
}

// ─── startNewRunEpoch ────────────────────────────────────────────────────────

export function startNewRunEpoch(deps: ExecuteDeps): number {
  deps.epochState.activeRunEpoch += 1;
  deps.epochState.activeStepEpoch = 0;
  deps.epochState.activeGenerateToken = 0;
  deps.epochState.activeRunId = null;
  deps.scheduler.startNewRunEpoch();
  return deps.epochState.activeRunEpoch;
}