import type { ComputeUsageRecord, UsageMeter } from './contracts.js';

export class InMemoryUsageMeter implements UsageMeter {
  private readonly records = new Map<string, ComputeUsageRecord[]>();

  async record(record: ComputeUsageRecord): Promise<void> {
    const runtimeRecords = this.records.get(record.runtimeId) ?? [];
    runtimeRecords.push(record);
    this.records.set(record.runtimeId, runtimeRecords);
  }

  async list(runtimeId: string): Promise<ComputeUsageRecord[]> {
    return [...(this.records.get(runtimeId) ?? [])];
  }
}
