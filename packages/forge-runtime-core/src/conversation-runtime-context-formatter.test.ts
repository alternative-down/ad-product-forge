import { describe, expect, it } from 'vitest';
import { createConversationRuntimeContextFormatter } from './conversation-runtime-context-formatter.js';

describe('conversation-runtime-context-formatter', () => {
  const formatter = createConversationRuntimeContextFormatter();

  describe('formatInput', () => {
    it('returns null for internal forge-provider-options type', () => {
      const result = formatter.formatInput({
        id: 'input-1',
        type: 'forge-provider-options',
        payload: { anything: 'goes' },
      });
      expect(result).toBeNull();
    });

    it('returns null for internal forge-system-instruction type', () => {
      const result = formatter.formatInput({
        id: 'input-2',
        type: 'forge-system-instruction',
        payload: { instructions: 'be helpful' },
      });
      expect(result).toBeNull();
    });

    it('formats text-only conversation payload', () => {
      const result = formatter.formatInput({
        id: 'input-3',
        type: 'user-message',
        payload: {
          threadId: 'thread-1',
          role: 'user',
          messageId: 'msg-123',
          parts: [{ type: 'text', text: 'Hello there' }],
        },
      });
      expect(result).not.toBeNull();
      expect(result!.text).toBe('Hello there');
      expect(result!.kind).toBe('input:conversation-message:user');
      expect(result!.id).toBe('conversation-message:msg-123');
    });

    it('formats conversation payload with authorId in title', () => {
      const result = formatter.formatInput({
        id: 'input-4',
        type: 'assistant-message',
        payload: {
          threadId: 'thread-2',
          role: 'assistant',
          messageId: 'msg-456',
          authorId: 'user-789',
          parts: [{ type: 'text', text: 'Hello' }],
        },
      });
      expect(result!.title).toContain('user-789');
      expect(result!.title).toContain('assistant');
    });

    it('formats payload with multiple text parts joined', () => {
      const result = formatter.formatInput({
        id: 'input-5',
        type: 'user-message',
        payload: {
          threadId: 'thread-3',
          role: 'user',
          messageId: 'msg-multi',
          parts: [
            { type: 'text', text: '  Part one  ' },
            { type: 'text', text: 'Part two' },
            { type: 'text', text: '' },
          ],
        },
      });
      expect(result!.text).toBe('Part one\nPart two');
    });

    it('formats payload with image parts', () => {
      const result = formatter.formatInput({
        id: 'input-6',
        type: 'user-message',
        payload: {
          threadId: 'thread-4',
          role: 'user',
          messageId: 'msg-img',
          parts: [
            {
              type: 'image',
              mimeType: 'image/png',
              imageAspectRatio: undefined,
              bytes: new Uint8Array([0, 1, 2]),
            },
          ],
        },
      });
      expect(result!.content).toBeDefined();
      expect(result!.content).toHaveLength(1);
      expect(result!.content![0].type).toBe('image');
    });

    it('returns text step context for unknown payload type', () => {
      const payload = { unknown: 'structure' };
      const result = formatter.formatInput({
        id: 'input-7',
        type: 'custom-input',
        payload,
      });
      expect(result).not.toBeNull();
      expect(result!.kind).toBe('input:custom-input');
      expect(result!.id).toBe('input-7');
    });

    it('returns null for empty text payload', () => {
      const result = formatter.formatInput({
        id: 'input-8',
        type: 'user-message',
        payload: {
          threadId: 'thread-5',
          role: 'user',
          messageId: 'msg-empty',
          parts: [{ type: 'text', text: '   ' }],
        },
      });
      // whitespace-only text gets filtered out → text is undefined
      expect(result!.text).toBeUndefined();
    });
  });

  describe('formatActionResults', () => {
    it('formats action results with step number', () => {
      const result = formatter.formatActionResults(1, [{ tool: 'test', result: 'ok' }]);
      expect(result.id).toBe('action-results:1');
      expect(result.kind).toBe('action-results');
      expect(result.title).toBe('Previous action results');
      expect(result.data).toHaveLength(1);
    });

    it('formats empty action results', () => {
      const result = formatter.formatActionResults(5, []);
      expect(result.data).toHaveLength(0);
      expect(result.content).toEqual([]);
    });

    it('formats action results with multiple entries', () => {
      const result = formatter.formatActionResults(2, [{ a: 1 }, { b: 2 }, { c: 3 }]);
      expect(result.data).toHaveLength(3);
    });

    it('satisfies StepContextEntry shape', () => {
      const result = formatter.formatActionResults(3, []);
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('kind');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('content');
    });
  });
});
