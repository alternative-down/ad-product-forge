import type { RuntimePlugin } from '../../core/plugins.js';
import type { UsageMeter } from '../usage/contracts.js';

export type UsageMeterPluginOptions = {
  name?: string;
  meter: UsageMeter;
};

export function createUsageMeterPlugin(options: UsageMeterPluginOptions): RuntimePlugin {
  return {
    name: options.name ?? 'usage-meter',
    async onAfterStep(context) {
      const usage = context.record.modelUsage;

      if (!usage) {
        return;
      }

      await options.meter.record({
        runtimeId: context.runtimeId,
        stepId: context.record.id,
        provider: context.record.modelMetadata?.provider,
        modelId: context.record.modelMetadata?.modelId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        recordedAt: context.record.finishedAt,
      });
    },
  };
}
