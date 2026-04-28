import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentWakeQueue } from './wake-queue.js';

function makeEvent(overrides = {}): {
  type: string;
  groupKey: string;
  idempotencyKey: string;
  timestamp: number;
  text: string;
} {
  return {
    type: 'message:internal-chat',
    groupKey: 'message:internal-chat:chat-1',
    idempotencyKey: `key-${Date.now()}-${Math.random()}`,
    timestamp: Date.now(),
    text: 'test',
    ...overrides,
  };
}

describe('wake-queue', () => {
  let executeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('notifies external event and triggers after debounce', async () => {
    const received: ReturnType<typeof makeEvent>[] = [];
    executeSpy = vi.fn().mockImplementation(async (events) => {
      received.push(...events);
    });

    const queue = createAgentWakeQueue({ label: 'test', execute: executeSpy });

    queue.notifyExternalEvent(makeEvent());

    expect(executeSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(received).toHaveLength(1);
  });

  it('accumulates multiple events within debounce window', async () => {
    const received: ReturnType<typeof makeEvent>[] = [];
    executeSpy = vi.fn().mockImplementation(async (events) => {
      received.push(...events);
    });

    const queue = createAgentWakeQueue({ label: 'test', execute: executeSpy });

    const e1 = makeEvent({ idempotencyKey: 'key-1' });
    const e2 = makeEvent({ idempotencyKey: 'key-2' });
    queue.notifyExternalEvent(e1);
    queue.notifyExternalEvent(e2);

    await vi.advanceTimersByTimeAsync(3000);

    expect(received).toHaveLength(2);
  });

  it('deduplicates events with same idempotency key', async () => {
    const received: ReturnType<typeof makeEvent>[] = [];
    executeSpy = vi.fn().mockImplementation(async (events) => {
      received.push(...events);
    });

    const queue = createAgentWakeQueue({ label: 'test', execute: executeSpy });

    const event = makeEvent({ idempotencyKey: 'same-key' });
    queue.notifyExternalEvent(event);
    queue.notifyExternalEvent(event);

    await vi.advanceTimersByTimeAsync(3000);

    expect(received).toHaveLength(1);
  });

  it('forces trigger when max accumulation time is reached', async () => {
    const received: ReturnType<typeof makeEvent>[] = [];
    executeSpy = vi.fn().mockImplementation(async (events) => {
      received.push(...events);
    });

    const queue = createAgentWakeQueue({ label: 'test', execute: executeSpy });

    queue.notifyExternalEvent(makeEvent({ idempotencyKey: 'acc-key' }));

    // Trigger before debounce completes
    await vi.advanceTimersByTimeAsync(10000);

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(received).toHaveLength(1);
  });

  it('reschedules after execute failure with debounce', async () => {
    executeSpy = vi.fn().mockRejectedValue(new Error('execute failed'));

    const queue = createAgentWakeQueue({ label: 'test', execute: executeSpy });

    queue.notifyExternalEvent(makeEvent({ idempotencyKey: 'fail-key' }));
    await vi.advanceTimersByTimeAsync(3000);

    expect(executeSpy).toHaveBeenCalledTimes(1);

    // Should reschedule, not execute again immediately
    expect(executeSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);

    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  it('stop clears pending state and timer', async () => {
    executeSpy = vi.fn();

    const queue = createAgentWakeQueue({ label: 'test', execute: executeSpy });

    queue.notifyExternalEvent(makeEvent({ idempotencyKey: 'stop-key' }));
    queue.stop();

    await vi.advanceTimersByTimeAsync(15000);

    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('onRunnerIdle flushes idle-only events and reschedules trigger', async () => {
    const received: ReturnType<typeof makeEvent>[] = [];
    executeSpy = vi.fn().mockImplementation(async (events) => {
      received.push(...events);
    });

    const queue = createAgentWakeQueue({ label: 'test', execute: executeSpy });

    const idleEvent = makeEvent({ idempotencyKey: 'idle-key', idleOnly: true });
    queue.notifyExternalEvent(idleEvent);

    expect(executeSpy).not.toHaveBeenCalled();

    // onRunnerIdle flushes to ready and reschedules — trigger after debounce
    await queue.onRunnerIdle();
    await vi.advanceTimersByTimeAsync(3000);

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(received).toHaveLength(1);
    expect(received[0].idleOnly).toBe(true);
  });

  it('onRunnerIdle does nothing when no idle events pending', async () => {
    executeSpy = vi.fn();

    const queue = createAgentWakeQueue({ label: 'test', execute: executeSpy });

    await queue.onRunnerIdle();

    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('getSnapshot reflects pending and waitingForIdle state', async () => {
    executeSpy = vi.fn();

    const queue = createAgentWakeQueue({ label: 'test', execute: executeSpy });

    let snap = queue.getSnapshot();
    expect(snap.pending).toBe(false);
    expect(snap.waitingForIdle).toBe(false);

    queue.notifyExternalEvent(makeEvent({ idempotencyKey: 'snap-key' }));

    snap = queue.getSnapshot();
    expect(snap.pending).toBe(true);
    expect(snap.events).toHaveLength(1);
  });

  it('group messages use longer debounce and accumulation windows', async () => {
    const received: ReturnType<typeof makeEvent>[] = [];
    executeSpy = vi.fn().mockImplementation(async (events) => {
      received.push(...events);
    });

    const queue = createAgentWakeQueue({ label: 'test', execute: executeSpy });

    const groupEvent = makeEvent({
      idempotencyKey: 'group-key',
      groupMetadata: { ConversationType: 'group' },
    });
    queue.notifyExternalEvent(groupEvent);

    // 8s debounce — should not trigger after 5s
    await vi.advanceTimersByTimeAsync(5000);
    expect(executeSpy).not.toHaveBeenCalled();

    // But should trigger after 8s
    await vi.advanceTimersByTimeAsync(5000);
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  it('deduplicates across ready and idle maps', async () => {
    const received: ReturnType<typeof makeEvent>[] = [];
    executeSpy = vi.fn().mockImplementation(async (events) => {
      received.push(...events);
    });

    const queue = createAgentWakeQueue({ label: 'test', execute: executeSpy });

    const key = 'cross-map-key';
    queue.notifyExternalEvent(makeEvent({ idempotencyKey: key }));
    queue.notifyExternalEvent(makeEvent({ idempotencyKey: key, idleOnly: true }));

    await vi.advanceTimersByTimeAsync(3000);
    await queue.onRunnerIdle();

    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  it('multiple idle events flushed via onRunnerIdle accumulate and trigger', async () => {
    const received: ReturnType<typeof makeEvent>[] = [];
    executeSpy = vi.fn().mockImplementation(async (events) => {
      received.push(...events);
    });

    const queue = createAgentWakeQueue({ label: 'test', execute: executeSpy });

    queue.notifyExternalEvent(makeEvent({ idempotencyKey: 'idle-1', idleOnly: true }));
    queue.notifyExternalEvent(makeEvent({ idempotencyKey: 'idle-2', idleOnly: true }));

    await queue.onRunnerIdle();
    await vi.advanceTimersByTimeAsync(3000);

    expect(received).toHaveLength(2);
  });

  it('idle event deduped when ready event with same key already exists', async () => {
    const received: ReturnType<typeof makeEvent>[] = [];
    executeSpy = vi.fn().mockImplementation(async (events) => {
      received.push(...events);
    });

    const queue = createAgentWakeQueue({ label: 'test', execute: executeSpy });

    // Same key in both ready and idle — should appear once
    queue.notifyExternalEvent(makeEvent({ idempotencyKey: 'dedup-key' }));
    queue.notifyExternalEvent(makeEvent({ idempotencyKey: 'dedup-key', idleOnly: true }));

    await vi.advanceTimersByTimeAsync(3000);

    expect(received).toHaveLength(1);
  });

  it('execute failure re-adds events to ready events', async () => {
    let callCount = 0;
    executeSpy = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('first failure');
    });

    const queue = createAgentWakeQueue({ label: 'test', execute: executeSpy });

    queue.notifyExternalEvent(makeEvent({ idempotencyKey: 'retry-key' }));
    await vi.advanceTimersByTimeAsync(3000);

    expect(callCount).toBe(1);

    // After failure, it reschedules — wait and verify second attempt
    await vi.advanceTimersByTimeAsync(3000);

    expect(callCount).toBe(2);
  });
});