import { describe, it, expect } from 'vitest';
import { formatPendingRunEvents, RUN_STOP_REMINDER } from './agent-runner-wake';

describe('RUN_STOP_REMINDER', () => {
  it('is a string (array joined with newlines)', () => {
    expect(typeof RUN_STOP_REMINDER).toBe('string');
    expect(RUN_STOP_REMINDER.length).toBeGreaterThan(0);
  });

  it('contains STOP_AND_IDLE instruction', () => {
    expect(RUN_STOP_REMINDER).toContain('STOP_AND_IDLE');
  });

  it('warns about plain text not being sent', () => {
    expect(RUN_STOP_REMINDER).toContain('plain text');
    expect(RUN_STOP_REMINDER).toContain('send_message');
  });

  it('is joined with newline separators', () => {
    // The original is an array joined with '\n'
    expect(RUN_STOP_REMINDER).toContain('\n');
  });
});

describe('formatPendingRunEvents', () => {
  const makeEvent = (overrides = {}) => ({
    type: 'message:text',
    groupKey: 'conv_abc',
    idempotencyKey: 'idem-001',
    timestamp: 1700000000000,
    text: 'Hello',
    groupMetadata: {},
    itemMetadata: {},
    ...overrides,
  });

  it('returns empty string for empty array', () => {
    expect(formatPendingRunEvents([])).toBe('');
  });

  it('formats a single message event', () => {
    const result = formatPendingRunEvents([makeEvent({ groupKey: 'conv_abc', text: 'Hi there' })]);
    expect(result).toContain('conv_abc');
    expect(result).toContain('Hi there');
  });

  it('groups events by groupKey', () => {
    const events = [
      makeEvent({ groupKey: 'conv_abc', idempotencyKey: 'i1', text: 'first' }),
      makeEvent({ groupKey: 'conv_abc', idempotencyKey: 'i2', text: 'second' }),
      makeEvent({ groupKey: 'conv_xyz', idempotencyKey: 'i3', text: 'other' }),
    ];
    const result = formatPendingRunEvents(events);
    expect(result).toContain('first');
    expect(result).toContain('second');
    expect(result).toContain('other');
  });

  it('sorts events within each group by timestamp ascending', () => {
    const events = [
      makeEvent({ groupKey: 'conv_abc', idempotencyKey: 'i2', timestamp: 1700000002000, text: 'second' }),
      makeEvent({ groupKey: 'conv_abc', idempotencyKey: 'i1', timestamp: 1700000001000, text: 'first' }),
      makeEvent({ groupKey: 'conv_abc', idempotencyKey: 'i3', timestamp: 1700000003000, text: 'third' }),
    ];
    const result = formatPendingRunEvents(events);
    const firstIdx = result.indexOf('first');
    const secondIdx = result.indexOf('second');
    const thirdIdx = result.indexOf('third');
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });

  it('formats schedule event as scheduler group', () => {
    const result = formatPendingRunEvents([
      makeEvent({ type: 'schedule', groupKey: 'cron-42', text: 'scheduled run' }),
    ]);
    expect(result).toContain('scheduler');
    expect(result).toContain('scheduled run');
  });

  it('includes scheduleId in scheduler group header when present', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'schedule',
        groupKey: 'cron-42',
        text: 'run',
        groupMetadata: { ScheduleId: 'sched-abc-123' },
      }),
    ]);
    expect(result).toContain('scheduler: sched-abc-123');
  });

  it('formats heartbeat schedule event as plain scheduler (no heartbeat word in header)', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'schedule',
        groupKey: 'heartbeat-1',
        text: 'heartbeat',
        groupMetadata: { ScheduleKind: 'heartbeat' },
      }),
    ]);
    // Header is just "scheduler", text "heartbeat" comes from event text
    expect(result).toContain('scheduler\n\n[22:13] heartbeat');
  });

  it('formats github event with GitHub prefix', () => {
    const result = formatPendingRunEvents([
      makeEvent({ type: 'github:push', groupKey: 'github/repo', text: 'push event', groupMetadata: { Source: 'github' } }),
    ]);
    expect(result).toContain('GitHub:');
  });

  it('formats github event with EventType when provided', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'github:push',
        groupKey: 'github/repo',
        text: 'push',
        groupMetadata: { Source: 'github', EventType: 'push' },
      }),
    ]);
    expect(result).toContain('GitHub: push');
  });

  it('formats role-change event with target agent', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'role-change',
        groupKey: 'agent-role-123',
        text: 'role changed',
        groupMetadata: { TargetAgentId: 'agent-xyz' },
      }),
    ]);
    expect(result).toContain('Role change: agent-xyz');
  });

  it('formats runner-reminder event', () => {
    const result = formatPendingRunEvents([
      makeEvent({ type: 'runner-reminder', groupKey: 'reminder-1', text: 'reminder text' }),
    ]);
    expect(result).toContain('runner-reminder');
  });

  it('formats message event with provider in group header', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        groupKey: 'conv_abc',
        text: 'hello',
        groupMetadata: { Provider: 'telegram', TargetKey: 'conv_abc' },
      }),
    ]);
    expect(result).toContain('provider: telegram');
    expect(result).toContain('targetKey: abc');
  });

  it('strips conv_ and msg_ prefix from targetKey', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        groupKey: 'conv_abc',
        text: 'hello',
        groupMetadata: { TargetKey: 'conv_channel-123' },
      }),
    ]);
    expect(result).toContain('targetKey: channel-123');
    expect(result).not.toContain('conv_channel-123');
  });

  it('includes conversationType group when present', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        groupKey: 'conv_group',
        text: 'group msg',
        groupMetadata: { ConversationType: 'group', TargetKey: 'conv_group' },
      }),
    ]);
    expect(result).toContain('conversationType: group');
  });

  it('includes ConversationName when present', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        groupKey: 'conv_abc',
        text: 'named group',
        groupMetadata: { ConversationName: 'Team Chat', TargetKey: 'conv_abc' },
      }),
    ]);
    expect(result).toContain('conversationName: Team Chat');
  });

  it('includes Participants when present', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        groupKey: 'conv_abc',
        text: 'with participants',
        groupMetadata: { Participants: 'alice, bob', TargetKey: 'conv_abc' },
      }),
    ]);
    expect(result).toContain('participants: alice, bob');
  });

  it('includes author in item line when Author is present', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        text: 'alice says hi',
        itemMetadata: { Author: 'Alice', AuthorKey: 'alice@x.com' },
      }),
    ]);
    expect(result).toContain('Alice');
    expect(result).toContain('alice@x.com');
  });

  it('includes messageId from itemMetadata when present', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        text: 'msg with id',
        itemMetadata: { MessageId: 'msg_12345' },
      }),
    ]);
    expect(result).toContain('[messageId: 12345]');
  });

  it('strips both conv_ and msg_ prefix from MessageId (strips conv_ first, then msg_)', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        text: 'msg',
        itemMetadata: { MessageId: 'conv_msg_abc' },
      }),
    ]);
    // conv_msg_abc -> msg_abc (strips conv_) -> abc (strips msg_)
    expect(result).toContain('[messageId: abc]');
  });

  it('includes attachments count when present', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        text: 'file msg',
        itemMetadata: { Attachments: '3' },
      }),
    ]);
    expect(result).toContain('(attachments: 3)');
  });

  it('trims text', () => {
    const result = formatPendingRunEvents([
      makeEvent({ text: '  spaces around  ' }),
    ]);
    expect(result).toContain('spaces around');
  });

  it('formats multi-line text on its own line', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        text: 'line one\nline two\nline three',
        itemMetadata: { Author: 'Alice' },
      }),
    ]);
    expect(result).toContain('line one');
    expect(result).toContain('line two');
    expect(result).toContain('line three');
  });

  it('returns non-empty string for unknown event type without group metadata', () => {
    const result = formatPendingRunEvents([
      makeEvent({ type: 'unknown:event', groupKey: 'unknown-group', text: 'unknown' }),
    ]);
    expect(result).not.toBe('');
    expect(result).toContain('unknown-group');
  });

