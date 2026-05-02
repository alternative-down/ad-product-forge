import type { InternalAgentRuntime } from './runtime/types';
import { createAgentContractStore } from './agent-contract-store';

const RECENT_STEP_LIMIT = 10;

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
    if (!input.runtime.modelProfileId) {
      throw new Error(`Agent runtime is missing primary model profile: ${input.runtime.id}`);
    }

    const recentSteps = await input.store.listRecentSteps(input.runtime.id, RECENT_STEP_LIMIT);

    if (recentSteps.length === 0) {
      return null;
    }

    const pricing = await input.store.getUsagePricing({
      pricingModelKey: input.runtime.pricingModelKey,
      profileId: input.runtime.modelProfileId,
    });

    if (!pricing.modelPrice) {
      return recentSteps.reduce((total, step) => total + step.costUsd, 0) / recentSteps.length;
    }

    const averageInputTokens =
      recentSteps.reduce((total, step) => total + step.inputTokens, 0) / recentSteps.length;
    const averageCachedInputTokens =
      recentSteps.reduce((total, step) => total + step.cachedInputTokens, 0) / recentSteps.length;
    const averageOutputTokens =
      recentSteps.reduce((total, step) => total + step.outputTokens, 0) / recentSteps.length;
    const averageUncachedInputTokens = Math.max(averageInputTokens - averageCachedInputTokens, 0);

    return (
      ((averageUncachedInputTokens / 1_000_000) * pricing.modelPrice.inputPerMillionUsd
        + (averageCachedInputTokens / 1_000_000) * pricing.modelPrice.inputCachePerMillionUsd
        + (averageOutputTokens / 1_000_000) * pricing.modelPrice.outputPerMillionUsd)
      * pricing.contractCostMultiplier
    );
  }

  async function recordAgentStep(
    contractId: string,
    inputTokens: number,
    cachedInputTokens: number,
    outputTokens: number,
  ) {
    if (!input.runtime.modelProfileId) {
      throw new Error(`Agent runtime is missing primary model profile: ${input.runtime.id}`);
    }

    const pricing = await input.store.getUsagePricing({
      pricingModelKey: input.runtime.pricingModelKey,
      profileId: input.runtime.modelProfileId,
    });
    let costUsd = 0;

    if (pricing.modelPrice) {
      const uncachedInputTokens = Math.max(inputTokens - cachedInputTokens, 0);
      costUsd =
        ((uncachedInputTokens / 1_000_000) * pricing.modelPrice.inputPerMillionUsd +
          (cachedInputTokens / 1_000_000) * pricing.modelPrice.inputCachePerMillionUsd +
          (outputTokens / 1_000_000) * pricing.modelPrice.outputPerMillionUsd) *
        pricing.contractCostMultiplier;
    }

    return input.store.recordAgentStep({
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

  async function recordObservationalMemorySteps(
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
      cachedInputTokens,
      outputTokens,
    };
  }

  return {
    estimateStepCostUsd,
    recordAgentStep,
    recordObservationalMemorySteps,
    getUsageFromResult,
  };
}
