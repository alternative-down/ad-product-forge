import type { StepContextEntry } from '../../core/types.js';
import type { OperationalMemory, OperationalMemoryObservation, OperationalMemoryObserver, OperationalMemoryRawEntry, OperationalMemorySnapshot } from './operational-memory.js';
export type InMemoryOperationalMemoryOptions = {
    recentReserveUnits: number;
    maxObservationCount?: number;
    observer: OperationalMemoryObserver;
};
export declare class InMemoryOperationalMemory implements OperationalMemory {
    private readonly recentReserveUnits;
    private readonly maxObservationCount;
    private readonly observer;
    private readonly rawEntries;
    private readonly observations;
    constructor(options: InMemoryOperationalMemoryOptions);
    append(entry: OperationalMemoryRawEntry): Promise<void>;
    consolidate(): Promise<OperationalMemoryObservation | null>;
    getSnapshot(): Promise<OperationalMemorySnapshot>;
    renderContext(): Promise<StepContextEntry[]>;
}
