import type { RuntimeSnapshot } from '../../core/types.js';
export interface RuntimeSnapshotStore {
    write(snapshot: RuntimeSnapshot): Promise<void>;
    read(runtimeId: string): Promise<RuntimeSnapshot | null>;
}
