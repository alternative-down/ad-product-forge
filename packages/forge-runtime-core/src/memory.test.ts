import { describe, expect, it } from 'vitest';
import { createForgeConversationMemory } from './memory.js';
import type { ForgeConversationMemory, ForgeConversationMemoryOptions } from './memory.js';

describe('memory', () => {
  describe('ForgeConversationMemoryOptions', () => {
    it('accepts minimal options', () => {
      const opts: ForgeConversationMemoryOptions = {
        threadId: 'thread-1',
        conversationStore: {
          agentId: '',
          insertMessages: async () => [],
          listOperationalMemoryMessages: async () => [],
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
          listOperationalMemoryMessages: async () => [],
          getMessages: async () => [],
          insertAnnotation: async () => {},
          getAnnotations: async () => [],
        } as never,
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
          listOperationalMemoryMessages: async () => [],
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

describe('memory — #6313 cast-removal + cross-cutting pattern (C11 review)', () => {
  describe('createForgeConversationMemory — structural type guarantees', () => {
    const baseOptions = {
      threadId: 'thread-cast',
      conversationStore: {
        agentId: '',
        insertMessages: async () => [],
          listOperationalMemoryMessages: async () => [],
        getMessages: async () => [],
        insertAnnotation: async () => {},
        getAnnotations: async () => [],
      } as never,
    };

    it('returns observers as empty array (Finding 2 cast removed)', () => {
      createForgeConversationMemory(baseOptions);
      const mem = createForgeConversationMemory(baseOptions);
      expect(mem.observers).toEqual([]);
      expect(Array.isArray(mem.observers)).toBe(true);
    });

    it('returns observers as RuntimeObserver[] without cast (Finding 2)', () => {
      const mem = createForgeConversationMemory(baseOptions);
      // Compile-time guarantee: this assignment must succeed without `as`
      const observers: { onStepComplete: () => Promise<void> }[] = mem.observers;
      expect(observers).toEqual([]);
    });

    it('renders ModelMessage[] with autonomous-context as first element (Finding 1)', async () => {
      const mem = createForgeConversationMemory(baseOptions);
      const messages = await mem.renderModelMessages();
      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBeGreaterThan(0);
      const first = messages[0] as Record<string, unknown>;
      expect(first.role).toBe('user');
      expect(Array.isArray(first.content)).toBe(true);
    });

    it('autonomous-context message uses text content type (Finding 1 structural)', async () => {
      const mem = createForgeConversationMemory(baseOptions);
      const messages = await mem.renderModelMessages();
      const first = messages[0] as { content: Array<{ type: string; text: string }> };
      expect(first.content[0]?.type).toBe('text');
      expect(first.content[0]?.text).toContain('autonomous company agent');
    });
  });

  describe('selectRunScopedMessages — edge cases (Finding 1 factory function coverage)', () => {
    // Test the early-return branches of the helper function
    it('returns full messages when historyStartMessageId is null', () => {
      // Indirect test via renderModelMessages
      const baseOptions = {
        threadId: 'thread-null-start',
        conversationStore: {
          agentId: '',
          insertMessages: async () => [],
          listOperationalMemoryMessages: async () => [],
          getMessages: async () => [],
          insertAnnotation: async () => {},
          getAnnotations: async () => [],
        } as never,
      };
      const mem = createForgeConversationMemory(baseOptions);
      // No historyStartMessageId → returns activeMessages path
      mem.renderModelMessages({ historyWindow: { historyStartMessageId: null, historyEndMessageId: null } }).then((msgs) => {
        expect(Array.isArray(msgs)).toBe(true);
      });
    });
  });
});
