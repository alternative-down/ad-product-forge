import { describe, expect, test, vi } from 'vitest';
import { createMessageManager, type MessageManagerState } from './agent-runner-messages.js';
import type { AgentWakeEvent } from '@forge-runtime/core';

function makeEvent(overrides: Partial<AgentWakeEvent> = {}): AgentWakeEvent {
  return {
    groupKey: 'group-' + Math.random(),
    type: 'message:user',
    timestamp: Date.now(),
    idempotencyKey: 'key-' + Math.random(),
    text: 'hello',
    originIdleOnly: false,
    idleOnly: false,
    ...overrides,
  };
}

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

describe('createMessageManager', () => {
  describe('appendPendingRunMessages', () => {
    test('adds event to pending map', () => {
      const state = makeState();
      const manager = createMessageManager(state, () => '');
      const event = makeEvent({ idempotencyKey: 'key-1', text: 'hello' });

      manager.appendPendingRunMessages([event]);

      expect(state.pendingRunMessages.size).toBe(1);
      expect(state.pendingRunMessages.get('key-1')?.text).toBe('hello');
    });

    test('skips events with idleOnly=true when allowIdleOnly=false', () => {
      const state = makeState();
      const manager = createMessageManager(state, () => '');
      const event = makeEvent({ idleOnly: true, text: 'idle msg' });

      manager.appendPendingRunMessages([event]);

      expect(state.pendingRunMessages.size).toBe(0);
    });

    test('adds events with idleOnly=true when allowIdleOnly=true', () => {
      const state = makeState();
      const manager = createMessageManager(state, () => '');
      const event = makeEvent({ idleOnly: true, text: 'idle msg' });

      manager.appendPendingRunMessages([event], { allowIdleOnly: true });

      expect(state.pendingRunMessages.size).toBe(1);
    });

    test('skips events with empty text', () => {
      const state = makeState();
      const manager = createMessageManager(state, () => '');
      const event = makeEvent({ text: '   \n  ' });

      manager.appendPendingRunMessages([event]);

      expect(state.pendingRunMessages.size).toBe(0);
    });

    test('skips events with whitespace-only text', () => {
      const state = makeState();
      const manager = createMessageManager(state, () => '');
      const event = makeEvent({ text: '' });

      manager.appendPendingRunMessages([event]);

      expect(state.pendingRunMessages.size).toBe(0);
    });

    test('sets originIdleOnly from idleOnly when not already set', () => {
      const state = makeState();
      const manager = createMessageManager(state, () => '');
      const event = makeEvent({ originIdleOnly: undefined as unknown as false, idleOnly: true });

      manager.appendPendingRunMessages([event], { allowIdleOnly: true });

      const stored = state.pendingRunMessages.get(event.idempotencyKey)!;
      expect(stored.originIdleOnly).toBe(true);
    });

    test('overrides originIdleOnly when allowIdleOnly=true', () => {
      const state = makeState();
      const manager = createMessageManager(state, () => '');
      const event = makeEvent({ originIdleOnly: false, idleOnly: true });

      manager.appendPendingRunMessages([event], { allowIdleOnly: true });

      const stored = state.pendingRunMessages.get(event.idempotencyKey)!;
      expect(stored.idleOnly).toBe(false);
    });

    test('updates existing event by idempotencyKey (deduplicates)', () => {
      const state = makeState();
      const manager = createMessageManager(state, () => '');
      const event1 = makeEvent({ idempotencyKey: 'dup-key', text: 'first' });
      const event2 = makeEvent({ idempotencyKey: 'dup-key', text: 'second' });

      manager.appendPendingRunMessages([event1]);
      manager.appendPendingRunMessages([event2]);

      expect(state.pendingRunMessages.size).toBe(1);
      expect(state.pendingRunMessages.get('dup-key')?.text).toBe('second');
    });
  });

  describe('shouldIncludePendingRunEventInFlush', () => {
    test('returns true for non-message event types', () => {
      const state = makeState();
      const manager = createMessageManager(state, () => '');
      const event = makeEvent({ type: 'wake:start', text: 'wake' });

      expect(manager.shouldIncludePendingRunEventInFlush(event)).toBe(true);
    });

    test('returns communicationGroupFlushingEnabled for group messages', () => {
      const state = makeState({
        currentFlushSettings: {
          communicationDmFlushingEnabled: true,
          communicationGroupFlushingEnabled: false,
        },
      });
      const manager = createMessageManager(state, () => '');
      const event = makeEvent({
        type: 'message:group',
        groupMetadata: { ConversationType: 'group' as const },
      });

      expect(manager.shouldIncludePendingRunEventInFlush(event)).toBe(false);
    });

    test('returns communicationDmFlushingEnabled for DM messages', () => {
      const state = makeState({
        currentFlushSettings: {
          communicationDmFlushingEnabled: false,
          communicationGroupFlushingEnabled: true,
        },
      });
      const manager = createMessageManager(state, () => '');
      const event = makeEvent({
        type: 'message:user',
        groupMetadata: { ConversationType: 'dm' as const },
      });

      expect(manager.shouldIncludePendingRunEventInFlush(event)).toBe(false);
    });

    test('returns true for group messages when group flushing enabled', () => {
      const state = makeState({
        currentFlushSettings: {
          communicationDmFlushingEnabled: false,
          communicationGroupFlushingEnabled: true,
        },
      });
      const manager = createMessageManager(state, () => '');
      const event = makeEvent({
        type: 'message:group',
        groupMetadata: { ConversationType: 'group' as const },
      });

      expect(manager.shouldIncludePendingRunEventInFlush(event)).toBe(true);
    });
  });

  describe('resetFlushedRunEventKeys', () => {
    test('clears flushedRunEventKeys and flushedRunEventKeyOrder', () => {
      const state = makeState({
        flushedRunEventKeys: new Set(['a', 'b']),
        flushedRunEventKeyOrder: ['a', 'b'],
      });
      const manager = createMessageManager(state, () => '');

      manager.resetFlushedRunEventKeys();

      expect(state.flushedRunEventKeys.size).toBe(0);
      expect(state.flushedRunEventKeyOrder).toEqual([]);
    });
  });

  describe('rememberFlushedRunEventKey', () => {
    test('adds key to Set and array', () => {
      const state = makeState();
      const manager = createMessageManager(state, () => '');

      manager.rememberFlushedRunEventKey('key-1');

      expect(state.flushedRunEventKeys.has('key-1')).toBe(true);
      expect(state.flushedRunEventKeyOrder).toContain('key-1');
    });

    test('ignores duplicate keys', () => {
      const state = makeState();
      const manager = createMessageManager(state, () => '');

      manager.rememberFlushedRunEventKey('dup');
      manager.rememberFlushedRunEventKey('dup');

      expect(state.flushedRunEventKeys.size).toBe(1);
      expect(state.flushedRunEventKeyOrder).toEqual(['dup']);
    });

    test('evicts oldest key when exceeding MAX_FLUSHED_RUN_EVENT_KEYS', () => {
      const state = makeState();
      const manager = createMessageManager(state, () => '');

      for (let i = 0; i < 2_005; i++) {
        manager.rememberFlushedRunEventKey(`key-${i}`);
      }

      expect(state.flushedRunEventKeys.size).toBe(2_000);
      expect(state.flushedRunEventKeys.has('key-0')).toBe(false);
      expect(state.flushedRunEventKeys.has('key-5')).toBe(true);
    });
  });

  describe('flushPendingRunMessages', () => {
    test('returns null when pending queue is empty', () => {
      const state = makeState();
      const manager = createMessageManager(state, () => 'formatted');

      const result = manager.flushPendingRunMessages();

      expect(result).toBeNull();
    });

    test('returns null when all events are already flushed', () => {
      const state = makeState({
        pendingRunMessages: new Map([['already-flushed', makeEvent({ idempotencyKey: 'already-flushed' })]]),
        flushedRunEventKeys: new Set(['already-flushed']),
        flushedRunEventKeyOrder: ['already-flushed'],
      });
      const manager = createMessageManager(state, () => 'formatted');

      const result = manager.flushPendingRunMessages();

      expect(result).toBeNull();
      expect(state.pendingRunMessages.size).toBe(0);
    });

    test('returns null when all events are deferred originIdleOnly', () => {
      const state = makeState({
        pendingRunMessages: new Map([['idle-event', makeEvent({ originIdleOnly: true })]]),
      });
      const manager = createMessageManager(state, () => 'formatted');

      const result = manager.flushPendingRunMessages();

      expect(result).toBeNull();
      // Deferred events stay in map
      expect(state.pendingRunMessages.size).toBe(1);
    });

    test('calls formatter with filtered events and returns formatted string', () => {
      const state = makeState();
      const formatMock = vi.fn().mockReturnValue('formatted-output');
      const manager = createMessageManager(state, formatMock);
      const event = makeEvent({ idempotencyKey: 'flush-me', text: 'hello' });
      manager.appendPendingRunMessages([event]);

      const result = manager.flushPendingRunMessages();

      expect(formatMock).toHaveBeenCalledOnce();
      expect(formatMock.mock.calls[0][0]).toHaveLength(1);
      expect(result).toBe('formatted-output');
    });

    test('sorts events by timestamp before formatting', () => {
      const state = makeState();
      const captured: AgentWakeEvent[][] = [];
      const manager = createMessageManager(state, (events) => {
        captured.push(events);
        return '';
      });
      const t1 = Date.now();
      const t2 = t1 + 100;
      const t3 = t1 + 50;
      manager.appendPendingRunMessages([makeEvent({ idempotencyKey: 'k1', timestamp: t1, text: 't1' })]);
      manager.appendPendingRunMessages([makeEvent({ idempotencyKey: 'k2', timestamp: t2, text: 't2' })]);
      manager.appendPendingRunMessages([makeEvent({ idempotencyKey: 'k3', timestamp: t3, text: 't3' })]);

      manager.flushPendingRunMessages();

      expect(captured[0].map((e) => e.idempotencyKey)).toEqual(['k1', 'k3', 'k2']);
    });

    test('clears pending queue after successful flush', () => {
      const state = makeState();
      const manager = createMessageManager(state, () => 'formatted');
      manager.appendPendingRunMessages([makeEvent({ idempotencyKey: 'e1', text: 'hello' })]);

      manager.flushPendingRunMessages();

      expect(state.pendingRunMessages.size).toBe(0);
    });

    test('calls rememberFlushedRunEventKey for each flushed event', () => {
      const state = makeState();
      const manager = createMessageManager(state, () => '');
      manager.appendPendingRunMessages([makeEvent({ idempotencyKey: 'k1', text: 'a' })]);
      manager.appendPendingRunMessages([makeEvent({ idempotencyKey: 'k2', text: 'b' })]);

      manager.flushPendingRunMessages();

      expect(state.flushedRunEventKeys.has('k1')).toBe(true);
      expect(state.flushedRunEventKeys.has('k2')).toBe(true);
    });

    test('respects flush settings for group messages', () => {
      const state = makeState({
        currentFlushSettings: {
          communicationDmFlushingEnabled: true,
          communicationGroupFlushingEnabled: false,
        },
      });
      const formatMock = vi.fn().mockReturnValue('formatted');
      const manager = createMessageManager(state, formatMock);
      const groupEvent = makeEvent({
        type: 'message:group',
        idempotencyKey: 'group-1',
        groupMetadata: { ConversationType: 'group' as const },
      });
      manager.appendPendingRunMessages([groupEvent]);

      manager.flushPendingRunMessages();

      expect(formatMock).not.toHaveBeenCalled();
      expect(state.pendingRunMessages.size).toBe(0);
    });

    test('allows originIdleOnly events when allowOriginIdleOnly=true', () => {
      const state = makeState();
      const formatMock = vi.fn().mockReturnValue('formatted');
      const manager = createMessageManager(state, formatMock);
      manager.appendPendingRunMessages(
        [makeEvent({ originIdleOnly: true, idleOnly: false, text: 'origin idle' })],
        { allowIdleOnly: true },
      );

      manager.flushPendingRunMessages({ allowOriginIdleOnly: true });

      expect(formatMock).toHaveBeenCalled();
    });
  });

  describe('updateFlushSettings', () => {
    test('updates currentFlushSettings', () => {
      const state = makeState({
        currentFlushSettings: {
          communicationDmFlushingEnabled: true,
          communicationGroupFlushingEnabled: true,
        },
      });
      const manager = createMessageManager(state, () => '');

      manager.updateFlushSettings({
        communicationDmFlushingEnabled: false,
        communicationGroupFlushingEnabled: false,
      });

      expect(state.currentFlushSettings.communicationDmFlushingEnabled).toBe(false);
      expect(state.currentFlushSettings.communicationGroupFlushingEnabled).toBe(false);
    });
  });

  describe('getPendingCount', () => {
    test('returns pendingRunMessages size', () => {
      const state = makeState();
      const manager = createMessageManager(state, () => '');
      manager.appendPendingRunMessages([makeEvent({ text: 'a' })]);
      manager.appendPendingRunMessages([makeEvent({ text: 'b' })]);
      manager.appendPendingRunMessages([makeEvent({ text: 'c' })]);

      expect(manager.getPendingCount()).toBe(3);
    });

    test('returns 0 when empty', () => {
      const state = makeState();
      const manager = createMessageManager(state, () => '');

      expect(manager.getPendingCount()).toBe(0);
    });
  });
});
