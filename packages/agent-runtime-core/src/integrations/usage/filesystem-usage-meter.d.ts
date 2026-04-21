import type { ComputeUsageRecord, UsageMeter } from './contracts.js';
export type FilesystemUsageMeterOptions = {
    basePath: string;
};
export declare class FilesystemUsageMeter implements UsageMeter {
    private readonly basePath;
    constructor(options: FilesystemUsageMeterOptions);
    record(record: ComputeUsageRecord): Promise<void>;
    list(runtimeId: string): Promise<ComputeUsageRecord[]>;
    private readRecords;
    private writeRecords;
    private getFilePath;
}
