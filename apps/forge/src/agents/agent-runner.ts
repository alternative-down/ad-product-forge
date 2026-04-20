import { createAgentWakeQueue } from '@mastra-engine/core';
import type { AgentWakeEvent } from '@mastra-engine/core';

import type { InternalAgentRuntime } from './agent-runtime-types';
import { createAgentContractStore } from './agent-contract-store';
import type { Database } from '../database/index';
import { createSystemSettingsStore } from '../system-settings/store';
import { createAgentNotificationStore } from '../notifications/store';
import { createAgentRunnerUsage } from './agent-runner-usage';
import { formatPendingRunEvents, RUN_STOP_REMINDER } from './agent-runner-wake';

const ONE_MINUTE_MS = 60_000;
const TEN_MINUTES_MS = 10 * ONE_MINUTE_MS;
const FIFTEEN_MINUTES_MS = 15 * ONE_MINUTE_MS;
const STUCK_LOOP_REPEAT_LIMIT = 6;
const GENERATE_TIMEOUT_MS = FIFTEEN_MINUTES_MS;
const GENERATE_TIMEOUT_MAX_ATTEMPTS = 1;
const GENERATE_TIMEOUT_BACKOFF_MS = 5_000;
const GENERATE_MAX_STEPS_PER_RUN = 1000;
const RUNNER_AWAIT_TIMEOUT_MS = 30_000;
const STARTING_RUN_TIMEOUT_MS = RUNNER_AWAIT_TIMEOUT_MS * 2;
const CONTEXT_DECORATION_TIMEOUT_MS = 5_000;
const RUNNER_HEALTHCHECK_INTERVAL_MS = 30_000;
const DEFAULT_RUN_LAST_MESSAGES = 20;
const FULL_MEMORY_LOAD_LAST_MESSAGES = Number.MAX_SAFE_INTEGER;
const MAX_FLUSHED_RUN_EVENT_KEYS = 2_000;
const AGENT_CONTEXT_FILE_PATH = 'AGENT_CONTEXT.md';
const AGENT_CONTEXT_WARNING_CHAR_LIMIT = 8_000;
const WORKING_MEMORY_WARNING_CHAR_LIMIT = 4_000;
const NO_ACTION_NEEDED_PREFIX = 'NO_ACTION_NEEDED';
const STOP_AND_IDLE_PREFIX = 'STOP_AND_IDLE';

