import { createAgentWakeQueue } from '@mastra-engine/core';

import type { InternalAgentRuntime } from './create-forge-agent.js';
import { createAgentContractStore } from './agent-contract-store.js';
import type { Database } from '../database/index.js';

const ONE_MINUTE_MS = 60_000;
const TEN_MINUTES_MS = 10 * ONE_MINUTE_MS;
const RECENT_STEP_LIMIT = 10;
type AgentUsage = {
  inputTokens?: number;
  outputTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  cachedInputTokens?: number;
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
    run: wake,
  });
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let instant = false;
  let executing = false;
  let backoffMs = ONE_MINUTE_MS;

  runtime.onReceiveMessage(wakeQueue.notifyExternalEvent);

  function clearTimer() {
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    timer = null;
  }

  function schedule(delayMs: number) {
    if (stopped || timer) {
      return;
    }

    timer = setTimeout(
      () => {
        timer = null;
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

    await queueNextStep();
  }

  async function wake() {
    if (stopped) {
      return;
    }

    const executionState = await store.getExecutionState(runtime.id);

    if (executionState === 'running') {
      return;
    }

    instant = true;
    backoffMs = ONE_MINUTE_MS;
    await store.setExecutionState(runtime.id, 'running');
    await queueNextStep();
  }

  function stop() {
    stopped = true;
    clearTimer();
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
      timer = setTimeout(
        () => {
          timer = null;
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

      const result = await runtime.agent.generate([], {
        maxSteps: 1,
      });
      const usage = result.usage as AgentUsage;
      const inputTokens = usage.inputTokens ?? usage.promptTokens ?? 0;
      const cachedInputTokens = usage.cachedInputTokens ?? 0;
      const outputTokens = usage.outputTokens ?? usage.completionTokens ?? 0;

      await recordAgentStep(contractId, inputTokens, cachedInputTokens, outputTokens);
      await recordObservationalMemorySteps(contractId, result.steps);

      if (result.toolCalls.length === 0) {
        await store.setExecutionState(runtime.id, 'idle');
        return;
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
    const recentSteps = await store.listRecentSteps(runtime.id, RECENT_STEP_LIMIT);

    if (recentSteps.length === 0) {
      return null;
    }

    const averageStepUsd =
      recentSteps.reduce((total, step) => total + step.costUsd, 0) / recentSteps.length;
    const modelPrice = await store.getModelPrice(runtime.modelKey);
    const lastAgentStep = recentSteps.find((step) => step.kind === 'agent-step');

    if (!modelPrice || !lastAgentStep) {
      return averageStepUsd;
    }

    const inputEstimatedUsd =
      (lastAgentStep.inputTokens / 1_000_000) * modelPrice.inputPerMillionUsd;
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
    const modelPrice = await store.getModelPrice(runtime.modelKey);
    let costUsd = 0;

    if (modelPrice) {
      costUsd =
        (inputTokens / 1_000_000) * modelPrice.inputPerMillionUsd +
        (cachedInputTokens / 1_000_000) * modelPrice.inputCachePerMillionUsd +
        (outputTokens / 1_000_000) * modelPrice.outputPerMillionUsd;
    }

    await store.recordAgentStep({
      agentId: runtime.id,
      contractId,
      modelKey: runtime.modelKey,
      kind: 'agent-step',
      inputTokens,
      cachedInputTokens,
      outputTokens,
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
    const modelPrice = await store.getModelPrice(runtime.omModelKey);
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

      if (modelPrice) {
        costUsd =
          (inputTokens / 1_000_000) * modelPrice.inputPerMillionUsd +
          (outputTokens / 1_000_000) * modelPrice.outputPerMillionUsd;
      }

      await store.recordAgentStep({
        agentId: runtime.id,
        contractId,
        modelKey: runtime.omModelKey,
        kind: 'om',
        inputTokens,
        cachedInputTokens: 0,
        outputTokens,
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
    };
  }

  return {
    start,
    stop,
    wake,
    getSnapshot,
    notifyExternalEvent: wakeQueue.notifyExternalEvent,
  };
}

export type InternalAgentRunner = ReturnType<typeof createAgentRunner>;
