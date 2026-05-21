import { describe, expect, it } from 'vitest';
import type {
  NativeToolLoopMessage,
  NativeToolLoopDeferredCall,
  NativeToolLoopResult,
} from './native-tool-loop.js';

describe('native-tool-loop', () => {
  describe('NativeToolLoopMessage', () => {
    it('accepts simple user message', () => {
      const msg: NativeToolLoopMessage = { role: 'user', content: 'hello' };
      expect(msg.role).toBe('user');
      expect(msg.content).toBe('hello');
    });

    it('accepts simple assistant message', () => {
      const msg: NativeToolLoopMessage = { role: 'assistant', content: 'response' };
      expect(msg.role).toBe('assistant');
    });

    it('accepts system message', () => {
      const msg: NativeToolLoopMessage = { role: 'system', content: 'system prompt' };
      expect(msg.role).toBe('system');
    });

    it('accepts assistant message with text part', () => {
      const msg: NativeToolLoopMessage = {
        role: 'assistant',
        content: [{ type: 'text', text: 'hello' }],
      };
      expect(msg.content[0].type).toBe('text');
    });

    it('accepts assistant message with tool-call part', () => {
      const msg: NativeToolLoopMessage = {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'my-tool',
            input: { arg: 'value' },
          },
        ],
      };
      expect(msg.content[0].type).toBe('tool-call');
    });

    it('accepts tool result message', () => {
      const msg: NativeToolLoopMessage = {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'my-tool',
            output: 'result',
          },
        ],
      };
      expect(msg.role).toBe('tool');
    });
  });

  describe('NativeToolLoopDeferredCall', () => {
    it('accepts deferred call structure', () => {
      const call: NativeToolLoopDeferredCall = {
        toolName: 'deferred-tool',
        input: { key: 'value' },
      };
      expect(call.toolName).toBe('deferred-tool');
    });
  });

  describe('NativeToolLoopResult', () => {
    it('accepts complete result structure', () => {
      const result: NativeToolLoopResult = {
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
        ],
        deferredToolCall: null,
        text: 'hello',
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 5 },
      };
      expect(result.messages).toHaveLength(2);
      expect(result.usage.inputTokens).toBe(10);
    });

    it('accepts result with deferred tool call', () => {
      const result: NativeToolLoopResult = {
        messages: [],
        deferredToolCall: { toolName: 'tool', input: {} },
        text: '',
        finishReason: undefined,
        usage: { inputTokens: 0, outputTokens: 0 },
      };
      expect(result.deferredToolCall?.toolName).toBe('tool');
    });

    it('accepts result with undefined finish reason', () => {
      const result: NativeToolLoopResult = {
        messages: [],
        deferredToolCall: null,
        text: '',
        finishReason: undefined,
        usage: { inputTokens: 0, outputTokens: 0 },
      };
      expect(result.finishReason).toBeUndefined();
    });
  });

  describe('type completeness', () => {
    it('all message role types are representable', () => {
      const roles: NativeToolLoopMessage['role'][] = ['user', 'assistant', 'system', 'tool'];
      expect(roles).toHaveLength(4);
    });

    it('message union discriminates by role', () => {
      const msg: NativeToolLoopMessage = { role: 'user', content: 'test' };
      // Each union member is distinguishable by role field
      expect(msg).toHaveProperty('role');
    });
  });
});
