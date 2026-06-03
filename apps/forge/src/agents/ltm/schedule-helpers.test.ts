import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  readLtmState,
  writeLtmState,
  markLtmRecallIndexDirty,
  scheduleLtmRun,
  clearLtmTimer,
  applyLtmStateToSnapshot,
} from './schedule-helpers';

describe('readLtmState', () => {
  it('delegates to persistenceStore.readState', async () => {
    const mockState = {
      lastRunAt: null,
      lastRunError: null,
      lastRunErrorAt: null,
      lastWrittenPackageId: null,
      lastWrittenAt: null,
      packages: [],
      updatedAt: Date.now(),
    };
    const mockStore = { readState: vi.fn().mockResolvedValue(mockState) };

    const result = await readLtmState(mockStore);

    expect(mockStore.readState).toHaveBeenCalledTimes(1);
    expect(result).toBe(mockState);
  });
});

describe('writeLtmState', () => {
  it('returns persisted state fields from store', async () => {
    const persistedResult = {
      lastRunAt: '2025-01-01T00:00:00.000Z',
      lastRunError: null,
      lastRunErrorAt: null,
      lastWrittenPackageId: 'pkg-123',
      lastWrittenAt: '2025-01-02T00:00:00.000Z',
      packages: [],
    };
    const mockStore = { writeState: vi.fn().mockResolvedValue(persistedResult) };
    const state = {
      lastRunAt: null,
      lastRunError: null,
      lastRunErrorAt: null,
      lastWrittenPackageId: null,
      lastWrittenAt: null,
      packages: [],
      updatedAt: Date.now(),
    } as any;

    const result = await writeLtmState(mockStore, state);

    expect(mockStore.writeState).toHaveBeenCalledWith(state);
    expect(result.lastWrittenPackageId).toBe('pkg-123');
  });
});

describe('markLtmRecallIndexDirty', () => {
  it('calls writeRecallIndexStamp with reason', async () => {
    const mockStore = { writeRecallIndexStamp: vi.fn().mockResolvedValue(undefined) };

    await markLtmRecallIndexDirty(mockStore, 'new-observation-added');

    expect(mockStore.writeRecallIndexStamp).toHaveBeenCalledWith('new-observation-added');
  });
});

describe('scheduleLtmRun', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('sets a timer to call runFn after delayMs', () => {
    const timer = { current: null as ReturnType<typeof setTimeout> | null };
    const runFn = vi.fn();

    scheduleLtmRun(5_000, false, true, timer, runFn);

    expect(timer.current).not.toBeNull();
    vi.advanceTimersByTime(5_000);
    expect(runFn).toHaveBeenCalledTimes(1);
  });

  it('replaces previous timer on subsequent call', () => {
    const timer = { current: null as ReturnType<typeof setTimeout> | null };
    const runFn = vi.fn();

    scheduleLtmRun(5_000, false, true, timer, runFn);
    scheduleLtmRun(3_000, false, true, timer, runFn);

    // The first timer should have been cancelled (timer.current replaced)
    expect(timer.current).not.toBeNull();
    vi.advanceTimersByTime(3_000);
    expect(runFn).toHaveBeenCalledTimes(1);
  });

  it('does not schedule when stopped=true', () => {
    const timer = { current: null as ReturnType<typeof setTimeout> | null };
    const runFn = vi.fn();

    scheduleLtmRun(5_000, true, true, timer, runFn);

    expect(timer.current).toBeNull();
    vi.advanceTimersByTime(5_000);
    expect(runFn).not.toHaveBeenCalled();
  });

  it('does not schedule when idle=false', () => {
    const timer = { current: null as ReturnType<typeof setTimeout> | null };
    const runFn = vi.fn();

    scheduleLtmRun(5_000, false, false, timer, runFn);

    expect(timer.current).toBeNull();
    vi.advanceTimersByTime(5_000);
    expect(runFn).not.toHaveBeenCalled();
  });
});

