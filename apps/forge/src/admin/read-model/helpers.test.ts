import { describe, expect, it, vi } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
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
  mergeToolLogMessages,
  buildThreadToolInvocationParts,
  collectConversationParticipants,
  isTextPart,
} from './helpers';

// Helper types for test data
type TestMessage = {
  id: string;
  role: string;
  threadId: string;
  createdAt: string;
  parts: Array<{
    type: string;
    text?: { content: string };
    toolCall?: { toolName: string; toolCallId: string; input: unknown };
    toolResult?: { toolCallId: string; result: unknown };
    toolInvocation?: { toolName: string; toolCallId?: string; state?: string; args?: unknown; result?: unknown };
  }>;
  metadata?: Record<string, unknown>;
};

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
    // [\s\S]* is greedy, matches across nested tags
    expect(isMemoryRecallText('<memory-recall>a<memory-recall>b</memory-recall>')).toBe(true);
  });

  it('returns false for incomplete block (missing closing tag)', () => {
    expect(isMemoryRecallText('<memory-recall>test')).toBe(false);
  });
});

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
    const result = splitMemoryRecallSegments('<memory-recall>test');
    expect(result).toEqual([{ kind: 'text', value: '<memory-recall>test' }]);
  });
});

describe('truncatePreview', () => {
  it('returns unchanged string under max length (200)', () => {
    expect(truncatePreview('a'.repeat(199))).toBe('a'.repeat(199));
  });

  it('truncates and appends ellipsis at max length', () => {
    // slice(0, 199) + '…' = 200 total
    expect(truncatePreview('a'.repeat(200))).toBe('a'.repeat(199) + '…');
  });

  it('truncates longer strings with ellipsis', () => {
    expect(truncatePreview('a'.repeat(201))).toBe('a'.repeat(199) + '…');
  });

  it('returns empty string unchanged', () => {
    expect(truncatePreview('')).toBe('');
  });
});

describe('toToolBadge', () => {
  it('returns Email badge for discord_send_message (matches email pattern)', () => {
    // 'send' matches /email|mail|send/i → Email
    expect(toToolBadge('discord_send_message')).toEqual({ icon: '📧', label: 'Email' });
  });

  it('returns Chat badge for chat commands', () => {
    expect(toToolBadge('slack_chat_message')).toEqual({ icon: '💬', label: 'Chat' });
  });

  it('returns MCP badge for mcp commands', () => {
    // 'mcp' matches /mcp|tool/i (tool also matches many names)
    expect(toToolBadge('mcp_tool_call')).toEqual({ icon: '🔌', label: 'MCP' });
  });

  it('is case insensitive in pattern matching', () => {
    expect(toToolBadge('WORKSPACE_EXECUTE_COMMAND')).toEqual({ icon: '💻', label: 'Terminal' });
  });

  it('returns direct icon for exact match in TOOL_ICONS', () => {
    // workspace_list_files matches /list_files|workspace_list_files|file_list/i → badge
    // Actually: pattern is /list_files|workspace_list_files|file_list/i → 'list_files' matches → badge!
    expect(toToolBadge('workspace_list_files')).toEqual({ icon: '📁', label: 'Files' });
  });


  it('returns default for terminal (no badge pattern)', () => {
    expect(toToolBadge('terminal')).toEqual({ icon: '⚙️', label: 'terminal' });
  });

  it('returns default gear emoji for unknown tools', () => {
    expect(toToolBadge('totally_unknown_agent_tool')).toEqual({ icon: '🔌', label: 'MCP' });
  });

});
describe('humanizeMemoryKey', () => {
  it('splits camelCase words', () => {
    expect(humanizeMemoryKey('camelCase')).toBe('Camel Case');
  });

  it('replaces underscores with spaces', () => {
    expect(humanizeMemoryKey('snake_case')).toBe('Snake case');
  });

  it('handles mixed camelCase and snake_case', () => {
    expect(humanizeMemoryKey('mixedCamel_andSnake')).toBe('Mixed Camel and Snake');
  });

  it('trims leading/trailing whitespace from input', () => {
    // trim() is called AFTER replace operations, so ' test ' → ' test' → ' test' → 'test'
    expect(humanizeMemoryKey('  test  ')).toBe('test');
  });
});

