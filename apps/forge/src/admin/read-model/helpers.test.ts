import { describe, expect, test, vi } from 'vitest';

const mockForgeDebug = vi.hoisted(() => vi.fn());

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: mockForgeDebug,
  LibsqlConversationStore: vi.fn(),
  readOperationalMemoryState: vi.fn(),
}));

vi.mock('../../encryption/crypto', () => ({
  decryptSecret: vi.fn((x: string) => x),
}));

import {
  isMemoryRecallText,
  splitMemoryRecallSegments,
  truncatePreview,
  toToolBadge,
  humanizeMemoryKey,
  formatWorkingMemoryValue,
  renderWorkingMemoryMarkdown,
  toScheduleSummary,
  extractLatestMessagePreview,
  extractLatestMessageToolBadge,
  decryptProviderConfig,
  mergeToolLogMessages,
  buildThreadToolInvocationParts,
  collectConversationParticipants,
  isTextPart,
} from './helpers';

describe('isMemoryRecallText', () => {
  test('returns true for memory-recall tag with content', () => {
    expect(isMemoryRecallText('<memory-recall>test</memory-recall>')).toBe(true);
  });

  test('returns true for multi-line memory-recall block', () => {
    expect(
      isMemoryRecallText(
        '<memory-recall>\n<items>\n<item>content</item>\n</items>\n</memory-recall>',
      ),
    ).toBe(true);
  });

  test('returns false for plain text', () => {
    expect(isMemoryRecallText('just some regular text')).toBe(false);
  });

  test('returns false for open tag only', () => {
    expect(isMemoryRecallText('<memory-recall>')).toBe(false);
  });

  test('returns false for closing tag only', () => {
    expect(isMemoryRecallText('</memory-recall>')).toBe(false);
  });

  test('returns false for mismatched tags', () => {
    expect(isMemoryRecallText('<memory-recall>test</memory-other>')).toBe(false);
  });

  test('returns false for whitespace-only text', () => {
    expect(isMemoryRecallText('   ')).toBe(false);
  });

  test('returns true when wrapped in whitespace', () => {
    expect(isMemoryRecallText('  <memory-recall>x</memory-recall>  ')).toBe(true);
  });

  test('returns false for nested mismatched tags', () => {
    expect(isMemoryRecallText('<memory-recall><other>x</other></memory-other>')).toBe(false);
  });
});

describe('splitMemoryRecallSegments', () => {
  test('returns text segment when no memory-recall', () => {
    const result = splitMemoryRecallSegments('hello world');
    expect(result).toEqual([{ kind: 'text', value: 'hello world' }]);
  });

  test('extracts single memory-recall block', () => {
    const result = splitMemoryRecallSegments('hello <memory-recall>x</memory-recall> world');
    expect(result).toEqual([
      { kind: 'text', value: 'hello' },
      { kind: 'memory-recall', value: '<memory-recall>x</memory-recall>' },
      { kind: 'text', value: 'world' },
    ]);
  });

  test('extracts multiple memory-recall blocks', () => {
    const result = splitMemoryRecallSegments(
      '<memory-recall>a</memory-recall> text <memory-recall>b</memory-recall>',
    );
    expect(result).toEqual([
      { kind: 'memory-recall', value: '<memory-recall>a</memory-recall>' },
      { kind: 'text', value: 'text' },
      { kind: 'memory-recall', value: '<memory-recall>b</memory-recall>' },
    ]);
  });

  test('trims surrounding whitespace', () => {
    const result = splitMemoryRecallSegments('  hello  ');
    expect(result).toEqual([{ kind: 'text', value: 'hello' }]);
  });

  test('skips empty text segments', () => {
    const result = splitMemoryRecallSegments('<memory-recall>x</memory-recall>');
    expect(result).toEqual([{ kind: 'memory-recall', value: '<memory-recall>x</memory-recall>' }]);
  });

  test('handles nested tags inside memory-recall', () => {
    const xml = '<memory-recall><items><item>content</item></items></memory-recall>';
    const result = splitMemoryRecallSegments(xml);
    expect(result).toEqual([{ kind: 'memory-recall', value: xml }]);
  });

  test('returns empty array for empty string', () => {
    const result = splitMemoryRecallSegments('');
    expect(result).toEqual([]);
  });

  test('handles memory-recall at start of string', () => {
    const result = splitMemoryRecallSegments('<memory-recall>x</memory-recall> rest');
    expect(result).toEqual([
      { kind: 'memory-recall', value: '<memory-recall>x</memory-recall>' },
      { kind: 'text', value: 'rest' },
    ]);
  });

  test('handles memory-recall at end of string', () => {
    const result = splitMemoryRecallSegments('start <memory-recall>x</memory-recall>');
    expect(result).toEqual([
      { kind: 'text', value: 'start' },
      { kind: 'memory-recall', value: '<memory-recall>x</memory-recall>' },
    ]);
  });
});

