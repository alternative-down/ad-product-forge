import { describe, expect, it } from 'vitest';
import {
  createConversationModelMessages,
  normalizeOperationalMemoryMessage,
  normalizeOperationalMemoryText,
} from './conversation-model-messages.js';
import type { ConversationMessage } from 'agent-runtime-core/integrations';

const makeMessage = (overrides: Partial<ConversationMessage> = {}): ConversationMessage =>
  ({
    id: 'msg-1',
    createdAt: new Date(),
    role: 'user',
    parts: [{ type: 'text', text: 'Hello' }],
    ...overrides,
  }) as ConversationMessage;

describe('conversation-model-messages', () => {
  describe('normalizeOperationalMemoryText', () => {
    it('returns trimmed text unchanged', () => {
      expect(normalizeOperationalMemoryText('Hello world')).toBe('Hello world');
    });

    it('trims whitespace', () => {
      expect(normalizeOperationalMemoryText('  Hello  ')).toBe('Hello');
    });

    it('strips Checkpoint summary: prefix', () => {
      expect(normalizeOperationalMemoryText('Checkpoint summary: some summary')).toBe(
        'some summary',
      );
    });

    it('strips Active reflection: prefix', () => {
      expect(normalizeOperationalMemoryText('Active reflection: my reflection')).toBe(
        'my reflection',
      );
    });

    it('strips Active observation: prefix', () => {
      expect(normalizeOperationalMemoryText('Active observation: my observation')).toBe(
        'my observation',
      );
    });

    it('strips <observations> envelope', () => {
      expect(normalizeOperationalMemoryText('<observations>inner text</observations>')).toBe(
        'inner text',
      );
    });

    it('strips nested <observations> after prefix removal', () => {
      expect(
        normalizeOperationalMemoryText('Checkpoint summary: <observations>A</observations>'),
      ).toBe('A');
    });

    it('returns original if no envelope match', () => {
      expect(normalizeOperationalMemoryText('plain text <no match> here')).toBe(
        'plain text <no match> here',
      );
    });

    it('is case-insensitive for prefix and envelope', () => {
      expect(normalizeOperationalMemoryText('CHECKPOINT SUMMARY: text')).toBe('text');
      expect(normalizeOperationalMemoryText('<OBSERVATIONS>inner</OBSERVATIONS>')).toBe('inner');
    });
  });

  describe('normalizeOperationalMemoryMessage', () => {
    it('returns message unchanged when operationalMemoryType is absent', () => {
      const msg = makeMessage({ role: 'user' });
      expect(normalizeOperationalMemoryMessage(msg)).toBe(msg);
    });

    it('sets role to assistant for operational memory message', () => {
      const msg = makeMessage({ role: 'system', operationalMemoryType: 'reflection' });
      const result = normalizeOperationalMemoryMessage(msg);
      expect(result.role).toBe('assistant');
    });

    it('normalizes text parts', () => {
      const msg = makeMessage({
        role: 'system',
        operationalMemoryType: 'reflection',
        parts: [{ type: 'text', text: '  Active observation: Some text  ' }],
      });
      const result = normalizeOperationalMemoryMessage(msg);
      expect(result.parts[0]).toEqual({ type: 'text', text: 'Some text' });
    });

    it('normalizes reasoning parts', () => {
      const msg = makeMessage({
        role: 'system',
        operationalMemoryType: 'observation',
        parts: [{ type: 'reasoning', text: '  Active reflection: Thinking  ' }],
      });
      const result = normalizeOperationalMemoryMessage(msg);
      expect(result.parts[0]).toEqual({ type: 'reasoning', text: 'Thinking' });
    });

    it('preserves non-text/reasoning parts', () => {
      const msg = makeMessage({
        role: 'system',
        operationalMemoryType: 'checkpoint',
        parts: [{ type: 'image', mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]) }],
      });
      const result = normalizeOperationalMemoryMessage(msg);
      expect(result.parts).toHaveLength(1);
    });
  });

  describe('createConversationModelMessages', () => {
    it('returns empty array for empty input', () => {
      expect(createConversationModelMessages([])).toEqual([]);
    });

    it('maps user message with text part as content array', () => {
      const msgs = [makeMessage({ role: 'user', parts: [{ type: 'text', text: 'Hello' }] })];
      const result = createConversationModelMessages(msgs);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
      const content = result[0].content as Array<Record<string, unknown>>;
      expect(content).toEqual([{ type: 'text', text: 'Hello' }]);
    });

    it('converts external role to user', () => {
      const msgs = [makeMessage({ role: 'external', parts: [{ type: 'text', text: 'Ext msg' }] })];
      const result = createConversationModelMessages(msgs);
      expect(result[0].role).toBe('user');
    });

    it('maps system message text parts joined as string', () => {
      const msgs = [
        makeMessage({ role: 'system', parts: [{ type: 'text', text: 'System prompt' }] }),
      ];
      const result = createConversationModelMessages(msgs);
      expect(result[0].role).toBe('system');
      expect(result[0].content).toBe('System prompt');
    });

    it('maps image part to base64 data URL', () => {
      const msgs = [
        makeMessage({
          role: 'user',
          parts: [{ type: 'image', mimeType: 'image/png', bytes: new Uint8Array([0, 255, 128]) }],
        }),
      ];
      const result = createConversationModelMessages(msgs);
      const content = result[0].content as Array<Record<string, unknown>>;
      expect(content[0].type).toBe('image');
      expect(String(content[0].image)).toContain('data:image/png;base64,');
    });

    it('maps file part', () => {
      const msgs = [
        makeMessage({
          role: 'user',
          parts: [
            {
              type: 'file',
              mimeType: 'text/plain',
              name: 'readme.txt',
              bytes: new Uint8Array([65]),
            },
          ],
        }),
      ];
      const result = createConversationModelMessages(msgs);
      const content = result[0].content as Array<Record<string, unknown>>;
      expect(content[0].type).toBe('file');
      expect(content[0].mediaType).toBe('text/plain');
    });

    it('maps assistant text and reasoning parts', () => {
      const msgs = [
        makeMessage({
          role: 'assistant',
          parts: [
            { type: 'text', text: 'Hello' },
            { type: 'reasoning', text: 'Thinking...' },
          ],
        }),
      ];
      const result = createConversationModelMessages(msgs);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('assistant');
      const content = result[0].content as Array<Record<string, unknown>>;
      expect(content).toHaveLength(2);
      expect(content[0]).toEqual({ type: 'text', text: 'Hello' });
      expect(content[1]).toEqual({ type: 'reasoning', text: 'Thinking...' });
    });

    it('maps tool-call from metadata.toolInvocations', () => {
      const msgs = [
        makeMessage({
          role: 'assistant',
          parts: [{ type: 'text', text: 'Calling tool' }],
          metadata: {
            toolInvocations: [{ toolCallId: 'tc1', toolName: 'search', args: { query: 'test' } }],
          },
        }),
      ];
      const result = createConversationModelMessages(msgs);
      const content = result[0].content as Array<Record<string, unknown>>;
      const toolCall = content.find((p) => p.type === 'tool-call') as Record<string, unknown>;
      expect(toolCall).toBeDefined();
      expect(toolCall.toolCallId).toBe('tc1');
      expect(toolCall.toolName).toBe('search');
    });

    it('skips tool-call without toolCallId', () => {
      const msgs = [
        makeMessage({
          role: 'assistant',
          parts: [{ type: 'text', text: 'Call' }],
          metadata: { toolInvocations: [{ toolName: 'search', args: {} }] },
        }),
      ];
      const result = createConversationModelMessages(msgs);
      const content = result[0].content as Array<Record<string, unknown>>;
      expect(content.find((p) => p.type === 'tool-call')).toBeUndefined();
    });

    it('maps tool-result from tool message paired with invocation', () => {
      const msgs = [
        makeMessage({
          id: 'a1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Calling' }],
          metadata: { toolInvocations: [{ toolCallId: 'tc1', toolName: 'search', args: {} }] },
        }),
        makeMessage({
          id: 't1',
          role: 'tool',
          parts: [],
          metadata: { toolResults: [{ toolCallId: 'tc1', toolName: 'search', result: 'result' }] },
        }),
      ];
      const result = createConversationModelMessages(msgs);
      const toolMsg = result.find((m) => m.role === 'tool');
      expect(toolMsg).toBeDefined();
      const content = toolMsg!.content as Array<Record<string, unknown>>;
      expect(content[0].toolCallId).toBe('tc1');
    });

    it('filters tool-result when toolCallId not in fulfilled set', () => {
      const msgs = [
        makeMessage({
          id: 't1',
          role: 'tool',
          parts: [],
          metadata: { toolResults: [{ toolCallId: 'orphan', result: 'orphan result' }] },
        }),
      ];
      const result = createConversationModelMessages(msgs);
      // orphan tool result (no matching invocation) is filtered out
      expect(result.find((m) => m.role === 'tool')).toBeUndefined();
    });

    it('drops tool-result without toolCallId', () => {
      const msgs = [
        makeMessage({
          id: 't1',
          role: 'tool',
          parts: [],
          metadata: { toolResults: [{ result: 'no id' }] },
        }),
      ];
      const result = createConversationModelMessages(msgs);
      expect(result.find((m) => m.role === 'tool')).toBeUndefined();
    });

    it('drops tool-result with unknown toolCallId', () => {
      const msgs = [
        makeMessage({
          id: 'a1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Call' }],
          metadata: { toolInvocations: [] },
        }),
        makeMessage({
          id: 't1',
          role: 'tool',
          parts: [],
          metadata: { toolResults: [{ toolCallId: 'tc-unknown', result: 'res' }] },
        }),
      ];
      const result = createConversationModelMessages(msgs);
      expect(result.find((m) => m.role === 'tool')).toBeUndefined();
    });

    it('skips user message with no parts', () => {
      const msgs = [makeMessage({ role: 'user', parts: [] })];
      const result = createConversationModelMessages(msgs);
      expect(result).toHaveLength(0);
    });
  });
});