export function createAgentRunner(
  db: Database,
  runtime: InternalAgentRuntime,
  options: {
    reloadRuntime?: () => Promise<InternalAgentRuntime>;
    onRuntimeReloaded?: (runtime: InternalAgentRuntime) => void;
  } = {},
) {
  const store = createAgentContractStore(db);
  const systemSettings = createSystemSettingsStore(db);
  const notifications = createAgentNotificationStore(db);
  let currentRuntime = runtime;
  let usage = createAgentRunnerUsage({ store, runtime: currentRuntime });
  const wakeQueue = createAgentWakeQueue({
    label: currentRuntime.id,
    execute,
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
  let lastLoopSignature: string | null = null;
  let repeatedLoopCount = 0;
  let activeRunEpoch = 0;
  let activeStepEpoch = 0;
  let activeGenerateToken = 0;
  let activeRunId: string | null = null;
  let currentGenerateAbortController: AbortController | null = null;
  let runLastMessages = DEFAULT_RUN_LAST_MESSAGES;
  let pendingLongTermMemoryRecallSystemText: string | null = null;
  let flushedRunEventKeys = new Set<string>();
  let flushedRunEventKeyOrder: string[] = [];
  let currentFlushSettings = {
    communicationDmFlushingEnabled: true,
    communicationGroupFlushingEnabled: true,
  };
  const pendingRunMessages = new Map<string, AgentWakeEvent>();

  currentRuntime.onReceiveMessage(notifyExternalEvent);

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

  function clearTimer() {
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    timer = null;
    nextStepAt = null;
  }

  function startHealthcheck() {
    if (healthcheckTimer) {
      return;
    }

    healthcheckTimer = setInterval(() => {
      void runHealthcheck();
    }, RUNNER_HEALTHCHECK_INTERVAL_MS);
  }

  function clearHealthcheck() {
    if (!healthcheckTimer) {
      return;
    }

    clearInterval(healthcheckTimer);
    healthcheckTimer = null;
  }

  function schedule(delayMs: number) {
    if (stopped || timer) {
      return;
    }

    nextStepAt = Date.now() + Math.max(delayMs, 0);
    timer = setTimeout(
      () => {
        timer = null;
        nextStepAt = null;
        void queueNextStep();
      },
      Math.max(delayMs, 0),
    );
  }

  async function start() {
    if (stopped) {
      return;
    }

    startHealthcheck();
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
    for (const event of events) {
      if (event.idleOnly && !options.allowIdleOnly) {
        continue;
      }

      if (!event.text.trim()) {
        continue;
      }

      pendingRunMessages.set(event.idempotencyKey, {
        ...event,
        originIdleOnly: event.originIdleOnly ?? event.idleOnly ?? false,
        idleOnly: options.allowIdleOnly ? false : event.idleOnly,
      });
    }
  }

  function flushPendingRunMessages(options: {
    allowOriginIdleOnly?: boolean;
  } = {}) {
    if (pendingRunMessages.size === 0) {
      return null;
    }

    const allEvents = Array.from(pendingRunMessages.values()).sort(
      (left, right) => left.timestamp - right.timestamp,
    );
    const deferredEvents: AgentWakeEvent[] = [];

    const events = allEvents.filter((event) => {
      if (flushedRunEventKeys.has(event.idempotencyKey)) {
        return false;
      }

      if (event.originIdleOnly && !options.allowOriginIdleOnly) {
        deferredEvents.push(event);
        return false;
      }

      return shouldIncludePendingRunEventInFlush(event);
    });

    pendingRunMessages.clear();

    for (const event of deferredEvents) {
      pendingRunMessages.set(event.idempotencyKey, event);
    }

    if (events.length === 0) {
      return null;
    }

    for (const event of events) {
      rememberFlushedRunEventKey(event.idempotencyKey);
    }
    return formatPendingRunEvents(events);
  }

  function stop() {
    stopped = true;
    startingRun = false;
    startingRunStartedAt = null;
    activeRunEpoch += 1;
    activeStepEpoch = 0;
    activeRunId = null;
    invalidateInFlightGenerate();
    executing = false;
    clearTimer();
    clearHealthcheck();
    wakeQueue.stop();
    resetFlushedRunEventKeys();
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
      pendingRunMessages.clear();
    }
    resetFlushedRunEventKeys();
    instant = false;
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

        if (pendingRunMessages.size > 0) {
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
          console.error(
            `[AgentRunner] ${runtime.id} startingRun exceeded ${STARTING_RUN_TIMEOUT_MS}ms; recovering local runner state`,
          );
          startNewRunEpoch();
          startingRun = false;
          startingRunStartedAt = null;
          activeRunId = null;
        }
      }

      if (startingRun || executing || timer) {
        return;
      }

      await queueNextStep(activeRunEpoch);
    } catch (error) {
      console.error(`[AgentRunner] ${runtime.id} healthcheck failed:`, error);
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
      activeRunId = crypto.randomUUID();
      instant = true;
      backoffMs = ONE_MINUTE_MS;
      lastWakeStartedAt = input.wakeStartedAt;
      resetLoopDetector();
      resetFlushedRunEventKeys();
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
      console.error(`[AgentRunner] ${runtime.id} failed to begin run:`, error);
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
        instant = false;
        await transitionToIdle(runEpoch);
        return;
      }

      if (!nextAttempt.execute) {
        instant = false;
        schedule(nextAttempt.delayMs);
        return;
      }

      const delayMs = nextAttempt.delayMs;
      instant = false;
      nextStepAt = Date.now() + Math.max(delayMs, 0);
      console.log(`[AgentRunner] ${runtime.id} scheduling next step in ${Math.max(delayMs, 0)}ms`);
      timer = setTimeout(
        () => {
          timer = null;
          nextStepAt = null;
          void executeStep(nextAttempt.contractId, runEpoch);
        },
        Math.max(delayMs, 0),
      );
    } catch (error) {
      console.error(`[AgentRunner] ${runtime.id} failed to schedule next step:`, error);
      instant = false;
      schedule(nextBackoff());
    }
  }

  async function executeStep(contractId: string, runEpoch: number) {
    if (stopped || executing || isStaleRun(runEpoch)) {
      return;
    }

    executing = true;
    activeStepEpoch = runEpoch;
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
      console.log(`[AgentRunner] ${runtime.id} executing step`);

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

      if (stopRequested && pendingRunMessages.size === 0) {
        nextStepAt = null;
        resetLoopDetector();
        await transitionToIdle(runEpoch, {
          deferWakeQueueDrain: true,
        });
        drainWakeQueueAfterStep = true;
        return;
      }

      backoffMs = ONE_MINUTE_MS;
      continueRunning = pendingRunMessages.size > 0;
    } catch (error) {
      if (isStaleRun(runEpoch)) {
        return;
      }

      console.error(
        `[AgentRunner] ${runtime.id} step failed:`,
        JSON.stringify({
          agentId: runtime.id,
          mastraId: currentRuntime.mastraId,
          pricingModelKey: currentRuntime.pricingModelKey,
          modelProfileId: currentRuntime.modelProfileId,
          stepStartedAt: lastStepStartedAt,
          stepStage: lastStepStage,
          prompt,
          error: serializeError(error),
        }, null, 2),
      );
      await withTimeout(
        store.setExecutionAbsent(runtime.id, formatAbsentExecutionError({
          stage: lastStepStage,
          error,
        })),
        RUNNER_AWAIT_TIMEOUT_MS,
        `Agent execution state update timed out for ${runtime.id}`,
      ).catch((stateError) => {
        console.error(`[AgentRunner] ${runtime.id} failed to set absent state:`, stateError);
      });
      schedule(nextBackoff());
    } finally {
      lastStepStartedAt = null;
      lastStepStage = null;
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
    lastLoopSignature = null;
    repeatedLoopCount = 0;
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

    currentFlushSettings = {
      communicationDmFlushingEnabled: settings.communicationDmFlushingEnabled,
      communicationGroupFlushingEnabled: settings.communicationGroupFlushingEnabled,
    };
  }

  function shouldIncludePendingRunEventInFlush(event: AgentWakeEvent) {
    if (!event.type.startsWith('message:')) {
      return true;
    }

    const conversationType = event.groupMetadata?.ConversationType;

    if (conversationType === 'group') {
      return currentFlushSettings.communicationGroupFlushingEnabled;
    }

    return currentFlushSettings.communicationDmFlushingEnabled;
  }

  function resetFlushedRunEventKeys() {
    flushedRunEventKeys = new Set<string>();
    flushedRunEventKeyOrder = [];
  }

  function rememberFlushedRunEventKey(idempotencyKey: string) {
    if (flushedRunEventKeys.has(idempotencyKey)) {
      return;
    }

    flushedRunEventKeys.add(idempotencyKey);
    flushedRunEventKeyOrder.push(idempotencyKey);

    while (flushedRunEventKeyOrder.length > MAX_FLUSHED_RUN_EVENT_KEYS) {
      const oldestIdempotencyKey = flushedRunEventKeyOrder.shift();

      if (!oldestIdempotencyKey) {
        return;
      }

      flushedRunEventKeys.delete(oldestIdempotencyKey);
    }
  }

  function registerLoopSignature(signature: string) {
    if (lastLoopSignature === signature) {
      repeatedLoopCount += 1;
      return repeatedLoopCount;
    }

    lastLoopSignature = signature;
    repeatedLoopCount = 1;
    return repeatedLoopCount;
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

    backoffMs = ONE_MINUTE_MS;
    const settings = await withTimeout(
      systemSettings.getSettings(),
      RUNNER_AWAIT_TIMEOUT_MS,
      `System settings lookup timed out for ${runtime.id}`,
    );

    return {
      execute: true as const,
      contractId: contract.id,
      delayMs: instant
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
    return {
      stopped,
      instant,
      startingRun,
      startingRunStartedAt,
      executing,
      activeRunEpoch,
      activeStepEpoch,
      scheduled: timer !== null,
      backoffMs,
      nextStepAt,
      estimatedDelayMs: nextStepAt ? Math.max(nextStepAt - Date.now(), 0) : null,
      lastStepStartedAt,
      lastStepStage,
      pendingRunEvents: Array.from(pendingRunMessages.values()),
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
      touchGenerateTimeout(timeout, controller);

      try {
        console.log(`[AgentRunner] ${runtime.id} preparing runtime context before generate`);
        const agentContextInstructions = await loadAgentContextInstructions();
        const systemPrompt = buildStepSystemPrompt({
          agentContextInstructions,
        });
        console.log(`[AgentRunner] ${runtime.id} runtime context ready before generate`);
        console.log(`[AgentRunner] ${runtime.id} generate start (attempt ${attempt}/${GENERATE_TIMEOUT_MAX_ATTEMPTS})`);
        const result = await Promise.race([
          currentRuntime.agent.generate(effectivePromptText, {
            runId: activeRunId ?? `${runtime.id}:${runEpoch}`,
            maxSteps: GENERATE_MAX_STEPS_PER_RUN,
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
              touchGenerateTimeout(timeout, controller);

              if (stepNumber === 0 || runDelayMs <= 0) {
                return;
              }

              await delay(runDelayMs);
            },
            onStepFinish: async (stepResult) => {
              touchGenerateTimeout(timeout, controller);
              lastStepStage = 'recording-agent-usage';
              const { inputTokens, cachedInputTokens, outputTokens } =
                usage.getUsageFromResult(stepResult);

              await withTimeout(
                usage.recordAgentStep(contractId, inputTokens, cachedInputTokens, outputTokens),
                RUNNER_AWAIT_TIMEOUT_MS,
                `Agent usage recording timed out for ${runtime.id}`,
              );
            },
            onIterationComplete: async (iteration) => {
              touchGenerateTimeout(timeout, controller);
              lastStepStage = 'processing-runner-control';

              console.log(
                `[AgentRunner] ${runtime.id} iteration toolCalls:`,
                JSON.stringify(iteration.toolCalls, null, 2),
              );

              const controlDirective = extractRunnerControlDirectiveFromIteration(iteration);
              const ignoredTextRequested = controlDirective === 'ignore';
              const stopRequested = controlDirective === 'stop';
              const workingMemoryUpdated = didIterationUpdateWorkingMemory(iteration);
              const loopSignature = buildIterationLoopSignature(iteration);

              if (workingMemoryUpdated) {
                appendPendingRunMessages([
                  {
                    type: 'runner-working-memory-update',
                    groupKey: `runner-working-memory-update:${runtime.id}`,
                    groupMetadata: {
                      Source: 'runner',
                    },
                    idempotencyKey: `runner-working-memory-update:${runtime.id}:${Date.now()}`,
                    itemMetadata: {
                      Kind: 'working-memory-update',
                    },
                    text: `Working memory was updated at ${new Date().toISOString()} during the last step.`,
                    timestamp: Date.now(),
                  },
                ]);
              }

              if (registerLoopSignature(loopSignature) >= STUCK_LOOP_REPEAT_LIMIT) {
                await withTimeout(
                  notifications.createNotification({
                    agentId: runtime.id,
                    content: [
                      'Stuck loop detected.',
                      `Repeated signature count: ${repeatedLoopCount}`,
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

              const feedbackParts: string[] = [];
              const flushedPrompt = flushPendingRunMessages({
                allowOriginIdleOnly: true,
              });

              if (flushedPrompt) {
                feedbackParts.push(flushedPrompt);
              }

              if (
                iteration.toolCalls.length === 0 &&
                !stopRequested &&
                !suppressNoToolCallReminderForRun
              ) {
                feedbackParts.push(RUN_STOP_REMINDER);
              }

              const recallStep = buildRecallStepFromIteration(iteration);
              const recallFeedback = await currentRuntime.longTermMemoryRecall?.recallFromStep({
                step: recallStep,
                steps: [recallStep],
                threadId: currentRuntime.mastraId,
                resourceId: currentRuntime.mastraId,
              }) ?? null;

              if (recallFeedback?.trim()) {
                feedbackParts.push(recallFeedback.trim());
              }

              if (stopRequested && pendingRunMessages.size === 0 && feedbackParts.length === 0) {
                return {
                  continue: false,
                };
              }

              if (feedbackParts.length > 0) {
                return {
                  continue: true,
                  feedback: feedbackParts.join('\n\n'),
                };
              }

              return undefined;
            },
          }),
          timeout.promise,
        ]);
        console.log(`[AgentRunner] ${runtime.id} generate completed (attempt ${attempt}/${GENERATE_TIMEOUT_MAX_ATTEMPTS})`);
        return result;
      } catch (error) {
        const timedOut = controller.signal.aborted;

        if (!timedOut || attempt === GENERATE_TIMEOUT_MAX_ATTEMPTS) {
          throw error;
        }

        const backoffMs = GENERATE_TIMEOUT_BACKOFF_MS * attempt;
        console.error(
          `[AgentRunner] ${runtime.id} generate timed out on attempt ${attempt}/${GENERATE_TIMEOUT_MAX_ATTEMPTS}; retrying in ${backoffMs}ms`,
        );
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
    const agentContextContentPromise = loadAgentContextContent(filesystem);
    const pressureSignalsPromise = loadContextPressureSignals(agentContextContentPromise);
    const [agentContextContent, pressureSignals] = await Promise.all([
      agentContextContentPromise,
      pressureSignalsPromise,
    ]);

    if (!agentContextContent) {
      return pressureSignals || undefined;
    }

    return [
      pressureSignals,
      'Automatically loaded workspace context file.',
      `File: ${AGENT_CONTEXT_FILE_PATH}`,
      'This file should be treated as additional runtime instructions and context.',
      'This is the only workspace file auto-loaded into the execution context.',
      'Treat it as a concise summary layer. Keep details in other files and store only high-signal references here when needed.',
      'If you mention or use information from this file, do not say it came from context, instructions, notes, or memory. Use active language such as "I remember that...", "we already saw that...", or "on day X in the morning I did X" when appropriate.',
      '',
      agentContextContent,
    ].filter(Boolean).join('\n');
  }

  async function loadAgentContextContent(filesystem: typeof currentRuntime.workspace.filesystem) {
    if (!filesystem) {
      return null;
    }

    const exists = await withTimeout(
      filesystem.exists(AGENT_CONTEXT_FILE_PATH),
      CONTEXT_DECORATION_TIMEOUT_MS,
      `Agent context existence check timed out for ${runtime.id}`,
    ).catch(() => false);

    if (!exists) {
      return null;
    }

    const data = await withTimeout(
      filesystem.readFile(AGENT_CONTEXT_FILE_PATH),
      CONTEXT_DECORATION_TIMEOUT_MS,
      `Agent context read timed out for ${runtime.id}`,
    ).catch(() => null);

    if (!data) {
      return null;
    }

    const content = typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
    const trimmedContent = content.trim();
    return trimmedContent || null;
  }

  async function loadContextPressureSignals(agentContextContentPromise: Promise<string | null>) {
    const warnings: string[] = [];
    const [agentContextContent, workingMemory] = await Promise.all([
      agentContextContentPromise.catch(() => null),
      loadWorkingMemoryForPressureSignals().catch(() => null),
    ]);

    if (agentContextContent && agentContextContent.length > AGENT_CONTEXT_WARNING_CHAR_LIMIT) {
      warnings.push([
        'Context pressure warning:',
        `- \`${AGENT_CONTEXT_FILE_PATH}\` is getting large (${agentContextContent.length} chars).`,
        '- Keep only high-signal summary context there.',
        '- Move detailed notes, logs, and long task detail into separate workspace files.',
        '- Leave short retrieval hints and file references in `AGENT_CONTEXT.md`.',
      ].join('\n'));
    }

    if (workingMemory && workingMemory.trim().length > WORKING_MEMORY_WARNING_CHAR_LIMIT) {
      warnings.push([
        'Working memory pressure warning:',
        `- Working memory is getting large (${workingMemory.trim().length} chars).`,
        '- Working memory is for intrinsic identity, stable rules, domain boundaries, and mission-level direction.',
        '- Do not keep notebook detail, long task logs, timelines, or operational dumps there.',
        '- Move recoverable detail into workspace files and keep only intrinsic guidance in working memory.',
      ].join('\n'));
    }

    return warnings.join('\n\n');
  }

  async function loadWorkingMemoryForPressureSignals() {
    if (!currentRuntime.agent.hasOwnMemory()) {
      return null;
    }

    const memory = await withTimeout(
      currentRuntime.agent.getMemory(),
      CONTEXT_DECORATION_TIMEOUT_MS,
      `Agent memory lookup timed out for ${runtime.id}`,
    );

    if (!memory) {
      return null;
    }

    return withTimeout(
      memory.getWorkingMemory({
        threadId: currentRuntime.mastraId,
        resourceId: currentRuntime.mastraId,
      }),
      CONTEXT_DECORATION_TIMEOUT_MS,
      `Working memory lookup timed out for ${runtime.id}`,
    );
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
    invalidateInFlightGenerate();
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
    instant = false;
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
    activeGenerateToken += 1;
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
    backoffMs = ONE_MINUTE_MS;
    const settings = await withTimeout(
      systemSettings.getSettings(),
      RUNNER_AWAIT_TIMEOUT_MS,
      `System settings lookup timed out for ${runtime.id}`,
    );

    if (instant || !settings.stepDelayEnabled) {
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
      controller.abort(timeoutError);
      timeout.rejectTimeout?.(timeoutError);
    }, GENERATE_TIMEOUT_MS);
  }

  function clearGenerateTimeout(timeout: { timeoutId: NodeJS.Timeout | null }) {
    if (!timeout.timeoutId) {
      return;
    }

    clearTimeout(timeout.timeoutId);
    timeout.timeoutId = null;
  }
}

function delay(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeoutId: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (!timeoutId) {
      return;
    }

    clearTimeout(timeoutId);
  });
}

function buildIterationLoopSignature(iteration: {
  text: string;
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
}) {
  return JSON.stringify({
    text: iteration.text.trim(),
    toolCalls: iteration.toolCalls.map((toolCall) => ({
      toolName: toolCall.name,
      args: toolCall.args,
    })),
  });
}

function didIterationUpdateWorkingMemory(iteration: {
  toolCalls: Array<{
    name: string;
  }>;
}) {
  return iteration.toolCalls.some((toolCall) => toolCall.name === 'updateWorkingMemory');
}

function serializeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return {
      type: typeof error,
      value: error,
    };
  }

  const extra = Object.fromEntries(
    Object.entries(error).map(([key, value]) => [key, serializeUnknown(value)]),
  );

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...extra,
  };
}

