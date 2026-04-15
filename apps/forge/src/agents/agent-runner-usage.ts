import type { InternalAgentRuntime } from './agent-runtime-types';
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

    const averageStepUsd =
      recentSteps.reduce((total, step) => total + step.costUsd, 0) / recentSteps.length;
    const pricing = await input.store.getUsagePricing({
      pricingModelKey: input.runtime.pricingModelKey,
      profileId: input.runtime.modelProfileId,
    });
    const lastStep = recentSteps[0];

    if (!pricing.modelPrice || !lastStep) {
      return averageStepUsd;
    }

    const inputEstimatedUsd =
      (Math.max(lastStep.inputTokens - lastStep.cachedInputTokens, 0) / 1_000_000) *
      pricing.modelPrice.inputPerMillionUsd *
      pricing.contractCostMultiplier;
    return (inputEstimatedUsd + averageStepUsd) / 2;
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

    await input.store.recordAgentStep({
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
