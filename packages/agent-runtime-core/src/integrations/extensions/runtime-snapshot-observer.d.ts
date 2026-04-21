import type { RuntimeObserver } from '../../core/observers.js';
import type { RuntimeSnapshotStore } from '../persistence/runtime-snapshot-store.js';
export type RuntimeSnapshotObserverOptions = {
    name?: string;
    store: RuntimeSnapshotStore;
};
export declare function createRuntimeSnapshotObserver(options: RuntimeSnapshotObserverOptions): RuntimeObserver;