function serializeUnknown(value: unknown): unknown {
  if (value instanceof Error) {
    return serializeError(value);
  }

  if (Array.isArray(value)) {
    return value.map(serializeUnknown);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, serializeUnknown(item)]),
  );
}

function formatAbsentExecutionError(input: {
  stage: string | null;
  error: unknown;
}) {
  const stage = input.stage ?? 'unknown';

  if (input.error instanceof Error) {
    const details = extractAbsentErrorDetails(input.error);

    return [
      `Stage: ${stage}`,
      `${input.error.name}: ${input.error.message}`,
      ...details,
    ].join('\n');
  }

  return `Stage: ${stage}\n${String(input.error)}`;
}

function extractAbsentErrorDetails(error: Error) {
  const record = serializeError(error);
  const detailLines: string[] = [];
  const candidateEntries = [
    ['statusCode', record.statusCode],
    ['statusText', record.statusText],
    ['url', record.url],
    ['responseBody', record.responseBody],
    ['body', record.body],
    ['data', record.data],
    ['value', record.value],
  ] as const;

  for (const [label, value] of candidateEntries) {
    const text = formatAbsentErrorDetailValue(value);

    if (!text) {
      continue;
    }

    detailLines.push(`${label}: ${text}`);
  }

  const causeText = formatAbsentErrorDetailValue(record.cause);

  if (causeText) {
    detailLines.push(`cause: ${causeText}`);
  }

  return detailLines;
}

