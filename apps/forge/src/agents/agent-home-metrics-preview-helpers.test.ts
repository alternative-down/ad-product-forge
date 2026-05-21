import { describe, expect, it } from 'vitest';
import {
  truncatePreview,
  extractLatestMessagePreview,
  extractLatestMessageToolBadge,
} from './agent-home-metrics-preview-helpers';

describe('truncatePreview', () => {
  it('returns value unchanged when under 220 chars', () => {
    const short = 'Hello, this is a short preview text.';
    expect(truncatePreview(short)).toBe(short);
  });

  it('truncates to 217 chars and appends ... when over 220', () => {
    const long = 'a'.repeat(300);
    const result = truncatePreview(long);
    expect(result.length).toBe(220);
  });

  it('handles exactly 220 chars unchanged', () => {
    const exact = 'a'.repeat(220);
    expect(truncatePreview(exact)).toBe(exact);
  });

  it('handles empty string', () => {
    expect(truncatePreview('')).toBe('');
  });

  it('handles 221 chars (just over threshold)', () => {
    const justOver = 'a'.repeat(221);
    const result = truncatePreview(justOver);
    expect(result.length).toBe(220);
  });
});

describe('extractLatestMessagePreview', () => {
  it('returns null for null input', () => {
    expect(extractLatestMessagePreview(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(extractLatestMessagePreview(undefined)).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(extractLatestMessagePreview(42)).toBeNull();
    expect(extractLatestMessagePreview('string')).toBeNull();
    expect(extractLatestMessagePreview([])).toBeNull();
  });

  it('returns null when parts is missing', () => {
    expect(extractLatestMessagePreview({})).toBeNull();
    expect(extractLatestMessagePreview({ foo: 'bar' })).toBeNull();
  });

  it('returns null when parts is not an array', () => {
    expect(extractLatestMessagePreview({ parts: 'not array' })).toBeNull();
    expect(extractLatestMessagePreview({ parts: {} })).toBeNull();
  });

  it('returns null when no text or reasoning parts', () => {
    const content = {
      parts: [
        { type: 'tool-call', toolName: 'send_message' },
        { type: 'image', url: 'http://example.com' },
      ],
    };
    expect(extractLatestMessagePreview(content)).toBeNull();
  });

  it('extracts text from single text part', () => {
    const content = {
      parts: [{ type: 'text', text: 'Hello world' }],
    };
    expect(extractLatestMessagePreview(content)).toBe('Hello world');
  });

  it('extracts text from reasoning part', () => {
    const content = {
      parts: [{ type: 'reasoning', text: 'Thinking about this...' }],
    };
    expect(extractLatestMessagePreview(content)).toBe('Thinking about this...');
  });

  it('joins multiple text and reasoning parts', () => {
    const content = {
      parts: [
        { type: 'text', text: 'First part' },
        { type: 'reasoning', text: 'Second part' },
        { type: 'text', text: 'Third part' },
      ],
    };
    expect(extractLatestMessagePreview(content)).toBe('First part Second part Third part');
  });

  it('trims and filters empty segments', () => {
    const content = {
      parts: [
        { type: 'text', text: '  ' },
        { type: 'reasoning', text: '' },
        { type: 'text', text: 'Valid text' },
        { type: 'text', text: null },
        { type: 'text', text: undefined },
      ],
    };
    expect(extractLatestMessagePreview(content)).toBe('Valid text');
  });

  it('truncates long combined text', () => {
    const content = {
      parts: Array.from({ length: 20 }, () => ({ type: 'text', text: 'word ' })),
    };
    const result = extractLatestMessagePreview(content);
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(220);
  });
});

describe('extractLatestMessageToolBadge', () => {
  it('returns null for null input', () => {
    expect(extractLatestMessageToolBadge(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(extractLatestMessageToolBadge(undefined)).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(extractLatestMessageToolBadge(42)).toBeNull();
    expect(extractLatestMessageToolBadge('string')).toBeNull();
  });

  it('returns null when parts is missing', () => {
    expect(extractLatestMessageToolBadge({})).toBeNull();
  });

  it('returns null when no tool-call part', () => {
    const content = {
      parts: [{ type: 'text', text: 'Hello' }],
    };
    expect(extractLatestMessageToolBadge(content)).toBeNull();
  });

  it('returns null when toolCallPart has no toolName', () => {
    const content = {
      parts: [{ type: 'tool-call', toolCallId: 'abc' }],
    };
    expect(extractLatestMessageToolBadge(content)).toBeNull();
  });

  it('returns Mensagem badge for send_message', () => {
    const content = {
      parts: [{ type: 'tool-call', toolName: 'send_message', toolCallId: 'xyz' }],
    };
    expect(extractLatestMessageToolBadge(content)).toEqual({ icon: '✉️', label: 'Mensagem' });
  });

  it('returns Workspace badge for workspace_* tools', () => {
    const wsContent = {
      parts: [{ type: 'tool-call', toolName: 'workspace_write_file', toolCallId: 'abc' }],
    };
    const wsRead = {
      parts: [{ type: 'tool-call', toolName: 'workspace_read_file', toolCallId: 'abc' }],
    };
    expect(extractLatestMessageToolBadge(wsContent)).toEqual({ icon: '🛠️', label: 'Workspace' });
    expect(extractLatestMessageToolBadge(wsRead)).toEqual({ icon: '🛠️', label: 'Workspace' });
  });

  it('returns GitHub badge for github_* tools', () => {
    const content = {
      parts: [{ type: 'tool-call', toolName: 'github_create_pull_request', toolCallId: 'abc' }],
    };
    expect(extractLatestMessageToolBadge(content)).toEqual({ icon: '🐙', label: 'GitHub' });
  });

  it('returns Buscar badge for search_* tools', () => {
    const content = {
      parts: [{ type: 'tool-call', toolName: 'search_conversations', toolCallId: 'abc' }],
    };
    expect(extractLatestMessageToolBadge(content)).toEqual({ icon: '🔎', label: 'Busca' });
  });

  it('returns null for unrecognized tool names', () => {
    const content = {
      parts: [{ type: 'tool-call', toolName: 'do_something_else', toolCallId: 'abc' }],
    };
    expect(extractLatestMessageToolBadge(content)).toBeNull();
  });

  it('returns null for non-string toolName', () => {
    const content = {
      parts: [{ type: 'tool-call', toolName: 123, toolCallId: 'abc' }],
    };
    expect(extractLatestMessageToolBadge(content)).toBeNull();
  });

  it('returns the first tool-call part badge (not subsequent ones)', () => {
    const content = {
      parts: [
        { type: 'tool-call', toolName: 'send_message', toolCallId: 'first' },
        { type: 'tool-call', toolName: 'workspace_write_file', toolCallId: 'second' },
      ],
    };
    // First tool-call wins
    expect(extractLatestMessageToolBadge(content)).toEqual({ icon: '✉️', label: 'Mensagem' });
  });
});
