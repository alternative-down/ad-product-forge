import type { RuntimeInput, StepRecord } from '../../core/types.js';
import type { RuntimeJournal, RuntimeJournalSnapshot } from './contracts.js';
export declare class InMemoryRuntimeJournal implements RuntimeJournal {
    private readonly state;
    appendInput(runtimeId: string, input: RuntimeInput): Promise<void>;
    appendStep(runtimeId: string, step: StepRecord): Promise<void>;
    readSnapshot(runtimeId: string): Promise<RuntimeJournalSnapshot>;
    private getOrCreateState;
}
