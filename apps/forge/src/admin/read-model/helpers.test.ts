import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stable module-level mocks so they can be referenced consistently across vi.mock and tests
const mockForgeDebug = vi.fn();
const mockDecryptSecret = vi.fn();

// Mock @forge-runtime/core before helpers.ts tries to import it
vi.mock('@forge-runtime/core', () => ({ forgeDebug: (...args: unknown[]) => mockForgeDebug(...args) }));

// Mock encryption before helpers.ts tries to import it
vi.mock('../../encryption/crypto', () => ({ decryptSecret: (...args: unknown[]) => mockDecryptSecret(...args) }));

import {
  isMemoryRecallText,
  splitMemoryRecallSegments,
  truncatePreview,
  toToolBadge,
  humanizeMemoryKey,
  formatWorkingMemoryValue,
  renderWorkingMemoryMarkdown,
  extractLatestMessagePreview,
  extractLatestMessageToolBadge,
  mergeToolLogMessages,
  buildThreadToolInvocationParts,
  collectConversationParticipants,
  isTextPart,
  toScheduleSummary,
  parseProviderCredentials,
} from './helpers';

// ---------------------------------------------------------------------------
// isMemoryRecallText
// ---------------------------------------------------------------------------
describe('isMemoryRecallText', () => {
  it('returns false for plain text without tags', () => {
    expect(isMemoryRecallText('hello world')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isMemoryRecallText('')).toBe(false);
  });

  it('returns true for valid memory-recall block', () => {
    expect(isMemoryRecallText('<memory-recall>test</memory-recall>')).toBe(true);
  });

  it('returns true for nested memory-recall blocks (greedy regex)', () => {
    expect(isMemoryRecallText('<memory-recall>a<memory-recall>b</memory-recall>')).toBe(true);
  });

  it('returns false for incomplete block (missing closing tag)', () => {
    expect(isMemoryRecallText('<memory-recall>test')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// splitMemoryRecallSegments
// ---------------------------------------------------------------------------
describe('splitMemoryRecallSegments', () => {
  it('returns empty array for empty string', () => {
    expect(splitMemoryRecallSegments('')).toEqual([]);
  });

  it('returns single text segment for plain text', () => {
    expect(splitMemoryRecallSegments('hello')).toEqual([{ kind: 'text', value: 'hello' }]);
  });

  it('returns memory-recall segment for valid block', () => {
    const result = splitMemoryRecallSegments('<memory-recall>test</memory-recall>');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'memory-recall', value: '<memory-recall>test</memory-recall>' });
  });

  it('splits mixed content into multiple segments', () => {
    const result = splitMemoryRecallSegments('before <memory-recall>test</memory-recall> after');
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ kind: 'text', value: 'before' });
    expect(result[1]).toMatchObject({ kind: 'memory-recall' });
    expect(result[2]).toMatchObject({ kind: 'text', value: 'after' });
  });

  it('returns text segment for incomplete block (no closing tag)', () => {
    expect(splitMemoryRecallSegments('<memory-recall>test')).toEqual([{ kind: 'text', value: '<memory-recall>test' }]);
  });
});

// ---------------------------------------------------------------------------
// truncatePreview
// ---------------------------------------------------------------------------
describe('truncatePreview', () => {
  it('returns unchanged string under max length (199)', () => {
    expect(truncatePreview('a'.repeat(199))).toBe('a'.repeat(199));
  });

  it('truncates and appends ellipsis at max length (200)', () => {
    expect(truncatePreview('a'.repeat(200))).toBe('a'.repeat(199) + '…');
  });

  it('truncates longer strings with ellipsis', () => {
    expect(truncatePreview('a'.repeat(201))).toBe('a'.repeat(199) + '…');
  });

  it('returns empty string unchanged', () => {
    expect(truncatePreview('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// toToolBadge
// ---------------------------------------------------------------------------
describe('toToolBadge', () => {
  it('returns Email badge for tools matching email pattern', () => {
    expect(toToolBadge('send_email_to_customer')).toEqual({ icon: '📧', label: 'Email' });
  });

  it('returns Chat badge for chat tools', () => {
    expect(toToolBadge('slack_chat_message')).toEqual({ icon: '💬', label: 'Chat' });
  });

  it('returns MCP badge for mcp tools', () => {
    expect(toToolBadge('mcp_tool_call')).toEqual({ icon: '🔌', label: 'MCP' });
  });

  it('is case insensitive in pattern matching', () => {
    expect(toToolBadge('WORKSPACE_EXECUTE_COMMAND')).toEqual({ icon: '💻', label: 'Terminal' });
  });

  it('returns direct match from TOOL_NAME_BADGES for workspace_list_files', () => {
    expect(toToolBadge('workspace_list_files')).toEqual({ icon: '📁', label: 'Files' });
  });
});

// ---------------------------------------------------------------------------
// humanizeMemoryKey
// ---------------------------------------------------------------------------
describe('humanizeMemoryKey', () => {
  it('converts snake_case to Title Case', () => {
    // Order: replace caps, capitalize first char, then replace underscores
    // total_spend -> " Total spend" -> " Total Spend" -> "Total Spend"
    expect(humanizeMemoryKey('total_spend')).toBe('Total Spend');
  });

  it('converts camelCase to Title Case', () => {
    expect(humanizeMemoryKey('lastUpdated')).toBe('Last Updated');
  });

  it('returns single word unchanged', () => {
    expect(humanizeMemoryKey('notes')).toBe('Notes');
  });

  it('handles mixed snake_case and spaces', () => {
    expect(humanizeMemoryKey('customer_notes')).toBe('Customer Notes');
  });
});

// ---------------------------------------------------------------------------
// formatWorkingMemoryValue
// ---------------------------------------------------------------------------
describe('formatWorkingMemoryValue', () => {
  it('returns null for null', () => {
    expect(formatWorkingMemoryValue(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(formatWorkingMemoryValue(undefined)).toBeNull();
  });

  it('parses JSON string and returns markdown bullet list', () => {
    const result = formatWorkingMemoryValue('{"name":"Alice","age":30}');
    expect(result).toContain('- **Name**: Alice');
    expect(result).toContain('- **Age**: 30');
  });

  it('returns null for empty JSON object', () => {
    expect(formatWorkingMemoryValue('{}')).toBeNull();
  });

  it('filters out null/undefined values from JSON', () => {
    const result = formatWorkingMemoryValue('{"a":1,"b":null,"c":"hi"}');
    expect(result).not.toContain('b');
    expect(result).toContain('A');
    expect(result).toContain('C');
  });

  it('returns null for non-JSON string', () => {
    expect(formatWorkingMemoryValue('not-json')).toBeNull();
  });

  it('uses humanizeMemoryKey to format field names', () => {
    const result = formatWorkingMemoryValue('{"total_spend":100}');
    expect(result).toContain('**Total Spend**');
  });
});

// ---------------------------------------------------------------------------
// renderWorkingMemoryMarkdown
// ---------------------------------------------------------------------------
describe('renderWorkingMemoryMarkdown', () => {
  it('returns null for null', () => {
    expect(renderWorkingMemoryMarkdown(null)).toBeNull();
  });

  it('returns null for non-object values', () => {
    expect(renderWorkingMemoryMarkdown(42)).toBeNull();
    expect(renderWorkingMemoryMarkdown('hello')).toBeNull();
  });

  it('returns null for empty object', () => {
    expect(renderWorkingMemoryMarkdown({})).toBeNull();
  });

  it('returns markdown sections for a valid memory object', () => {
    const memory = {
      name: JSON.stringify({ value: 'Alice' }),
      age: JSON.stringify({ value: 30 }),
      notes: JSON.stringify({ value: 'VIP customer' }),
    };
    const result = renderWorkingMemoryMarkdown(memory);
    expect(result).toContain('## Name');
    expect(result).toContain('Alice');
    expect(result).toContain('## Age');
    expect(result).toContain('30');
    expect(result).toContain('## Notes');
    expect(result).toContain('VIP customer');
  });
});

// ---------------------------------------------------------------------------
// extractLatestMessagePreview
// ---------------------------------------------------------------------------
describe('extractLatestMessagePreview', () => {
  it('returns null for null', () => {
    expect(extractLatestMessagePreview(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(extractLatestMessagePreview(undefined)).toBeNull();
  });

  it('returns null for non-object content', () => {
    expect(extractLatestMessagePreview('hello')).toBeNull();
  });

  it('returns null for empty object', () => {
    expect(extractLatestMessagePreview({})).toBeNull();
  });

  it('returns null for content with no text, reasoning, or parts', () => {
    expect(extractLatestMessagePreview({ foo: 'bar' })).toBeNull();
  });

  it('extracts text from content.text', () => {
    expect(extractLatestMessagePreview({ content: 'hello world' })).toBe('hello world');
  });

  it('extracts text from content.reasoning', () => {
    expect(extractLatestMessagePreview({ reasoning: 'I think' })).toBe('I think');
  });

  it('extracts from parts array in reverse order, skipping memory-recall text', () => {
    // Parts are iterated in reverse. The last non-memory-recall text wins.
    const content = {
      parts: [
        { type: 'text', text: 'should be ignored (memory recall)' },
        { type: 'text', text: '<memory-recall>ignored</memory-recall>' },
        { type: 'text', text: 'this is the preview' },
      ],
    };
    expect(extractLatestMessagePreview(content)).toBe('this is the preview');
  });

  it('prefers text over reasoning when both present in parts', () => {
    const content = {
      parts: [
        { type: 'reasoning', text: 'thinking...' },
        { type: 'text', text: 'final answer' },
      ],
    };
    expect(extractLatestMessagePreview(content)).toBe('final answer');
  });

  it('truncates long text via truncatePreview', () => {
    const longText = 'a'.repeat(250);
    expect(extractLatestMessagePreview({ content: longText })).toHaveLength(200); // 199 + …
  });
});

// ---------------------------------------------------------------------------
// extractLatestMessageToolBadge
// ---------------------------------------------------------------------------
describe('extractLatestMessageToolBadge', () => {
  it('returns null for null', () => {
    expect(extractLatestMessageToolBadge(null)).toBeNull();
  });

  it('returns null for empty object', () => {
    expect(extractLatestMessageToolBadge({})).toBeNull();
  });

  it('returns null for empty parts array', () => {
    expect(extractLatestMessageToolBadge({ parts: [] })).toBeNull();
  });

  it('returns null when no tool-invocation part is found', () => {
    expect(extractLatestMessageToolBadge({ parts: [{ type: 'text', text: 'hello' }] })).toBeNull();
  });

  it('returns Recall badge for memory-recall text in parts', () => {
    const content = { parts: [{ type: 'text', text: 'hello <memory-recall>some memory</memory-recall>' }] };
    expect(extractLatestMessageToolBadge(content)).toEqual({ icon: '🧠', label: 'Recall' });
  });

  it('returns Recall badge for memory-recall text in content field', () => {
    const content = { content: 'hello <memory-recall>some memory</memory-recall>' };
    expect(extractLatestMessageToolBadge(content)).toEqual({ icon: '🧠', label: 'Recall' });
  });

  it('extracts tool badge from tool-invocation part', () => {
    const content = {
      parts: [{
        type: 'tool-invocation',
        toolInvocation: { toolName: 'slack_chat', toolCallId: 'c1', state: 'result' },
      }],
    };
    expect(extractLatestMessageToolBadge(content)).toEqual({ icon: '💬', label: 'Chat' });
  });

  it('extracts from topLevel toolInvocations field', () => {
    const content = {
      toolInvocations: [{ toolName: 'mcp_tool_call', toolCallId: 'c1' }],
    };
    expect(extractLatestMessageToolBadge(content)).toEqual({ icon: '🔌', label: 'MCP' });
  });

  it('skips non-tool-invocation parts and finds the first matching tool', () => {
    const content = {
      parts: [
        { type: 'text' },
        { type: 'tool-invocation', toolInvocation: { toolName: 'workspace_execute_command', state: 'call' } },
      ],
    };
    expect(extractLatestMessageToolBadge(content)).toEqual({ icon: '💻', label: 'Terminal' });
  });
});

// ---------------------------------------------------------------------------
// mergeToolLogMessages
// ---------------------------------------------------------------------------
describe('mergeToolLogMessages', () => {
  it('returns empty array for empty input', () => {
    expect(mergeToolLogMessages([])).toEqual([]);
  });

  it('returns messages unchanged when no adjacent assistant+tool pair', () => {
    const messages = [
      makeMsg('user', 'u1', 't1'),
      makeMsg('assistant', 'a1', 't1', [], { toolInvocations: [] }),
    ];
    expect(mergeToolLogMessages(messages)).toHaveLength(2);
  });

  it('merges tool result into previous assistant message as toolResults', () => {
    const assistantMsg = makeMsg('assistant', 'a1', 't1', [], {
      toolInvocations: [{ toolName: 'test', toolCallId: 'c1' }],
    });
    const toolMsg = makeMsg('tool', 't1', 't1', [], {
      toolResults: [{ toolCallId: 'c1', result: { output: 'done' } }],
    });
    const result = mergeToolLogMessages([assistantMsg, toolMsg]);
    expect(result).toHaveLength(1);
    expect(result[0].metadata?.toolResults).toHaveLength(1);
    expect(result[0].metadata?.toolResults?.[0].toolCallId).toBe('c1');
  });

  it('does not merge when previous message has no toolInvocations', () => {
    const assistantMsg = makeMsg('assistant', 'a1', 't1');
    const toolMsg = makeMsg('tool', 't1', 't1');
    const result = mergeToolLogMessages([assistantMsg, toolMsg]);
    expect(result).toHaveLength(2);
  });

  it('does not merge when tool message has no toolResults', () => {
    const assistantMsg = makeMsg('assistant', 'a1', 't1', [], { toolInvocations: [{ toolName: 't', toolCallId: 'c1' }] });
    const toolMsg = makeMsg('tool', 't1', 't1');
    const result = mergeToolLogMessages([assistantMsg, toolMsg]);
    expect(result).toHaveLength(2);
  });

  it('does not merge across non-adjacent messages', () => {
    const m1 = makeMsg('assistant', 'a1', 't1', [], { toolInvocations: [{ toolName: 't', toolCallId: 'c1' }] });
    const m2 = makeMsg('user', 'u1', 't1');
    const m3 = makeMsg('tool', 't1', 't1', [], { toolResults: [{ toolCallId: 'c1', result: {} }] });
    const result = mergeToolLogMessages([m1, m2, m3]);
    expect(result).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// buildThreadToolInvocationParts
// ---------------------------------------------------------------------------
describe('buildThreadToolInvocationParts', () => {
  it('returns empty array for undefined', () => {
    expect(buildThreadToolInvocationParts(undefined)).toEqual([]);
  });

  it('returns empty array for empty object', () => {
    expect(buildThreadToolInvocationParts({})).toEqual([]);
  });

  it('returns empty array when no toolInvocations or toolResults', () => {
    expect(buildThreadToolInvocationParts({ foo: 'bar' })).toEqual([]);
  });

  it('builds tool-invocation parts from toolInvocations', () => {
    const metadata = {
      toolInvocations: [
        { toolName: 'test_tool', toolCallId: 'call-abc', args: { x: 1 }, state: 'result', result: { out: 'done' } },
      ],
    };
    const parts = buildThreadToolInvocationParts(metadata);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({
      type: 'tool-invocation',
      toolInvocation: { toolName: 'test_tool', toolCallId: 'call-abc', state: 'call' },
    });
  });

  it('sets state to "call" when no matching result is found', () => {
    const metadata = {
      toolInvocations: [{ toolName: 'test', toolCallId: 'c1', args: {} }],
    };
    const parts = buildThreadToolInvocationParts(metadata);
    expect(parts[0].toolInvocation.state).toBe('call');
  });

  it('appends unmatched toolResults as tool-result parts', () => {
    const metadata = {
      toolResults: [{ toolCallId: 'orphan', result: { data: 'yes' } }],
    };
    const parts = buildThreadToolInvocationParts(metadata);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ type: 'tool-result', toolResult: { toolCallId: 'orphan' } });
  });
});

// ---------------------------------------------------------------------------
// collectConversationParticipants
// ---------------------------------------------------------------------------
describe('collectConversationParticipants', () => {
  it('returns empty array when no participants and no messages', () => {
    const result = collectConversationParticipants({ name: 'Chat', participants: [], messages: [] });
    expect(result).toEqual([]);
  });

  it('deduplicates participants using Set', () => {
    const result = collectConversationParticipants({
      name: 'Group',
      participants: ['Alice', 'Bob', 'Alice'],
      messages: [],
    });
    expect(result).toEqual(['Alice', 'Bob']);
  });

  it('includes message authors not already in participants', () => {
    const result = collectConversationParticipants({
      name: 'Alice',
      participants: ['Bob'],
      messages: [{ authorDisplayName: 'Diana' }, { authorDisplayName: 'Bob' }],
    });
    expect(result).toContain('Bob');
    expect(result).toContain('Diana');
  });

  it('excludes the chat name from participants', () => {
    const result = collectConversationParticipants({
      name: 'Alice',
      participants: ['Alice', 'Bob'],
      messages: [],
    });
    expect(result).toEqual(['Bob']);
  });
});

// ---------------------------------------------------------------------------
// isTextPart
// ---------------------------------------------------------------------------
describe('isTextPart', () => {
  it('returns true for text part', () => {
    expect(isTextPart({ type: 'text', text: 'hello' })).toBe(true);
  });

  it('returns true for reasoning part', () => {
    expect(isTextPart({ type: 'reasoning', text: 'thinking...' })).toBe(true);
  });

  it('returns false for other part types', () => {
    expect(isTextPart({ type: 'tool-call', text: 'hello' })).toBe(false);
    expect(isTextPart({ type: 'tool-result', text: 'hello' })).toBe(false);
    expect(isTextPart({ type: 'image', text: 'hello' })).toBe(false);
  });

  it('returns false when text is missing', () => {
    expect(isTextPart({ type: 'text' })).toBe(false);
    expect(isTextPart({ type: 'reasoning' })).toBe(false);
  });

  it('returns false for null/undefined type', () => {
    expect(isTextPart({ text: 'hello' })).toBe(false);
    expect(isTextPart({ type: undefined, text: 'hello' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toScheduleSummary
// ---------------------------------------------------------------------------
describe('toScheduleSummary', () => {
  // Minimal row matching agentSchedules.$inferSelect (actual column names)
  const makeRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'sched-1',
    agentId: 'agent-1',
    kind: 'agent',
    name: 'Daily Report',
    description: null,
    scheduleType: 'cron' as const,
    cronExpression: '0 9 * * *',
    scheduledDate: null,
    timezone: 'UTC',
    content: '{}',
    wakeWhenRunning: 1,
    isActive: 1,
    lastTriggeredAt: 1710000000000,
    nextTriggerAt: 1710086400000,
    creatorId: null,
    createdAt: 1709900000000,
    updatedAt: 1710000000000,
    ...overrides,
  });

  it('maps id, kind, name, and scheduleType', () => {
    const row = makeRow({ id: 's99', kind: 'data', name: 'My Job', scheduleType: 'cron' });
    const r = toScheduleSummary(row);
    expect(r.scheduleId).toBe('s99');
    expect(r.id).toBe('s99');
    expect(r.kind).toBe('data');
    expect(r.name).toBe('My Job');
  });

  it('maps createdAt and updatedAt', () => {
    const r = toScheduleSummary(makeRow({ createdAt: 1000, updatedAt: 2000 }));
    expect(r.createdAt).toBe(1000);
    expect(r.updatedAt).toBe(2000);
  });

  it('parses content JSON string to input object', () => {
    const row = makeRow({ content: '{"topic":"daily"}' });
    expect(toScheduleSummary(row).input).toEqual({ topic: 'daily' });
  });

  it('returns null input when content is null', () => {
    const row = makeRow({ content: null });
    expect(toScheduleSummary(row).input).toBeNull();
  });

  it('maps isActive 1 → true, isActive 0 → false', () => {
    expect(toScheduleSummary(makeRow({ isActive: 1 })).isActive).toBe(true);
    expect(toScheduleSummary(makeRow({ isActive: 0 })).isActive).toBe(false);
    expect(toScheduleSummary(makeRow({ isActive: null })).isActive).toBeNull();
  });

  it('maps lastTriggeredAt → lastRunAt (ms), nextTriggerAt → nextRunAt (ms)', () => {
    const r = toScheduleSummary(makeRow({ lastTriggeredAt: 1710000000000, nextTriggerAt: 1710086400000 }));
    expect(r.lastRunAt).toBe(1710000000000);
    expect(r.nextRunAt).toBe(1710086400000);
  });

  it('maps null timestamps to null', () => {
    const r = toScheduleSummary(makeRow({ lastTriggeredAt: null, nextTriggerAt: null }));
    expect(r.lastRunAt).toBeNull();
    expect(r.nextRunAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseProviderCredentials
// ---------------------------------------------------------------------------
describe('parseProviderCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses valid JSON decrypted string and returns parsed object', () => {
    mockDecryptSecret.mockReturnValue('{"apiKey":"sk-secret","region":"us-west"}');

    const result = parseProviderCredentials('encrypted_value');

    expect(result).toEqual({ apiKey: 'sk-secret', region: 'us-west' });
    expect(mockDecryptSecret).toHaveBeenCalledWith('encrypted_value');
  });

  it('returns raw string when JSON parse fails, logging a warning', () => {
    mockDecryptSecret.mockReturnValue('plain-text-token');
    mockForgeDebug.mockImplementation(() => {});

    const result = parseProviderCredentials('encrypted_bad');

    expect(result).toBe('plain-text-token');
    expect(mockForgeDebug).toHaveBeenCalledOnce();
  });

  it('logs with warn level on parse failure', () => {
    mockDecryptSecret.mockReturnValue('not-valid-json');
    mockForgeDebug.mockImplementation(() => {});

    parseProviderCredentials('data');

    expect(mockForgeDebug.mock.calls[0][0]).toMatchObject({
      level: 'warn',
      message: 'Failed to parse credentials JSON',
    });
  });

  it('returns decrypted string even when parse throws', () => {
    mockDecryptSecret.mockReturnValue('still-raw');

    const result = parseProviderCredentials('throws-json');

    expect(result).toBe('still-raw');
  });

  it('passes encryptedCredentials directly to decryptSecret', () => {
    mockDecryptSecret.mockReturnValue('{}');

    parseProviderCredentials('my-encrypted-creds');

    expect(mockDecryptSecret).toHaveBeenCalledOnce();
    expect(mockDecryptSecret).toHaveBeenCalledWith('my-encrypted-creds');
  });
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
function makeMsg(
  role: string,
  id: string,
  threadId: string,
  parts: Array<{ type: string; text?: string; toolInvocation?: Record<string, unknown> }> = [],
  metadata: Record<string, unknown> = {},
) {
  return {
    id,
    role,
    threadId,
    createdAt: '2024-01-01',
    parts,
    metadata,
  } as unknown;
}
