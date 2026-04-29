import { describe, expect, it } from 'vitest';
import type { AgentWakeEvent } from '@forge-runtime/core';
import { RUN_STOP_REMINDER, formatPendingRunEvents } from './agent-runner-wake';

function makeEvent(overrides: Partial<AgentWakeEvent>): AgentWakeEvent {
  return {
    type: 'message:chat',
    groupKey: 'conv_abc123',
    idempotencyKey: 'msg_xyz',
    timestamp: 1746000000000,
    text: 'Hello world',
    ...overrides,
  };
}

describe('agent-runner-wake', () => {
  describe('RUN_STOP_REMINDER', () => {
    it('is a non-empty string', () => {
      expect(typeof RUN_STOP_REMINDER).toBe('string');
      expect(RUN_STOP_REMINDER.length).toBeGreaterThan(0);
    });

    it('contains the STOP_AND_IDLE instruction', () => {
      expect(RUN_STOP_REMINDER).toContain('STOP_AND_IDLE');
    });

    it('mentions send_message as the delivery confirmation', () => {
      expect(RUN_STOP_REMINDER).toContain('send_message');
    });
  });

  describe('formatPendingRunEvents', () => {
    it('returns empty string for empty events array', () => {
      expect(formatPendingRunEvents([])).toBe('');
    });

    it('formats a single event with timestamp and text', () => {
      const event = makeEvent({ timestamp: 1746000000000, text: 'Hello there' });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('Hello there');
      expect(result).toContain('[08:00]');
    });

    it('groups events with the same groupKey together', () => {
      const ts1 = 1746000000000;
      const ts2 = 1746000001000;
      const events = [
        makeEvent({ groupKey: 'conv_abc', timestamp: ts2, text: 'Second' }),
        makeEvent({ groupKey: 'conv_abc', timestamp: ts1, text: 'First' }),
      ];
      const result = formatPendingRunEvents(events);
      expect(result).toContain('First');
      expect(result).toContain('Second');
    });

    it('separates events with different groupKeys', () => {
      const events = [
        makeEvent({ groupKey: 'conv_abc', timestamp: 1000, text: 'Group A' }),
        makeEvent({ groupKey: 'conv_xyz', timestamp: 2000, text: 'Group B' }),
      ];
      const result = formatPendingRunEvents(events);
      expect(result).toContain('Group A');
      expect(result).toContain('Group B');
    });

    it('sorts events within a group by timestamp ascending', () => {
      const events = [
        makeEvent({ groupKey: 'conv_abc', timestamp: 1746000003000, text: 'Third' }),
        makeEvent({ groupKey: 'conv_abc', timestamp: 1746000001000, text: 'First' }),
        makeEvent({ groupKey: 'conv_abc', timestamp: 1746000002000, text: 'Second' }),
      ];
      const result = formatPendingRunEvents(events);
      const firstIdx = result.indexOf('First');
      const secondIdx = result.indexOf('Second');
      const thirdIdx = result.indexOf('Third');
      expect(firstIdx).toBeLessThan(secondIdx);
      expect(secondIdx).toBeLessThan(thirdIdx);
    });

    it('includes provider in group header for message events', () => {
      const event = makeEvent({
        groupMetadata: { Provider: 'whatsapp', TargetKey: 'conv_abc' },
      });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('provider: whatsapp');
      expect(result).toContain('targetKey: abc');
    });

    it('normalizes conv_ prefix from targetKey', () => {
      const event = makeEvent({
        groupKey: 'conv_abc123',
        groupMetadata: { TargetKey: 'conv_abc123' },
      });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('targetKey: abc123');
    });

    it('normalizes msg_ prefix from messageId', () => {
      const event = makeEvent({
        itemMetadata: { MessageId: 'msg_12345' },
        text: 'Test message',
      });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('[messageId: 12345]');
    });

    it('includes conversationType: group for group conversations', () => {
      const event = makeEvent({
        groupMetadata: {
          Provider: 'telegram',
          TargetKey: 'conv_abc',
          ConversationType: 'group',
        },
      });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('conversationType: group');
    });

    it('includes participants in group header', () => {
      const event = makeEvent({
        groupMetadata: {
          Provider: 'slack',
          TargetKey: 'conv_abc',
          Participants: 'john, jane, bob',
        },
      });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('participants: john, jane, bob');
    });

    it('includes conversationName in group header', () => {
      const event = makeEvent({
        groupMetadata: {
          Provider: 'telegram',
          TargetKey: 'conv_abc',
          ConversationName: 'Team Chat',
        },
      });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('conversationName: Team Chat');
    });

    it('describes GitHub events with Source metadata', () => {
      const event = makeEvent({
        type: 'github:push',
        groupKey: 'github-push',
        groupMetadata: { Source: 'github', EventType: 'push' },
        itemMetadata: { Author: 'Alice', AuthorKey: 'alice' },
        text: 'New push',
      });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('GitHub: push');
    });

    it('describes GitHub events by type prefix without Source', () => {
      const event = makeEvent({
        type: 'github:pull_request',
        groupKey: 'github-pr',
        groupMetadata: { EventType: 'pull_request' },
        text: 'PR opened',
      });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('GitHub: pull_request');
    });

    it('describes heartbeat schedule events as "scheduler"', () => {
      const event = makeEvent({
        type: 'schedule',
        groupKey: 'heartbeat-1',
        groupMetadata: { ScheduleKind: 'heartbeat' },
      });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('scheduler');
    });

    it('describes schedule with ScheduleId in group header', () => {
      const event = makeEvent({
        type: 'schedule',
        groupKey: 'scheduled-1',
        groupMetadata: { ScheduleId: 'cron-123', ScheduleKind: 'cron' },
      });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('scheduler: cron-123');
    });

    it('describes role-change events', () => {
      const event = makeEvent({
        type: 'role-change',
        groupKey: 'role-abc',
        groupMetadata: { TargetAgentId: 'agent-1' },
      });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('Role change: agent-1');
    });

    it('describes runner-reminder events', () => {
      const event = makeEvent({
        type: 'runner-reminder',
        groupKey: 'reminder-1',
      });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('System: runner-reminder');
    });

    it('shows "scheduler" as group label for schedule events (not "System")', () => {
      const event = makeEvent({
        type: 'schedule',
        groupKey: 'scheduled-1',
        text: 'Scheduled task',
        timestamp: 1746000000000,
      });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('scheduler');
      // describeWakeActor returns '' for schedule events, so no "System" label
      expect(result).not.toMatch(/\[08:00\] System/);
    });

    it('includes actor name and key in event item', () => {
      const event = makeEvent({
        itemMetadata: { Author: 'John Doe', AuthorKey: 'john.doe@example.com' },
        text: 'Hello world',
        timestamp: 1746000000000,
      });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('John Doe (john.doe@example.com)');
    });

    it('shows actor name without key if key is absent', () => {
      const event = makeEvent({
        itemMetadata: { Author: 'Jane' },
        text: 'Hi',
        timestamp: 1746000000000,
      });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('Jane');
      expect(result).not.toContain('Jane (');
    });

    it('includes attachments suffix when present', () => {
      const event = makeEvent({
        itemMetadata: { Author: 'Alice', Attachments: 'file.pdf, image.png' },
        text: 'See files',
        timestamp: 1746000000000,
      });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('(attachments: file.pdf, image.png)');
    });

    it('handles multi-line event text with actor', () => {
      const event = makeEvent({
        itemMetadata: { Author: 'Bob' },
        text: 'Line one\nLine two\nLine three',
        timestamp: 1746000000000,
      });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('Line one');
      expect(result).toContain('Line two');
      expect(result).toContain('Line three');
    });

    it('handles multi-line event text without actor', () => {
      const event = makeEvent({
        itemMetadata: {},
        text: 'Multi\nLine\nText',
        timestamp: 1746000000000,
      });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('Multi');
    });

    it('includes timestamp in HH:MM format', () => {
      const event = makeEvent({
        timestamp: new Date(2025, 3, 29, 14, 30).getTime(),
        text: 'Afternoon message',
      });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('[14:30]');
    });

    it('formats time with leading zeros', () => {
      const event = makeEvent({
        timestamp: new Date(2025, 3, 29, 8, 5).getTime(),
        text: 'Morning message',
      });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('[08:05]');
    });

    it('falls back to formatWakeLabel for unrecognized event types', () => {
      const event = makeEvent({
        type: 'custom_unknown_event',
        groupKey: 'unknown-key',
        text: 'Custom',
      });
      const result = formatPendingRunEvents([event]);
      // formatWakeLabel converts 'custom_unknown_event' -> 'custom unknown event'
      expect(result).toContain('custom unknown event');
      expect(result).toContain('unknown-key');
    });

    it('handles dash in event type as space in fallback', () => {
      const event = makeEvent({
        type: 'my-custom-type',
        groupKey: 'x',
        text: '',
      });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('my custom type: x');
    });

    it('handles colon in event type as space in fallback', () => {
      const event = makeEvent({
        type: 'my:custom:type',
        groupKey: 'y',
        text: '',
      });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('my custom type: y');
    });
  });

  describe('normalizeProviderCode', () => {
    it('removes conv_ prefix from targetKey', () => {
      const event = makeEvent({
        groupMetadata: { TargetKey: 'conv_abc' },
      });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('targetKey: abc');
    });

    it('removes msg_ prefix from messageId', () => {
      const event = makeEvent({
        itemMetadata: { MessageId: 'msg_12345' },
        text: 'Test',
      });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('[messageId: 12345]');
    });

    it('leaves plain codes unchanged', () => {
      const event = makeEvent({
        groupMetadata: { TargetKey: 'abc123' },
      });
      const result = formatPendingRunEvents([event]);
      expect(result).toContain('targetKey: abc123');
    });
  });
});
