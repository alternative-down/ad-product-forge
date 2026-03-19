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
};

export function createAgentRunner(
  db: Database,
  runtime: InternalAgentRuntime,
) {
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

    timer = setTimeout(() => {
      timer = null;
      void queueNextStep();
    }, Math.max(delayMs, 0));
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
      timer = setTimeout(() => {
        timer = null;
        void executeStep(nextAttempt.contractId);
      }, Math.max(delayMs, 0));
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
      const outputTokens = usage.outputTokens ?? usage.completionTokens ?? 0;

      await recordStep(contractId, inputTokens, outputTokens);

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
      delayMs: instant ? 0 : calculateDelayMs(contract.endsAt, remainingBudgetUsd, estimatedStepUsd),
    };
  }

  async function estimateStepCostUsd() {
    const recentSteps = await store.listRecentSteps(runtime.id, RECENT_STEP_LIMIT);

    if (recentSteps.length === 0) {
      return null;
    }

    const averageStepUsd = recentSteps.reduce((total, step) => total + step.costUsd, 0) / recentSteps.length;
    const modelPrice = await store.getModelPrice(runtime.modelKey);
    const lastStep = recentSteps[0];

    if (!modelPrice || !lastStep) {
      return averageStepUsd;
    }

    const inputEstimatedUsd = (lastStep.inputTokens / 1_000_000) * modelPrice.inputPerMillionUsd;
    return (inputEstimatedUsd + averageStepUsd) / 2;
  }

  function calculateDelayMs(endsAt: number, remainingBudgetUsd: number, estimatedStepUsd: number | null) {
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

  async function recordStep(contractId: string, inputTokens: number, outputTokens: number) {
    const modelPrice = await store.getModelPrice(runtime.modelKey);
    const cachedInputTokens = 0;
    let costUsd = 0;

    if (modelPrice) {
      costUsd =
        (inputTokens / 1_000_000) * modelPrice.inputPerMillionUsd +
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

  return {
    start,
    stop,
    wake,
    notifyExternalEvent: wakeQueue.notifyExternalEvent,
  };
}

export type InternalAgentRunner = ReturnType<typeof createAgentRunner>;
