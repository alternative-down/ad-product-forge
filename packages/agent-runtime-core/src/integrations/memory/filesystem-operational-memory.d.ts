import type { StepContextEntry } from '../../core/types.js';
import type { OperationalMemory, OperationalMemoryObservation, OperationalMemoryObserver, OperationalMemoryRawEntry, OperationalMemorySnapshot } from './operational-memory.js';
export type FilesystemOperationalMemoryOptions = {
    basePath: string;
    recentReserveUnits: number;
    maxObservationCount?: number;
    observer: OperationalMemoryObserver;
};
export declare class FilesystemOperationalMemory implements OperationalMemory {
    private readonly basePath;
    private readonly recentReserveUnits;
    private readonly maxObservationCount;
    private readonly observer;
    constructor(options: FilesystemOperationalMemoryOptions);
    append(entry: OperationalMemoryRawEntry): Promise<void>;
    consolidate(): Promise<OperationalMemoryObservation | null>;
    getSnapshot(): Promise<OperationalMemorySnapshot>;
    renderContext(): Promise<StepContextEntry[]>;
    private readState;
    private writeState;
    private getFilePath;
}
