import type { BlobRecord, BlobStore } from './blob-store.js';
export declare class InMemoryBlobStore implements BlobStore {
    private readonly records;
    write(record: BlobRecord): Promise<void>;
    read(blobId: string): Promise<BlobRecord | null>;
    list(): Promise<BlobRecord[]>;
}
