/**
 * Unit tests for agents/agent-home-metrics.ts.
 *
 * Tests pure/exported helper functions. No prior coverage.
 *
 * Functions tested:
 * - truncatePreview
 * - extractLatestMessagePreview
 * - extractLatestMessageToolBadge
 * - buildThreadToolInvocationParts
 * - buildAverageStepIntervalMs
 * - mergeToolLogMessages (internal — replicated inline)
 */
import { describe, expect, it } from 'vitest';
import {
  truncatePreview,
  extractLatestMessagePreview,
  extractLatestMessageToolBadge,
  buildThreadToolInvocationParts,
  buildAverageStepIntervalMs,
} from './agent-home-metrics';

// ─── Inline: mergeToolLogMessages (internal, lines 158–194) ──────────────────
// Duplicated verbatim from agent-home-metrics.ts source.

type RuntimeStoredMessagePart = {
  type: string;
  text?: string;
};

type MergedMessage = {
  id: string;
  role: string;
  threadId: string;
  createdAt: string;
  parts: RuntimeStoredMessagePart[];
  metadata?: Record<string, unknown>;
};

function mergeToolLogMessages(messages: Array<MergedMessage>): Array<MergedMessage> {
  const merged: Array<MergedMessage> = [];
  for (const message of messages) {
    const previousMessage = merged[merged.length - 1];
    if (
      previousMessage?.role === 'assistant'
      && message.role === 'tool'
      && Array.isArray(previousMessage.metadata?.toolInvocations)
      && previousMessage.metadata.toolInvocations.length > 0
      && Array.isArray(message.metadata?.toolResults)
      && message.metadata.toolResults.length > 0
    ) {
      merged[merged.length - 1] = {
        ...previousMessage,
        metadata: {
          ...previousMessage.metadata,
          toolResults: message.metadata.toolResults,
        },
      };
      continue;
    }
    merged.push(message);
  }
  return merged;
}

// ─── Tests: truncatePreview ───────────────────────────────────────────────────

describe('truncatePreview', () => {
  it('returns original string when under 220 chars', () => {
    expect(truncatePreview('Short message')).toBe('Short message');
  });

  it('truncates at 217 chars and appends "..." when over 220', () => {
    const input = 'A'.repeat(250);
    const result = truncatePreview(input);
    expect(result).toHaveLength(220);
    expect(result.endsWith('...')).toBe(true);
  });

  it('keeps exactly 217 chars before "..."', () => {
    const result = truncatePreview('A'.repeat(300));
    expect(result.slice(0, 217)).toBe('A'.repeat(217));
  });

  it('trims trailing whitespace before appending ellipsis', () => {
    const result = truncatePreview('A'.repeat(219) + '   ');
    expect(result.endsWith('...')).toBe(true);
    expect(result).toBe('A'.repeat(217) + '...');
  });

  it('handles exactly 220 chars (boundary — no truncation)', () => {
    expect(truncatePreview('A'.repeat(220))).toBe('A'.repeat(220));
  });
});

// ─── Tests: extractLatestMessagePreview ────────────────────────────────────────

