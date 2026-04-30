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
});
