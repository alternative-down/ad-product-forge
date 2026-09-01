import { describe, expect, it, vi } from 'vitest';
import { rt } from './runtime-ops';
import { RUNNER_AWAIT_TIMEOUT_MS } from './agent-runner-generate';

describe('_runtime-ops rt()', () => {
  it('passes through when the wrapped promise resolves before the timeout', async () => {
    vi.useFakeTimers();
    try {
      const value = await rt(Promise.resolve('ok'), 'should not fire');
      expect(value).toBe('ok');
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects with the supplied message when the wrapped promise exceeds RUNNER_AWAIT_TIMEOUT_MS', async () => {
    vi.useFakeTimers();
    try {
      const neverResolves = new Promise<string>(() => {
        // intentionally pending — we want the timeout to win the race.
      });
      const pending = rt(neverResolves, 'agent runner timed out');
      const rejection = expect(pending).rejects.toThrow('agent runner timed out');

      vi.advanceTimersByTime(RUNNER_AWAIT_TIMEOUT_MS);
      await vi.advanceTimersToNextTimerAsync();

      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it('propagates rejection from the wrapped promise without invoking the timeout', async () => {
    vi.useFakeTimers();
    try {
      const failing = Promise.reject(new Error('store exploded'));
      await expect(rt(failing, 'should not fire')).rejects.toThrow('store exploded');
    } finally {
      vi.useRealTimers();
    }
  });
});