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
const STEP_HANG_WARNING_MS = FIFTEEN_MINUTES_MS;
const GENERATE_TIMEOUT_MS = FIFTEEN_MINUTES_MS;
const GENERATE_TIMEOUT_MAX_ATTEMPTS = 3;
const GENERATE_TIMEOUT_BACKOFF_MS = 5_000;
const DEFAULT_RUN_LAST_MESSAGES = 20;
const AGENT_CONTEXT_FILE_PATH = 'AGENT_CONTEXT.md';
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
  let stopped = false;
  let instant = false;
  let startingRun = false;
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
  let currentGenerateAbortController: AbortController | null = null;
  let runLastMessages: number | null = DEFAULT_RUN_LAST_MESSAGES;
  const pendingRunMessages = new Map<string, AgentWakeEvent>();

  currentRuntime.onReceiveMessage(notifyExternalEvent);

  async function reloadRuntimeForNewRun(runEpoch: number) {
    if (!options.reloadRuntime) {
      return;
    }

    const previousRuntime = currentRuntime;
    const nextRuntime = await options.reloadRuntime();

    if (isStaleRun(runEpoch)) {
      await nextRuntime.dispose();
      return;
    }

    currentRuntime = nextRuntime;
    usage = createAgentRunnerUsage({ store, runtime: currentRuntime });
    currentRuntime.onReceiveMessage(notifyExternalEvent);
    options.onRuntimeReloaded?.(nextRuntime);
    await previousRuntime.dispose();
  }

  function clearTimer() {
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    timer = null;
    nextStepAt = null;
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

    const executionState = await store.getExecutionState(runtime.id);

    if (executionState !== 'running') {
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

    const executionState = await store.getExecutionState(runtime.id);

    appendPendingRunMessages(events);

    if (executionState === 'running' || startingRun) {
      return;
    }

    await beginRun({
      reloadRuntime: true,
      wakeStartedAt: Date.now(),
      markRunning: true,
    });
  }

  function appendPendingRunMessages(events: AgentWakeEvent[]) {
    for (const event of events) {
      if (!event.text.trim()) {
        continue;
      }

      pendingRunMessages.set(event.idempotencyKey, event);
    }
  }

  function flushPendingRunMessages() {
    if (pendingRunMessages.size === 0) {
      return null;
    }

    const events = Array.from(pendingRunMessages.values()).sort(
      (left, right) => left.timestamp - right.timestamp,
    );
    pendingRunMessages.clear();

    if (events.length === 0) {
      return null;
    }

    incrementRunLastMessages();
    return formatPendingRunEvents(events);
  }

  function stop() {
    stopped = true;
    startingRun = false;
    activeRunEpoch += 1;
    activeStepEpoch = 0;
    invalidateInFlightGenerate();
    executing = false;
    clearTimer();
    wakeQueue.stop();
    runLastMessages = DEFAULT_RUN_LAST_MESSAGES;
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
    const runEpoch = startNewRunEpoch();

    try {
      instant = true;
      backoffMs = ONE_MINUTE_MS;
      lastWakeStartedAt = input.wakeStartedAt;
      resetLoopDetector();
      await resetRunLastMessages();

      if (input.reloadRuntime) {
        await reloadRuntimeForNewRun(runEpoch);
      }

      if (isStaleRun(runEpoch)) {
        return;
      }

      if (input.markRunning) {
        await store.setExecutionState(runtime.id, 'running');
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
    }
  }

  async function queueNextStep(runEpoch = activeRunEpoch) {
    if (stopped || startingRun || executing || timer || isStaleRun(runEpoch)) {
      return;
    }

    try {
      const executionState = await store.getExecutionState(runtime.id);

      if (executionState !== 'running' || isStaleRun(runEpoch)) {
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
    let prompt = '';
    lastStepStartedAt = Date.now();
    lastStepStage = 'step-started';
    const stepWarningTimer = setTimeout(() => {
      console.error(
        `[AgentRunner] ${runtime.id} step appears stuck:`,
        JSON.stringify({
          agentId: runtime.id,
          mastraId: currentRuntime.mastraId,
          pricingModelKey: currentRuntime.pricingModelKey,
          modelProfileId: currentRuntime.modelProfileId,
          stepStartedAt: lastStepStartedAt,
          stepStage: lastStepStage,
          prompt,
          snapshot: getSnapshot(),
          stepHangWarningMs: STEP_HANG_WARNING_MS,
        }, null, 2),
      );

    }, STEP_HANG_WARNING_MS);

    try {
      lastStepStage = 'checking-execution-state';
      const executionState = await store.getExecutionState(runtime.id);

      if (executionState !== 'running' || isStaleRun(runEpoch)) {
        return;
      }

      lastStepStage = 'loading-runnable-contract';
      const contract = await store.getRunnableContract(runtime.id);

      if (isStaleRun(runEpoch)) {
        return;
      }

      if (!contract) {
        await transitionToIdle(runEpoch);
        return;
      }

      if (contract.id !== contractId) {
        await queueNextStep(runEpoch);
        return;
      }

      lastStepStage = 'flushing-pending-run-messages';
      prompt = flushPendingRunMessages() ?? '';
      console.log(`[AgentRunner] ${runtime.id} executing step`);

      lastStepStage = 'agent-generate';
      const result = await generateWithTimeoutRetries(prompt, runEpoch);

      if (isStaleRun(runEpoch)) {
        return;
      }
      lastStepStage = 'logging-tool-calls';
      console.log(
        `[AgentRunner] ${runtime.id} toolCalls:`,
        JSON.stringify(
          result.toolCalls.map((chunk) => ({
            toolName: chunk.payload.toolName,
            args: chunk.payload.args,
          })),
          null,
          2,
        ),
      );
      lastStepStage = 'recording-agent-usage';
      const {
        inputTokens,
        cachedInputTokens,
        outputTokens,
      } = usage.getUsageFromResult(result);

      await usage.recordAgentStep(contractId, inputTokens, cachedInputTokens, outputTokens);
      lastStepStage = 'recording-observational-memory-usage';
      await usage.recordObservationalMemorySteps(contractId, result.steps);

      lastStepStage = 'processing-runner-control';
      const controlDirective = extractRunnerControlDirective(result.text);
      const ignoredTextRequested = controlDirective === 'ignore';
      const stopRequested = controlDirective === 'stop';
      const workingMemoryUpdated = didUpdateWorkingMemory(result);
      const loopSignature = buildLoopSignature(result);

      if (workingMemoryUpdated) {
        appendPendingRunMessages([
          {
            type: 'runner-working-memory-update',
            groupKey: `runner-working-memory-update:${runtime.id}`,
            groupMetadata: {
              Source: 'runner',
            },
            idempotencyKey: `runner-working-memory-update:${runtime.id}:${lastStepStartedAt ?? Date.now()}`,
            itemMetadata: {
              Kind: 'working-memory-update',
            },
            text: `Working memory was updated at ${new Date().toISOString()} during the last step.`,
            timestamp: Date.now(),
          },
        ]);
      }

      if (registerLoopSignature(loopSignature) >= STUCK_LOOP_REPEAT_LIMIT) {
        await notifications.createNotification({
          agentId: runtime.id,
          content: [
            'Stuck loop detected.',
            `Repeated signature count: ${repeatedLoopCount}`,
            'The agent repeated the same tool/text pattern and was forced to stop.',
            '',
            'Signature:',
            loopSignature,
          ].join('\n'),
        });
        nextStepAt = null;
        await resetRunLastMessages();
        resetLoopDetector();
        await transitionToIdle(runEpoch);
        return;
      }

      if (result.toolCalls.length === 0 && stopRequested) {
        if (pendingRunMessages.size > 0) {
          console.log(`[AgentRunner] ${runtime.id} ignored STOP_AND_IDLE because pending run messages arrived during the step`);
          backoffMs = ONE_MINUTE_MS;
          continueRunning = true;
          return;
        }

        nextStepAt = null;
        resetLoopDetector();
        await transitionToIdle(runEpoch);
        return;
      }

      if (result.toolCalls.length === 0 && ignoredTextRequested) {
        backoffMs = ONE_MINUTE_MS;
        continueRunning = true;
        return;
      }

      if (result.toolCalls.length === 0) {
        appendPendingRunMessages([
          {
            type: 'runner-reminder',
            groupKey: `runner-reminder:${runtime.id}`,
            groupMetadata: {
              Source: 'runner',
            },
            idempotencyKey: `runner-reminder:${runtime.id}:${Date.now()}`,
            itemMetadata: {
              Kind: 'run-stop-reminder',
            },
            text: RUN_STOP_REMINDER,
            timestamp: Date.now(),
          },
        ]);
        instant = true;
      }

      backoffMs = ONE_MINUTE_MS;
      continueRunning = true;
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
      schedule(nextBackoff());
    } finally {
      clearTimeout(stepWarningTimer);
      lastStepStartedAt = null;
      lastStepStage = null;
      if (activeStepEpoch === runEpoch) {
        activeStepEpoch = 0;
        executing = false;
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
    const settings = await systemSettings.getSettings();

    if (settings.memoryLastMessagesFullEnabled) {
      runLastMessages = null;
      return;
    }

    runLastMessages = settings.memoryLastMessagesCount || DEFAULT_RUN_LAST_MESSAGES;
  }

  function incrementRunLastMessages() {
    if (runLastMessages === null) {
      return;
    }
    runLastMessages += 1;
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
    const contract = await store.getRunnableContract(runtime.id);

    if (!contract) {
      return {
        execute: 'idle' as const,
      };
    }

    const spentUsd = await store.getContractSpend(contract.id);
    const remainingBudgetUsd = contract.budgetUsd - spentUsd;
    const estimatedStepUsd = await usage.estimateStepCostUsd();

    if (estimatedStepUsd !== null && remainingBudgetUsd < estimatedStepUsd) {
      return {
        execute: 'idle' as const,
      };
    }

    backoffMs = ONE_MINUTE_MS;
    const settings = await systemSettings.getSettings();

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
    execute,
    getSnapshot,
    notifyExternalEvent,
  };

  async function generateWithTimeoutRetries(promptText: string, runEpoch: number) {
    for (let attempt = 1; attempt <= GENERATE_TIMEOUT_MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const generateToken = startGenerateAttempt(controller);
      const timeout = createGenerateTimeoutPromise(controller);

      try {
        const agentContextInstructions = await loadAgentContextInstructions();
        console.log(`[AgentRunner] ${runtime.id} generate start (attempt ${attempt}/${GENERATE_TIMEOUT_MAX_ATTEMPTS})`);
        const result = await Promise.race([
          currentRuntime.agent.generate(promptText, {
            maxSteps: 1,
            abortSignal: controller.signal,
            ...(agentContextInstructions ? { system: agentContextInstructions } : {}),
            memory: {
              thread: currentRuntime.mastraId,
              resource: currentRuntime.mastraId,
              options: runLastMessages === null
                ? undefined
                : {
                    lastMessages: runLastMessages,
                  },
            },
            providerOptions: {
              anthropic: {
                thinking: { type: 'enabled', budgetTokens: 2000 },
              },
            },
            onIterationComplete: () => {
              if (isStaleRun(runEpoch) || generateToken !== activeGenerateToken) {
                return;
              }

              const feedback = flushPendingRunMessages();

              if (!feedback) {
                return;
              }

              return {
                continue: true,
                feedback,
              };
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
        timeout.clear();
        finishGenerateAttempt(generateToken, controller);
      }
    }

    throw new Error('Agent generate timed out after all retry attempts');
  }

  async function loadAgentContextInstructions() {
    const filesystem = currentRuntime.workspace.filesystem;

    if (!filesystem) {
      return undefined;
    }

    const exists = await filesystem.exists(AGENT_CONTEXT_FILE_PATH);

    if (!exists) {
      return undefined;
    }

    const data = await filesystem.readFile(AGENT_CONTEXT_FILE_PATH);
    const content = typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
    const trimmedContent = content.trim();

    if (!trimmedContent) {
      return undefined;
    }

    return [
      'Automatically loaded workspace context file.',
      `File: ${AGENT_CONTEXT_FILE_PATH}`,
      'This file should be treated as additional runtime instructions and context.',
      'This is the only workspace file auto-loaded into the execution context.',
      'Treat it as a concise summary layer. Keep details in other files and store only high-signal references here when needed.',
      '',
      trimmedContent,
    ].join('\n');
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

  async function transitionToIdle(runEpoch: number) {
    if (isStaleRun(runEpoch)) {
      return;
    }

    clearTimer();
    invalidateInFlightGenerate();
    instant = false;
    await resetRunLastMessages();
    resetLoopDetector();
    await store.setExecutionState(runtime.id, 'idle');

    if (isStaleRun(runEpoch)) {
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

  function createGenerateTimeoutPromise(controller: AbortController) {
    let timeoutId: NodeJS.Timeout | null = null;
    const promise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        const timeoutError = new Error(`Agent generate timed out after ${GENERATE_TIMEOUT_MS}ms`);
        controller.abort(timeoutError);
        reject(timeoutError);
      }, GENERATE_TIMEOUT_MS);
    });

    return {
      promise,
      clear() {
        if (!timeoutId) {
          return;
        }

        clearTimeout(timeoutId);
        timeoutId = null;
      },
    };
  }
}

function delay(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function buildLoopSignature(result: {
  text: string;
  toolCalls: Array<{
    payload: {
      toolName: string;
      args?: unknown;
    };
  }>;
}) {
  return JSON.stringify({
    text: result.text.trim(),
    toolCalls: result.toolCalls.map((chunk) => ({
      toolName: chunk.payload.toolName,
      args: chunk.payload.args,
    })),
  });
}

function didUpdateWorkingMemory(result: {
  toolCalls: Array<{
    payload: {
      toolName: string;
    };
  }>;
}) {
  return result.toolCalls.some((chunk) => chunk.payload.toolName === 'updateWorkingMemory');
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

export type InternalAgentRunner = ReturnType<typeof createAgentRunner>;

function extractRunnerControlDirective(text: string) {
  const normalizedText = text.trim();

  if (normalizedText.includes(STOP_AND_IDLE_PREFIX)) {
    return 'stop' as const;
  }

  if (normalizedText.includes(NO_ACTION_NEEDED_PREFIX)) {
    return 'ignore' as const;
  }

  return null;
}
