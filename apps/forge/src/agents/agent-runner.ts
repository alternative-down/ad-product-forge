import { forgeDebug } from '@forge-runtime/core';
import { eq, and } from 'drizzle-orm';
import { agentSchedules } from '../database/schema';
import { createId } from '../utils/id';
import { createAgentWakeQueue } from '@forge-runtime/core';
import type { AgentWakeEvent } from '@forge-runtime/core';

import type { InternalAgentRuntime } from './runtime/types';
import { createAgentContractStore } from './agent-contract-store';
import type { Database } from '../database/index';
import { createSystemSettingsStore } from '../system-settings/store';
import { createAgentNotificationStore } from '../notifications/store';
import { createAgentRunnerUsage } from './agent-runner-usage';
import { createAgentHomeMetricSnapshotStore } from './agent-home-metric-snapshot-store';
import { readAgentHomeMetricSnapshot } from './agent-home-metrics';
import { formatPendingRunEvents, RUN_STOP_REMINDER } from './agent-runner-wake';
import { createMessageManager, type MessageManagerState } from './agent-runner-messages';

import {
  AGENT_CONTEXT_WARNING_CHAR_LIMIT,
  WORKING_MEMORY_WARNING_CHAR_LIMIT,
  AGENT_CONTEXT_FILE_PATH,
} from './constants';


import {
  delay,
  withTimeout,
  buildIterationLoopSignature,
  serializeError,
  serializeUnknown,
  formatAbsentExecutionError,
  extractAbsentErrorDetails,
  buildStepSystemPrompt,
  extractRunnerControlDirective,
  extractRunnerControlDirectiveFromIteration,
  buildRecallStepFromIteration,
  didIterationProduceVisibleAssistantText,
  collectStepTextParts,
  hasExactControlDirective,
} from './agent-runner-helpers';
import { createLoopDetector } from './agent-runner-loop-detector';
import { isStaleRun, advanceRunEpoch, advanceStepEpoch, advanceGenerateToken, nextBackoff, resetBackoffState, calculateDelayMs } from './agent-runner-state';
import { isNoActionNeeded, isStopAndIdle, extractControlDirective } from './agent-runner-helpers';