describe('truncatePreview', () => {
  test('returns original string when under 200 chars', () => {
    const input = 'a'.repeat(199);
    expect(truncatePreview(input)).toBe(input);
  });

  test('truncates and appends ellipsis when over 200 chars', () => {
    const input = 'a'.repeat(300);
    const result = truncatePreview(input);
    expect(result.length).toBe(200);
    expect(result.endsWith('…')).toBe(true);
  });

  test('returns original for empty string', () => {
    expect(truncatePreview('')).toBe('');
  });

  test('returns original for single character', () => {
    expect(truncatePreview('a')).toBe('a');
  });
});

describe('toToolBadge', () => {
  test('returns Terminal badge for execute_command variants', () => {
    expect(toToolBadge('workspace_execute_command')).toEqual({ icon: '💻', label: 'Terminal' });
    expect(toToolBadge('bash')).toEqual({ icon: '💻', label: 'Terminal' });
    expect(toToolBadge('shell')).toEqual({ icon: '💻', label: 'Terminal' });
  });

  test('returns File badge for read variants', () => {
    expect(toToolBadge('workspace_read_file')).toEqual({ icon: '📄', label: 'File' });
    expect(toToolBadge('read_file')).toEqual({ icon: '📄', label: 'File' });
  });

  test('returns Write badge for write variants', () => {
    expect(toToolBadge('workspace_write_file')).toEqual({ icon: '✏️', label: 'Write' });
  });

  test('returns Edit badge for edit variants', () => {
    expect(toToolBadge('workspace_edit_file')).toEqual({ icon: '🔧', label: 'Edit' });
  });

  test('returns Files badge for list variants', () => {
    expect(toToolBadge('workspace_list_files')).toEqual({ icon: '📁', label: 'Files' });
  });

  test('returns Search badge for grep/search', () => {
    expect(toToolBadge('workspace_grep')).toEqual({ icon: '🔎', label: 'Search' });
  });

  test('returns HTTP badge for http/fetch', () => {
    expect(toToolBadge('send_http_request')).toEqual({ icon: '🌐', label: 'HTTP' });
  });

  test('returns Email badge for email/mail', () => {
    expect(toToolBadge('send_email')).toEqual({ icon: '📧', label: 'Email' });
  });

  test('returns Memory badge for memory/recall', () => {
    expect(toToolBadge('memory_recall')).toEqual({ icon: '🧠', label: 'Memory' });
  });

  test('returns GitHub badge for git/github', () => {
    expect(toToolBadge('github_api')).toEqual({ icon: '🐙', label: 'GitHub' });
  });

  test('returns Schedule badge for schedule/cron', () => {
    expect(toToolBadge('create_schedule')).toEqual({ icon: '⏰', label: 'Schedule' });
  });

  test('returns MCP badge for mcp/tool', () => {
    expect(toToolBadge('mcp_list_tools')).toEqual({ icon: '🔌', label: 'MCP' });
  });

  test('returns default badge for unrecognized tool name', () => {
    // unrecognized names fall through to TOOL_ICONS (not found) then return ⚙️ default
    expect(toToolBadge('something_completely_arbitrary')).toEqual({
      icon: '⚙️',
      label: 'something_completely_arbitrary',
    });
  });

  test('badge extraction is case-insensitive', () => {
    expect(toToolBadge('WORKSPACE_EXECUTE_COMMAND')).toEqual({ icon: '💻', label: 'Terminal' });
    expect(toToolBadge('Workspace_Execute_Command')).toEqual({ icon: '💻', label: 'Terminal' });
  });
});

