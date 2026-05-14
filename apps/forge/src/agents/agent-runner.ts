import { forgeDebug } from '@forge-runtime/core';
import { eq, and } from 'drizzle-orm';
import { agentSchedules } from '../database/schema';
import { createId } from '../utils/id';
import { createAgentWakeQueue } from '@forge-runtime/core';
import type { AgentWakeEvent } from '@forge-runtime/core';

import type { InternalAgentRuntime } from './runtime/types';
import { createAgentContractStore } from './agent-contract-store';

import type {Database} from '../database/schema';
import { createSystemSettingsStore } from '../system-settings/store';
import { createAgentNotificationStore } from '../notifications/store';
import { createAgentRunnerUsage } from './agent-runner-usage';
import { createAgentHomeMetricSnapshotStore } from './agent-home-metric-snapshot-store';
import { readAgentHomeMetricSnapshot } from './agent-home-metrics';
import { formatPendingRunEvents, RUN_STOP_REMINDER } from './agent-runner-wake';
import { createLoopManager, type LoopManager } from './agent-runner-loop-manager';
import { createRunnerMessageManager, type RunnerMessageManagerState } from './agent-runner-message-manager';

import {
  AGENT_CONTEXT_WARNING_CHAR_LIMIT,
  WORKING_MEMORY_WARNING_CHAR_LIMIT,
  AGENT_CONTEXT_FILE_PATH,
} from '../utils/constants';

import {
  serializeError,
  formatAbsentExecutionError,
  extractAbsentErrorDetails,
} from './agent-runner-error-formatting';
import {
  delay,
  buildIterationLoopSignature,
  buildStepSystemPrompt,
  extractRunnerControlDirective,
  extractRunnerControlDirectiveFromIteration,
} from './agent-runner-control-directives';
import {
  buildRecallStepFromIteration,
  didIterationProduceVisibleAssistantText,
} from './agent-runner-iteration-helpers';
import {
  collectStepTextParts,
  hasExactControlDirective,
} from './agent-runner-helpers';
import { withTimeout } from '../utils/async';
import { createLoopDetector } from './agent-runner-loop-detector';
import { isStaleRun, advanceRunEpoch, advanceStepEpoch, advanceGenerateToken, nextBackoff, resetBackoff, calculateDelayMs } from './agent-runner-state';
import { calculateBudgetDelayMs, nextExponentialBackoffMs } from './agent-runner-delay';
import { loadAgentContextInstructions } from './agent-runner-context-loaders';
import {
  generateWithTimeoutRetries,
  createGenerateTimeoutGuard,
  touchGenerateTimeout,
  clearGenerateTimeout,
  startGenerateAttempt,
  finishGenerateAttempt,
  type GenerateTimeoutHandle,
} from './agent-runner-generate';

