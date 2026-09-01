import type { RuntimeObserver } from 'agent-runtime-core/integrations';

export type ForgeStepModelUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
};

export type ForgeStepUsageRecord = {
  runtimeId: string;
  stepId: string;
  stepNumber: number;
  startedAt: string;
  finishedAt: string;
  usage: ForgeStepModelUsage | null;
  modelMetadata: {
    provider?: string;
    modelId?: string;
  } | null;
};

export interface ForgeUsageSink {
  // eslint-disable-next-line @typescript-eslint/require-await
  recordStepUsage(record: ForgeStepUsageRecord): Promise<void>;
}

export class InMemoryForgeUsageSink implements ForgeUsageSink {
  private readonly records: ForgeStepUsageRecord[] = [];

  // eslint-disable-next-line @typescript-eslint/require-await
  async recordStepUsage(record: ForgeStepUsageRecord): Promise<void> {
    this.records.push(record);
  }

  list() {
    return [...this.records];
  }
}

export function createForgeUsageObserver(sink: ForgeUsageSink): RuntimeObserver {
  return {
    name: 'forge-usage-observer',
    async onAfterStep(context) {
      await sink.recordStepUsage({
        runtimeId: context.snapshot.runtimeId,
        stepId: context.record.id,
        stepNumber: context.record.stepNumber,
        startedAt: context.record.startedAt,
        finishedAt: context.record.finishedAt,
        usage: context.record.modelUsage,
        modelMetadata: context.record.modelMetadata,
      });
    },
  };
}
