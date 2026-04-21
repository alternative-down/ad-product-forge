import type { BlobRecord, BlobStore } from '../assets/blob-store.js';
export type FilesystemBlobStoreOptions = {
    basePath: string;
};
export declare class FilesystemBlobStore implements BlobStore {
    private readonly basePath;
    constructor(options: FilesystemBlobStoreOptions);
    write(record: BlobRecord): Promise<void>;
    read(blobId: string): Promise<BlobRecord | null>;
    list(): Promise<BlobRecord[]>;
    private getFilePath;
}