import { createScheduler, type SchedulerState } from './agent-runner-scheduler';
import { runHealthcheck as healthcheckRunHealthcheck } from './agent-runner-healthcheck';
import { ONE_MINUTE_MS, TEN_MINUTES_MS, FIFTEEN_MINUTES_MS } from './time-constants';
const GENERATE_TIMEOUT_MS = FIFTEEN_MINUTES_MS;
const GENERATE_TIMEOUT_MAX_ATTEMPTS = 1;
const GENERATE_TIMEOUT_BACKOFF_MS = 5_000;
const GENERATE_MAX_STEPS_PER_RUN = 10_000;
const RUNNER_AWAIT_TIMEOUT_MS = 30_000;
const STARTING_RUN_TIMEOUT_MS = RUNNER_AWAIT_TIMEOUT_MS * 2;
const CONTEXT_DECORATION_TIMEOUT_MS = 5_000;
const RUNNER_HEALTHCHECK_INTERVAL_MS = 30_000;
const DEFAULT_RUN_LAST_MESSAGES = 20;
const FULL_MEMORY_LOAD_LAST_MESSAGES = Number.MAX_SAFE_INTEGER;
const MAX_FLUSHED_RUN_EVENT_KEYS = 2_000;
export function createAgentRunner(
  db: Database,
  runtime: InternalAgentRuntime,
  options: {
    reloadRuntime?: () => Promise<InternalAgentRuntime>;
    onRuntimeReloaded?: (runtime: InternalAgentRuntime) => void;
    workspaceBasePath?: string;
  } = {},
) {
  const store = createAgentContractStore(db);
  const systemSettings = createSystemSettingsStore(db);
  const notifications = createAgentNotificationStore(db);
  const homeMetricSnapshots = createAgentHomeMetricSnapshotStore(db);
  let currentRuntime = runtime;
  let usage = createAgentRunnerUsage({ store, runtime: currentRuntime });
  const wakeQueue = createAgentWakeQueue({
    label: currentRuntime.id,
    execute,
  });

  const schedulerState: SchedulerState = {
    nextStepAt: null,
    backoffMs: ONE_MINUTE_MS,
    instant: false,
    activeRunEpoch: 0,
    activeStepEpoch: 0,
    activeGenerateToken: 0,
  };
  const scheduler = createScheduler(schedulerState, {
    getSystemSettings: () => systemSettings.getSettings(),
    getRunnableContract: (id) => store.getRunnableContract(id),
    getContractSpend: (id) => store.getContractSpend(id),
    estimateStepCostUsd: () => usage.estimateStepCostUsd(),
    runtimeId: runtime.id,
    setExecutionState: (id, state) => store.setExecutionState(id, state),
  });
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let instant = false;
  let startingRun = false;
  let startingRunStartedAt: number | null = null;
  let executing = false;
  let backoffMs = ONE_MINUTE_MS;
  let nextStepAt: number | null = null;
  let lastWakeStartedAt: number | null = null;
  let lastStepStartedAt: number | null = null;
  let lastStepStage: string | null = null;
  let lastGenerateProgress:
    | {
        stage: string;
        at: number;
        detail: Record<string, unknown> | null;
      }
    | null = null;
  const loopManager = createLoopManager({ lastLoopSignature: null, repeatedLoopCount: 0 });
  let activeRunEpoch = 0;
  let activeStepEpoch = 0;
  const activeGenerateToken = 0;
  let activeRunId: string | null = null;
  let currentGenerateAbortController: AbortController | null = null;
  let runLastMessages = DEFAULT_RUN_LAST_MESSAGES;
  let pendingLongTermMemoryRecallSystemText: string | null = null;
  const messageManager = createRunnerMessageManager(
    {
      flushedRunEventKeys: new Set<string>(),
      flushedRunEventKeyOrder: [] as string[],
      currentFlushSettings: {
        communicationDmFlushingEnabled: true,
        communicationGroupFlushingEnabled: true,
      },
      pendingRunMessages: new Map<string, AgentWakeEvent>(),
    },
    formatPendingRunEvents,
  );

  currentRuntime.onReceiveMessage(notifyExternalEvent);

  const epochState = { activeRunEpoch, activeStepEpoch, activeGenerateToken, activeRunId };
  const backoffState = { backoffMs, instant, nextStepAt };

  async function reloadRuntimeForNewRun(runEpoch: number) {
    if (!options.reloadRuntime) {
      return;
    }

    const previousRuntime = currentRuntime;
    const nextRuntime = await withTimeout(
      options.reloadRuntime(),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent runtime reload timed out for ${runtime.id}`,
    );

    if (isStaleRun(runEpoch)) {
      await withTimeout(
        nextRuntime.dispose(),
        RUNNER_AWAIT_TIMEOUT_MS,
        `Agent runtime disposal timed out for ${runtime.id}`,
      );
      return;
    }

    currentRuntime = nextRuntime;
    usage = createAgentRunnerUsage({ store, runtime: currentRuntime });
    currentRuntime.onReceiveMessage(notifyExternalEvent);
    options.onRuntimeReloaded?.(nextRuntime);
    await withTimeout(
      previousRuntime.dispose(),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Previous agent runtime disposal timed out for ${runtime.id}`,
    );
  }

  function clearTimer() { scheduler.clearTimer(); }

  function startHealthcheck() { scheduler.startHealthcheck(); }

  function clearHealthcheck() { scheduler.clearHealthcheck(); }

  function schedule(delayMs: number) { scheduler.scheduleNextStep(delayMs); }

  async function start() {
    if (stopped) {
      return;
    }

    scheduler.startHealthcheck();
    await refreshRunFlushSettings();

    const executionState = await withTimeout(
      store.getExecutionState(runtime.id),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent execution state lookup timed out for ${runtime.id}`,
    );

    if (executionState === 'idle') {
      await currentRuntime.longTermMemory?.onAgentIdle();
      return;
    }

    if (executionState === 'absent') {
      await beginRun({
        reloadRuntime: false,
        wakeStartedAt: Date.now(),
        markRunning: true,
      });
      return;
    }

    await beginRun({
      reloadRuntime: false,
      wakeStartedAt: Date.now(),
      markRunning: false,
    });
  }

  async function execute(events: AgentWakeEvent[]) {
    if (stopped) {
      return;
    }

    const executionState = await withTimeout(
      store.getExecutionState(runtime.id),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent execution state lookup timed out for ${runtime.id}`,
    );

    const idleOnlyEvents = events.filter((event) => event.idleOnly);
    const runnableEvents = events.filter((event) => !event.idleOnly);

    if (executionState !== 'idle' || startingRun) {
      appendPendingRunMessages(runnableEvents);

      for (const event of idleOnlyEvents) {
        wakeQueue.notifyExternalEvent(event);
      }

      return;
    }

    appendPendingRunMessages(runnableEvents);

    if (idleOnlyEvents.length > 0) {
      appendPendingRunMessages(idleOnlyEvents, {
        allowIdleOnly: true,
      });
    }

    await beginRun({
      reloadRuntime: false,
      wakeStartedAt: Date.now(),
      markRunning: true,
    });
  }

  function appendPendingRunMessages(
    events: AgentWakeEvent[],
    options: {
      allowIdleOnly?: boolean;
    } = {},
  ) {
    void messageManager.appendPendingRunMessages(events, options);
  }

  function flushPendingRunMessages(options: {
    allowOriginIdleOnly?: boolean;
  } = {}) {
    return messageManager.flushPendingRunMessages(options);
  }

  function stop() {
    stopped = true;
    startingRun = false;
    startingRunStartedAt = null;
    activeRunId = null;
    scheduler.stop();
    executing = false;
    clearTimer();
    clearHealthcheck();
    wakeQueue.stop();
    messageManager.reset();
  }

  async function forceIdle(options: {
    preserveQueuedWork?: boolean;
  } = {}) {
    const runEpoch = startNewRunEpoch();
    startingRun = false;
    startingRunStartedAt = null;
    executing = false;
    clearTimer();
    if (!options.preserveQueuedWork) {
      wakeQueue.stop();
      messageManager.getState().pendingRunMessages.clear();
    }
    messageManager.reset();
    scheduler.setInstant(false);
    resetLoopDetector();
    await withTimeout(
      store.setExecutionState(runtime.id, 'idle'),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent execution state update timed out for ${runtime.id}`,
    );
    await withTimeout(
      currentRuntime.longTermMemory?.onAgentIdle() ?? Promise.resolve(),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent long-term memory idle transition timed out for ${runtime.id}`,
    );

    if (isStaleRun(runEpoch)) {
      return;
    }

    lastWakeStartedAt = null;
    lastStepStartedAt = null;
    lastStepStage = null;
    nextStepAt = null;
  }

  async function runHealthcheck() {
    if (stopped) return;
    await healthcheckRunHealthcheck({
      runtimeId: runtime.id,
      getExecutionState: (id) =>
        withTimeout(store.getExecutionState(id), RUNNER_AWAIT_TIMEOUT_MS, `Agent execution state lookup timed out for ${id}`),
      isLocallyIdle,
      getPendingCount: () => messageManager.getPendingCount(),
      getWakeSnapshot: () => wakeQueue.getSnapshot(),
      onRunnerIdle: () => wakeQueue.onRunnerIdle(),
      beginRun: (opts) => beginRun(opts),
      queueNextStep,
      onStartingRunTimeout: () => {
        forgeDebug({ scope: 'agent-runner', level: 'warn', runtimeId: runtime.id, message: `startingRun exceeded ${STARTING_RUN_TIMEOUT_MS}ms; recovering local runner state` });
        startNewRunEpoch();
        startingRun = false;
        startingRunStartedAt = null;
        activeRunId = null;
      },
      syncStarterState: (running, startedAt) => { startingRun = running; startingRunStartedAt = startedAt; },
      syncExecuting: (val) => { executing = val; },
      syncTimer: (val) => { timer = val; },
      isStaleRun,
      notifyError: (error) => forgeDebug({ scope: 'agent-runner', level: 'error', runtimeId: runtime.id, message: 'healthcheck failed', context: { error: error instanceof Error ? error.message : String(error) } }),
    });
  }

  async function beginRun(input: {
    reloadRuntime: boolean;
    wakeStartedAt: number;
    markRunning: boolean;
  }) {
    if (stopped || startingRun) {
      return;
    }

    startingRun = true;
    startingRunStartedAt = Date.now();
    const runEpoch = startNewRunEpoch();

    try {
      activeRunId = createId();
      scheduler.setInstant(true);
      scheduler.resetBackoff();
      lastWakeStartedAt = input.wakeStartedAt;
      resetLoopDetector();
      messageManager.reset();
      pendingLongTermMemoryRecallSystemText = null;
      await refreshRunFlushSettings();
      await resetRunLastMessages();

      if (input.reloadRuntime) {
        await reloadRuntimeForNewRun(runEpoch);
      }

      if (isStaleRun(runEpoch)) {
        return;
      }

      currentRuntime.longTermMemory?.onAgentRunning();

      if (input.markRunning) {
        await withTimeout(
          store.setExecutionState(runtime.id, 'running'),
          RUNNER_AWAIT_TIMEOUT_MS,
          `Agent execution state update timed out for ${runtime.id}`,
        );
      }

      if (isStaleRun(runEpoch)) {
        return;
      }

      await queueNextStep(runEpoch);
    } catch (error) {
      forgeDebug({ scope: 'agent-runner', level: 'error', runtimeId: runtime.id, message: 'failed to begin run', context: { error: error instanceof Error ? error.message : String(error) } });
      if (!isStaleRun(runEpoch)) {
        await transitionToIdle(runEpoch);
      }
    } finally {
      startingRun = false;
      startingRunStartedAt = null;
    }
  }

  async function queueNextStep(runEpoch = activeRunEpoch) {
    if (stopped || executing || timer || isStaleRun(runEpoch)) {
      return;
    }

    try {
      const executionState = await withTimeout(
        store.getExecutionState(runtime.id),
        RUNNER_AWAIT_TIMEOUT_MS,
        `Agent execution state lookup timed out for ${runtime.id}`,
      );

      if (executionState === 'idle' || isStaleRun(runEpoch)) {
        return;
      }

      const nextAttempt = await planNextAttempt();

      if (isStaleRun(runEpoch)) {
        return;
      }

      if (nextAttempt.execute === 'idle') {
        scheduler.setInstant(false);
        await transitionToIdle(runEpoch);
        return;
      }

      if (!nextAttempt.execute) {
        scheduler.setInstant(false);
        scheduler.scheduleNextStep(nextAttempt.delayMs);
        return;
      }

      const delayMs = nextAttempt.delayMs;
      scheduler.setInstant(false);
      scheduler.scheduleNextStep(delayMs, () => executeStep(nextAttempt.contractId, runEpoch));
    } catch (error) {
      forgeDebug({ scope: 'agent-runner', level: 'error', runtimeId: runtime.id, message: 'failed to schedule next step', context: { error: error instanceof Error ? error.message : String(error) } });
      scheduler.setInstant(false);
      schedule(nextExponentialBackoffMs(scheduler.getState().backoffMs).current);
    }
  }

  async function executeStep(contractId: string, runEpoch: number) {
    if (stopped || executing || isStaleRun(runEpoch)) {
      return;
    }

    executing = true;
    advanceStepEpoch(epochState);
    activeStepEpoch = epochState.activeStepEpoch;
    let continueRunning = false;
    let drainWakeQueueAfterStep = false;
    let prompt = '';
    lastStepStartedAt = Date.now();
    lastStepStage = 'step-started';

    try {
      lastStepStage = 'checking-execution-state';
      const executionState = await withTimeout(
        store.getExecutionState(runtime.id),
        RUNNER_AWAIT_TIMEOUT_MS,
        `Agent execution state lookup timed out for ${runtime.id}`,
      );

      if (executionState === 'idle' || isStaleRun(runEpoch)) {
        return;
      }

      if (executionState === 'absent') {
        await withTimeout(
          store.setExecutionState(runtime.id, 'running'),
          RUNNER_AWAIT_TIMEOUT_MS,
          `Agent execution state update timed out for ${runtime.id}`,
        );
      }

      lastStepStage = 'loading-runnable-contract';
      const contract = await withTimeout(
        store.getRunnableContract(runtime.id),
        RUNNER_AWAIT_TIMEOUT_MS,
        `Agent runnable contract lookup timed out for ${runtime.id}`,
      );

      if (isStaleRun(runEpoch)) {
        return;
      }

      if (!contract) {
        await transitionToIdle(runEpoch, {
          deferWakeQueueDrain: true,
        });
        drainWakeQueueAfterStep = true;
        return;
      }

      if (contract.id !== contractId) {
        await queueNextStep(runEpoch);
        return;
      }

      const stepLongTermMemoryRecallSystemText = pendingLongTermMemoryRecallSystemText;
      pendingLongTermMemoryRecallSystemText = null;
      lastStepStage = 'flushing-pending-run-messages';
      prompt = flushPendingRunMessages({
        allowOriginIdleOnly: true,
      }) ?? '';
      forgeDebug({ scope: 'agent-runner', level: 'debug', runtimeId: runtime.id, message: 'executing step' });

      lastStepStage = 'agent-generate';
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
          messageManager,
          runLastMessages,
          flushPendingRunMessages,
          scheduler,
          epochState,
          backoffState,
          progressState,
          loopState,
          loopManager,
          currentGenerateAbortController,
          setCurrentGenerateAbortController: (c) => {
            currentGenerateAbortController = c;
          },
          markGenerateProgress,
          setBackoffMs: (ms) => {
            backoffMs = ms;
          },
          setInstant: (v) => {
            instant = v;
          },
          setNextStepAt: (v) => {
            nextStepAt = v;
          },
          setLoopSignature: (sig) => {
            loopManager.getState().lastLoopSignature = sig;
          },
          loopSignature: loopManager.getState().lastLoopSignature ?? '',
          activeRunId,
          loadAgentContextInstructions,
          isStopped: () => stopped,
        },
      );

      if (isStaleRun(runEpoch)) {
        return;
      }
      lastStepStage = 'finalizing-run';
      const controlDirective = extractRunnerControlDirective(result);
      const stopRequested = controlDirective === 'stop';

      if (stopRequested && messageManager.getPendingCount() === 0) {
        nextStepAt = null;
        resetLoopDetector();
        await transitionToIdle(runEpoch, {
          deferWakeQueueDrain: true,
        });
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
          runtimeId: runtime.id,
          message: 'step failed',
          context: {
            mastraId: currentRuntime.mastraId,
            pricingModelKey: currentRuntime.pricingModelKey,
            modelProfileId: currentRuntime.modelProfileId,
            stepStartedAt: lastStepStartedAt,
            stepStage: lastStepStage,
            lastGenerateProgress,
            prompt,
            error: serializeError(error),
          },
        });
      await withTimeout(
        store.setExecutionAbsent(runtime.id, formatAbsentExecutionError({
          stage: lastStepStage,
          lastGenerateProgress,
          error,
        })),
        RUNNER_AWAIT_TIMEOUT_MS,
        `Agent execution state update timed out for ${runtime.id}`,
      ).catch((stateError) => {
        forgeDebug({ scope: 'agent-runner', level: 'error', runtimeId: runtime.id, message: 'failed to set absent state', context: { stateError } });
      });
      schedule(nextExponentialBackoffMs(backoffMs).current);
    } finally {
      lastStepStartedAt = null;
      lastStepStage = null;
      lastGenerateProgress = null;
      // scheduler manages its own step epoch
      if (activeStepEpoch === runEpoch) {
        activeStepEpoch = 0;
        executing = false;
      }

      if (drainWakeQueueAfterStep && !isStaleRun(runEpoch)) {
        await wakeQueue.onRunnerIdle();
      }

      if (continueRunning && !isStaleRun(runEpoch)) {
        await queueNextStep(runEpoch);
      }
    }
  }

  function resetLoopDetector() {
    loopManager.reset();
  }

  async function resetRunLastMessages() {
    const settings = await withTimeout(
      systemSettings.getSettings(),
      RUNNER_AWAIT_TIMEOUT_MS,
      `System settings lookup timed out for ${runtime.id}`,
    );

    if (settings.memoryLastMessagesFullEnabled) {
      runLastMessages = FULL_MEMORY_LOAD_LAST_MESSAGES;
      return;
    }

    runLastMessages = settings.memoryLastMessagesCount || DEFAULT_RUN_LAST_MESSAGES;
  }

  async function refreshRunFlushSettings() {
    const settings = await withTimeout(
      systemSettings.getSettings(),
      RUNNER_AWAIT_TIMEOUT_MS,
      `System settings lookup timed out for ${runtime.id}`,
    );

    messageManager.updateFlushSettings(settings);
  }
  function registerLoopSignature(signature: string) {
    return loopManager.register(signature);
  }

  async function planNextAttempt(): Promise<
    | {
        execute: 'idle';
      }
    | {
        execute: false;
        delayMs: number;
      }
    | {
        execute: true;
        contractId: string;
        delayMs: number;
      }
  > {
    const contract = await withTimeout(
      store.getRunnableContract(runtime.id),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent runnable contract lookup timed out for ${runtime.id}`,
    );

    if (!contract) {
      return {
        execute: 'idle' as const,
      };
    }

    const spentUsd = await withTimeout(
      store.getContractSpend(contract.id),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent contract spend lookup timed out for ${runtime.id}`,
    );
    const remainingBudgetUsd = contract.budgetUsd - spentUsd;
    const estimatedStepUsd = await withTimeout(
      usage.estimateStepCostUsd(),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent step cost estimate timed out for ${runtime.id}`,
    );

    if (estimatedStepUsd !== null && remainingBudgetUsd < estimatedStepUsd) {
      return {
        execute: 'idle' as const,
      };
    }

    scheduler.resetBackoff();
    const settings = await withTimeout(
      systemSettings.getSettings(),
      RUNNER_AWAIT_TIMEOUT_MS,
      `System settings lookup timed out for ${runtime.id}`,
    );

    return {
      execute: true as const,
      contractId: contract.id,
      delayMs: scheduler.getState().instant
        || !settings.stepDelayEnabled
        ? 0
        : calculateBudgetDelayMs(contract.endsAt, remainingBudgetUsd, estimatedStepUsd),
    };
  }



  function getSnapshot() {
    const s = scheduler.getState();
    return {
      stopped,
      instant: s.instant,
      startingRun,
      startingRunStartedAt,
      executing,
      activeRunEpoch: s.activeRunEpoch,
      activeStepEpoch: s.activeStepEpoch,
      scheduled: timer !== null,
      backoffMs: s.backoffMs,
      nextStepAt: s.nextStepAt,
      estimatedDelayMs: s.nextStepAt ? Math.max(s.nextStepAt - Date.now(), 0) : null,
      lastStepStartedAt,
      lastStepStage,
      pendingRunEvents: Array.from(messageManager.getState().pendingRunMessages.values()),
      wake: wakeQueue.getSnapshot(),
      lastWakeStartedAt,
    };
  }

  return {
    start,
    stop,
    forceIdle,
    execute,
    getSnapshot,
    notifyExternalEvent,
  };

  /**
   * Extracts feedback messages and determines whether to continue the agent run
   * after an iteration completes. Extracted from generateWithTimeoutRetries
   * to reduce function length and improve readability.
   */

  async function loadAgentContextInstructions(currentRuntime: InternalAgentRuntime, db: Database) {
    return loadContextInstructions(currentRuntime, db);
  }

  function notifyExternalEvent(event: AgentWakeEvent) {
    if (stopped) {
      return;
    }

    wakeQueue.notifyExternalEvent(event);

    if (event.idleOnly && isLocallyIdle()) {
      void wakeQueue.onRunnerIdle();
    }
  }

  function startNewRunEpoch() {
    activeRunEpoch += 1;
    activeStepEpoch = 0;
    // Keep scheduler's state in sync for snapshot consistency
    advanceGenerateToken(epochState);
    currentGenerateAbortController?.abort(new Error('Agent generate invalidated'));
    currentGenerateAbortController = null;
    // Also update scheduler state
    scheduler.startNewRunEpoch();
    return activeRunEpoch;
  }

  function isStaleRun(runEpoch: number) {
    return stopped || runEpoch !== activeRunEpoch;
  }

  function isLocallyIdle() {
    return !startingRun && !executing && !timer;
  }

  async function transitionToIdle(
    runEpoch: number,
    options: {
      deferWakeQueueDrain?: boolean;
    } = {},
  ) {
    if (isStaleRun(runEpoch)) {
      return;
    }

    clearTimer();
    advanceGenerateToken(epochState);
    currentGenerateAbortController?.abort(new Error('Agent generate invalidated'));
    currentGenerateAbortController = null;
    scheduler.setInstant(false);
    resetLoopDetector();
    await withTimeout(
      store.setExecutionState(runtime.id, 'idle'),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent execution state update timed out for ${runtime.id}`,
    );
    await withTimeout(
      currentRuntime.longTermMemory?.onAgentIdle() ?? Promise.resolve(),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent long-term memory idle transition timed out for ${runtime.id}`,
    );

    if (isStaleRun(runEpoch)) {
      return;
    }

    if (options.deferWakeQueueDrain) {
      return;
    }

    await wakeQueue.onRunnerIdle();
  }

}

export type InternalAgentRunner = ReturnType<typeof createAgentRunner>;