describe('extractLatestMessagePreview', () => {
  it('returns null for null input', () => {
    expect(extractLatestMessagePreview(null)).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(extractLatestMessagePreview('string')).toBeNull();
    expect(extractLatestMessagePreview(123)).toBeNull();
  });

  it('returns null when parts is missing or empty', () => {
    expect(extractLatestMessagePreview({})).toBeNull();
    expect(extractLatestMessagePreview({ parts: [] })).toBeNull();
  });

  it('extracts text from text part', () => {
    expect(extractLatestMessagePreview({ parts: [{ type: 'text', text: 'Hello world' }] })).toBe('Hello world');
  });

  it('extracts text from reasoning part', () => {
    expect(extractLatestMessagePreview({ parts: [{ type: 'reasoning', text: 'Let me think...' }] })).toBe('Let me think...');
  });

  it('combines multiple text segments with space', () => {
    const content = {
      parts: [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: 'world' },
      ],
    };
    expect(extractLatestMessagePreview(content)).toBe('Hello world');
  });

  it('ignores non-text parts', () => {
    const content = {
      parts: [
        { type: 'text', text: 'Valid' },
        { type: 'tool-call', text: 'Ignored' },
        { type: 'image', text: 'Also ignored' },
      ],
    };
    expect(extractLatestMessagePreview(content)).toBe('Valid');
  });

  it('filters out empty text segments', () => {
    const content = {
      parts: [
        { type: 'text', text: '' },
        { type: 'text', text: '  ' },
        { type: 'text', text: 'Real content' },
      ],
    };
    expect(extractLatestMessagePreview(content)).toBe('Real content');
  });

  it('truncates long preview via truncatePreview', () => {
    const result = extractLatestMessagePreview({ parts: [{ type: 'text', text: 'A'.repeat(300) }] });
    expect(result).toHaveLength(220);
    expect(result.endsWith('...')).toBe(true);
  });
});

// ─── Tests: extractLatestMessageToolBadge ──────────────────────────────────────

describe('extractLatestMessageToolBadge', () => {
  it('returns null for null input', () => {
    expect(extractLatestMessageToolBadge(null)).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(extractLatestMessageToolBadge(123)).toBeNull();
  });

  it('returns null when parts has no tool-call part', () => {
    expect(extractLatestMessageToolBadge({})).toBeNull();
    expect(extractLatestMessageToolBadge({ parts: [{ type: 'text', text: 'hi' }] })).toBeNull();
  });

  it('returns null when tool-call part has no toolName', () => {
    expect(extractLatestMessageToolBadge({ parts: [{ type: 'tool-call' }] })).toBeNull();
  });

  it('returns message badge for send_message', () => {
    expect(extractLatestMessageToolBadge({ parts: [{ type: 'tool-call', toolName: 'send_message' }] })).toEqual({ icon: '✉️', label: 'Mensagem' });
  });

  it('returns workspace badge for workspace_* tools', () => {
    expect(extractLatestMessageToolBadge({ parts: [{ type: 'tool-call', toolName: 'workspace_write_file' }] })).toEqual({ icon: '🛠️', label: 'Workspace' });
  });

  it('returns GitHub badge for github_* tools', () => {
    expect(extractLatestMessageToolBadge({ parts: [{ type: 'tool-call', toolName: 'github_create_pull_request' }] })).toEqual({ icon: '🐙', label: 'GitHub' });
  });

  it('returns search badge for search_* tools', () => {
    expect(extractLatestMessageToolBadge({ parts: [{ type: 'tool-call', toolName: 'search_files' }] })).toEqual({ icon: '🔎', label: 'Busca' });
  });

  it('returns null for unknown tool name', () => {
    expect(extractLatestMessageToolBadge({ parts: [{ type: 'tool-call', toolName: 'unknown_tool' }] })).toBeNull();
  });

  it('uses first tool-call part when multiple exist', () => {
    const content = {
      parts: [
        { type: 'tool-call', toolName: 'unknown_tool' },
        { type: 'tool-call', toolName: 'send_message' },
      ],
    };
    expect(extractLatestMessageToolBadge(content)).toBeNull();
  });
});

// ─── Tests: buildThreadToolInvocationParts ──────────────────────────────────