function formatAbsentErrorDetailValue(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, 2_000) : null;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    const text = JSON.stringify(value);
    return text && text !== '{}' ? text.slice(0, 2_000) : null;
  } catch {
    return String(value).slice(0, 2_000);
  }
}

function buildStepSystemPrompt(input: {
  agentContextInstructions: string | null | undefined;
}) {
  const sections = [
    input.agentContextInstructions?.trim() || null,
  ].filter((value): value is string => Boolean(value));

  if (sections.length === 0) {
    return null;
  }

  return sections.join('\n\n');
}

export type InternalAgentRunner = ReturnType<typeof createAgentRunner>;

function extractRunnerControlDirective(result: {
  text: string;
  steps?: Array<{
    response?: {
      uiMessages?: Array<{
        parts?: Array<unknown>;
      }>;
    };
  }>;
}) {
  const texts = [
    result.text,
    ...collectStepTextParts(result.steps ?? []),
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  if (texts.some((value) => hasExactControlDirective(value, STOP_AND_IDLE_PREFIX))) {
    return 'stop' as const;
  }

  if (texts.some((value) => hasExactControlDirective(value, NO_ACTION_NEEDED_PREFIX))) {
    return 'ignore' as const;
  }

  return null;
}

function extractRunnerControlDirectiveFromIteration(iteration: {
  text: string;
}) {
  const text = iteration.text.trim();

  if (hasExactControlDirective(text, STOP_AND_IDLE_PREFIX)) {
    return 'stop' as const;
  }

  if (hasExactControlDirective(text, NO_ACTION_NEEDED_PREFIX)) {
    return 'ignore' as const;
  }

  return null;
}

function buildRecallStepFromIteration(iteration: {
  text: string;
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
  toolResults: Array<{
    name: string;
    result: unknown;
  }>;
}) {
  return {
    text: iteration.text,
    toolCalls: iteration.toolCalls.map((toolCall) => ({
      toolName: toolCall.name,
      args: toolCall.args,
    })),
    toolResults: iteration.toolResults.map((toolResult) => ({
      toolName: toolResult.name,
      result: toolResult.result,
    })),
  };
}

function collectStepTextParts(steps: Array<{
  response?: {
    uiMessages?: Array<{
      parts?: Array<unknown>;
    }>;
  };
}>) {
  const texts: string[] = [];

  for (const step of steps) {
    for (const message of step.response?.uiMessages ?? []) {
      for (const part of message.parts ?? []) {
        if (!part || typeof part !== 'object') {
          continue;
        }

        if ('type' in part && part.type === 'text' && 'text' in part && typeof part.text === 'string') {
          texts.push(part.text);
          continue;
        }

        if ('text' in part && typeof part.text === 'string') {
          texts.push(part.text);
        }
      }
    }
  }

  return texts;
}

function hasExactControlDirective(text: string, directive: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .some((line) => line === directive);
}