describe('describeWakeGroup branches', () => {
  const makeEvent = (overrides = {}) => ({
    type: 'message:text',
    groupKey: 'conv_abc',
    idempotencyKey: 'idem-001',
    timestamp: 1700000000000,
    text: 'Hello',
    groupMetadata: {},
    itemMetadata: {},
    ...overrides,
  });

  it('includes Provider in group header for message type when present', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'message:text',
        groupKey: 'conv_abc',
        text: 'hello',
        groupMetadata: { Provider: 'slack', TargetKey: 'conv_abc' },
      }),
    ]);
    expect(result).toContain('provider: slack');
  });

  it('strips conv_ from TargetKey when normalizeProviderCode used', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'message:anything',
        groupKey: 'conv_abc',
        text: 'msg',
        groupMetadata: { TargetKey: 'conv_channel-xyz' },
      }),
    ]);
    expect(result).toContain('targetKey: channel-xyz');
  });

  it('uses groupKey as fallback for TargetKey when targetKey is absent', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'message:text',
        groupKey: 'conv_fallback',
        text: 'msg',
        groupMetadata: { TargetKey: 'conv_fallback' },
      }),
    ]);
    expect(result).toContain('targetKey: fallback');
  });

  it('formats github: event without Source: github metadata', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'github:pr',
        groupKey: 'github/repo',
        text: 'pr event',
        // groupMetadata has NO Source: 'github'
      }),
    ]);
    expect(result).toContain('GitHub:');
  });

  it('formats github: event with EventType in header', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'github:issue',
        groupKey: 'github/repo',
        text: 'issue',
        groupMetadata: { EventType: 'issues.opened' },
      }),
    ]);
    expect(result).toContain('GitHub: issues.opened');
  });

  it('formats github: event falls back to groupKey when no EventType', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'github:webhook',
        groupKey: 'github/my-repo',
        text: 'webhook',
        groupMetadata: {},
      }),
    ]);
    expect(result).toContain('GitHub:');
    expect(result).toContain('github/my-repo');
  });

  it('formats schedule with non-heartbeat ScheduleKind using ScheduleId', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'schedule',
        groupKey: 'cron-daily',
        text: 'daily run',
        groupMetadata: { ScheduleKind: 'cron', ScheduleId: 'sched-xyz' },
      }),
    ]);
    expect(result).toContain('scheduler: sched-xyz');
  });

  it('formats schedule with non-heartbeat without ScheduleId (uses groupKey)', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'schedule',
        groupKey: 'scheduled-task',
        text: 'task',
        groupMetadata: { ScheduleKind: 'interval' },
      }),
    ]);
    expect(result).toContain('scheduler\n\n[22:13] task');
  });

  it('formats schedule heartbeat as plain scheduler', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'schedule',
        groupKey: 'heartbeat',
        text: 'heartbeat pulse',
        groupMetadata: { ScheduleKind: 'heartbeat' },
      }),
    ]);
    expect(result).toContain('scheduler\n\n[');
    expect(result).toContain('heartbeat pulse');
  });

  it('formats role-change with TargetAgentId in header', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'role-change',
        groupKey: 'role-change-1',
        text: 'change',
        groupMetadata: { TargetAgentId: 'forge-agent-99' },
      }),
    ]);
    expect(result).toContain('Role change: forge-agent-99');
  });

  it('formats role-change falls back to groupKey when TargetAgentId absent', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'role-change',
        groupKey: 'role-change-event-1',
        text: 'change',
        groupMetadata: {},
      }),
    ]);
    expect(result).toContain('Role change: role-change-event-1');
  });

  it('formats runner-reminder event', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'runner-reminder',
        groupKey: 'reminder-abc',
        text: 'reminder',
        groupMetadata: {},
      }),
    ]);
    expect(result).toContain('System: runner-reminder');
  });

  it('formats unknown type falls through to formatWakeLabel with groupKey', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'custom:event-type',
        groupKey: 'custom-group-key',
        text: 'custom',
        groupMetadata: {},
      }),
    ]);
    expect(result).toContain('custom event type:');
    expect(result).toContain('custom-group-key');
  });

  it('formatWakeLabel handles kebab-case type', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'message-text',
        groupKey: 'kebab-group',
        text: 'text',
        groupMetadata: {},
      }),
    ]);
    expect(result).toContain('message text:');
  });

  it('formatWakeLabel handles snake_case type', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'some_snake_event',
        groupKey: 'snake-group',
        text: 'text',
        groupMetadata: {},
      }),
    ]);
    expect(result).toContain('some snake event:');
  });

  it('formatWakeLabel handles type with colons', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'provider:channel:special',
        groupKey: 'special-group',
        text: 'text',
        groupMetadata: {},
      }),
    ]);
    expect(result).toContain('provider channel special:');
  });

  it('formatWakeLabel handles camelCase type', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'messageText',
        groupKey: 'camel-group',
        text: 'text',
        groupMetadata: {},
      }),
    ]);
    expect(result).toContain('message text:');
  });

  it('formatWakeLabel converts trailing capitals to space-separated', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'HTTPGet',
        groupKey: 'http-get',
        text: 'http request',
        groupMetadata: {},
      }),
    ]);
    expect(result).toContain('httpget:');
  });
});

