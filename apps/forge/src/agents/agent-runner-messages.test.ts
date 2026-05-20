/**
 * Unit tests for agents/agent-runner-messages.ts.
 * createMessageManager — pure state manager for agent wake event buffering.
 * Zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import { createMessageManager, type MessageManagerState } from './agent-runner-messages';
import type { AgentWakeEvent } from '@forge-runtime/core';

// ─── Factory helpers ─────────────────────────────────────────────────────────

function makeState(overrides: Partial<MessageManagerState> = {}): MessageManagerState {
  return {
    pendingRunMessages: new Map(),
    flushedRunEventKeys: new Set(),
    flushedRunEventKeyOrder: [],
    currentFlushSettings: {
      communicationDmFlushingEnabled: true,
      communicationGroupFlushingEnabled: true,
    },
    ...overrides,
  };
}

function makeEvent(overrides: Record<string, unknown> = {}): AgentWakeEvent {
  const { id: _ignoredId, ...rest } = overrides as Record<string, unknown>;
  void _ignoredId;
  return {
    text: rest.text ?? 'hello',
    timestamp: rest.timestamp ?? Date.now(),
    idempotencyKey: rest.idempotencyKey ?? 'key-1',
    type: rest.type ?? 'message:dummy',
    originIdleOnly: rest.originIdleOnly ?? false,
    idleOnly: rest.idleOnly ?? false,
    groupMetadata: rest.groupMetadata ?? undefined,
  } as unknown as AgentWakeEvent;
}

function mockFormatter(events: AgentWakeEvent[]): string {
  return `MESSAGES:${events.map((e) => e.text).join(',')}`;
}

// ─── appendPendingRunMessages ───────────────────────────────────────────────

describe('appendPendingRunMessages', () => {
  it('adds event to pendingRunMessages', () => {
    const state = makeState();
    const manager = createMessageManager(state, mockFormatter);
    const event = makeEvent({ id: 'evt-a', text: 'hello', idempotencyKey: 'k1' });

    manager.appendPendingRunMessages([event]);

    expect(state.pendingRunMessages.has('k1')).toBe(true);
  });

  it('overwrites existing event with same idempotencyKey', () => {
    const state = makeState();
    const manager = createMessageManager(state, mockFormatter);
    const event1 = makeEvent({ id: 'evt-1', text: 'first', idempotencyKey: 'k1' });
    const event2 = makeEvent({ id: 'evt-2', text: 'second', idempotencyKey: 'k1' });

    manager.appendPendingRunMessages([event1]);
    manager.appendPendingRunMessages([event2]);

    expect(state.pendingRunMessages.get('k1')!.text).toBe('second');
  });

  it('skips idleOnly events when allowIdleOnly is false', () => {
    const state = makeState();
    const manager = createMessageManager(state, mockFormatter);
    const idleEvent = makeEvent({ idleOnly: true, idempotencyKey: 'k1' });

    manager.appendPendingRunMessages([idleEvent], { allowIdleOnly: false });

    expect(state.pendingRunMessages.has('k1')).toBe(false);
  });

  it('includes idleOnly events when allowIdleOnly is true', () => {
    const state = makeState();
    const manager = createMessageManager(state, mockFormatter);
    const idleEvent = makeEvent({ idleOnly: true, originIdleOnly: false, idempotencyKey: 'k1' });

    manager.appendPendingRunMessages([idleEvent], { allowIdleOnly: true });

    expect(state.pendingRunMessages.has('k1')).toBe(true);
  });

  it('skips events with empty text', () => {
    const state = makeState();
    const manager = createMessageManager(state, mockFormatter);
    const blankEvent = makeEvent({ text: '   ', idempotencyKey: 'k1' });

    manager.appendPendingRunMessages([blankEvent]);

    expect(state.pendingRunMessages.has('k1')).toBe(false);
  });

  it('preserves originIdleOnly on appended events', () => {
    const state = makeState();
    const manager = createMessageManager(state, mockFormatter);
    const event = makeEvent({ originIdleOnly: true, idleOnly: false, idempotencyKey: 'k1' });

    manager.appendPendingRunMessages([event]);

    expect(state.pendingRunMessages.get('k1')!.originIdleOnly).toBe(true);
    expect(state.pendingRunMessages.get('k1')!.idleOnly).toBe(false);
  });
});

// ─── flushPendingRunMessages ────────────────────────────────────────────────

describe('flushPendingRunMessages', () => {
  it('returns null when no pending events', () => {
    const state = makeState();
    const manager = createMessageManager(state, mockFormatter);

    expect(manager.flushPendingRunMessages()).toBeNull();
  });

  it('returns formatted string and clears pending events', () => {
    const state = makeState();
    const manager = createMessageManager(state, mockFormatter);
    state.pendingRunMessages.set('k1', makeEvent({ text: 'hello', idempotencyKey: 'k1' }));

    const result = manager.flushPendingRunMessages();

    expect(result).toBe('MESSAGES:hello');
    expect(state.pendingRunMessages.size).toBe(0);
  });

  it('formats multiple events in timestamp order', () => {
    const state = makeState();
    const manager = createMessageManager(state, mockFormatter);
    const now = Date.now();
    state.pendingRunMessages.set(
      'k2',
      makeEvent({ text: 'second', timestamp: now + 2, idempotencyKey: 'k2' }),
    );
    state.pendingRunMessages.set(
      'k1',
      makeEvent({ text: 'first', timestamp: now + 1, idempotencyKey: 'k1' }),
    );

    const result = manager.flushPendingRunMessages();

    expect(result).toBe('MESSAGES:first,second');
  });

  it('skips already-flushed events (idempotency)', () => {
    const state = makeState();
    const manager = createMessageManager(state, mockFormatter);
    state.flushedRunEventKeys.add('k1');
    state.flushedRunEventKeyOrder.push('k1');
    state.pendingRunMessages.set('k1', makeEvent({ text: 'hello', idempotencyKey: 'k1' }));

    const result = manager.flushPendingRunMessages();

    expect(result).toBeNull();
  });

  it('skips originIdleOnly events when allowOriginIdleOnly is false', () => {
    const state = makeState();
    const manager = createMessageManager(state, mockFormatter);
    const idleEvent = makeEvent({
      originIdleOnly: true,
      idleOnly: true,
      text: 'idle-msg',
      idempotencyKey: 'k1',
    });
    state.pendingRunMessages.set('k1', idleEvent);

    const result = manager.flushPendingRunMessages();

    expect(result).toBeNull();
    // event should be re-queued
    expect(state.pendingRunMessages.size).toBe(1);
  });

  it('includes originIdleOnly events when allowOriginIdleOnly is true', () => {
    const state = makeState();
    const manager = createMessageManager(state, mockFormatter);
    const idleEvent = makeEvent({
      originIdleOnly: true,
      idleOnly: true,
      text: 'idle-msg',
      idempotencyKey: 'k1',
    });
    state.pendingRunMessages.set('k1', idleEvent);

    const result = manager.flushPendingRunMessages({ allowOriginIdleOnly: true });

    expect(result).toBe('MESSAGES:idle-msg');
  });

  it('skips non-message type events based on flush settings', () => {
    const state = makeState({
      currentFlushSettings: {
        communicationDmFlushingEnabled: false,
        communicationGroupFlushingEnabled: false,
      },
    });
    const manager = createMessageManager(state, mockFormatter);
    const msgEvent = makeEvent({ type: 'message:dummy', text: 'msg', idempotencyKey: 'k1' });
    state.pendingRunMessages.set('k1', msgEvent);

    const result = manager.flushPendingRunMessages();

    expect(result).toBeNull();
    expect(state.pendingRunMessages.size).toBe(0);
  });

  it('returns null when all events are skipped', () => {
    const state = makeState();
    const manager = createMessageManager(state, mockFormatter);
    state.pendingRunMessages.set('k1', makeEvent({ text: 'hello', idempotencyKey: 'k1' }));
    state.flushedRunEventKeys.add('k1');
    state.flushedRunEventKeyOrder.push('k1');

    const result = manager.flushPendingRunMessages();

    expect(result).toBeNull();
  });
});

// ─── rememberFlushedRunEventKey ───────────────────────────────────────────────

describe('rememberFlushedRunEventKey', () => {
  it('adds key to flushedRunEventKeys and order', () => {
    const state = makeState();
    const manager = createMessageManager(state, mockFormatter);

    manager.rememberFlushedRunEventKey('k1');

    expect(state.flushedRunEventKeys.has('k1')).toBe(true);
    expect(state.flushedRunEventKeyOrder).toContain('k1');
  });

  it('is idempotent — does not duplicate key in order', () => {
    const state = makeState();
    const manager = createMessageManager(state, mockFormatter);

    manager.rememberFlushedRunEventKey('k1');
    manager.rememberFlushedRunEventKey('k1');

    expect(state.flushedRunEventKeyOrder.filter((k) => k === 'k1').length).toBe(1);
  });

  it('evicts oldest keys when order exceeds MAX_FLUSHED_RUN_EVENT_KEYS', () => {
    const state = makeState();
    const manager = createMessageManager(state, mockFormatter);
    const maxKeys = 2_000;

    for (let i = 0; i < maxKeys + 5; i++) {
      manager.rememberFlushedRunEventKey(`k-${i}`);
    }

    expect(state.flushedRunEventKeyOrder.length).toBeLessThanOrEqual(maxKeys);
    expect(state.flushedRunEventKeyOrder[0]).toBe('k-5');
  });
});

// ─── resetFlushedRunEventKeys ─────────────────────────────────────────────────

describe('resetFlushedRunEventKeys', () => {
  it('clears flushedRunEventKeys and flushedRunEventKeyOrder', () => {
    const state = makeState();
    const manager = createMessageManager(state, mockFormatter);
    state.flushedRunEventKeys.add('k1');
    state.flushedRunEventKeyOrder.push('k1');

    manager.resetFlushedRunEventKeys();

    expect(state.flushedRunEventKeys.size).toBe(0);
    expect(state.flushedRunEventKeyOrder).toHaveLength(0);
  });
});

// ─── shouldIncludePendingRunEventInFlush ─────────────────────────────────────

describe('shouldIncludePendingRunEventInFlush', () => {
  it('always returns true for non-message type events', () => {
    const state = makeState({
      currentFlushSettings: {
        communicationDmFlushingEnabled: false,
        communicationGroupFlushingEnabled: false,
      },
    });
    const manager = createMessageManager(state, mockFormatter);
    const event = makeEvent({ type: 'schedule:tick', groupMetadata: undefined });

    expect(manager.shouldIncludePendingRunEventInFlush(event)).toBe(true);
  });

  it('respects group flush setting for group conversations', () => {
    const state = makeState({
      currentFlushSettings: {
        communicationDmFlushingEnabled: true,
        communicationGroupFlushingEnabled: false,
      },
    });
    const manager = createMessageManager(state, mockFormatter);
    const event = makeEvent({
      type: 'message:dummy',
      groupMetadata: { ConversationType: 'group' },
    });

    expect(manager.shouldIncludePendingRunEventInFlush(event)).toBe(false);
  });

  it('respects dm flush setting for dm conversations', () => {
    const state = makeState({
      currentFlushSettings: {
        communicationDmFlushingEnabled: false,
        communicationGroupFlushingEnabled: true,
      },
    });
    const manager = createMessageManager(state, mockFormatter);
    const event = makeEvent({ type: 'message:dummy', groupMetadata: { ConversationType: 'dm' } });

    expect(manager.shouldIncludePendingRunEventInFlush(event)).toBe(false);
  });

  it('returns true for group conversation when group flush is enabled', () => {
    const state = makeState({
      currentFlushSettings: {
        communicationDmFlushingEnabled: false,
        communicationGroupFlushingEnabled: true,
      },
    });
    const manager = createMessageManager(state, mockFormatter);
    const event = makeEvent({
      type: 'message:dummy',
      groupMetadata: { ConversationType: 'group' },
    });

    expect(manager.shouldIncludePendingRunEventInFlush(event)).toBe(true);
  });

  it('returns true for dm conversation when dm flush is enabled', () => {
    const state = makeState({
      currentFlushSettings: {
        communicationDmFlushingEnabled: true,
        communicationGroupFlushingEnabled: false,
      },
    });
    const manager = createMessageManager(state, mockFormatter);
    const event = makeEvent({ type: 'message:dummy', groupMetadata: { ConversationType: 'dm' } });

    expect(manager.shouldIncludePendingRunEventInFlush(event)).toBe(true);
  });
});
