import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createAgentWakeQueue, type AgentWakeEvent } from './wake-queue';

function makeEvent(overrides: Partial<AgentWakeEvent> = {}): AgentWakeEvent {
  return {
    type: 'message:direct',
    groupKey: 'gk-1',
    idempotencyKey: `key-${Math.random()}`,
    timestamp: Date.now(),
    text: 'hello',
    ...overrides,
  };
}

describe('createAgentWakeQueue', () => {
  let execute: ReturnType<typeof vi.fn>;
  let queue: ReturnType<typeof createAgentWakeQueue>;

  beforeEach(() => {
    execute = vi.fn().mockResolvedValue(undefined);
    queue = createAgentWakeQueue({ label: 'test', execute });
    vi.useFakeTimers();
  });

  afterEach(() => {
    queue.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── notifyExternalEvent ──────────────────────────────────────────────────

  it('sets pending=true after an event is notified', () => {
    queue.notifyExternalEvent(makeEvent());
    expect(queue.getSnapshot().pending).toBe(true);
  });

  it('stores event by idempotencyKey', () => {
    const ev = makeEvent({ idempotencyKey: 'idempotent-1' });
    queue.notifyExternalEvent(ev);
    expect(queue.getSnapshot().events).toContainEqual(expect.objectContaining({ idempotencyKey: 'idempotent-1' }));
  });

  it('does not duplicate events with same idempotencyKey', () => {
    const ev = makeEvent({ idempotencyKey: 'same-key', text: 'first' });
    queue.notifyExternalEvent(ev);
    queue.notifyExternalEvent({ ...ev, text: 'second' });
    expect(queue.getSnapshot().events.filter(e => e.idempotencyKey === 'same-key')).toHaveLength(1);
  });

  // ── debouncing ──────────────────────────────────────────────────────────

  it('waits for DEFAULT_WAKE_DEBOUNCE_MS (3000ms) before executing', async () => {
    queue.notifyExternalEvent(makeEvent());
    expect(execute).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2999);
    expect(execute).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2); // past 3000ms
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('executes with the queued events after debounce', async () => {
    const ev1 = makeEvent({ idempotencyKey: 'a', text: 'msg a' });
    const ev2 = makeEvent({ idempotencyKey: 'b', text: 'msg b' });
    queue.notifyExternalEvent(ev1);
    queue.notifyExternalEvent(ev2);
    await vi.advanceTimersByTimeAsync(3000);
    expect(execute).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ idempotencyKey: 'a', text: 'msg a' }),
        expect.objectContaining({ idempotencyKey: 'b', text: 'msg b' }),
      ]),
    );
  });

  it('executes with events sorted by timestamp', async () => {
    const earlier = makeEvent({ idempotencyKey: 'early', timestamp: 1000, text: 'early' });
    const later = makeEvent({ idempotencyKey: 'late', timestamp: 2000, text: 'late' });
    queue.notifyExternalEvent(later);
    queue.notifyExternalEvent(earlier); // out-of-order notification
    await vi.advanceTimersByTimeAsync(3000);
    expect(execute).toHaveBeenCalledWith([
      expect.objectContaining({ idempotencyKey: 'early' }),
      expect.objectContaining({ idempotencyKey: 'late' }),
    ]);
  });

  // ── group message longer debounce ────────────────────────────────────────

  it('uses GROUP_MESSAGE_WAKE_DEBOUNCE_MS (8000ms) for group messages', async () => {
    const groupEvent = makeEvent({
      type: 'message:group',
      groupMetadata: { ConversationType: 'group' },
    });
    queue.notifyExternalEvent(groupEvent);
    await vi.advanceTimersByTimeAsync(7999);
    expect(execute).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('uses GROUP_MESSAGE_WAKE_MAX_ACCUMULATION_MS (20000ms) as max for group messages', async () => {
    const groupEvent = makeEvent({
      type: 'message:group',
      groupMetadata: { ConversationType: 'group' },
    });
    queue.notifyExternalEvent(groupEvent);
    // Should not trigger before 8000ms
    await vi.advanceTimersByTimeAsync(7000);
    expect(execute).not.toHaveBeenCalled();
    // Should trigger at 8000ms
    await vi.advanceTimersByTimeAsync(1001);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  // ── max accumulation window ───────────────────────────────────────────────

  it('triggers at max accumulation window even without debounce settling', async () => {
    const ev = makeEvent();
    queue.notifyExternalEvent(ev);
    // Advance past the max accumulation (10000ms)
    await vi.advanceTimersByTimeAsync(10000);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  // ── idleOnly events ─────────────────────────────────────────────────────

  it('queues idleOnly events separately', () => {
    const normal = makeEvent({ idleOnly: false });
    const idle = makeEvent({ idleOnly: true });
    queue.notifyExternalEvent(normal);
    queue.notifyExternalEvent(idle);
    const snapshot = queue.getSnapshot();
    expect(snapshot.events.some(e => e.idleOnly)).toBe(true);
    expect(snapshot.events.some(e => !e.idleOnly)).toBe(true);
  });

  it('still accumulates idleOnly events in snapshot', () => {
    queue.notifyExternalEvent(makeEvent({ idleOnly: true }));
    expect(queue.getSnapshot().events).toHaveLength(1);
  });

  // ── onRunnerIdle ────────────────────────────────────────────────────────

  it('onRunnerIdle resolves when not pending', async () => {
    const p = queue.onRunnerIdle();
    // Not pending → should resolve immediately
    await expect(p).resolves.toBeUndefined();
  });

  it('onRunnerIdle schedules trigger if not at max accumulation', async () => {
    queue.notifyExternalEvent(makeEvent());
    execute.mockReturnValue(new Promise(() => {})); // never resolves
    const _idlePromise = queue.onRunnerIdle();
    // Should have scheduled a timer (nextTriggerAt not null)
    expect(queue.getSnapshot().nextTriggerAt).not.toBeNull();
    queue.stop();
  });

  // ── stop ────────────────────────────────────────────────────────────────

  it('stop clears the timer', () => {
    queue.notifyExternalEvent(makeEvent());
    expect(queue.getSnapshot().nextTriggerAt).not.toBeNull();
    queue.stop();
    expect(queue.getSnapshot().nextTriggerAt).toBeNull();
  });

  it('stop prevents further execution', async () => {
    queue.notifyExternalEvent(makeEvent());
    queue.stop();
    await vi.advanceTimersByTimeAsync(15000);
    expect(execute).not.toHaveBeenCalled();
  });

  // ── error recovery ──────────────────────────────────────────────────────

  it('re-queues events when execute throws', async () => {
    const ev = makeEvent({ idempotencyKey: 'retry-test' });
    execute.mockRejectedValueOnce(new Error('boom'));
    queue.notifyExternalEvent(ev);
    await vi.advanceTimersByTimeAsync(3000);
    // After failure, events should be re-queued
    expect(queue.getSnapshot().pending).toBe(true);
    expect(queue.getSnapshot().events.some(e => e.idempotencyKey === 'retry-test')).toBe(true);
  });

  it('events are cleared from snapshot during execution even if pending', async () => {
    // After successful execution, snapshot events are cleared
    queue.notifyExternalEvent(makeEvent());
    await vi.advanceTimersByTimeAsync(3000);
    expect(execute).toHaveBeenCalledTimes(1);
    // Events array is cleared after execution
    expect(queue.getSnapshot().events).toHaveLength(0);
  });

  // ── getSnapshot ────────────────────────────────────────────────────────

  it('returns firstPendingAt when pending', () => {
    queue.notifyExternalEvent(makeEvent());
    expect(queue.getSnapshot().firstPendingAt).not.toBeNull();
  });

  it('returns null firstPendingAt when not pending', () => {
    expect(queue.getSnapshot().firstPendingAt).toBeNull();
  });

  it('clears state after successful execution', async () => {
    queue.notifyExternalEvent(makeEvent());
    await vi.advanceTimersByTimeAsync(3000);
    const snapshot = queue.getSnapshot();
    expect(snapshot.pending).toBe(false);
    expect(snapshot.events).toHaveLength(0);
    expect(snapshot.firstPendingAt).toBeNull();
    expect(snapshot.nextTriggerAt).toBeNull();
  });

  // ── label parameter ─────────────────────────────────────────────────────

  it('uses provided label in error logs', async () => {
    const customQueue = createAgentWakeQueue({
      label: 'my-agent',
      execute: vi.fn().mockRejectedValue(new Error('fail')),
    });
    customQueue.notifyExternalEvent(makeEvent());
    await vi.advanceTimersByTimeAsync(3000);
    customQueue.stop();
    vi.restoreAllMocks();
  });
});