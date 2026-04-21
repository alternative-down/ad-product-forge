import type { RuntimeInput, StepRecord } from '../../core/types.js';
import type { RuntimeJournal, RuntimeJournalSnapshot } from '../journal/contracts.js';
export type FilesystemRuntimeJournalOptions = {
    basePath: string;
};
export declare class FilesystemRuntimeJournal implements RuntimeJournal {
    private readonly basePath;
    constructor(options: FilesystemRuntimeJournalOptions);
    appendInput(runtimeId: string, input: RuntimeInput): Promise<void>;
    appendStep(runtimeId: string, step: StepRecord): Promise<void>;
    readSnapshot(runtimeId: string): Promise<RuntimeJournalSnapshot>;
    private readOrCreateSnapshot;
    private writeSnapshot;
    private getFilePath;
}
