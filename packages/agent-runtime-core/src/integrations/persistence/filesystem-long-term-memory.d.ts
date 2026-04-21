import type { LongTermMemoryDocument, LongTermMemoryStore } from '../memory/long-term-memory.js';
export type FilesystemLongTermMemoryStoreOptions = {
    basePath: string;
};
export declare class FilesystemLongTermMemoryStore implements LongTermMemoryStore {
    private readonly basePath;
    constructor(options: FilesystemLongTermMemoryStoreOptions);
    write(document: LongTermMemoryDocument): Promise<void>;
    remove(documentId: string): Promise<void>;
    list(): Promise<LongTermMemoryDocument[]>;
    private getFilePath;
}
