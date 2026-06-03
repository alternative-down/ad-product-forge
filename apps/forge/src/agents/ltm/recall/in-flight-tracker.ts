import { forgeDebug } from '@forge-runtime/core';

import { errorMsg } from '../../error-formatting';
import { withTimeout } from '../../../utils/async';

/**
 * InFlightRecallTracker
 *
 * Encapsulates the in-flight recall operation state and timeout tracking.
 * Extracted from `recall.ts` (#5352) to reduce the 803-LoC class to a thin facade.
 *
 * Concerns:
 *  - Track count of pending recall operations (concurrency guard)
 *  - Track when a "lingering" operation started (timeout recovery)
 *  - Wrap a promise with timeout + error logging
 */
export interface InFlightRecallTrackerDeps {
  agentId: string;
}

export class InFlightRecallTracker {
  private pendingCount = 0;
  private lingeringSince: number | null = null;

  constructor(private readonly deps: InFlightRecallTrackerDeps) {}

  /**
   * Whether a recall operation is currently in flight.
   * Used by `recallFromStep` to short-circuit overlapping requests.
   */
  isRecallInFlight(): boolean {
    return this.pendingCount > 0;
  }

  /**
   * Emit a debug log when a recall is skipped because another is in flight.
   */
  logInFlightSkip(threadId: string | null): void {
    forgeDebug({
      scope: 'ltm',
      level: 'info',
      message: 'ltm recall skipped because a prior recall operation is still in flight',
      context: {
        agentId: this.deps.agentId,
        threadId,
        pendingRecallOperationCount: this.pendingCount,
        lingeringRecallOperationSince: this.formatLingering(),
      },
    });
  }

  /**
   * Wrap an operation with timeout + in-flight tracking.
   * Increments `pendingCount` on entry, decrements on settlement.
   * On timeout/error, sets `lingeringSince` so the next skip log can report it.
   */
  async runTrackedRecallOperation<T>(
    label: string,
    operation: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> {
    this.pendingCount += 1;
    let settled = false;
    const trackedOperation = operation.finally(() => {
      settled = true;
      this.pendingCount = Math.max(0, this.pendingCount - 1);

      if (this.pendingCount === 0) {
        this.lingeringSince = null;
      }
    });

    try {
      return await withTimeout(trackedOperation, timeoutMs, timeoutMessage);
    } catch (error) {
      if (!settled && this.lingeringSince === null) {
        this.lingeringSince = Date.now();
      }

      forgeDebug({
        scope: 'ltm',
        level: 'info',
        message: 'ltm recall operation failed or timed out',
        context: {
          agentId: this.deps.agentId,
          label,
          timeoutMs,
          settled,
          pendingRecallOperationCount: this.pendingCount,
          lingeringRecallOperationSince: this.formatLingering(),
          error: errorMsg(error),
        },
      });
      throw error;
    }
  }

  private formatLingering(): string | null {
    return this.lingeringSince !== null ? new Date(this.lingeringSince).toISOString() : null;
  }
}

export function createInFlightRecallTracker(deps: InFlightRecallTrackerDeps) {
  return new InFlightRecallTracker(deps);
}
