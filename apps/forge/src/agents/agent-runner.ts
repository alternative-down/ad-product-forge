import { createAgentWakeQueue } from '@mastra-engine/core';
import type { AgentWakeEvent } from '@mastra-engine/core';

import type { InternalAgentRuntime } from './create-forge-agent';
import { createAgentContractStore } from './agent-contract-store';
import type { Database } from '../database/index';

const ONE_MINUTE_MS = 60_000;
const TEN_MINUTES_MS = 10 * ONE_MINUTE_MS;
const RECENT_STEP_LIMIT = 10;
const NO_ACTION_NEEDED_PREFIX = 'NO_ACTION_NEEDED';
const RUN_STOP_REMINDER = [
  'System reminder:',
  '- The current run will continue looping until you explicitly respond with NO_ACTION_NEEDED.',
  '- NO_ACTION_NEEDED signals the task is complete and no further tools are needed.',
  '- If you still need to inspect, decide, or act, call the appropriate tool.',
].join('\n');
type AgentUsage = {
  inputTokens?: number;
  outputTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  cachedInputTokens?: number;
  inputTokenDetails?: {
    noCacheTokens?: number;
    cacheReadTokens?: number;
  };
};

type OmObservationEndPart = {
  type: 'data-om-observation-end';
  data?: {
    tokensObserved?: number;
    observationTokens?: number;
  };
};