describe('humanizeMemoryKey', () => {
  test('replaces underscores with spaces', () => {
    expect(humanizeMemoryKey('hello_world')).toBe('Hello World');
  });

  test('splits camelCase words', () => {
    expect(humanizeMemoryKey('helloWorld')).toBe('Hello World');
  });

  test('trims leading/trailing whitespace', () => {
    expect(humanizeMemoryKey('  hello  ')).toBe('Hello');
  });
});

describe('formatWorkingMemoryValue', () => {
  test('returns null for null input', () => {
    expect(formatWorkingMemoryValue(null)).toBeNull();
  });

  test('returns null for undefined input', () => {
    expect(formatWorkingMemoryValue(undefined)).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(formatWorkingMemoryValue('')).toBeNull();
  });

  test('returns null for invalid JSON', () => {
    expect(formatWorkingMemoryValue('not json')).toBeNull();
  });

  test('formats valid JSON object as markdown bullet points', () => {
    const result = formatWorkingMemoryValue('{"key1":"value1","key2":"value2"}');
    expect(result).toContain('- **Key1**: value1');
    expect(result).toContain('- **Key2**: value2');
  });

  test('filters out null and undefined values', () => {
    // Entries with null/undefined values are excluded from output
    const result = formatWorkingMemoryValue('{"active":"yes","deleted":null}');
    expect(result).toContain('- **Active**: yes');
    expect(result).not.toContain('deleted');
  });

  test('returns null when all values are null/undefined', () => {
    expect(formatWorkingMemoryValue('{"a":null,"b":null}')).toBeNull();
  });
});

describe('renderWorkingMemoryMarkdown', () => {
  test('returns null for null input', () => {
    expect(renderWorkingMemoryMarkdown(null)).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(renderWorkingMemoryMarkdown('')).toBeNull();
  });

  test('returns null for invalid JSON', () => {
    expect(renderWorkingMemoryMarkdown('not-json')).toBeNull();
  });
});

describe('toScheduleSummary', () => {
  test('returns AgentSchedule shape with all fields mapped', () => {
    const row = {
      id: 'sched-1',
      agentId: 'a1',
      kind: 'agent',
      name: 'Nightly job',
      description: 'Runs nightly',
      scheduleType: 'cron',
      cronExpression: '0 2 * * *',
      scheduledDate: null,
      timezone: 'America/Sao_Paulo',
      content: '{"msg":"hello"}',
      wakeWhenRunning: 1,
      isActive: 1,
      lastTriggeredAt: 1700000000000,
      nextTriggerAt: 1700100000000,
      creatorId: null,
      createdAt: 1699000000000,
      updatedAt: 1699100000000,
    } as const;
    const result = toScheduleSummary(row);
    expect(result.scheduleId).toBe('sched-1');
    expect(result.kind).toBe('agent');
    expect(result.name).toBe('Nightly job');
    expect(result.description).toBe('Runs nightly');
    expect(result.scheduleType).toBe('cron');
    expect(result.cronExpression).toBe('0 2 * * *');
    expect(result.scheduledDate).toBeUndefined();
    expect(result.timezone).toBe('America/Sao_Paulo');
    expect(result.content).toBe('{"msg":"hello"}');
    expect(result.wakeWhenRunning).toBe(true);
    expect(result.isActive).toBe(true);
    expect(result.lastTriggeredAt).toBe(1700000000000);
    expect(result.nextTriggerAt).toBe(1700100000000);
    expect(result.createdAt).toBe(1699000000000);
    expect(result.updatedAt).toBe(1699100000000);
  });

  test('returns undefined cronExpression when not set', () => {
    const result = toScheduleSummary({
      id: '1',
      kind: 'agent',
      name: 'Test',
      scheduleType: 'date',
    } as never);
    expect(result.cronExpression).toBeUndefined();
  });

  test('returns empty string content when null', () => {
    const result = toScheduleSummary({
      id: '1',
      kind: 'agent',
      name: 'Test',
      content: null,
      scheduleType: 'cron',
      timezone: 'UTC',
      wakeWhenRunning: 0,
    } as never);
    expect(result.content).toBe('');
  });

  test('defaults timezone to UTC and scheduleType to cron', () => {
    const result = toScheduleSummary({
      id: '1',
      kind: 'agent',
      name: 'Minimal',
    } as never);
    expect(result.timezone).toBe('UTC');
    expect(result.scheduleType).toBe('cron');
  });
});

