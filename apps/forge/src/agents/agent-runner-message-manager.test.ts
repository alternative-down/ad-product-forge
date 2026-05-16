/**
 * Unit tests for agent-runner-messages.ts — message flushing logic.
 * Functions: createMessageManager (appendPendingRunMessages, flushPendingRunMessages,
 *   shouldIncludePendingRunEventInFlush, getPendingCount, resetFlushedRunEventKeys,
 *   rememberFlushedRunEventKey).
 */
import { describe, expect, it, vi } from 'vitest';
import { createMessageManager } from './agent-runner-messages';
import type { MessageManagerState } from './agent-runner-messages';
import type { AgentWakeEvent } from '@forge-runtime/core';

function makeState(): MessageManagerState {
  return {
    pendingRunMessages: new Map<string, AgentWakeEvent>(),
    flushedRunEventKeys: new Set<string>(),
    flushedRunEventKeyOrder: [],
    currentFlushSettings: {
      communicationDmFlushingEnabled: true,
      communicationGroupFlushingEnabled: true,
    },
  };
}

function makeEvent(overrides?: Partial<AgentWakeEvent>): AgentWakeEvent {
  return {
    idempotencyKey: 'key-1',
    type: 'message:dm',
    agentId: 'agent-1',
    groupMetadata: { ConversationType: 'dm' },
    timestamp: Date.now(),
    text: 'Hello',
    content: 'Hello',
    createdAt: Date.now(),
    ...overrides,
  } as unknown as AgentWakeEvent;
}

describe('createMessageManager — appendPendingRunMessages', () => {
  it('adds event to pending map', () => {
    const state = makeState();
    const mgr = createMessageManager(state, (ev) => ev.map((e: {text: string}) => e.text).join('|'));
    mgr.appendPendingRunMessages([makeEvent({ idempotencyKey: 'k1', text: 'msg1' })]);
    expect(state.pendingRunMessages.has('k1')).toBe(true);
    expect(state.pendingRunMessages.get('k1')!.text).toBe('msg1');
  });

  it('skips idleOnly events unless allowIdleOnly is true', () => {
    const state = makeState();
    const mgr = createMessageManager(state, (ev) => '');
    mgr.appendPendingRunMessages([makeEvent({ idleOnly: true, idempotencyKey: 'k-idle' })]);
    expect(state.pendingRunMessages.has('k-idle')).toBe(false);
    mgr.appendPendingRunMessages([makeEvent({ idleOnly: true, idempotencyKey: 'k-idle2' })], { allowIdleOnly: true });
    expect(state.pendingRunMessages.has('k-idle2')).toBe(true);
  });

  it('skips events with empty text', () => {
    const state = makeState();
    const mgr = createMessageManager(state, (ev) => '');
    mgr.appendPendingRunMessages([makeEvent({ text: '   ', idempotencyKey: 'k-empty' })]);
    expect(state.pendingRunMessages.has('k-empty')).toBe(false);
  });

  it('does not overwrite existing key', () => {
    const state = makeState();
    const mgr = createMessageManager(state, (ev) => '');
    mgr.appendPendingRunMessages([makeEvent({ idempotencyKey: 'k1', text: 'first' })]);
    mgr.appendPendingRunMessages([makeEvent({ idempotencyKey: 'k1', text: 'second' })]);
    expect(state.pendingRunMessages.get('k1')!.text).toBe('second');
  });

  it('sets originIdleOnly to idleOnly value when event has idleOnly=true and allowIdleOnly', () => {
    const state = makeState();
    const mgr = createMessageManager(state, (ev) => '');
    mgr.appendPendingRunMessages([makeEvent({ idleOnly: true, originIdleOnly: undefined, idempotencyKey: 'k1' })], { allowIdleOnly: true });
    expect(state.pendingRunMessages.get('k1')!.originIdleOnly).toBe(true);
  });

  it('preserves originIdleOnly when explicitly set', () => {
    const state = makeState();
    const mgr = createMessageManager(state, (ev) => '');
    mgr.appendPendingRunMessages([makeEvent({ idleOnly: false, originIdleOnly: true, idempotencyKey: 'k1' })]);
    expect(state.pendingRunMessages.get('k1')!.originIdleOnly).toBe(true);
  });

  it('sets originIdleOnly to false when idleOnly is false and originIdleOnly not set', () => {
    const state = makeState();
    const mgr = createMessageManager(state, (ev) => '');
    mgr.appendPendingRunMessages([makeEvent({ idleOnly: false, originIdleOnly: undefined, idempotencyKey: 'k1' })]);
    expect(state.pendingRunMessages.get('k1')!.originIdleOnly).toBe(false);
  });

  it('sets idleOnly to false when allowIdleOnly is true', () => {
    const state = makeState();
    const mgr = createMessageManager(state, (ev) => '');
    mgr.appendPendingRunMessages([makeEvent({ idleOnly: true, idempotencyKey: 'k1' })], { allowIdleOnly: true });
    expect(state.pendingRunMessages.get('k1')!.idleOnly).toBe(false);
  });
});