export function createAgentRunner(db: Database, runtime: InternalAgentRuntime) {
  const store = createAgentContractStore(db);
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
      const usage = result.usage as AgentUsage;
      const inputTokens =
        usage.inputTokenDetails?.noCacheTokens ?? usage.inputTokens ?? usage.promptTokens ?? 0;
      const cachedInputTokens =
        usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens ?? 0;
      const outputTokens = usage.outputTokens ?? usage.completionTokens ?? 0;

      await recordAgentStep(contractId, inputTokens, cachedInputTokens, outputTokens);
      await recordObservationalMemorySteps(contractId, result.steps);

      const stopRequested = result.text.trimStart().includes(NO_ACTION_NEEDED_PREFIX);

      if (result.toolCalls.length === 0 && stopRequested) {
        nextStepAt = null;
        await store.setExecutionState(runtime.id, 'idle');
        await wakeQueue.onRunnerIdle();
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
    const estimatedStepUsd = await estimateStepCostUsd();

    if (estimatedStepUsd !== null && remainingBudgetUsd < estimatedStepUsd) {
      return {
        execute: false as const,
        delayMs: nextBackoff(),
      };
    }

    backoffMs = ONE_MINUTE_MS;

    return {
      execute: true as const,
      contractId: contract.id,
      delayMs: instant
        ? 0
        : calculateDelayMs(contract.endsAt, remainingBudgetUsd, estimatedStepUsd),
    };
  }

  async function estimateStepCostUsd() {
    if (!runtime.modelProfileId) {
      throw new Error(`Agent runtime is missing primary model profile: ${runtime.id}`);
    }

    const recentSteps = await store.listRecentSteps(runtime.id, RECENT_STEP_LIMIT);

    if (recentSteps.length === 0) {
      return null;
    }

    const averageStepUsd =
      recentSteps.reduce((total, step) => total + step.costUsd, 0) / recentSteps.length;
    const pricing = await store.getUsagePricing({
      pricingModelKey: runtime.pricingModelKey,
      profileId: runtime.modelProfileId,
    });
    const lastAgentStep = recentSteps.find((step) => step.kind === 'agent-step');

    if (!pricing.modelPrice || !lastAgentStep) {
      return averageStepUsd;
    }

    const inputEstimatedUsd =
      (lastAgentStep.inputTokens / 1_000_000) *
      pricing.modelPrice.inputPerMillionUsd *
      pricing.contractCostMultiplier;
    return (inputEstimatedUsd + averageStepUsd) / 2;
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

  async function recordAgentStep(
    contractId: string,
    inputTokens: number,
    cachedInputTokens: number,
    outputTokens: number,
  ) {
    if (!runtime.modelProfileId) {
      throw new Error(`Agent runtime is missing primary model profile: ${runtime.id}`);
    }

    const pricing = await store.getUsagePricing({
      pricingModelKey: runtime.pricingModelKey,
      profileId: runtime.modelProfileId,
    });
    let costUsd = 0;

    if (pricing.modelPrice) {
      costUsd =
        ((inputTokens / 1_000_000) * pricing.modelPrice.inputPerMillionUsd +
          (cachedInputTokens / 1_000_000) * pricing.modelPrice.inputCachePerMillionUsd +
          (outputTokens / 1_000_000) * pricing.modelPrice.outputPerMillionUsd) *
        pricing.contractCostMultiplier;
    }

    await store.recordAgentStep({
      agentId: runtime.id,
      contractId,
      llmProfileId: runtime.modelProfileId,
      modelKey: runtime.pricingModelKey,
      kind: 'agent-step',
      inputTokens,
      cachedInputTokens,
      outputTokens,
      inputPerMillionUsd: pricing.modelPrice?.inputPerMillionUsd ?? 0,
      inputCachePerMillionUsd: pricing.modelPrice?.inputCachePerMillionUsd ?? 0,
      outputPerMillionUsd: pricing.modelPrice?.outputPerMillionUsd ?? 0,
      contractCostMultiplier: pricing.contractCostMultiplier,
      costUsd,
    });
  }

  async function recordObservationalMemorySteps(
    contractId: string,
    steps: Array<{
      response?: {
        uiMessages?: Array<{
          parts?: Array<unknown>;
        }>;
      };
    }>,
  ) {
    if (!runtime.omModelProfileId) {
      throw new Error(`Agent runtime is missing OM model profile: ${runtime.id}`);
    }

    const pricing = await store.getUsagePricing({
      pricingModelKey: runtime.omPricingModelKey,
      profileId: runtime.omModelProfileId,
    });
    const parts = steps
      .flatMap((step) => step.response?.uiMessages ?? [])
      .flatMap((message) => message.parts ?? []);

    for (const part of parts) {
      if (!isOmObservationEndPart(part)) {
        continue;
      }

      const inputTokens = part.data?.tokensObserved ?? 0;
      const outputTokens = part.data?.observationTokens ?? 0;

      if (inputTokens <= 0 && outputTokens <= 0) {
        continue;
      }

      let costUsd = 0;

      if (pricing.modelPrice) {
        costUsd =
          ((inputTokens / 1_000_000) * pricing.modelPrice.inputPerMillionUsd +
            (outputTokens / 1_000_000) * pricing.modelPrice.outputPerMillionUsd) *
          pricing.contractCostMultiplier;
      }

      await store.recordAgentStep({
        agentId: runtime.id,
        contractId,
        llmProfileId: runtime.omModelProfileId,
        modelKey: runtime.omPricingModelKey,
        kind: 'om',
        inputTokens,
        cachedInputTokens: 0,
        outputTokens,
        inputPerMillionUsd: pricing.modelPrice?.inputPerMillionUsd ?? 0,
        inputCachePerMillionUsd: pricing.modelPrice?.inputCachePerMillionUsd ?? 0,
        outputPerMillionUsd: pricing.modelPrice?.outputPerMillionUsd ?? 0,
        contractCostMultiplier: pricing.contractCostMultiplier,
        costUsd,
      });
    }
  }

  function isOmObservationEndPart(part: unknown): part is OmObservationEndPart {
    if (!part || typeof part !== 'object') {
      return false;
    }

    return 'type' in part && part.type === 'data-om-observation-end';
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

function formatPendingRunEvents(events: AgentWakeEvent[]) {
  const groups = new Map<string, AgentWakeEvent[]>();
  const orderedEvents = [...events].sort((left, right) => left.timestamp - right.timestamp);

  for (const event of orderedEvents) {
    const existingGroup = groups.get(event.groupKey);

    if (existingGroup) {
      existingGroup.push(event);
      continue;
    }

    groups.set(event.groupKey, [event]);
  }

  return Array.from(groups.values())
    .map((groupEvents) => formatPendingRunEventGroup(groupEvents))
    .join('\n\n');
}

function formatPendingRunEventGroup(events: AgentWakeEvent[]) {
  const orderedEvents = [...events].sort((left, right) => left.timestamp - right.timestamp);
  const firstEvent = orderedEvents[0];
  const header = describeWakeGroup(firstEvent);
  const itemLines = orderedEvents.map((event) => formatPendingRunEventItem(event));

  return [header, '', ...itemLines].join('\n');
}

function formatPendingRunEventItem(event: AgentWakeEvent) {
  const timeLabel = formatWakeTime(event.timestamp);
  const messageId = event.itemMetadata?.MessageId;
  const actor = event.itemMetadata?.Author ?? describeWakeActor(event);
  const actorId = event.itemMetadata?.AuthorId;
  const text = event.text.trim().replace(/\s*\n+\s*/g, ' ');

  const label = [
    `[${timeLabel}]`,
    messageId ? `[msg: ${messageId}]` : '',
    actor
      ? actorId
        ? `${actor} (id: ${actorId})`
        : actor
      : '',
  ]
    .filter(Boolean)
    .join('');

  return actor ? `${label}: ${text}` : `${[label, text].filter(Boolean).join(' ')}`.trim();
}

function describeWakeGroup(event: AgentWakeEvent) {
  if (event.type.startsWith('message:')) {
    const provider = event.groupMetadata?.Provider ?? event.type.split(':')[1] ?? 'message';
    const targetKey = event.groupMetadata?.TargetKey ?? event.groupKey;
    return `${formatWakeProvider(provider)}: ${targetKey}`;
  }

  if (event.type === 'schedule') {
    return `Schedule: ${event.groupMetadata?.ScheduleId ?? event.groupKey}`;
  }

  if (event.type.startsWith('github:') || event.groupMetadata?.Source === 'github') {
    return `GitHub: ${event.groupMetadata?.EventType ?? event.groupKey}`;
  }

  if (event.type === 'function-change') {
    return `Function change: ${event.groupMetadata?.TargetAgentId ?? event.groupKey}`;
  }

  if (event.type === 'runner-reminder') {
    return 'System: runner-reminder';
  }

  return `${formatWakeLabel(event.type)}: ${event.groupKey}`;
}

function formatWakeProvider(value: string) {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatWakeLabel(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_:]+/g, ' ')
    .toLowerCase();
}

function describeWakeActor(event: AgentWakeEvent) {
  if (event.type === 'schedule') {
    return 'Scheduler';
  }

  if (event.type.startsWith('github:') || event.groupMetadata?.Source === 'github') {
    return 'GitHub';
  }

  if (event.type === 'function-change') {
    return 'System';
  }

  if (event.type === 'runner-reminder') {
    return 'System';
  }

  return '';
}

function formatWakeTime(timestamp: number) {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export type InternalAgentRunner = ReturnType<typeof createAgentRunner>;
