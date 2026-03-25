import { createAgentWakeQueue } from '@mastra-engine/core';

import type { InternalAgentRuntime } from './create-forge-agent';
import { createAgentContractStore } from './agent-contract-store';
import type { Database } from '../database/index';

const ONE_MINUTE_MS = 60_000;
const TEN_MINUTES_MS = 10 * ONE_MINUTE_MS;
const RECENT_STEP_LIMIT = 10;
const NO_ACTION_NEEDED_PREFIX = 'NO_ACTION_NEEDED';
const RUN_STOP_REMINDER = [
  'System reminder:',
  '- Plain text responses are not routed to any external counterpart.',
  '- The current run only stops when you explicitly respond with `NO_ACTION_NEEDED` and do not call a tool.',
  '- If you still need to inspect, decide, or act, use the appropriate tools.',
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
  let pendingRunMessages: string[] = [];

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

  async function execute(content: string) {
    if (stopped) {
      return;
    }

    const nextContent = content.trim();
    const executionState = await store.getExecutionState(runtime.id);

    appendPendingRunMessage(nextContent);

    if (executionState === 'running') {
      return;
    }

    instant = true;
    backoffMs = ONE_MINUTE_MS;
    lastWakeStartedAt = Date.now();
    await store.setExecutionState(runtime.id, 'running');
    await queueNextStep();
  }

  function appendPendingRunMessage(content: string) {
    const nextContent = content.trim();

    if (!nextContent) {
      return;
    }

    pendingRunMessages.push(nextContent);
  }

  function flushPendingRunMessages() {
    if (pendingRunMessages.length === 0) {
      return null;
    }

    const content = pendingRunMessages.join('\n\n---\n\n').trim();
    pendingRunMessages = [];
    return content || null;
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
          thread: runtime.id,
          resource: runtime.id,
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

      const stopRequested = result.text.trimStart().startsWith(NO_ACTION_NEEDED_PREFIX);

      if (result.toolCalls.length === 0 && stopRequested) {
        nextStepAt = null;
        await store.setExecutionState(runtime.id, 'idle');
        await wakeQueue.onRunnerIdle();
        return;
      }

      if (result.toolCalls.length === 0) {
        appendPendingRunMessage(RUN_STOP_REMINDER);
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

export type InternalAgentRunner = ReturnType<typeof createAgentRunner>;
