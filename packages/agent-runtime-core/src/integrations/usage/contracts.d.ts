export type ComputeUsageRecord = {
    runtimeId: string;
    stepId?: string;
    provider?: string;
    modelId?: string;
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    costUsd?: number;
    metadata?: Record<string, unknown>;
    recordedAt: string;
};
export interface UsageMeter {
    record(record: ComputeUsageRecord): Promise<void>;
    list(runtimeId: string): Promise<ComputeUsageRecord[]>;
}