describe('extractLatestMessagePreview', () => {
  // These functions receive message.content directly (not wrapped in {messages:[...]})
  // They read parts[], content, reasoning at the top level of the input object

  test('returns null for null/undefined', () => {
    expect(extractLatestMessagePreview(null)).toBeNull();
    expect(extractLatestMessagePreview(undefined)).toBeNull();
  });

  test('returns null when parts array is empty and no content/reasoning', () => {
    expect(extractLatestMessagePreview({ parts: [] })).toBeNull();
  });

  test('returns null for message with null content and empty parts', () => {
    expect(extractLatestMessagePreview({ content: null, parts: [] })).toBeNull();
  });

  test('returns truncated preview from text part in parts array', () => {
    const result = extractLatestMessagePreview({
      parts: [{ type: 'text', text: 'hello from parts' }],
    });
    expect(result).toBe('hello from parts');
  });

  test('returns truncated preview from content string', () => {
    const result = extractLatestMessagePreview({
      content: 'simple content',
      parts: [],
    });
    expect(result).toBe('simple content');
  });

  test('returns truncated preview from reasoning', () => {
    const result = extractLatestMessagePreview({
      reasoning: 'thinking out loud',
      parts: [],
      content: null,
    });
    expect(result).toBe('thinking out loud');
  });

  test('skips memory-recall-only text', () => {
    const result = extractLatestMessagePreview({
      parts: [{ type: 'text', text: '<memory-recall><item>x</item></memory-recall>' }],
      content: null,
    });
    expect(result).toBeNull();
  });
});

describe('extractLatestMessageToolBadge', () => {
  // These functions receive message.content directly
  // They read parts[], toolInvocations, content at the top level of the input

  test('returns null for null/undefined', () => {
    expect(extractLatestMessageToolBadge(null)).toBeNull();
    expect(extractLatestMessageToolBadge(undefined)).toBeNull();
  });

  test('returns null for empty parts', () => {
    expect(extractLatestMessageToolBadge({ parts: [] })).toBeNull();
  });

  test('returns null when no tool invocation is present', () => {
    expect(extractLatestMessageToolBadge({ content: 'text only', parts: [] })).toBeNull();
  });

  test('returns Recall badge for memory-recall text part', () => {
    const result = extractLatestMessageToolBadge({
      parts: [{ type: 'text', text: '<memory-recall><item>x</item></memory-recall>' }],
      content: null,
    });
    expect(result).toEqual({ icon: '🧠', label: 'Recall' });
  });

  test('returns tool badge for last tool-invocation part', () => {
    const result = extractLatestMessageToolBadge({
      content: null,
      parts: [
        { type: 'text', text: 'some text' },
        {
          type: 'tool-invocation',
          toolInvocation: { toolName: 'bash', toolCallId: '1' },
        },
      ],
    });
    expect(result).toEqual({ icon: '💻', label: 'Terminal' });
  });

  test('returns null when toolInvocation is missing toolName', () => {
    const result = extractLatestMessageToolBadge({
      parts: [{ type: 'tool-invocation', toolInvocation: { toolCallId: '1' } }],
      content: null,
    });
    expect(result).toBeNull();
  });
});

describe('decryptProviderConfig', () => {
  test('decrypts and parses valid credentials JSON', () => {
    const result = decryptProviderConfig('{"apiKey":"secret","endpoint":"url"}');
    expect(result).toEqual({ apiKey: 'secret', endpoint: 'url' });
  });

  test('throws on invalid JSON instead of returning plaintext', () => {
    // On JSON parse failure the function throws — credentials must not leak as plaintext
    expect(() => decryptProviderConfig('not-json')).toThrow();
  });

  test('throws on malformed credentials JSON', () => {
    expect(() => decryptProviderConfig('{broken')).toThrow();
  });
});

