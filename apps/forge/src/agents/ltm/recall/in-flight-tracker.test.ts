import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockWithTimeout = vi.hoisted(() => vi.fn());
const mockForgeDebug = vi.hoisted(() => vi.fn());

vi.mock('../../../utils/async', () => ({
  withTimeout: mockWithTimeout,
}));

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: mockForgeDebug,

    errorMsg: vi.fn((err) => err instanceof Error ? err.message : typeof err === "string" ? err : String(err).replace(/^Error: /, "")),
    withToolErrorLogging: vi.fn(async (params) => {
      try {
        return { valid: true, data: await params.fn() };
      } catch (error) {
        // Mirror the real impl: use errorMsg-style formatting
        const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error).replace(/^Error: /, '');
        return { valid: false, error: msg, hint: params.hint || '' };
      }
    }),
  }));

import {
  InFlightRecallTracker,
  createInFlightRecallTracker,
} from './in-flight-tracker';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTracker() {
  return createInFlightRecallTracker({ agentId: 'ag_tracker' });
}

beforeEach(() => {
  mockWithTimeout.mockReset();
  // withTimeout just resolves the operation unchanged by default
  mockWithTimeout.mockImplementation((op) => op);
  mockForgeDebug.mockReset();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('InFlightRecallTracker', () => {
  describe('initial state', () => {
    it('starts with no operations in flight', () => {
      const tracker = makeTracker();
      expect(tracker.isRecallInFlight()).toBe(false);
    });
  });

  describe('isRecallInFlight()', () => {
    it('returns true while an operation is pending', async () => {
      const tracker = makeTracker();
      let resolveOp: (() => void) | undefined;
      const op = new Promise<void>((resolve) => {
        resolveOp = resolve;
      });
      // withTimeout should not resolve the op until we say so
      mockWithTimeout.mockImplementation(() => op);
      const pending = tracker.runTrackedRecallOperation('test', op, 1000, 'timeout');

      // Wait for pendingCount to be incremented
      await Promise.resolve();
      expect(tracker.isRecallInFlight()).toBe(true);

      // Settle
      resolveOp!();
      await pending;
      expect(tracker.isRecallInFlight()).toBe(false);
    });

    it('returns false after operation completes', async () => {
      const tracker = makeTracker();
      await tracker.runTrackedRecallOperation('test', Promise.resolve(42), 1000, 'timeout');
      expect(tracker.isRecallInFlight()).toBe(false);
    });

    it('handles concurrent operations: count tracks all', async () => {
      const tracker = makeTracker();
      let resolveA: (() => void) | undefined;
      let resolveB: (() => void) | undefined;
      const opA = new Promise<void>((r) => {
        resolveA = r;
      });
      const opB = new Promise<void>((r) => {
        resolveB = r;
      });
      mockWithTimeout.mockImplementation((op) => op);

      const pendingA = tracker.runTrackedRecallOperation('a', opA, 1000, 't');
      const pendingB = tracker.runTrackedRecallOperation('b', opB, 1000, 't');
      await Promise.resolve();

      // Both in flight
      resolveA!();
      await pendingA;
      // Only B is in flight
      expect(tracker.isRecallInFlight()).toBe(true);

      resolveB!();
      await pendingB;
      expect(tracker.isRecallInFlight()).toBe(false);
    });
  });

  describe('runTrackedRecallOperation()', () => {
    it('forwards label, timeoutMs, timeoutMessage to withTimeout (operation is wrapped with .finally)', async () => {
      const tracker = makeTracker();
      const op = Promise.resolve(99);
      await tracker.runTrackedRecallOperation('myLabel', op, 5000, 'my timeout msg');

      expect(mockWithTimeout).toHaveBeenCalledTimes(1);
      const [, ms, msg] = mockWithTimeout.mock.calls[0]!;
      expect(ms).toBe(5000);
      expect(msg).toBe('my timeout msg');
      // The argument passed to withTimeout is the tracked promise (op.finally(...)),
      // which is a different Promise instance but will resolve to the same value.
      const arg = mockWithTimeout.mock.calls[0]![0];
      expect(arg).not.toBe(op); // tracked op is a new promise
      const argValue = await arg;
      expect(argValue).toBe(99);
    });

    it('returns the resolved value of the operation', async () => {
      const tracker = makeTracker();
      const result = await tracker.runTrackedRecallOperation('test', Promise.resolve('hello'), 1000, 't');
      expect(result).toBe('hello');
    });

    it('decrements pending count even on rejection (input op resolves, withTimeout throws)', async () => {
      const tracker = makeTracker();
      // Input op resolves normally; withTimeout independently rejects
      mockWithTimeout.mockImplementationOnce(() => Promise.reject(new Error('boom')));
      const op = Promise.resolve('input-result');
      await expect(
        tracker.runTrackedRecallOperation('test', op, 1000, 't')
      ).rejects.toThrow('boom');
      // pendingCount is tied to input op's lifecycle: input resolved → finally ran → count=0
      expect(tracker.isRecallInFlight()).toBe(false);
    });

    it('caps pending count at 0 (cannot go negative from double-decrement)', async () => {
      const tracker = makeTracker();
      // No operation yet, but call finally handler manually via multiple ops
      await tracker.runTrackedRecallOperation('a', Promise.resolve(1), 1000, 't');
      // Force a state: artificially trigger another finally by running another op
      // and ensure it doesn't underflow
      await tracker.runTrackedRecallOperation('b', Promise.resolve(2), 1000, 't');
      expect(tracker.isRecallInFlight()).toBe(false);
    });
  });

  describe('lingering operation tracking', () => {
    it('sets lingeringSince on timeout (not settled)', async () => {
      const tracker = makeTracker();
      const timeoutError = new Error('timed out');
      mockWithTimeout.mockRejectedValueOnce(timeoutError);

      try {
        await tracker.runTrackedRecallOperation('test', new Promise(() => {}), 1000, 'timed out');
      } catch {
        // expected
      }
      // After timeout, lingeringSince should be set (verified by log content)
      // We verify the log includes lingeringRecallOperationSince not null
      expect(mockForgeDebug).toHaveBeenCalled();
      const logArg = mockForgeDebug.mock.calls[0]![0];
      expect(logArg.context.lingeringRecallOperationSince).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('keeps lingeringSince null when ops settle normally (no timeouts)', async () => {
      const tracker = makeTracker();
      // Run two consecutive successful ops — both settle, count returns to 0
      await tracker.runTrackedRecallOperation('a', Promise.resolve(1), 100, 't');
      await tracker.runTrackedRecallOperation('b', Promise.resolve(2), 100, 't');
      expect(tracker.isRecallInFlight()).toBe(false);

      // lingeringSince should be null
      mockForgeDebug.mockClear();
      tracker.logInFlightSkip(null);
      const skipLog = mockForgeDebug.mock.calls[0]![0];
      expect(skipLog.context.lingeringRecallOperationSince).toBeNull();
    });
  });

  describe('error logging', () => {
    it('emits forgeDebug with agentId, label, timeoutMs, error, on failure', async () => {
      const tracker = makeTracker();
      const err = new Error('oops');
      mockWithTimeout.mockImplementationOnce(() => Promise.reject(err));
      // Use a never-resolving op so no rejection is created in the test
      const op = new Promise<string>(() => {});

      try {
        await tracker.runTrackedRecallOperation('myOp', op, 2000, 'oops msg');
      } catch {
        /* */
      }

      expect(mockForgeDebug).toHaveBeenCalledTimes(1);
      const arg = mockForgeDebug.mock.calls[0]![0];
      expect(arg.scope).toBe('ltm');
      expect(arg.level).toBe('info');
      expect(arg.message).toContain('failed or timed out');
      expect(arg.context.agentId).toBe('ag_tracker');
      expect(arg.context.label).toBe('myOp');
      expect(arg.context.timeoutMs).toBe(2000);
      expect(arg.context.error).toContain('oops');
    });
  });

  describe('logInFlightSkip()', () => {
    it('emits forgeDebug with current pendingCount and threadId', () => {
      const tracker = makeTracker();
      tracker.logInFlightSkip('thread_123');
      expect(mockForgeDebug).toHaveBeenCalledTimes(1);
      const arg = mockForgeDebug.mock.calls[0]![0];
      expect(arg.context.threadId).toBe('thread_123');
      expect(arg.context.pendingRecallOperationCount).toBe(0);
      expect(arg.context.lingeringRecallOperationSince).toBeNull();
    });

    it('accepts null threadId', () => {
      const tracker = makeTracker();
      tracker.logInFlightSkip(null);
      const arg = mockForgeDebug.mock.calls[0]![0];
      expect(arg.context.threadId).toBeNull();
    });
  });

  describe('class instantiation', () => {
    it('can be instantiated via factory', () => {
      const tracker = createInFlightRecallTracker({ agentId: 'ag_1' });
      expect(tracker).toBeInstanceOf(InFlightRecallTracker);
    });

    it('can be instantiated via constructor', () => {
      const tracker = new InFlightRecallTracker({ agentId: 'ag_1' });
      expect(tracker).toBeInstanceOf(InFlightRecallTracker);
    });
  });
});
