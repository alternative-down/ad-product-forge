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

type OmObservationEndPart = {
  type: 'data-om-observation-end';
  data?: {
    tokensObserved?: number;
    observationTokens?: number;
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
      costUsd =
        ((inputTokens / 1_000_000) * pricing.modelPrice.inputPerMillionUsd +
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
    contractId: string,
    steps: Array<{
      response?: {
        uiMessages?: Array<{
          parts?: Array<unknown>;
        }>;
      };
    }>,
  ) {
    if (!input.runtime.omModelProfileId) {
      throw new Error(`Agent runtime is missing OM model profile: ${input.runtime.id}`);
    }

    const pricing = await input.store.getUsagePricing({
      pricingModelKey: input.runtime.omPricingModelKey,
      profileId: input.runtime.omModelProfileId,
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

      await input.store.recordAgentStep({
        agentId: input.runtime.id,
        contractId,
        llmProfileId: input.runtime.omModelProfileId,
        modelKey: input.runtime.omPricingModelKey,
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

  function getUsageFromResult(result: { usage?: unknown }) {
    const usage = result.usage as AgentUsage;
    const inputTokens =
      usage.inputTokenDetails?.noCacheTokens ?? usage.inputTokens ?? usage.promptTokens ?? 0;
    const cachedInputTokens =
      usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens ?? 0;
    const outputTokens = usage.outputTokens ?? usage.completionTokens ?? 0;

    return {
      inputTokens,
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

function isOmObservationEndPart(part: unknown): part is OmObservationEndPart {
  if (!part || typeof part !== 'object') {
    return false;
  }

  return 'type' in part && part.type === 'data-om-observation-end';
}