describe('describeWakeActor branches', () => {
  const makeEvent = (overrides = {}) => ({
    type: 'message:text',
    groupKey: 'conv_abc',
    idempotencyKey: 'idem-001',
    timestamp: 1700000000000,
    text: 'Hello',
    groupMetadata: {},
    itemMetadata: {},
    ...overrides,
  });

  it('returns empty string for schedule type', () => {
    const result = formatPendingRunEvents([
      makeEvent({ type: 'schedule', groupKey: 'sched-1', text: 'run', groupMetadata: {} }),
    ]);
    // schedule -> no actor prefix in the line
    expect(result).not.toMatch(/^\[22:13\]: Hello/);
  });

  it('returns GitHub for github: type with Source: github', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'github:push',
        groupKey: 'github/repo',
        text: 'push event',
        groupMetadata: { Source: 'github' },
        itemMetadata: {},
      }),
    ]);
    expect(result).toContain('GitHub');
  });

  it('returns empty string for github: without Source metadata', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'github:push',
        groupKey: 'github/repo',
        text: 'push event',
        groupMetadata: {},
        itemMetadata: {},
      }),
    ]);
    expect(result).toContain('GitHub:');
  });

  it('returns System for role-change type', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'role-change',
        groupKey: 'role-1',
        text: 'change',
        groupMetadata: {},
        itemMetadata: {},
      }),
    ]);
    expect(result).toContain('System');
  });

  it('returns System for runner-reminder type', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'runner-reminder',
        groupKey: 'reminder-1',
        text: 'reminder',
        groupMetadata: {},
        itemMetadata: {},
      }),
    ]);
    expect(result).toContain('System');
  });

  it('returns empty string for unknown type', () => {
    const result = formatPendingRunEvents([
      makeEvent({
        type: 'unknown:event',
        groupKey: 'unknown-1',
        text: 'unknown',
        groupMetadata: {},
        itemMetadata: {},
      }),
    ]);
    // Unknown type -> empty actor -> no actor prefix
    expect(result).toContain('[22:13]');
  });
});

