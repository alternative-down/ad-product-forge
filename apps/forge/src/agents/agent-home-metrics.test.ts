import { describe, expect, it, vi } from 'vitest';

// -----------------------------------------------------------------------
// Mock @forge-runtime/core so the module can be loaded without a full build.
// -----------------------------------------------------------------------
vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
  toMastraSafeIdentifier: (s: string) => s,
  LibsqlConversationStore: vi.fn(),
  readOperationalMemoryState: vi.fn(),
}));

// -----------------------------------------------------------------------
// Import all utilities under test — loaded after mocks are registered so
// the module graph resolves.
// -----------------------------------------------------------------------
import {
  truncatePreview,
  extractLatestMessagePreview,
  extractLatestMessageToolBadge,
  buildAverageStepIntervalMs,
  buildThreadToolInvocationParts,
} from './agent-home-metrics';

describe('agent-home-metrics utilities', () => {
  describe('truncatePreview', () => {
    it('returns the input unchanged when under 220 characters', () => {
      expect(truncatePreview('This is a short preview.')).toBe('This is a short preview.');
    });

    it('truncates strings longer than 220 characters with ellipsis', () => {
      const result = truncatePreview('a'.repeat(250));
      expect(result.length).toBeLessThanOrEqual(220);
      expect(result.endsWith('...')).toBe(true);
    });

    it('produces exactly 220 characters including ellipsis for long input', () => {
      expect(truncatePreview('x'.repeat(500))).toBe('x'.repeat(217) + '...');
    });

    it('leaves a string at exactly 220 characters untouched', () => {
      expect(truncatePreview('y'.repeat(220))).toBe('y'.repeat(220));
    });

    it('handles empty string', () => {
      expect(truncatePreview('')).toBe('');
    });
  });

  describe('extractLatestMessagePreview', () => {
    it('returns null when content is not an object', () => {
      expect(extractLatestMessagePreview(null)).toBe(null);
      expect(extractLatestMessagePreview('string')).toBe(null);
      expect(extractLatestMessagePreview(undefined)).toBe(null);
    });

    it('returns null when parts is not an array', () => {
      expect(extractLatestMessagePreview({ parts: 'not an array' })).toBe(null);
    });

    it('returns null when no text or reasoning parts exist', () => {
      expect(extractLatestMessagePreview({ parts: [{ type: 'tool-call', text: 'ignored' }] })).toBe(null);
    });

    it('extracts and joins text and reasoning parts, then truncates', () => {
      const longText = 'x'.repeat(300);
      const result = extractLatestMessagePreview({
        parts: [
          { type: 'text', text: 'Hello, ' },
          { type: 'reasoning', text: 'thinking... ' },
          { type: 'text', text: longText },
        ],
      });
      expect(result).not.toBeNull();
      expect(result!.length).toBeLessThanOrEqual(220);
      expect(result!.startsWith('Hello, thinking... ')).toBe(true);
    });

    it('truncates combined text exceeding 220 characters', () => {
      const result = extractLatestMessagePreview({
        parts: [{ type: 'text', text: 'a'.repeat(250) }],
      });
      expect(result).not.toBeNull();
      expect(result!.length).toBeLessThanOrEqual(220);
      expect(result!.endsWith('...')).toBe(true);
    });

    it('filters out empty/whitespace-only text parts', () => {
      expect(
        extractLatestMessagePreview({
          parts: [{ type: 'text', text: '' }, { type: 'text', text: '  ' }, { type: 'text', text: 'valid' }],
        }),
      ).toBe('valid');
    });
  });

  describe('extractLatestMessageToolBadge', () => {
    it('returns null when content is not an object', () => {
      expect(extractLatestMessageToolBadge(null)).toBe(null);
      expect(extractLatestMessageToolBadge(42)).toBe(null);
    });

    it('returns null when no tool-call part is present', () => {
      expect(extractLatestMessageToolBadge({ parts: [{ type: 'text', text: 'hello' }] })).toBe(null);
    });

    it('returns null when tool-call part has no toolName', () => {
      expect(extractLatestMessageToolBadge({ parts: [{ type: 'tool-call' }] })).toBe(null);
    });

    it('returns message badge for send_message tool', () => {
      expect(
        extractLatestMessageToolBadge({ parts: [{ type: 'tool-call', toolName: 'send_message', toolCallId: 'abc' }] }),
      ).toEqual({ icon: '✉️', label: 'Mensagem' });
    });

    it('returns workspace badge for workspace_ prefixed tools', () => {
      expect(
        extractLatestMessageToolBadge({ parts: [{ type: 'tool-call', toolName: 'workspace_write_file', toolCallId: 'abc' }] }),
      ).toEqual({ icon: '🛠️', label: 'Workspace' });
    });

    it('returns github badge for github_ prefixed tools', () => {
      expect(
        extractLatestMessageToolBadge({
          parts: [{ type: 'tool-call', toolName: 'github_create_pull_request', toolCallId: 'abc' }],
        }),
      ).toEqual({ icon: '🐙', label: 'GitHub' });
    });

    it('returns search badge for search_ prefixed tools', () => {
      expect(
        extractLatestMessageToolBadge({ parts: [{ type: 'tool-call', toolName: 'search_docs', toolCallId: 'abc' }] }),
      ).toEqual({ icon: '🔎', label: 'Busca' });
    });

    it('returns null for unrecognized tool name', () => {
      expect(
        extractLatestMessageToolBadge({ parts: [{ type: 'tool-call', toolName: 'custom_tool', toolCallId: 'abc' }] }),
      ).toBe(null);
    });
  });

  describe('buildAverageStepIntervalMs', () => {
    it('returns null for empty array', () => {
      expect(buildAverageStepIntervalMs([])).toBe(null);
    });

    it('returns null for single step', () => {
      expect(buildAverageStepIntervalMs([{ createdAt: 1000 }])).toBe(null);
    });

    it('returns 0 for two identical timestamps (zero interval is a valid number)', () => {
      // Math.max(0, 0) = 0, which is a number, not null — filter keeps it
      expect(buildAverageStepIntervalMs([{ createdAt: 1000 }, { createdAt: 1000 }])).toBe(0);
    });

    it('returns correct average interval for multiple steps (descending timestamps)', () => {
      // Steps newest-first: 5000,4000,3000,2000,1000,0 — intervals all 1000 → avg=1000
      expect(
        buildAverageStepIntervalMs([5000, 4000, 3000, 2000, 1000, 0].map((t) => ({ createdAt: t }))),
      ).toBe(1000);
    });

    it('uses only the first 6 steps', () => {
      // 7 steps: first 6 avg=1000, 7th (at 0) creates interval 1000 with 6th
      // but since only first 6 are sliced, 7th is excluded → avg stays 1000
      expect(
        buildAverageStepIntervalMs([6000, 5000, 4000, 3000, 2000, 1000, 0].map((t) => ({ createdAt: t }))),
      ).toBe(1000);
    });

    it('rounds to nearest integer', () => {
      // intervals: 333, 333, 333 → avg=333 (no fractional part to round)
      expect(buildAverageStepIntervalMs([999, 666, 333].map((t) => ({ createdAt: t })))).toBe(333);
    });

    it('handles larger intervals', () => {
      // intervals: 5000, 5000 → avg=5000
      expect(buildAverageStepIntervalMs([10000, 5000, 0].map((t) => ({ createdAt: t })))).toBe(5000);
    });
  });

  describe('buildThreadToolInvocationParts', () => {
    it('returns empty array when metadata is undefined', () => {
      expect(buildThreadToolInvocationParts(undefined)).toEqual([]);
    });

    it('returns empty array when no toolInvocations or toolResults exist', () => {
      expect(buildThreadToolInvocationParts({})).toEqual([]);
    });

    it('returns empty array when toolInvocations is not an array', () => {
      expect(buildThreadToolInvocationParts({ toolInvocations: 'invalid' })).toEqual([]);
    });

    it('skips invocations that are not objects or lack a toolName string', () => {
      const result = buildThreadToolInvocationParts({
        toolInvocations: [null, undefined, { name: 'not-toolName' }, { toolName: 'valid_tool' }],
      });
      expect(result).toHaveLength(1);
      expect(result[0].toolName).toBe('valid_tool');
    });

    it('excludes results without a string toolCallId from the index, but still emits them as unmatched tool-result parts', () => {
      // Results with non-string toolCallId are skipped for matching,
      // but still output at the end as unmatched tool-result parts.
      const metadata = {
        toolInvocations: [],
        toolResults: [
          { toolCallId: null },
          { toolCallId: undefined },
          { toolCallId: 123 as unknown as string },
          { toolCallId: 'valid-id', result: { output: 'ok' } },
        ],
      };
      const result = buildThreadToolInvocationParts(metadata);
      // 3 invalid results are emitted as tool-result parts (no index entry),
      // plus 1 valid result that was never matched → all 4 emitted.
      expect(result).toHaveLength(4);
      expect(result.filter((p) => p.type === 'tool-result')).toHaveLength(4);
    });

    it('pairs invocations with their matching results by toolCallId', () => {
      const metadata = {
        toolInvocations: [
          { toolName: 'send_message', toolCallId: 'call-1', args: { to: 'alice' } },
          { toolName: 'workspace_write_file', toolCallId: 'call-2', args: { path: '/test' } },
        ],
        toolResults: [
          { toolCallId: 'call-2', result: { success: true } },
          { toolCallId: 'call-1', result: { sent: true } },
        ],
      };
      const result = buildThreadToolInvocationParts(metadata);
      // call-1 invocation output first (order from toolInvocations), result attached
      expect(result).toHaveLength(2);
      expect(result[0].toolName).toBe('send_message');
      expect((result[0] as Record<string, unknown>).result).toEqual({ toolCallId: "call-1", result: { sent: true } });
      expect(result[1].toolName).toBe('workspace_write_file');
      expect((result[1] as Record<string, unknown>).result).toEqual({ toolCallId: "call-2", result: { success: true } });
    });

    it('outputs unmatched results as tool-result parts after all invocations', () => {
      const metadata = {
        toolInvocations: [{ toolName: 'send_message', toolCallId: 'call-1', args: {} }],
        toolResults: [
          { toolCallId: 'call-1', result: { sent: true } },
          { toolCallId: 'unmatched-call', result: { error: 'not found' } },
        ],
      };
      const result = buildThreadToolInvocationParts(metadata);
      expect(result).toHaveLength(2);
      expect(result[0].toolName).toBe('send_message');
      expect(result[1].type).toBe('tool-result');
      expect((result[1] as Record<string, unknown>).toolCallId).toBe('unmatched-call');
    });

    it('handles null toolCallId on invocation without crashing', () => {
      const result = buildThreadToolInvocationParts({
        toolInvocations: [{ toolName: 'some_tool', toolCallId: null as unknown as string, args: {} }],
        toolResults: [],
      });
      expect(result).toHaveLength(1);
      expect((result[0] as Record<string, unknown>).toolCallId).toBe(null);
    });
  });
});
