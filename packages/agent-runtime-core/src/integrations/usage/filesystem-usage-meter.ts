import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

import type { ComputeUsageRecord, UsageMeter } from './contracts.js';

export type FilesystemUsageMeterOptions = {
  basePath: string;
};

const usageRecordSchema = z.object({
  runtimeId: z.string().min(1),
  stepId: z.string().optional(),
  provider: z.string().optional(),
  modelId: z.string().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  cachedInputTokens: z.number().optional(),
  costUsd: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  recordedAt: z.string().min(1),
});

export class FilesystemUsageMeter implements UsageMeter {
  private readonly basePath: string;

  constructor(options: FilesystemUsageMeterOptions) {
    this.basePath = options.basePath;
  }

  async record(record: ComputeUsageRecord): Promise<void> {
    const records = await this.readRecords(record.runtimeId);
    records.push(usageRecordSchema.parse(record));
    await this.writeRecords(record.runtimeId, records);
  }

  async list(runtimeId: string): Promise<ComputeUsageRecord[]> {
    return this.readRecords(runtimeId);
  }

  private async readRecords(runtimeId: string): Promise<ComputeUsageRecord[]> {
    try {
      const raw = await readFile(this.getFilePath(runtimeId), 'utf8');
      return z.array(usageRecordSchema).parse(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  private async writeRecords(runtimeId: string, records: ComputeUsageRecord[]) {
    await mkdir(this.basePath, { recursive: true });
    await writeFile(this.getFilePath(runtimeId), JSON.stringify(records, null, 2), 'utf8');
  }

  private getFilePath(runtimeId: string) {
    return join(this.basePath, `${runtimeId}.usage.json`);
  }
}