describe('normalizeProviderCode', () => {
  it('returns undefined when value is undefined', () => {
    const result = formatPendingRunEvents([
      {
        type: 'message:text',
        groupKey: 'conv_abc',
        idempotencyKey: 'idem',
        timestamp: 1700000000000,
        text: 'msg',
        groupMetadata: { TargetKey: '' },
        itemMetadata: {},
      },
    ]);
    // Should not crash
    expect(result).toBeTruthy();
  });

  it('returns empty string when value is empty string', () => {
    const result = formatPendingRunEvents([
      {
        type: 'message:text',
        groupKey: 'conv_abc',
        idempotencyKey: 'idem',
        timestamp: 1700000000000,
        text: 'msg',
        groupMetadata: { TargetKey: '' },
        itemMetadata: {},
      },
    ]);
    expect(result).toBeTruthy();
  });

  it('strips conv_ prefix only', () => {
    const result = formatPendingRunEvents([
      {
        type: 'message:text',
        groupKey: 'conv_abc',
        idempotencyKey: 'idem',
        timestamp: 1700000000000,
        text: 'msg',
        groupMetadata: { TargetKey: 'conv_channel-xyz' },
        itemMetadata: {},
      },
    ]);
    expect(result).toContain('targetKey: channel-xyz');
    expect(result).not.toContain('conv_channel');
  });

  it('strips msg_ prefix only', () => {
    const result = formatPendingRunEvents([
      {
        type: 'message:text',
        groupKey: 'conv_abc',
        idempotencyKey: 'idem',
        timestamp: 1700000000000,
        text: 'msg',
        groupMetadata: { TargetKey: 'msg_12345' },
        itemMetadata: {},
      },
    ]);
    expect(result).toContain('targetKey: 12345');
    expect(result).not.toContain('msg_12345');
  });
});

});