describe('mergeToolLogMessages', () => {
  test('returns empty array for empty input', () => {
    expect(mergeToolLogMessages([])).toEqual([]);
  });

  test('passes through messages without inputPartIndex', () => {
    const messages = [{ role: 'user' as const, content: 'hello', parts: [] }] as unknown as {
      id: string;
      role: string;
      threadId: string;
      createdAt: string;
      parts: unknown[];
      metadata?: unknown;
    }[];
    expect(mergeToolLogMessages(messages as Parameters<typeof mergeToolLogMessages>[0])).toEqual(
      messages,
    );
  });

  test('does not merge when inputPartIndex differs', () => {
    const messages = [
      {
        role: 'assistant' as const,
        parts: [
          {
            type: 'tool-call' as const,
            toolCall: { toolCallId: '1', toolName: 'a', input: { inputPartIndex: 0 } },
          },
        ],
      },
      {
        role: 'assistant' as const,
        parts: [
          {
            type: 'tool-call' as const,
            toolCall: { toolCallId: '2', toolName: 'b', input: { inputPartIndex: 1 } },
          },
        ],
      },
    ] as unknown as {
      id: string;
      role: string;
      threadId: string;
      createdAt: string;
      parts: unknown[];
      metadata?: unknown;
    }[];
    const result = mergeToolLogMessages(messages as Parameters<typeof mergeToolLogMessages>[0]);
    expect(result).toHaveLength(2);
  });
});

describe('buildThreadToolInvocationParts', () => {
  test('returns empty array for undefined', () => {
    expect(buildThreadToolInvocationParts(undefined)).toEqual([]);
  });

  test('returns empty array for empty object', () => {
    expect(buildThreadToolInvocationParts({})).toEqual([]);
  });

  test('returns empty array for object without invocation', () => {
    expect(buildThreadToolInvocationParts({ other: 'field' })).toEqual([]);
  });

  test('returns empty array when invocation is empty', () => {
    expect(buildThreadToolInvocationParts({ invocation: {} })).toEqual([]);
  });

  test('returns empty array when invocation has no toolCalls', () => {
    expect(buildThreadToolInvocationParts({ invocation: { toolCalls: null } })).toEqual([]);
  });
});

describe('collectConversationParticipants', () => {
  test('returns unique participants from participants array', () => {
    const result = collectConversationParticipants({
      name: 'room',
      participants: ['Alice', 'Bob', 'Alice', 'Charlie'],
      messages: [],
    });
    expect(result).toContain('Alice');
    expect(result).toContain('Bob');
    expect(result).toContain('Charlie');
    expect(result).not.toContain('room');
  });

  test('extracts authorDisplayName from messages', () => {
    const result = collectConversationParticipants({
      name: 'room',
      participants: [],
      messages: [{ authorDisplayName: 'Alice' }, { authorDisplayName: 'Bob' }],
    });
    expect(result).toContain('Alice');
    expect(result).toContain('Bob');
  });

  test('excludes room name from participants', () => {
    const result = collectConversationParticipants({
      name: 'MainRoom',
      participants: ['MainRoom', 'Alice'],
      messages: [],
    });
    expect(result).not.toContain('MainRoom');
    expect(result).toContain('Alice');
  });

  test('deduplicates across participants and messages', () => {
    const result = collectConversationParticipants({
      name: 'room',
      participants: ['Alice'],
      messages: [{ authorDisplayName: 'Alice' }, { authorDisplayName: 'Bob' }],
    });
    expect(result.filter((n) => n === 'Alice')).toHaveLength(1);
  });
});

describe('isTextPart', () => {
  test('returns true for text part', () => {
    expect(isTextPart({ type: 'text', text: 'hello' })).toBe(true);
  });

  test('returns true for reasoning part', () => {
    expect(isTextPart({ type: 'reasoning', text: 'thinking...' })).toBe(true);
  });

  test('returns false for tool-call part', () => {
    expect(isTextPart({ type: 'tool-call' })).toBe(false);
  });

  test('returns false for part with empty text', () => {
    expect(isTextPart({ type: 'text', text: '' })).toBe(false);
  });

  test('returns false for part with undefined text', () => {
    expect(isTextPart({ type: 'text' })).toBe(false);
  });

  test('returns false for part with null text', () => {
    expect(isTextPart({ type: 'text', text: undefined })).toBe(false);
  });
});
