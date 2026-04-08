import { createAgentWakeQueue } from '@mastra-engine/core';
import type { AgentWakeEvent } from '@mastra-engine/core';

import type { InternalAgentRuntime } from './agent-runtime-types';
import { createAgentContractStore } from './agent-contract-store';
import type { Database } from '../database/index';
import { createSystemSettingsStore } from '../system-settings/store';
import { createAgentRunnerUsage } from './agent-runner-usage';
import { formatPendingRunEvents, RUN_STOP_REMINDER } from './agent-runner-wake';

const ONE_MINUTE_MS = 60_000;
const TEN_MINUTES_MS = 10 * ONE_MINUTE_MS;
const NO_ACTION_NEEDED_PREFIX = 'NO_ACTION_NEEDED';
const STOP_AND_IDLE_PREFIX = 'STOP_AND_IDLE';
const NO_ACTION_NEEDED_XML_PATTERN = /<invoke[^>]*name=["']NO_ACTION_NEEDED["'][^>]*>/i;
const STOP_AND_IDLE_XML_PATTERN = /<invoke[^>]*name=["']STOP_AND_IDLE["'][^>]*>/i;

export function createAgentRunner(db: Database, runtime: InternalAgentRuntime) {
  const store = createAgentContractStore(db);
  const systemSettings = createSystemSettingsStore(db);
  const usage = createAgentRunnerUsage({ store, runtime });
  const wakeQueue = createAgentWakeQueue({
    label: runtime.id,
    execute,
  });
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let instant = false;
  let executing = false;
  let backoffMs = ONE_MINUTE_MS;
  let nextStepAt: number | null = null;
  let lastWakeStartedAt: number | null = null;
  const pendingRunMessages = new Map<string, AgentWakeEvent>();

  runtime.onReceiveMessage(wakeQueue.notifyExternalEvent);

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
    const executionState = await store.getExecutionState(runtime.id);

    if (executionState !== 'running') {
      return;
    }

    instant = true;
    lastWakeStartedAt = Date.now();
    await queueNextStep();
  }

  async function execute(events: AgentWakeEvent[]) {
    if (stopped) {
      return;
    }

    const executionState = await store.getExecutionState(runtime.id);

    appendPendingRunMessages(events);

    if (executionState === 'running') {
      return;
    }

    instant = true;
    backoffMs = ONE_MINUTE_MS;
    lastWakeStartedAt = Date.now();
    await store.setExecutionState(runtime.id, 'running');
    await queueNextStep();
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

    return formatPendingRunEvents(events);
  }

  function stop() {
    stopped = true;
    clearTimer();
    wakeQueue.stop();
  }

  async function queueNextStep() {
    if (stopped || executing || timer) {
      return;
    }

    try {
      const executionState = await store.getExecutionState(runtime.id);

      if (executionState !== 'running') {
        return;
      }

      const nextAttempt = await planNextAttempt();

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
          void executeStep(nextAttempt.contractId);
        },
        Math.max(delayMs, 0),
      );
    } catch (error) {
      console.error(`[AgentRunner] ${runtime.id} failed to schedule next step:`, error);
      instant = false;
      schedule(nextBackoff());
    }
  }

  async function executeStep(contractId: string) {
    if (stopped || executing) {
      return;
    }

    executing = true;
    let continueRunning = false;

    try {
      const executionState = await store.getExecutionState(runtime.id);

      if (executionState !== 'running') {
        return;
      }

      const contract = await store.getRunnableContract(runtime.id);

      if (!contract || contract.id !== contractId) {
        await queueNextStep();
        return;
      }

      const prompt = flushPendingRunMessages() ?? [];
      console.log(`[AgentRunner] ${runtime.id} executing step`);

      const result = await runtime.agent.generate(prompt, {
        maxSteps: 1,
        // toolChoice: 'required', removio para não requerer tool call obrigatoriamente
        memory: {
          thread: runtime.mastraId,
          resource: runtime.mastraId,
        },
        providerOptions: {
          anthropic: {
            thinking: { type: 'enabled', budgetTokens: 2000 },
          },
        },
        onIterationComplete: () => {
          const feedback = flushPendingRunMessages();

          if (!feedback) {
            return;
          }

          return {
            continue: true,
            feedback,
          };
        },
      });
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
      const {
        inputTokens,
        cachedInputTokens,
        outputTokens,
      } = usage.getUsageFromResult(result);

      await usage.recordAgentStep(contractId, inputTokens, cachedInputTokens, outputTokens);
      await usage.recordObservationalMemorySteps(contractId, result.steps);

      const controlDirective = extractRunnerControlDirective(result.text);
      const ignoredTextRequested = controlDirective === 'ignore';
      const stopRequested = controlDirective === 'stop';

      if (result.toolCalls.length === 0 && stopRequested) {
        nextStepAt = null;
        await store.setExecutionState(runtime.id, 'idle');
        await wakeQueue.onRunnerIdle();
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
      console.error(`[AgentRunner] ${runtime.id} step failed:`, error);
      schedule(nextBackoff());
    } finally {
      executing = false;

      if (continueRunning) {
        await queueNextStep();
      }
    }
  }

  async function planNextAttempt() {
    const contract = await store.getRunnableContract(runtime.id);

    if (!contract) {
      return {
        execute: false as const,
        delayMs: nextBackoff(),
      };
    }

    const spentUsd = await store.getContractSpend(contract.id);
    const remainingBudgetUsd = contract.budgetUsd - spentUsd;
    const estimatedStepUsd = await usage.estimateStepCostUsd();

    if (estimatedStepUsd !== null && remainingBudgetUsd < estimatedStepUsd) {
      return {
        execute: false as const,
        delayMs: nextBackoff(),
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
      executing,
      scheduled: timer !== null,
      backoffMs,
      nextStepAt,
      estimatedDelayMs: nextStepAt ? Math.max(nextStepAt - Date.now(), 0) : null,
      wake: wakeQueue.getSnapshot(),
      lastWakeStartedAt,
    };
  }

  return {
    start,
    stop,
    execute,
    getSnapshot,
    notifyExternalEvent: wakeQueue.notifyExternalEvent,
  };
}

export type InternalAgentRunner = ReturnType<typeof createAgentRunner>;

function extractRunnerControlDirective(text: string) {
  const normalizedText = text.trim();

  if (
    normalizedText === STOP_AND_IDLE_PREFIX
    || STOP_AND_IDLE_XML_PATTERN.test(normalizedText)
  ) {
    return 'stop' as const;
  }

  if (
    normalizedText === NO_ACTION_NEEDED_PREFIX
    || NO_ACTION_NEEDED_XML_PATTERN.test(normalizedText)
  ) {
    return 'ignore' as const;
  }

  return null;
}