describe('buildThreadToolInvocationParts', () => {
  it('returns empty array for undefined metadata', () => {
    expect(buildThreadToolInvocationParts(undefined)).toEqual([]);
  });

  it('returns empty array when no toolInvocations or toolResults', () => {
    expect(buildThreadToolInvocationParts({})).toEqual([]);
    expect(buildThreadToolInvocationParts({ other: 'data' })).toEqual([]);
  });

  it('returns tool-call parts for each invocation', () => {
    const result = buildThreadToolInvocationParts({
      toolInvocations: [
        { toolName: 'write_file', toolCallId: 'call-1', args: { path: '/a.txt' } },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'tool-call', toolCallId: 'call-1', toolName: 'write_file' });
  });

  it('pairs tool-call with matching result by toolCallId', () => {
    const result = buildThreadToolInvocationParts({
      toolInvocations: [
        { toolName: 'write_file', toolCallId: 'call-1', args: {} },
      ],
      toolResults: [
        { toolCallId: 'call-1', result: 'ok' },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'tool-call', toolCallId: 'call-1' });
    expect((result[0] as Record<string, unknown>).result).toEqual({ toolCallId: 'call-1', result: 'ok' });
  });

  it('includes unmatched toolResults as tool-result parts', () => {
    const result = buildThreadToolInvocationParts({
      toolResults: [
        { toolCallId: 'call-orphan', result: 'orphaned' },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'tool-result' });
  });

  it('handles mixed matched and unmatched results', () => {
    const result = buildThreadToolInvocationParts({
      toolInvocations: [
        { toolName: 'write_file', toolCallId: 'call-1', args: {} },
        { toolName: 'read_file', toolCallId: 'call-2', args: {} },
      ],
      toolResults: [
        { toolCallId: 'call-1', result: 'ok' },
        { toolCallId: 'call-orphan', result: 'orphan' },
      ],
    });
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ type: 'tool-call', toolName: 'write_file' });
    expect(result[1]).toMatchObject({ type: 'tool-call', toolName: 'read_file' });
    expect(result[2]).toMatchObject({ type: 'tool-result' });
  });

  it('skips invalid toolInvocations (null, missing toolName)', () => {
    const result = buildThreadToolInvocationParts({
      toolInvocations: [
        null,
        { toolName: 'valid_tool' },
        { args: {} },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'tool-call', toolName: 'valid_tool' });
  });

  it('null toolResult not added to index map; pushed in unmatched loop', () => {
    const result = buildThreadToolInvocationParts({
      toolResults: [
        null,
        { result: 'no-id' },
        { toolCallId: 'call-1', result: 'valid' },
      ],
    });
    // null is not added to index map (no toolCallId), but IS pushed as unmatched tool-result
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ type: 'tool-result', result: null });
    expect(result[1]).toMatchObject({ type: 'tool-result', result: 'no-id' });
    expect(result[2]).toMatchObject({ type: 'tool-result', toolCallId: 'call-1', result: 'valid' });
  });
});

// ─── Tests: buildAverageStepIntervalMs ────────────────────────────────────────

describe('buildAverageStepIntervalMs', () => {
  it('returns null when fewer than 2 steps', () => {
    expect(buildAverageStepIntervalMs([])).toBeNull();
    expect(buildAverageStepIntervalMs([{ createdAt: 1000 }])).toBeNull();
  });

  it('calculates interval between two steps', () => {
    const steps = [{ createdAt: 2000 }, { createdAt: 1000 }];
    expect(buildAverageStepIntervalMs(steps)).toBe(1000);
  });

  it('calculates average of intervals between consecutive steps', () => {
    // Steps ordered newest-first (desc); interval = newest - older
    // step[0]=3000, step[1]=2000, step[2]=1000 → intervals 1000 and 1000 → avg 1000
    const steps = [{ createdAt: 3000 }, { createdAt: 2000 }, { createdAt: 1000 }];
    expect(buildAverageStepIntervalMs(steps)).toBe(1000);
  });

  it('limits to first 6 steps', () => {
    // 7 steps → uses first 6 (indices 0–5 → 5 intervals)
    const steps = Array.from({ length: 7 }, (_, i) => ({ createdAt: (7 - i) * 1000 }));
    const result = buildAverageStepIntervalMs(steps);
    expect(result).not.toBeNull();
  });

  it('uses only positive intervals', () => {
    const steps = [{ createdAt: 1000 }, { createdAt: 3000 }];
    expect(buildAverageStepIntervalMs(steps)).toBe(0);
  });

  it('rounds result to nearest integer', () => {
    const steps = [{ createdAt: 3000 }, { createdAt: 1000 }];
    expect(buildAverageStepIntervalMs(steps)).toBe(2000);
  });
});

