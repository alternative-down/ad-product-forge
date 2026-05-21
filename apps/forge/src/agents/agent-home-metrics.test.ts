import { describe, it, expect } from 'vitest';
import {
  truncatePreview,
  extractLatestMessagePreview,
  extractLatestMessageToolBadge,
} from './agent-home-metrics-preview-helpers';
import { buildThreadToolInvocationParts } from './agent-home-metrics-tool-helpers';
import { buildAverageStepIntervalMs } from './agent-home-metrics-thread-helpers';

describe('agent-home-metrics', () => {
  describe('truncatePreview', () => {
    it('returns empty string unchanged', () => {
      expect(truncatePreview('')).toBe('');
    });

    it('returns strings at boundary unchanged', () => {
      expect(truncatePreview('a'.repeat(220))).toBe('a'.repeat(220));
    });

    it('truncates strings over 220 chars with ellipsis', () => {
      const long = 'a'.repeat(250);
      const result = truncatePreview(long);
      expect(result.length).toBe(220); // 217 chars + '...'
      expect(result.endsWith('...')).toBe(true);
      expect(result.startsWith('a'.repeat(217))).toBe(true);
    });

    it('uses trimEnd on truncation point', () => {
      // 220 chars exactly should be unchanged
      expect(truncatePreview('a'.repeat(220)).length).toBe(220);
    });
  });

  describe('extractLatestMessagePreview', () => {
    it('returns null for null/undefined', () => {
      expect(extractLatestMessagePreview(null)).toBeNull();
      expect(extractLatestMessagePreview(undefined)).toBeNull();
    });

    it('returns null for non-object input', () => {
      expect(extractLatestMessagePreview('string')).toBeNull();
    });

    it('returns null when parts is empty or undefined', () => {
      expect(extractLatestMessagePreview({ parts: [] })).toBeNull();
      expect(extractLatestMessagePreview({})).toBeNull();
    });

    it('extracts joined text from all text/reasoning parts', () => {
      const content = {
        parts: [
          { type: 'text', text: 'First' },
          { type: 'text', text: 'Second' },
        ],
      };
      // Joins ALL text segments, then applies truncatePreview
      expect(extractLatestMessagePreview(content)).toBe('First Second');
    });

    it('extracts joined text from reasoning parts too', () => {
      const content = {
        parts: [
          { type: 'reasoning', text: 'Thinking...' },
          { type: 'reasoning', text: 'Final thought' },
        ],
      };
      expect(extractLatestMessagePreview(content)).toBe('Thinking... Final thought');
    });

    it('skips empty text segments', () => {
      const content = {
        parts: [
          { type: 'text', text: 'Valid' },
          { type: 'text', text: '' },
          { type: 'text', text: '' },
        ],
      };
      expect(extractLatestMessagePreview(content)).toBe('Valid');
    });

    it('skips non-text/reasoning parts', () => {
      const content = {
        parts: [
          { type: 'tool-call', toolName: 'test' },
          { type: 'text', text: 'Real response' },
        ],
      };
      expect(extractLatestMessagePreview(content)).toBe('Real response');
    });

    it('returns null when no text parts with content', () => {
      const content = {
        parts: [
          { type: 'tool-call', toolName: 'test' },
          { type: 'reasoning', text: '' },
        ],
      };
      expect(extractLatestMessagePreview(content)).toBeNull();
    });

    it('applies truncatePreview to joined text', () => {
      const content = {
        parts: [
          { type: 'text', text: 'Part1 ' },
          { type: 'text', text: 'Part2' },
        ],
      };
      const result = extractLatestMessagePreview(content);
      expect(result).toBe('Part1 Part2');
    });
  });

  describe('extractLatestMessageToolBadge', () => {
    it('returns null for null/undefined', () => {
      expect(extractLatestMessageToolBadge(null)).toBeNull();
      expect(extractLatestMessageToolBadge(undefined)).toBeNull();
    });

    it('returns null for non-object input', () => {
      expect(extractLatestMessageToolBadge('string')).toBeNull();
    });

    it('returns null when no tool-call parts', () => {
      expect(extractLatestMessageToolBadge({ parts: [] })).toBeNull();
    });

    it('returns null when tool-call has no toolName', () => {
      const content = {
        parts: [{ type: 'tool-call' }],
      };
      expect(extractLatestMessageToolBadge(content)).toBeNull();
    });

    it('returns null for unknown tool names', () => {
      const content = {
        parts: [{ type: 'tool-call', toolName: 'unknown_tool' }],
      };
      expect(extractLatestMessageToolBadge(content)).toBeNull();
    });

    it('maps send_message to message icon', () => {
      const content = {
        parts: [{ type: 'tool-call', toolName: 'send_message' }],
      };
      expect(extractLatestMessageToolBadge(content)).toEqual({ icon: '✉️', label: 'Mensagem' });
    });

    it('maps workspace_ prefix to workspace icon', () => {
      const content = {
        parts: [{ type: 'tool-call', toolName: 'workspace_update_memory' }],
      };
      expect(extractLatestMessageToolBadge(content)).toEqual({ icon: '🛠️', label: 'Workspace' });
    });

    it('maps github_ prefix to github icon', () => {
      const content = {
        parts: [{ type: 'tool-call', toolName: 'github_create_issue' }],
      };
      expect(extractLatestMessageToolBadge(content)).toEqual({ icon: '🐙', label: 'GitHub' });
    });

    it('maps search_ prefix to search icon', () => {
      const content = {
        parts: [{ type: 'tool-call', toolName: 'search_web' }],
      };
      expect(extractLatestMessageToolBadge(content)).toEqual({ icon: '🔎', label: 'Busca' });
    });
  });

  describe('buildThreadToolInvocationParts', () => {
    it('returns empty array for null/undefined', () => {
      expect(buildThreadToolInvocationParts(null as any)).toEqual([]);
      expect(buildThreadToolInvocationParts(undefined as any)).toEqual([]);
    });

    it('returns empty array for empty object', () => {
      expect(buildThreadToolInvocationParts({})).toEqual([]);
    });

    it('returns empty array when no toolInvocations or toolResults', () => {
      expect(buildThreadToolInvocationParts({ toolInvocations: [], toolResults: [] })).toEqual([]);
    });

    it('builds parts from toolInvocations with toolCallId', () => {
      const metadata = {
        toolInvocations: [{ toolName: 'test', toolCallId: 'tc-1', args: { a: 1 } }],
        toolResults: [],
      };
      const result = buildThreadToolInvocationParts(metadata);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tool-call');
      expect(result[0].toolName).toBe('test');
      expect(result[0].toolCallId).toBe('tc-1');
      expect(result[0].args).toEqual({ a: 1 });
    });

    it('pairs toolInvocations with toolResults by toolCallId', () => {
      const metadata = {
        toolInvocations: [{ toolName: 'test', toolCallId: 'tc-1' }],
        toolResults: [{ toolCallId: 'tc-1', result: { success: true } }],
      };
      const result = buildThreadToolInvocationParts(metadata);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tool-call');
      expect(result[0].toolName).toBe('test');
      expect(result[0].toolCallId).toBe('tc-1');
      // Result includes the full toolResult object
      expect(result[0].result).toEqual({ toolCallId: 'tc-1', result: { success: true } });
    });

    it('includes unmatched toolResults as tool-result parts', () => {
      const metadata = {
        toolInvocations: [],
        toolResults: [{ toolCallId: 'orphan', result: { x: 1 } }],
      };
      const result = buildThreadToolInvocationParts(metadata);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tool-result');
    });

    it('skips toolInvocations without toolName', () => {
      const metadata = {
        toolInvocations: [{ notToolName: true }],
      };
      expect(buildThreadToolInvocationParts(metadata)).toEqual([]);
    });

    it('adds unmatched toolResults as tool-result parts (even without toolCallId)', () => {
      const metadata = {
        toolInvocations: [],
        toolResults: [{ toolCallId: 'orphan', result: { x: 1 } }],
      };
      const result = buildThreadToolInvocationParts(metadata);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tool-result');
      expect(result[0].result).toEqual({ x: 1 });
    });
  });

  describe('buildAverageStepIntervalMs', () => {
    it('returns null for empty array', () => {
      expect(buildAverageStepIntervalMs([])).toBeNull();
    });

    it('returns null for single step', () => {
      expect(buildAverageStepIntervalMs([{ createdAt: 1000 }])).toBeNull();
    });

    it('calculates average interval for descending timestamps', () => {
      // For [6000, 3000, 1000]: intervals are 3000, 2000 -> average = 2500
      expect(
        buildAverageStepIntervalMs([{ createdAt: 6000 }, { createdAt: 3000 }, { createdAt: 1000 }]),
      ).toBe(2500);
    });

    it('returns correct average for two steps', () => {
      // [5000, 0]: interval = 5000-0 = 5000 -> Math.max(5000,0) = 5000
      expect(buildAverageStepIntervalMs([{ createdAt: 5000 }, { createdAt: 0 }])).toBe(5000);
    });

    it('handles exactly 6 steps (uses first 6)', () => {
      // intervals for [6000,5000,4000,3000,2000,1000]: 1000,1000,1000,1000,1000 -> avg = 1000
      const steps = [6000, 5000, 4000, 3000, 2000, 1000].map((t) => ({ createdAt: t }));
      expect(buildAverageStepIntervalMs(steps)).toBe(1000);
    });
  });
});
