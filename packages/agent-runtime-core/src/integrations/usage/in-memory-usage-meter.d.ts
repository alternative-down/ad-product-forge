import type { ComputeUsageRecord, UsageMeter } from './contracts.js';
export declare class InMemoryUsageMeter implements UsageMeter {
    private readonly records;
    record(record: ComputeUsageRecord): Promise<void>;
    list(runtimeId: string): Promise<ComputeUsageRecord[]>;
}
