import { describe, expect, it } from 'vitest';
import type { ForgeConversationMemory, ForgeConversationMemoryOptions } from './memory.js';

describe('memory', () => {
  describe('ForgeConversationMemoryOptions', () => {
    it('accepts minimal options', () => {
      const opts: ForgeConversationMemoryOptions = {
        threadId: 'thread-1',
        conversationStore: {
          agentId: '',
          insertMessages: async () => [],
          getMessages: async () => [],
          insertAnnotation: async () => {},
          getAnnotations: async () => [],
        } as never,
      };
      expect(opts.threadId).toBe('thread-1');
    });

    it('accepts options with all optional fields', () => {
      const opts: ForgeConversationMemoryOptions = {
        threadId: 'thread-2',
        conversationStore: {
          agentId: '',
          insertMessages: async () => [],
          getMessages: async () => [],
          insertAnnotation: async () => {},
          getAnnotations: async () => [],
        } as never,
        stateStore: { read: async () => null, write: async () => {} } as never,
        assistantAuthorId: 'author-1',
        observer: {} as never,
        recentTokenLimit: 4000,
        overflowObservationTokenLimit: 2000,
        consolidateOverflow: true,
      };
      expect(opts.assistantAuthorId).toBe('author-1');
      expect(opts.consolidateOverflow).toBe(true);
    });

    it('accepts options without consolidateOverflow', () => {
      const opts: ForgeConversationMemoryOptions = {
        threadId: 'thread-3',
        conversationStore: {
          agentId: '',
          insertMessages: async () => [],
          getMessages: async () => [],
          insertAnnotation: async () => {},
          getAnnotations: async () => [],
        } as never,
        recentTokenLimit: 8000,
      };
      expect(opts.consolidateOverflow).toBeUndefined();
    });
  });

  describe('ForgeConversationMemory', () => {
    it('has memory property', () => {
      const mem: ForgeConversationMemory = {
        memory: {} as never,
        captureRunHistoryWindow: async () => ({
          historyStartMessageId: null,
          historyEndMessageId: null,
        }),
        renderModelMessages: async () => [],
        plugins: [],
        observers: [],
      };
      expect(mem).toHaveProperty('memory');
    });

    it('has plugins and observers arrays', () => {
      const mem: ForgeConversationMemory = {
        memory: {} as never,
        captureRunHistoryWindow: async () => ({
          historyStartMessageId: null,
          historyEndMessageId: null,
        }),
        renderModelMessages: async () => [],
        plugins: [{ name: 'plugin-1' }] as never,
        observers: [{ onStepComplete: async () => {} }] as never,
      };
      expect(Array.isArray(mem.plugins)).toBe(true);
      expect(Array.isArray(mem.observers)).toBe(true);
    });

    it('has captureRunHistoryWindow returning promise', () => {
      const mem: ForgeConversationMemory = {
        memory: {} as never,
        captureRunHistoryWindow: async () => ({
          historyStartMessageId: null,
          historyEndMessageId: null,
        }),
        renderModelMessages: async () => [],
        plugins: [],
        observers: [],
      };
      const result = mem.captureRunHistoryWindow({ lastMessages: 10 });
      expect(result).toBeInstanceOf(Promise);
    });

    it('captureRunHistoryWindow accepts lastMessages option', async () => {
      const mem: ForgeConversationMemory = {
        memory: {} as never,
        captureRunHistoryWindow: async ({ lastMessages }) => ({
          historyStartMessageId: lastMessages > 0 ? 'msg-1' : null,
          historyEndMessageId: null,
        }),
        renderModelMessages: async () => [],
        plugins: [],
        observers: [],
      };
      const result = await mem.captureRunHistoryWindow({ lastMessages: 20 });
      expect(result.historyStartMessageId).toBe('msg-1');
    });

    it('has renderModelMessages returning promise', () => {
      const mem: ForgeConversationMemory = {
        memory: {} as never,
        captureRunHistoryWindow: async () => ({
          historyStartMessageId: null,
          historyEndMessageId: null,
        }),
        renderModelMessages: async () => [],
        plugins: [],
        observers: [],
      };
      const result = mem.renderModelMessages();
      expect(result).toBeInstanceOf(Promise);
    });
  });
});
