import type { RuntimeSnapshot } from '../../core/types.js';
import type { RuntimeSnapshotStore } from './runtime-snapshot-store.js';
export type FilesystemRuntimeSnapshotStoreOptions = {
    basePath: string;
};
export declare class FilesystemRuntimeSnapshotStore implements RuntimeSnapshotStore {
    private readonly basePath;
    constructor(options: FilesystemRuntimeSnapshotStoreOptions);
    write(snapshot: RuntimeSnapshot): Promise<void>;
    read(runtimeId: string): Promise<RuntimeSnapshot | null>;
    private getFilePath;
}