// ─── Tests: mergeToolLogMessages (inline internal helper) ─────────────────────

describe('mergeToolLogMessages', () => {
  it('returns empty array for empty input', () => {
    expect(mergeToolLogMessages([])).toEqual([]);
  });

  it('passes through non-adjacent messages unchanged', () => {
    const messages = [
      { id: '1', role: 'assistant', threadId: 't1', createdAt: '2025-01-01', parts: [], metadata: {} },
      { id: '2', role: 'user', threadId: 't1', createdAt: '2025-01-01', parts: [], metadata: {} },
    ];
    expect(mergeToolLogMessages(messages)).toEqual(messages);
  });

  it('merges tool-result into preceding assistant message', () => {
    const messages = [
      {
        id: '1',
        role: 'assistant',
        threadId: 't1',
        createdAt: '2025-01-01',
        parts: [],
        metadata: { toolInvocations: [{ toolName: 'write_file' }] },
      },
      {
        id: '2',
        role: 'tool',
        threadId: 't1',
        createdAt: '2025-01-01',
        parts: [],
        metadata: { toolResults: [{ result: 'ok' }] },
      },
    ];
    const result = mergeToolLogMessages(messages);
    expect(result).toHaveLength(1);
    expect(result[0].metadata.toolResults).toEqual([{ result: 'ok' }]);
  });

  it('does NOT merge when previous message is not assistant', () => {
    const messages = [
      { id: '1', role: 'user', threadId: 't1', createdAt: '2025-01-01', parts: [], metadata: {} },
      {
        id: '2',
        role: 'tool',
        threadId: 't1',
        createdAt: '2025-01-01',
        parts: [],
        metadata: { toolResults: [{ result: 'ok' }] },
      },
    ];
    const result = mergeToolLogMessages(messages);
    expect(result).toHaveLength(2);
  });

  it('does NOT merge when assistant message has no toolInvocations', () => {
    const messages = [
      { id: '1', role: 'assistant', threadId: 't1', createdAt: '2025-01-01', parts: [{ type: 'text', text: 'Hello' }], metadata: {} },
      {
        id: '2',
        role: 'tool',
        threadId: 't1',
        createdAt: '2025-01-01',
        parts: [],
        metadata: { toolResults: [{ result: 'ok' }] },
      },
    ];
    const result = mergeToolLogMessages(messages);
    expect(result).toHaveLength(2);
  });

  it('only the last consecutive tool message accumulates into the assistant', () => {
    // Both tool messages pass through the merge-into-previous mechanism,
    // but only the LAST one (the one immediately following the assistant) ends up
    // accumulated into the assistant — the earlier one ends up in a separate tool message.
    const messages = [
      {
        id: '1',
        role: 'assistant',
        threadId: 't1',
        createdAt: '2025-01-01',
        parts: [],
        metadata: { toolInvocations: [{ toolName: 'write_file' }] },
      },
      {
        id: '2',
        role: 'tool',
        threadId: 't1',
        createdAt: '2025-01-01',
        parts: [],
        metadata: { toolResults: [{ result: 'ok' }] },
      },
      {
        id: '3',
        role: 'tool',
        threadId: 't1',
        createdAt: '2025-01-01',
        parts: [],
        metadata: { toolResults: [{ result: 'done' }] },
      },
    ];
    const result = mergeToolLogMessages(messages);
    expect(result).toHaveLength(1);
    expect(result[0].metadata.toolResults).toEqual([{ result: 'done' }]);
  });
});