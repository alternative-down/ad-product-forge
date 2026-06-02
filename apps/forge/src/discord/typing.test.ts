/**
 * Unit tests for discord/typing.ts
 *
 * Covers: withTyping(channel, run, pendingTypingTimers)
 *  - Sends initial typing before run()
 *  - Sends periodic typing every ~8s while run is in flight
 *  - Always clears the interval after run() settles
 *  - Returns the value from run()
 *  - Clears the timer even when run() throws
 *
 * Covers: clearTypingTimers(pendingTypingTimers)
 *  - Clears all timers in the set and empties the set
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { withTyping, clearTypingTimers } from './typing';


function createFakeChannel(): { sendTyping: () => Promise<unknown> } {
  return { sendTyping: vi.fn().mockResolvedValue(undefined) };
}

describe('withTyping', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends an initial typing indicator before run() executes', async () => {
    const channel = createFakeChannel();
    const pending = new Set<NodeJS.Timeout>();

    const runPromise = withTyping(channel, async () => {
      // run() begins after sendTyping() has been called
      expect(channel.sendTyping).toHaveBeenCalledTimes(1);
      return { targetKey: 't1' };
    }, pending);
    await runPromise;

    expect(channel.sendTyping).toHaveBeenCalledTimes(1);
  });

  it('sends additional typing indicators every ~8s while run() is in flight', async () => {
    const channel = createFakeChannel();
    const pending = new Set<NodeJS.Timeout>();

    let resolveRun: (value: { targetKey: string }) => void = () => {};
    const runPromise = withTyping(
      channel,
      () => new Promise<{ targetKey: string }>((resolve) => {
        resolveRun = resolve;
      }),
      pending,
    );

    // Initial sendTyping call from withTyping
    expect(channel.sendTyping).toHaveBeenCalledTimes(1);

    // Advance 8s — setInterval fires
    await vi.advanceTimersByTimeAsync(8_000);
    expect(channel.sendTyping).toHaveBeenCalledTimes(2);

    // Advance another 8s
    await vi.advanceTimersByTimeAsync(8_000);
    expect(channel.sendTyping).toHaveBeenCalledTimes(3);

    resolveRun({ targetKey: 't-final' });
    await runPromise;
  });

  it('clears the typing interval after run() completes', async () => {
    const channel = createFakeChannel();
    const pending = new Set<NodeJS.Timeout>();
    const run = vi.fn().mockResolvedValue({ targetKey: 't1' });

    await withTyping(channel, run, pending);

    expect(pending.size).toBe(0);
    // Advance past the interval period; no further sendTyping
    await vi.advanceTimersByTimeAsync(20_000);
    expect(channel.sendTyping).toHaveBeenCalledTimes(1);
  });

  it('returns the value produced by run()', async () => {
    const channel = createFakeChannel();
    const pending = new Set<NodeJS.Timeout>();
    const run = vi.fn().mockResolvedValue({ targetKey: 't-returned', messageId: 'm1' });

    const out = await withTyping(channel, run, pending);

    expect(out).toEqual({ targetKey: 't-returned', messageId: 'm1' });
  });

  it('clears the typing interval even when run() throws', async () => {
    const channel = createFakeChannel();
    const pending = new Set<NodeJS.Timeout>();
    const run = vi.fn().mockRejectedValue(new Error('run-failed'));

    await expect(withTyping(channel, run, pending)).rejects.toThrow('run-failed');

    expect(pending.size).toBe(0);
  });
});

describe('clearTypingTimers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears every timer in the set and empties the set', () => {
    const set = new Set<NodeJS.Timeout>();
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');

    // Insert fake timers; we do not run them so no real scheduling happens.
    const fakeTimer = setTimeout(() => {}, 0) as unknown as NodeJS.Timeout;
    set.add(fakeTimer);
    set.add(setTimeout(() => {}, 0) as unknown as NodeJS.Timeout);
    expect(set.size).toBe(2);

    clearTypingTimers(set);

    expect(clearSpy).toHaveBeenCalledTimes(2);
    expect(set.size).toBe(0);
  });

  it('does nothing when the set is already empty', () => {
    const set = new Set<NodeJS.Timeout>();
    expect(() => clearTypingTimers(set)).not.toThrow();
    expect(set.size).toBe(0);
  });
});