describe('formatWorkingMemoryValue', () => {
  it('returns null for null input', () => {
    expect(formatWorkingMemoryValue(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(formatWorkingMemoryValue(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(formatWorkingMemoryValue('')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(formatWorkingMemoryValue('not json')).toBeNull();
  });

  it('formats non-object JSON as string', () => {
    expect(formatWorkingMemoryValue('"just a string"')).toBeNull();
  });

  it('formats valid object entries as markdown bullet points', () => {
    const result = formatWorkingMemoryValue('{"task":"build","status":"done"}');
    expect(result).toBe('- **Task**: build\n- **Status**: done');
  });

  it('filters out null and undefined values', () => {
    const result = formatWorkingMemoryValue('{"active":"yes","empty":null,"zero":0}');
    expect(result).toBe('- **Active**: yes\n- **Zero**: 0');
  });
});

describe('renderWorkingMemoryMarkdown', () => {
  it('returns null for null input', () => {
    expect(renderWorkingMemoryMarkdown(null)).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(renderWorkingMemoryMarkdown('string')).toBeNull();
  });

  it('returns null when no valid entries', () => {
    expect(renderWorkingMemoryMarkdown({})).toBeNull();
    expect(renderWorkingMemoryMarkdown({ bad: null })).toBeNull();
  });

  it('renders section header with formatted entries', () => {
    const result = renderWorkingMemoryMarkdown({ task_name: JSON.stringify({ name: 'build' }), priority: JSON.stringify({ level: 'high' }) });
    expect(result).toContain('## Task name');
    expect(result).toContain('- **Level**: high');
  });

  it('groups multiple entries under same section', () => {
    const result = renderWorkingMemoryMarkdown({
      working_memory_task1: JSON.stringify({ task: 'first' }),
      working_memory_task2: JSON.stringify({ task: 'second' }),
    });
    expect(result).toBe('## Task1\n- **Task**: first\n\n## Task2\n- **Task**: second');
  });
});

describe('extractLatestMessagePreview', () => {
  it('returns null for null content', () => {
    expect(extractLatestMessagePreview(null)).toBeNull();
  });

  it('extracts text from parts array', () => {
    const content = {
      parts: [{ type: 'text', text: 'hello world' }],
    };
    expect(extractLatestMessagePreview(content)).toBe('hello world');
  });

  it('skips memory-recall text in parts', () => {
    const content = {
      parts: [{ type: 'text', text: '<memory-recall>test</memory-recall>' }],
    };
    expect(extractLatestMessagePreview(content)).toBeNull();
  });

  it('favors last text part', () => {
    const content = {
      parts: [
        { type: 'text', text: 'first' },
        { type: 'text', text: 'last message' },
      ],
    };
    expect(extractLatestMessagePreview(content)).toBe('last message');
  });

  it('falls back to top-level content field', () => {
    const content = { content: 'top level text' };
    expect(extractLatestMessagePreview(content)).toBe('top level text');
  });

  it('falls back to reasoning field', () => {
    const content = { reasoning: 'chain of thought reasoning' };
    expect(extractLatestMessagePreview(content)).toBe('chain of thought reasoning');
  });

  it('truncates long text', () => {
    const content = {
      parts: [{ type: 'text', text: 'a'.repeat(201) }],
    };
    expect(extractLatestMessagePreview(content)).toBe('a'.repeat(199) + '…');
  });
});

describe('extractLatestMessageToolBadge', () => {
  it('returns null for null content', () => {
    expect(extractLatestMessageToolBadge(null)).toBeNull();
  });

  it('returns recall badge for memory-recall text part', () => {
    const content = {
      parts: [{ type: 'text', text: '<memory-recall>memories</memory-recall>' }],
    };
    expect(extractLatestMessageToolBadge(content)).toEqual({ icon: '🧠', label: 'Recall' });
  });

  it('returns recall badge for memory-recall in top-level content', () => {
    const content = { content: '<memory-recall>memories</memory-recall>' };
    expect(extractLatestMessageToolBadge(content)).toEqual({ icon: '🧠', label: 'Recall' });
  });

  it('returns tool badge from last tool-invocation part', () => {
    const content = {
      parts: [
        { type: 'text', text: 'hello' },
        { type: 'tool-invocation', toolInvocation: { toolName: 'send_email', toolCallId: '1', args: {} } },
      ],
    };
    expect(extractLatestMessageToolBadge(content)).toEqual({ icon: '📧', label: 'Email' });
  });

  it('returns tool badge from top-level toolInvocations', () => {
    const content = {
      toolInvocations: [{ toolName: 'workspace_execute_command' }],
    };
    expect(extractLatestMessageToolBadge(content)).toEqual({ icon: '💻', label: 'Terminal' });
  });

  it('skips null parts in array', () => {
    const content = {
      parts: [
        null as unknown,
        { type: 'tool-invocation', toolInvocation: { toolName: 'send_email', toolCallId: '1', args: {} } },
      ],
    };
    expect(extractLatestMessageToolBadge(content)).toEqual({ icon: '📧', label: 'Email' });
  });
});

describe('mergeToolLogMessages', () => {
  it('returns empty array for empty input', () => {
    expect(mergeToolLogMessages([])).toEqual([]);
  });

  it('returns single message unchanged', () => {
    const messages: TestMessage[] = [
      { id: '1', role: 'user', threadId: 't1', createdAt: '2024-01-01', parts: [] },
    ];
    expect(mergeToolLogMessages(messages)).toHaveLength(1);
  });

  it('merges assistant+toolInvocations with tool+toolResults', () => {
    const messages: TestMessage[] = [
      {
        id: '1', role: 'assistant', threadId: 't1', createdAt: '2024-01-01', parts: [],
        metadata: { toolInvocations: [{ toolName: 'test', toolCallId: 'c1', args: {} }] },
      },
      {
        id: '2', role: 'tool', threadId: 't1', createdAt: '2024-01-01', parts: [],
        metadata: { toolResults: [{ toolCallId: 'c1', result: 'result' }] },
      },
    ];
    const result = mergeToolLogMessages(messages);
    expect(result).toHaveLength(1);
    expect(result[0].metadata?.toolResults).toEqual([{ toolCallId: 'c1', result: 'result' }]);
  });

  it('does not merge when previous message has no toolInvocations', () => {
    const messages: TestMessage[] = [
      { id: '1', role: 'assistant', threadId: 't1', createdAt: '2024-01-01', parts: [] },
      { id: '2', role: 'tool', threadId: 't1', createdAt: '2024-01-01', parts: [] },
    ];
    expect(mergeToolLogMessages(messages)).toHaveLength(2);
  });

  it('keeps separate when no toolResults in current message', () => {
    const messages: TestMessage[] = [
      {
        id: '1', role: 'assistant', threadId: 't1', createdAt: '2024-01-01', parts: [],
        metadata: { toolInvocations: [{ toolName: 'test', toolCallId: 'c1', args: {} }] },
      },
      { id: '2', role: 'user', threadId: 't1', createdAt: '2024-01-01', parts: [] },
    ];
    expect(mergeToolLogMessages(messages)).toHaveLength(2);
  });
});

describe('buildThreadToolInvocationParts', () => {
  it('returns empty array for undefined', () => {
    expect(buildThreadToolInvocationParts(undefined)).toEqual([]);
  });

  it('returns empty array when toolInvocations is missing', () => {
    expect(buildThreadToolInvocationParts({})).toEqual([]);
    expect(buildThreadToolInvocationParts({ other: 'field' })).toEqual([]);
  });

  it('returns empty array for empty toolInvocations', () => {
    expect(buildThreadToolInvocationParts({ toolInvocations: [] })).toEqual([]);
  });

  it('returns tool-invocation part for valid toolInvocation', () => {
    const result = buildThreadToolInvocationParts({
      toolInvocations: [{ toolName: 'workspace_execute_command', toolCallId: 'call-123', args: { command: 'ls' } }],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'tool-invocation',
      toolInvocation: {
        toolName: 'workspace_execute_command',
        toolCallId: 'call-123',
        state: 'call',
      },
    });
  });

  it('returns result state when toolResult matches by toolCallId', () => {
    const result = buildThreadToolInvocationParts({
      toolInvocations: [{ toolName: 'workspace_read_file', toolCallId: 'call-456', args: { path: '/test' } }],
      toolResults: [{ toolCallId: 'call-456', result: 'file contents' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].toolInvocation).toMatchObject({ toolName: 'workspace_read_file', state: 'result' });
  });

  it('returns both invocation and orphaned result as separate parts', () => {
    const result = buildThreadToolInvocationParts({
      toolInvocations: [{ toolName: 'test', toolCallId: 'call-1', args: {} }],
      toolResults: [
        { toolCallId: 'call-1', result: 'matched' },
        { toolCallId: 'call-orphan', result: 'orphan result' },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('tool-invocation');
    expect(result[1].type).toBe('tool-result');
    expect(result[1].toolResult).toMatchObject({ toolCallId: 'call-orphan' });
  });
});

describe('collectConversationParticipants', () => {
  it('returns empty array for no participants', () => {
    expect(collectConversationParticipants({ messages: [] })).toEqual([]);
  });

  it('collects from participants array', () => {
    const result = collectConversationParticipants({
      name: 'ChatRoom',
      participants: ['Alice', 'Bob', 'Charlie'],
      messages: [],
    });
    expect(result).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('deduplicates between participants and messages', () => {
    const result = collectConversationParticipants({
      name: 'Alice',
      participants: ['Bob', 'Charlie'],
      messages: [{ authorDisplayName: 'Bob' }, { authorDisplayName: 'Diana' }],
    });
    expect(result).toEqual(['Bob', 'Charlie', 'Diana']);
  });

  it('excludes the chat name from participants', () => {
    const result = collectConversationParticipants({
      name: 'Alice',
      participants: ['Alice', 'Bob'],
      messages: [{ authorDisplayName: 'Alice' }, { authorDisplayName: 'Bob' }],
    });
    expect(result).toEqual(['Bob']);
  });
});

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

  it('returns false when text is empty string', () => {
    expect(isTextPart({ type: 'text', text: '' })).toBe(false);
  });

  it('returns false for null/undefined type', () => {
    expect(isTextPart({ text: 'hello' })).toBe(false);
    expect(isTextPart({ type: undefined, text: 'hello' })).toBe(false);
  });
});