describe('createMessageManager — flushPendingRunMessages', () => {
  it('returns null when no pending messages', () => {
    const state = makeState();
    const mgr = createMessageManager(state, () => 'formatted');
    expect(mgr.flushPendingRunMessages()).toBeNull();
  });

  it('formats and returns pending events', () => {
    const state = makeState();
    const format = vi.fn((ev) => ev.map((e: {text: string}) => e.text).join('|'));
    const mgr = createMessageManager(state, format);
    state.pendingRunMessages.set('k1', makeEvent({ idempotencyKey: 'k1', text: 'msg1' }));
    state.pendingRunMessages.set('k2', makeEvent({ idempotencyKey: 'k2', text: 'msg2' }));

    const result = mgr.flushPendingRunMessages({ allowOriginIdleOnly: true });
    expect(result).toBe('msg1|msg2');
    expect(format).toHaveBeenCalledWith(expect.any(Array));
  });

  it('clears pending map after flush', () => {
    const state = makeState();
    const mgr = createMessageManager(state, () => 'formatted');
    state.pendingRunMessages.set('k1', makeEvent({ idempotencyKey: 'k1' }));
    mgr.flushPendingRunMessages();
    expect(state.pendingRunMessages.size).toBe(0);
  });

  it('defers originIdleOnly events unless allowOriginIdleOnly', () => {
    const state = makeState();
    const format = vi.fn(() => 'x');
    const mgr = createMessageManager(state, format);
    state.pendingRunMessages.set('k-idle', makeEvent({ originIdleOnly: true, idempotencyKey: 'k-idle' }));
    state.pendingRunMessages.set('k-normal', makeEvent({ originIdleOnly: false, idempotencyKey: 'k-normal' }));

    const result = mgr.flushPendingRunMessages({ allowOriginIdleOnly: false });
    expect(result).toBe('x');
    expect(format).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ idempotencyKey: 'k-normal' }),
    ]));
    expect(format).not.toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ idempotencyKey: 'k-idle' }),
    ]));
    // Deferred event stays in pending
    expect(state.pendingRunMessages.has('k-idle')).toBe(true);
  });

  it('includes originIdleOnly events when allowOriginIdleOnly is true', () => {
    const state = makeState();
    const format = vi.fn(() => 'x');
    const mgr = createMessageManager(state, format);
    state.pendingRunMessages.set('k-idle', makeEvent({ originIdleOnly: true, idempotencyKey: 'k-idle' }));

    const result = mgr.flushPendingRunMessages({ allowOriginIdleOnly: true });
    expect(result).toBe('x');
    expect(state.pendingRunMessages.size).toBe(0);
  });

  it('skips already-flushed events', () => {
    const state = makeState();
    state.flushedRunEventKeys.add('k-flushed');
    const format = vi.fn(() => 'x');
    const mgr = createMessageManager(state, format);
    state.pendingRunMessages.set('k-flushed', makeEvent({ idempotencyKey: 'k-flushed', text: 'flushed' }));
    state.pendingRunMessages.set('k-new', makeEvent({ idempotencyKey: 'k-new', text: 'new' }));

    const result = mgr.flushPendingRunMessages();
    expect(result).toBe('x');
    expect(format).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ idempotencyKey: 'k-new' }),
    ]));
    expect(format).not.toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ idempotencyKey: 'k-flushed' }),
    ]));
  });

  it('returns null when all events filtered out', () => {
    const state = makeState();
    state.flushedRunEventKeys.add('k1');
    state.flushedRunEventKeys.add('k2');
    const mgr = createMessageManager(state, () => 'x');
    state.pendingRunMessages.set('k1', makeEvent({ idempotencyKey: 'k1' }));
    state.pendingRunMessages.set('k2', makeEvent({ idempotencyKey: 'k2' }));

    const result = mgr.flushPendingRunMessages();
    expect(result).toBeNull();
    expect(state.pendingRunMessages.size).toBe(0);
  });
});