import { createScheduler, type SchedulerState } from './agent-runner-scheduler';
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
  let healthcheckTimer: NodeJS.Timeout | null = null;
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
  const loopState: { lastLoopSignature: string | null; repeatedLoopCount: number } = { lastLoopSignature: null, repeatedLoopCount: 0 };
  const loopDetector = createLoopDetector(loopState);
  let activeRunEpoch = 0;
  let activeStepEpoch = 0;
  let activeGenerateToken = 0;
  let activeRunId: string | null = null;
  let currentGenerateAbortController: AbortController | null = null;
  let runLastMessages = DEFAULT_RUN_LAST_MESSAGES;
  let pendingLongTermMemoryRecallSystemText: string | null = null;
  const messageManagerState: MessageManagerState = {
    flushedRunEventKeys: new Set<string>(),
    flushedRunEventKeyOrder: [] as string[],
    currentFlushSettings: {
      communicationDmFlushingEnabled: true,
      communicationGroupFlushingEnabled: true,
    },
    pendingRunMessages: new Map<string, AgentWakeEvent>(),
  };

  const messageManager = createMessageManager(messageManagerState, formatPendingRunEvents);

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
    messageManager.resetFlushedRunEventKeys();
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
      messageManagerState.pendingRunMessages.clear();
    }
    messageManager.resetFlushedRunEventKeys();
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
    if (stopped) {
      return;
    }

    try {
      const executionState = await withTimeout(
        store.getExecutionState(runtime.id),
        RUNNER_AWAIT_TIMEOUT_MS,
        `Agent execution state lookup timed out for ${runtime.id}`,
      );

      if (executionState === 'idle') {
        if (!isLocallyIdle()) {
          return;
        }

        if (messageManager.getPendingCount() > 0) {

          await beginRun({

            reloadRuntime: false,

            wakeStartedAt: Date.now(),

            markRunning: true,

          });
          return;
        }

        const wakeSnapshot = wakeQueue.getSnapshot();
        if (wakeSnapshot.pending || wakeSnapshot.waitingForIdle) {
          await wakeQueue.onRunnerIdle();
        }

        return;
      }

      if (startingRun) {
        const startingRunAgeMs =
          startingRunStartedAt === null ? 0 : Date.now() - startingRunStartedAt;

        if (startingRunAgeMs >= STARTING_RUN_TIMEOUT_MS) {
          forgeDebug({
            scope: 'agent-runner',
            level: 'warn',
            runtimeId: runtime.id,
            message: `startingRun exceeded ${STARTING_RUN_TIMEOUT_MS}ms; recovering local runner state`,
          });
          startNewRunEpoch();
          startingRun = false;
          startingRunStartedAt = null;
          activeRunId = null;
        }
      }

      if (startingRun || executing || timer) {
        return;
      }

      await queueNextStep();
    } catch (error) {
      forgeDebug({ scope: 'agent-runner', level: 'error', runtimeId: runtime.id, message: 'healthcheck failed', context: { error } });
    }
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
      messageManager.resetFlushedRunEventKeys();
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
      forgeDebug({ scope: 'agent-runner', level: 'error', runtimeId: runtime.id, message: 'failed to begin run', context: { error } });
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
      forgeDebug({ scope: 'agent-runner', level: 'error', runtimeId: runtime.id, message: 'failed to schedule next step', context: { error } });
      scheduler.setInstant(false);
      schedule(scheduler.nextBackoff());
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
      schedule(nextBackoff());
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
    loopDetector.reset();
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
    return loopDetector.register(signature);
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
        : calculateDelayMs(contract.endsAt, remainingBudgetUsd, estimatedStepUsd),
    };
  }

  function calculateDelayMs(
    endsAt: number,
    remainingBudgetUsd: number,
    estimatedStepUsd: number | null,
  ) {
    if (estimatedStepUsd === null || estimatedStepUsd <= 0) {
      return 0;
    }

    const remainingTimeMs = endsAt - Date.now();
    const stepsPossible = remainingBudgetUsd / estimatedStepUsd;

    if (remainingTimeMs <= 0 || stepsPossible <= 0) {
      return 0;
    }

    return remainingTimeMs / stepsPossible;
  }

  function nextBackoff() {
    const delayMs = backoffMs;
    backoffMs = Math.min(backoffMs * 2, TEN_MINUTES_MS);
    return delayMs;
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
      pendingRunEvents: Array.from(messageManagerState.pendingRunMessages.values()),
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

  async function generateWithTimeoutRetries(
    promptText: string,
    runEpoch: number,
    contractId: string,
    contract: {
      id: string;
      budgetUsd: number;
      endsAt: number;
    },
    longTermMemoryRecallSystemText: string | null,
  ) {
    const effectivePromptText = [
      longTermMemoryRecallSystemText?.trim()
        ? {
            role: 'assistant' as const,
            content: longTermMemoryRecallSystemText.trim(),
          }
        : null,
      promptText.trim()
        ? {
            role: 'user' as const,
            content: promptText.trim(),
          }
        : null,
    ].filter((value): value is {
      role: 'assistant' | 'user';
      content: string;
    } => Boolean(value));
    const runDelayMs = await planCurrentRunDelayMs(contract);
    let suppressNoToolCallReminderForRun = false;

    for (let attempt = 1; attempt <= GENERATE_TIMEOUT_MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const generateToken = startGenerateAttempt(controller);
      const timeout = createGenerateTimeoutGuard(controller);
      markGenerateProgress(timeout, controller, {
        stage: 'generate-started',
        detail: {
          attempt,
          runId: activeRunId ?? `${runtime.id}:${runEpoch}`,
          maxSteps: GENERATE_MAX_STEPS_PER_RUN,
        },
      });

      try {
        forgeDebug({ scope: 'agent-runner', level: 'debug', runtimeId: runtime.id, message: 'preparing runtime context before generate' });
        const agentContextInstructions = await loadAgentContextInstructions();
        const systemPrompt = buildStepSystemPrompt({
          agentContextInstructions,
        });
        forgeDebug({ scope: 'agent-runner', level: 'debug', runtimeId: runtime.id, message: 'runtime context ready before generate' });
        forgeDebug({ scope: 'agent-runner', level: 'info', runtimeId: runtime.id, message: `generate start (attempt ${attempt}/${GENERATE_TIMEOUT_MAX_ATTEMPTS})` });
        const result = await Promise.race([
          currentRuntime.agent.generate(effectivePromptText, {
            runId: activeRunId ?? `${runtime.id}:${runEpoch}`,
            maxSteps: GENERATE_MAX_STEPS_PER_RUN,
            savePerStep: true,
            abortSignal: controller.signal,
            ...(systemPrompt ? { system: systemPrompt } : {}),
            memory: {
              thread: currentRuntime.mastraId,
              resource: currentRuntime.mastraId,
              options: {
                lastMessages: runLastMessages,
              },
            },
            providerOptions: {
              anthropic: {
                thinking: { type: 'enabled', budgetTokens: 2000 },
              },
            },
            prepareStep: async ({ stepNumber }) => {
              markGenerateProgress(timeout, controller, {
                stage: 'prepare-step',
                detail: {
                  stepNumber,
                },
              });

              if (stepNumber === 0 || runDelayMs <= 0) {
                return;
              }

              await delay(runDelayMs);
            },
            onStepFinish: async (stepResult) => {
              markGenerateProgress(timeout, controller, {
                stage: 'step-finish',
                detail: {
                  usage: stepResult.usage ?? null,
                },
              });
              lastStepStage = 'recording-agent-usage';
              const { inputTokens, cachedInputTokens, outputTokens } =
                usage.getUsageFromResult(stepResult);

              const recordedStep = await withTimeout(
                usage.recordAgentStep(contractId, inputTokens, cachedInputTokens, outputTokens),
                RUNNER_AWAIT_TIMEOUT_MS,
                `Agent usage recording timed out for ${runtime.id}`,
              );

              if (options.workspaceBasePath && recordedStep) {
                await withTimeout(
                  (async () => {
                    const snapshot = await readAgentHomeMetricSnapshot({
                      db,
                      workspaceBasePath: options.workspaceBasePath as string,
                      agentId: currentRuntime.id,
                      runtime: currentRuntime,
                      runnerSnapshot: getSnapshot(),
                    });

                    if (!snapshot) {
                      return;
                    }

                    await homeMetricSnapshots.recordSnapshot({
                      agentId: currentRuntime.id,
                      stepId: recordedStep.stepId,
                      stepCreatedAt: recordedStep.createdAt,
                      snapshot: {
                        ...snapshot,
                        omTrace: stepResult.omTrace ?? [],
                      },
                    });
                  })(),
                  RUNNER_AWAIT_TIMEOUT_MS,
                  `Agent home metric snapshot timed out for ${runtime.id}`,
                ).catch((error) => {
                  forgeDebug({ scope: 'agent-runner', level: 'error', runtimeId: runtime.id, message: 'Failed to persist home metric snapshot', context: { error } });
                });
              }
            },
            onIterationComplete: async (iteration) => {
              markGenerateProgress(timeout, controller, {
                stage: 'iteration-complete',
                detail: {
                  iteration: iteration.iteration,
                  finishReason: iteration.finishReason,
                  textPreview: iteration.text.trim().slice(0, 300),
                  toolCalls: iteration.toolCalls.map((toolCall) => ({
                    name: toolCall.name,
                    args: toolCall.args,
                  })),
                  toolResults: iteration.toolResults.map((toolResult) => ({
                    name: toolResult.name,
                    error: toolResult.error?.message ?? null,
                  })),
                },
              });
              lastStepStage = 'processing-runner-control';

              forgeDebug({
                scope: 'agent-runner',
                level: 'debug',
                runtimeId: runtime.id,
                message: 'iteration toolCalls',
                context: { toolCallCount: iteration.toolCalls?.length ?? 0 },
              });

              const controlDirective = extractRunnerControlDirectiveFromIteration(iteration);
              const ignoredTextRequested = controlDirective === 'ignore';
              const stopRequested = controlDirective === 'stop';

              if (loopDetector.isStuck()) {
                await withTimeout(
                  notifications.createNotification({
                    agentId: runtime.id,
                    content: [
                      'Stuck loop detected.',
                      `Repeated signature count: ${loopDetector.getSignatureCount()}`,
                      'The agent repeated the same tool/text pattern and was forced to stop.',
                      '',
                      'Signature:',
                      loopSignature,
                    ].join('\n'),
                  }),
                  RUNNER_AWAIT_TIMEOUT_MS,
                  `Agent notification creation timed out for ${runtime.id}`,
                );
                nextStepAt = null;
                resetLoopDetector();
                return {
                  continue: false,
                };
              }

              if (iteration.toolCalls.length === 0 && ignoredTextRequested) {
                suppressNoToolCallReminderForRun = true;
              }

              if (stopRequested) {
                nextStepAt = null;
                resetLoopDetector();
                return {
                  continue: false,
                };
              }

              const producedVisibleAssistantText = didIterationProduceVisibleAssistantText(iteration);
              const feedbackMessages: Array<{
                role: 'assistant' | 'user';
                content: string;
              }> = [];
              const flushedPrompt = flushPendingRunMessages({
                allowOriginIdleOnly: true,
              });

              if (flushedPrompt) {
                feedbackMessages.push({
                  role: 'user',
                  content: flushedPrompt,
                });
              }

              if (
                iteration.toolCalls.length === 0 &&
                producedVisibleAssistantText &&
                !stopRequested &&
                !suppressNoToolCallReminderForRun
              ) {
                feedbackMessages.push({
                  role: 'user',
                  content: RUN_STOP_REMINDER,
                });
              }

              const recallStep = buildRecallStepFromIteration(iteration);
              const recallFeedback = await currentRuntime.longTermMemoryRecall?.recallFromStep({
                step: recallStep,
                steps: [recallStep],
                threadId: currentRuntime.mastraId,
                resourceId: currentRuntime.mastraId,
              }) ?? null;

              if (recallFeedback?.trim()) {
                feedbackMessages.push({
                  role: 'assistant',
                  content: recallFeedback.trim(),
                });
              }

              if (feedbackMessages.length > 0) {
                return {
                  continue: true,
                  feedbackMessages,
                };
              }

              return undefined;
            },
          }),
          timeout.promise,
        ]);
        forgeDebug({ scope: 'agent-runner', level: 'info', runtimeId: runtime.id, message: `generate completed (attempt ${attempt}/${GENERATE_TIMEOUT_MAX_ATTEMPTS})` });
        return result;
      } catch (error) {
        const timedOut = controller.signal.aborted;

        if (!timedOut || attempt === GENERATE_TIMEOUT_MAX_ATTEMPTS) {
          throw error;
        }

        const backoffMs = GENERATE_TIMEOUT_BACKOFF_MS * attempt;
        forgeDebug({
          scope: 'agent-runner',
          level: 'warn',
          runtimeId: runtime.id,
          message: `generate timed out on attempt ${attempt}/${GENERATE_TIMEOUT_MAX_ATTEMPTS}; retrying in ${backoffMs}ms`,
        });
        await delay(backoffMs);
      } finally {
        clearGenerateTimeout(timeout);
        finishGenerateAttempt(generateToken, controller);
      }
    }

    throw new Error('Agent generate timed out after all retry attempts');
  }

  async function loadAgentContextInstructions() {
    const filesystem = currentRuntime.workspace.filesystem;
    const agentContextContent = await loadAgentContextContent(filesystem);
    const scheduleSummary = await loadActiveScheduleSummary();

    const sections: Array<string | null> = [
      scheduleSummary,
      agentContextContent,
    ];

    const filtered = sections.filter((v): v is string => Boolean(v));
    if (filtered.length === 0) {
      return undefined;
    }

    const lines: Array<string | null> = [
      ...(scheduleSummary ? ['Automatically loaded active schedule context.', ''] : []),
      ...(agentContextContent
        ? [
            'Automatically loaded workspace context file.',
            `File: ${AGENT_CONTEXT_FILE_PATH}`,
            'This file should be treated as additional runtime instructions and context.',
            'This is the only workspace file auto-loaded into the execution context.',
            'Treat it as a concise summary layer. Keep details in other files and store only high-signal references here when needed.',
            'If you mention or use information from this file, do not say it came from context, instructions, notes, or memory. Use active language such as "I remember that...", "we already saw that...", or "on day X in the morning I did X" when appropriate.',
            '',
          ]
        : []),
      agentContextContent ?? null,
    ].filter(Boolean);

    return filtered.join('\n\n');
  }

  async function loadActiveScheduleSummary() {
    try {
      const rows = await withTimeout(
        db
          .select({
            name: agentSchedules.name,
            cronExpression: agentSchedules.cronExpression,
            timezone: agentSchedules.timezone,
          })
          .from(agentSchedules)
          .where(
            and(
              eq(agentSchedules.agentId, runtime.id),
              eq(agentSchedules.isActive, 1),
            )
          )
          .limit(20),
        5_000,
        'Active schedule summary lookup timed out',
      );

      if (rows.length === 0) {
        return null;
      }

      const lines = rows.map((s) => {
        const cron = s.cronExpression ?? '';
        const tz = s.timezone ?? 'UTC';
        const name = s.name ?? '(unnamed)';
        return `  ${name}: "${cron}" [${tz}]`;
      });

      return [
        '## Active Schedules',
        '',
        'Your active recurring schedules (only show when triggered):',
        '',
        ...lines,
      ].join('\n');
    } catch (err) {
      forgeDebug({
        scope: 'agent-runner',
        level: 'warn',
        runtimeId: runtime.id,
        message: 'Failed to load active schedule summary: ' + (err instanceof Error ? err.message : String(err)),
      });
      return null;
    }
  }

  async function loadAgentContextContent(filesystem: typeof currentRuntime.workspace.filesystem) {
    if (!filesystem) {
      return null;
    }

    const exists = await withTimeout(
      filesystem.exists(AGENT_CONTEXT_FILE_PATH),
      CONTEXT_DECORATION_TIMEOUT_MS,
      `Agent context existence check timed out for ${runtime.id}`,
    ).catch((err) => { forgeDebug({ scope: 'agent-runner', level: 'error', message: '[safe-catch] context decoration check', context: { error: err } }); return false; });

    if (!exists) {
      return null;
    }

    const data = await withTimeout(
      filesystem.readFile(AGENT_CONTEXT_FILE_PATH),
      CONTEXT_DECORATION_TIMEOUT_MS,
      `Agent context read timed out for ${runtime.id}`,
    ).catch((err) => { forgeDebug({ scope: 'agent-runner', level: 'error', message: '[safe-catch] context decoration read', context: { error: err } }); return null; });

    if (!data) {
      return null;
    }

    const content = typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      return null;
    }

    if (trimmedContent.length > AGENT_CONTEXT_WARNING_CHAR_LIMIT) {
      return [
        'Context pressure warning:',
        `- \`${AGENT_CONTEXT_FILE_PATH}\` is getting large (${trimmedContent.length} chars).`,
        '- Keep only high-signal summary context there.',
        '- Move detailed notes, logs, and long task detail into separate workspace files.',
        '- Leave short retrieval hints and file references in `AGENT_CONTEXT.md`.',
        '',
        trimmedContent,
      ].join('\n');
    }

    return trimmedContent;
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
    invalidateInFlightGenerate();
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
    invalidateInFlightGenerate();
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

  function invalidateInFlightGenerate() {
    activeGenerateToken += 1;
    currentGenerateAbortController?.abort(new Error('Agent generate invalidated'));
    currentGenerateAbortController = null;
  }

  function startGenerateAttempt(controller: AbortController) {
    advanceGenerateToken(epochState);
    activeGenerateToken = epochState.activeGenerateToken;
    currentGenerateAbortController = controller;
    return activeGenerateToken;
  }

  function finishGenerateAttempt(generateToken: number, controller: AbortController) {
    controller.abort();

    if (activeGenerateToken !== generateToken) {
      return;
    }

    currentGenerateAbortController = null;
  }

  async function planCurrentRunDelayMs(contract: {
    id: string;
    budgetUsd: number;
    endsAt: number;
  }) {
    scheduler.resetBackoff();
    const settings = await withTimeout(
      systemSettings.getSettings(),
      RUNNER_AWAIT_TIMEOUT_MS,
      `System settings lookup timed out for ${runtime.id}`,
    );

    if (scheduler.getState().instant || !settings.stepDelayEnabled) {
      return 0;
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

    return calculateDelayMs(contract.endsAt, remainingBudgetUsd, estimatedStepUsd);
  }

  function createGenerateTimeoutGuard(_controller: AbortController) {
    let timeoutId: NodeJS.Timeout | null = null;
    let rejectTimeout: ((error: Error) => void) | null = null;
    const promise = new Promise<never>((_, reject) => {
      rejectTimeout = reject;
    });

    return {
      promise,
      get timeoutId() {
        return timeoutId;
      },
      set timeoutId(value: NodeJS.Timeout | null) {
        timeoutId = value;
      },
      rejectTimeout,
    };
  }

  function touchGenerateTimeout(
    timeout: {
      timeoutId: NodeJS.Timeout | null;
      rejectTimeout: ((error: Error) => void) | null;
    },
    controller: AbortController,
  ) {
    if (timeout.timeoutId) {
      clearTimeout(timeout.timeoutId);
    }

    timeout.timeoutId = setTimeout(() => {
      const timeoutError = new Error(
        `Agent generate timed out after ${GENERATE_TIMEOUT_MS}ms without iteration progress`,
      );
      (timeoutError as Error & { context?: Record<string, unknown> }).context = {
        lastStepStage,
        lastGenerateProgress,
      };
      controller.abort(timeoutError);
      timeout.rejectTimeout?.(timeoutError);
    }, GENERATE_TIMEOUT_MS);
  }

  function markGenerateProgress(
    timeout: {
      timeoutId: NodeJS.Timeout | null;
      rejectTimeout: ((error: Error) => void) | null;
    },
    controller: AbortController,
    progress: {
      stage: string;
      detail?: Record<string, unknown>;
    },
  ) {
    lastGenerateProgress = {
      stage: progress.stage,
      at: Date.now(),
      detail: progress.detail ?? null,
    };
    touchGenerateTimeout(timeout, controller);
  }

  function clearGenerateTimeout(timeout: { timeoutId: NodeJS.Timeout | null }) {
    if (!timeout.timeoutId) {
      return;
    }

    clearTimeout(timeout.timeoutId);
    timeout.timeoutId = null;
  }
}

export type InternalAgentRunner = ReturnType<typeof createAgentRunner>;
