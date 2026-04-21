import type { RuntimeObserver } from '../../core/observers.js';
import type { RuntimeSnapshotStore } from '../persistence/runtime-snapshot-store.js';

export type RuntimeSnapshotObserverOptions = {
  name?: string;
  store: RuntimeSnapshotStore;
};

export function createRuntimeSnapshotObserver(
  options: RuntimeSnapshotObserverOptions,
): RuntimeObserver {
  return {
    name: options.name ?? 'runtime-snapshot-observer',
    async onAfterStep(context) {
      await options.store.write(context.snapshot);
    },
  };
}