describe('clearLtmTimer', () => {
  it('clears the timer and sets current to null', () => {
    const timer = { current: setTimeout(() => {}, 5_000) } as {
      current: ReturnType<typeof setTimeout> | null;
    };

    clearLtmTimer(timer);

    expect(timer.current).toBeNull();
  });

  it('is idempotent when timer is already null', () => {
    const timer = { current: null as ReturnType<typeof setTimeout> | null };

    expect(() => clearLtmTimer(timer)).not.toThrow();
  });
});

describe('applyLtmStateToSnapshot', () => {
  it('parses lastRunAt ISO string to timestamp', () => {
    const snapshot = {} as {
      lastRunAt?: number;
      lastRunError?: string | null;
      lastRunErrorAt?: number | null;
      lastWrittenPackageId?: string | null;
      lastWrittenAt?: number | null;
      packageCount?: number;
    };
    const persisted = {
      lastRunAt: '2025-03-01T12:00:00.000Z',
      lastRunError: null,
      lastRunErrorAt: null,
      lastWrittenPackageId: null,
      lastWrittenAt: null,
      packages: [],
    };

    applyLtmStateToSnapshot(snapshot, persisted);

    expect(snapshot.lastRunAt).toBe(Date.parse('2025-03-01T12:00:00.000Z'));
  });

  it('parses lastRunErrorAt ISO string to timestamp', () => {
    const snapshot = {} as {
      lastRunAt?: number;
      lastRunError?: string | null;
      lastRunErrorAt?: number | null;
      lastWrittenPackageId?: string | null;
      lastWrittenAt?: number | null;
      packageCount?: number;
    };
    const persisted = {
      lastRunAt: null,
      lastRunError: 'some error',
      lastRunErrorAt: '2025-03-02T14:30:00.000Z',
      lastWrittenPackageId: null,
      lastWrittenAt: null,
      packages: [],
    };

    applyLtmStateToSnapshot(snapshot, persisted);

    expect(snapshot.lastRunErrorAt).toBe(Date.parse('2025-03-02T14:30:00.000Z'));
    expect(snapshot.lastRunError).toBe('some error');
  });

  it('sets lastWrittenPackageId and lastWrittenAt from persisted', () => {
    const snapshot = {} as {
      lastRunAt?: number;
      lastRunError?: string | null;
      lastRunErrorAt?: number | null;
      lastWrittenPackageId?: string | null;
      lastWrittenAt?: number | null;
      packageCount?: number;
    };
    const persisted = {
      lastRunAt: null,
      lastRunError: null,
      lastRunErrorAt: null,
      lastWrittenPackageId: 'pkg-456',
      lastWrittenAt: '2025-03-03T09:00:00.000Z',
      packages: [],
    };

    applyLtmStateToSnapshot(snapshot, persisted);

    expect(snapshot.lastWrittenPackageId).toBe('pkg-456');
    expect(snapshot.lastWrittenAt).toBe(Date.parse('2025-03-03T09:00:00.000Z'));
  });

  it('sets packageCount from packages.length', () => {
    const snapshot = {} as {
      lastRunAt?: number;
      lastRunError?: string | null;
      lastRunErrorAt?: number | null;
      lastWrittenPackageId?: string | null;
      lastWrittenAt?: number | null;
      packageCount?: number;
    };
    const persisted = {
      lastRunAt: null,
      lastRunError: null,
      lastRunErrorAt: null,
      lastWrittenPackageId: null,
      lastWrittenAt: null,
      packages: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    };

    applyLtmStateToSnapshot(snapshot, persisted);

    expect(snapshot.packageCount).toBe(3);
  });

  it('leaves lastRunAt unchanged when lastRunAt is null', () => {
    const snapshot = { lastRunAt: 1700000000000 } as {
      lastRunAt?: number;
      lastRunError?: string | null;
      lastRunErrorAt?: number | null;
      lastWrittenPackageId?: string | null;
      lastWrittenAt?: number | null;
      packageCount?: number;
    };
    const persisted = {
      lastRunAt: null,
      lastRunError: null,
      lastRunErrorAt: null,
      lastWrittenPackageId: null,
      lastWrittenAt: null,
      packages: [],
    };

    applyLtmStateToSnapshot(snapshot, persisted);

    expect(snapshot.lastRunAt).toBe(1700000000000);
  });
});
