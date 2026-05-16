import type { LongTermMemoryState } from '../ltm/store';

/**
 * Reads the current LTM state from the persistence store.
 * Delegates directly to the persistence layer.
 */
export async function readLtmState(persistenceStore: {
  readState(): Promise<LongTermMemoryState>;
}) {
    // eslint-disable-next-line @typescript-eslint/return-await
  return persistenceStore.readState();
}

/**
 * Writes LTM state to the persistence store and returns the persisted
 * snapshot fields that callers may need to update their own view of state.
 *
 * Returns the fields that changed as a result of the write, so callers
 * can sync their snapshot without re-reading the full state.
 */
export async function writeLtmState(
  persistenceStore: {
    writeState(state: LongTermMemoryState): Promise<{
      lastRunAt: string | null;
      lastRunError: string | null;
      lastRunErrorAt: string | null;
      lastWrittenPackageId: string | null;
      lastWrittenAt: string | null;
      packages: unknown[];
    }>;
  },
  state: LongTermMemoryState,
) {
    // eslint-disable-next-line @typescript-eslint/return-await
  return persistenceStore.writeState(state);
}

/**
 * Marks the recall index as dirty so the next LTM run will refresh it.
 */
export async function markLtmRecallIndexDirty(
  persistenceStore: { writeRecallIndexStamp(reason: string): Promise<void> },
  reason: string,
) {
  await persistenceStore.writeRecallIndexStamp(reason);
}

/**
 * Schedules a deferred LTM run.
 * Safe to call multiple times — previous scheduled run is cancelled.
 *
 * @param delayMs - Delay before running
 * @param stopped - Whether the agent is stopped (skip if true)
 * @param idle - Whether the agent is idle (skip if false)
 * @param timer - Current timer ref (mutated)
 * @param runFn - The workflow function to call
 */
export function scheduleLtmRun(
  delayMs: number,
  stopped: boolean,
  idle: boolean,
  timer: { current: ReturnType<typeof setTimeout> | null },
  runFn: () => void | Promise<void>,
) {
  if (stopped || !idle) {
    return;
  }

  clearLtmTimer(timer);
  timer.current = setTimeout(() => {
    timer.current = null;
    void runFn();
  }, delayMs);
}

/**
 * Clears any pending scheduled LTM run.
 */
export function clearLtmTimer(
  timer: { current: ReturnType<typeof setTimeout> | null },
) {
  if (!timer.current) {
    return;
  }
  clearTimeout(timer.current);
  timer.current = null;
}

/**
 * Applies state field updates to a snapshot object.
 * Used by writeState after persisting to keep the in-memory snapshot current.
 */
export function applyLtmStateToSnapshot(
  snapshot: {
    lastRunAt?: number;
    lastRunError?: string | null;
    lastRunErrorAt?: number | null;
    lastWrittenPackageId?: string | null;
    lastWrittenAt?: number | null;
    packageCount?: number;
  },
  persistedState: {
    lastRunAt: string | null;
    lastRunError: string | null;
    lastRunErrorAt: string | null;
    lastWrittenPackageId: string | null;
    lastWrittenAt: string | null;
    packages: unknown[];
  },
) {
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  snapshot.lastRunAt = persistedState.lastRunAt
    ? Date.parse(persistedState.lastRunAt)
    : snapshot.lastRunAt;
  snapshot.lastRunError = persistedState.lastRunError;
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  snapshot.lastRunErrorAt = persistedState.lastRunErrorAt
    ? Date.parse(persistedState.lastRunErrorAt)
    : null;
  snapshot.lastWrittenPackageId = persistedState.lastWrittenPackageId;
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  snapshot.lastWrittenAt = persistedState.lastWrittenAt
    ? Date.parse(persistedState.lastWrittenAt)
    : null;
  snapshot.packageCount = persistedState.packages.length;
}