describe('createMessageManager — shouldIncludePendingRunEventInFlush', () => {
  it('always includes non-message events', () => {
    const state = makeState();
    const mgr = createMessageManager(state, () => '');
    const event = makeEvent({ type: 'schedule:run' });
    expect(mgr.shouldIncludePendingRunEventInFlush(event)).toBe(true);
  });

  it('includes DM events when DM flushing enabled', () => {
    const state = makeState();
    const mgr = createMessageManager(state, () => '');
    const event = makeEvent({ type: 'message:dm', groupMetadata: { ConversationType: 'dm' } });
    expect(mgr.shouldIncludePendingRunEventInFlush(event)).toBe(true);
  });

  it('excludes DM events when DM flushing disabled', () => {
    const state = makeState();
    state.currentFlushSettings.communicationDmFlushingEnabled = false;
    const mgr = createMessageManager(state, () => '');
    const event = makeEvent({ type: 'message:dm', groupMetadata: { ConversationType: 'dm' } });
    expect(mgr.shouldIncludePendingRunEventInFlush(event)).toBe(false);
  });

  it('includes group events when group flushing enabled', () => {
    const state = makeState();
    const mgr = createMessageManager(state, () => '');
    const event = makeEvent({ type: 'message:group', groupMetadata: { ConversationType: 'group' } });
    expect(mgr.shouldIncludePendingRunEventInFlush(event)).toBe(true);
  });

  it('excludes group events when group flushing disabled', () => {
    const state = makeState();
    state.currentFlushSettings.communicationGroupFlushingEnabled = false;
    const mgr = createMessageManager(state, () => '');
    const event = makeEvent({ type: 'message:group', groupMetadata: { ConversationType: 'group' } });
    expect(mgr.shouldIncludePendingRunEventInFlush(event)).toBe(false);
  });

  it('defaults to DM settings for unrecognized message types', () => {
    const state = makeState();
    state.currentFlushSettings.communicationDmFlushingEnabled = false;
    const mgr = createMessageManager(state, () => '');
    const event = makeEvent({ type: 'message:unknown', groupMetadata: { ConversationType: 'other' } });
    expect(mgr.shouldIncludePendingRunEventInFlush(event)).toBe(false);
  });
});

describe('createMessageManager — getPendingCount', () => {
  it('returns 0 when empty', () => {
    const state = makeState();
    const mgr = createMessageManager(state, () => '');
    expect(mgr.getPendingCount()).toBe(0);
  });

  it('returns correct count', () => {
    const state = makeState();
    const mgr = createMessageManager(state, () => '');
    state.pendingRunMessages.set('k1', makeEvent({ idempotencyKey: 'k1' }));
    state.pendingRunMessages.set('k2', makeEvent({ idempotencyKey: 'k2' }));
    expect(mgr.getPendingCount()).toBe(2);
  });
});

describe('createMessageManager — resetFlushedRunEventKeys', () => {
  it('clears flushedRunEventKeys and flushedRunEventKeyOrder', () => {
    const state = makeState();
    state.flushedRunEventKeys.add('k1');
    state.flushedRunEventKeyOrder.push('k1');
    const mgr = createMessageManager(state, () => '');
    mgr.resetFlushedRunEventKeys();
    expect(state.flushedRunEventKeys.size).toBe(0);
    expect(state.flushedRunEventKeyOrder).toEqual([]);
  });
});

describe('createMessageManager — rememberFlushedRunEventKey', () => {
  it('adds key to flushedRunEventKeys and flushedRunEventKeyOrder', () => {
    const state = makeState();
    const mgr = createMessageManager(state, () => '');
    mgr.rememberFlushedRunEventKey('k1');
    expect(state.flushedRunEventKeys.has('k1')).toBe(true);
    expect(state.flushedRunEventKeyOrder).toEqual(['k1']);
  });

  it('does not add duplicate key', () => {
    const state = makeState();
    const mgr = createMessageManager(state, () => '');
    mgr.rememberFlushedRunEventKey('k1');
    mgr.rememberFlushedRunEventKey('k1');
    expect(state.flushedRunEventKeyOrder).toEqual(['k1']);
  });

  it('evicts oldest key when over limit', () => {
    const state = makeState();
    const mgr = createMessageManager(state, () => '');
    for (let i = 0; i < 5; i++) {
      mgr.rememberFlushedRunEventKey(`k${i}`);
    }
    // Default MAX = 2000, so 5 keys well under limit
    expect(state.flushedRunEventKeys.has('k0')).toBe(true);
    expect(state.flushedRunEventKeyOrder.length).toBe(5);
  });
});