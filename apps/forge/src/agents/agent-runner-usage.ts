import type { InternalAgentRuntime } from './runtime/types';
import { createAgentContractStore } from './agent-contract-store';
import { forgeDebug } from '@forge-runtime/core';
import { AgentRunnerMissingPrimaryModelProfileError } from './agent-runner-usage.errors';

const RECENT_STEP_LIMIT = 10;

export type AgentRunnerUsage = {
  recordAgentStep: (
    contractId: string,
    inputTokens: number,
    cachedInputTokens: number,
    outputTokens: number,
  ) => Promise<{ stepId: string; createdAt: number }>;
  recordRefund: (input: { contractId: string; refundedUsd: number }) => Promise<void>;
  estimateStepCostUsd: () => Promise<number | null>;
  recordObservationalMemorySteps: (
    contractId: string,
    steps: Array<{
      response?: {
        uiMessages?: Array<{
          parts?: Array<unknown>;
        }>;
      };
    }>,
  ) => void;
  getUsageFromResult: (result: { usage?: unknown }) => {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
  };
  getPeriodUsage: (input: {
    agentId: string;
    periodStartMs: number;
    periodEndMs: number;
  }) => { totalCostUsd: number; stepCount: number };
};

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

export function createAgentRunnerUsage(input: {
  store: ReturnType<typeof createAgentContractStore>;
  runtime: InternalAgentRuntime;
}) {
  async function estimateStepCostUsd() {
    if (input.runtime.modelProfileId === null || input.runtime.modelProfileId === undefined) {
      forgeDebug({
        scope: 'agent-runner-usage',
        level: 'error',
        message: 'agent-runner-usage: validation/requirement failed',
      });
      throw new AgentRunnerMissingPrimaryModelProfileError(input.runtime.id);
    }

    const recentSteps = await input.store.listRecentSteps(input.runtime.id, RECENT_STEP_LIMIT);

    if (recentSteps.length === 0) {
      return null;
    }

    const pricing = await input.store.getUsagePricing({
      pricingModelKey: input.runtime.pricingModelKey,
      profileId: input.runtime.modelProfileId,
    });

    if (pricing.modelPrice === null || pricing.modelPrice === undefined) {
      return (
        recentSteps.reduce(
          (
            total: number,
            step: {
              inputTokens: number;
              cachedInputTokens: number;
              outputTokens: number;
              costUsd: number;
            },
          ) => total + step.costUsd,
          0,
        ) / recentSteps.length
      );
    }

    const averageInputTokens =
      recentSteps.reduce(
        (
          total: number,
          step: {
            inputTokens: number;
            cachedInputTokens: number;
            outputTokens: number;
            costUsd: number;
          },
        ) => total + step.inputTokens,
        0,
      ) / recentSteps.length;
    const averageCachedInputTokens =
      recentSteps.reduce(
        (
          total: number,
          step: {
            inputTokens: number;
            cachedInputTokens: number;
            outputTokens: number;
            costUsd: number;
          },
        ) => total + step.cachedInputTokens,
        0,
      ) / recentSteps.length;
    const averageOutputTokens =
      recentSteps.reduce(
        (
          total: number,
          step: {
            inputTokens: number;
            cachedInputTokens: number;
            outputTokens: number;
            costUsd: number;
          },
        ) => total + step.outputTokens,
        0,
      ) / recentSteps.length;
    const averageUncachedInputTokens = Math.max(averageInputTokens - averageCachedInputTokens, 0);

    return (
      ((averageUncachedInputTokens / 1_000_000) * pricing.modelPrice.inputPerMillionUsd +
        (averageCachedInputTokens / 1_000_000) * pricing.modelPrice.inputCachePerMillionUsd +
        (averageOutputTokens / 1_000_000) * pricing.modelPrice.outputPerMillionUsd) *
      pricing.contractCostMultiplier
    );
  }

  async function recordAgentStep(
    contractId: string,
    inputTokens: number,
    cachedInputTokens: number,
    outputTokens: number,
  ) {
    if (input.runtime.modelProfileId === null || input.runtime.modelProfileId === undefined) {
      forgeDebug({
        scope: 'agent-runner-usage',
        level: 'error',
        message: 'agent-runner-usage: validation/requirement failed',
      });
      throw new AgentRunnerMissingPrimaryModelProfileError(input.runtime.id);
    }

    const pricing = await input.store.getUsagePricing({
      pricingModelKey: input.runtime.pricingModelKey,
      profileId: input.runtime.modelProfileId,
    });
    let costUsd = 0;

    if (pricing.modelPrice !== null && pricing.modelPrice !== undefined) {
      const uncachedInputTokens = Math.max(inputTokens - cachedInputTokens, 0);
      costUsd =
        ((uncachedInputTokens / 1_000_000) * pricing.modelPrice.inputPerMillionUsd +
          (cachedInputTokens / 1_000_000) * pricing.modelPrice.inputCachePerMillionUsd +
          (outputTokens / 1_000_000) * pricing.modelPrice.outputPerMillionUsd) *
        pricing.contractCostMultiplier;
    }

    return await input.store.recordAgentStep({
      agentId: input.runtime.id,
      contractId,
      llmProfileId: input.runtime.modelProfileId,
      modelKey: input.runtime.pricingModelKey,
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

  function recordObservationalMemorySteps(
    _contractId: string,
    steps: Array<{
      response?: {
        uiMessages?: Array<{
          parts?: Array<unknown>;
        }>;
      };
    }>,
  ) {
    void steps;
  }

  function getUsageFromResult(result: { usage?: unknown }) {
    const usage = result.usage as AgentUsage;
    const cachedInputTokens =
      usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens ?? 0;
    const promptTokens = usage.inputTokens ?? usage.promptTokens ?? 0;
    const outputTokens = usage.outputTokens ?? usage.completionTokens ?? 0;

    return {
      inputTokens: promptTokens,
      outputTokens,
      cachedInputTokens,
    };
  }

  return {
    estimateStepCostUsd,
    recordAgentStep,
    recordObservationalMemorySteps,
    getUsageFromResult,
    recordRefund: async (_input: { contractId: string; refundedUsd: number }) => {
      // stub
    },
    getPeriodUsage: (_input: { agentId: string; periodStartMs: number; periodEndMs: number }) => {
      // stub
      return { totalCostUsd: 0, stepCount: 0 };
    },
  };
}
