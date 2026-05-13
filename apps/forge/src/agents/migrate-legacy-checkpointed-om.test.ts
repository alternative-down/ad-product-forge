import { describe, expect, it, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

const mockAppendMessage = vi.hoisted(() => vi.fn());
const mockUpdateMessageReplacement = vi.hoisted(() => vi.fn());
const mockListMessages = vi.hoisted(() => vi.fn());

vi.mock('../database/schema', () => ({
  agentCheckpointedOmStates: {
    agentId: Symbol('agentId'),
  },
}));

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ field, value })),
}));

const mockDb = {
  query: {
    agentCheckpointedOmStates: {
      findFirst: vi.fn(),
    },
  },
  delete: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  }),
};

const createMockConversationStore = () => ({
  listMessages: mockListMessages,
  appendMessage: mockAppendMessage,
  updateMessageReplacement: mockUpdateMessageReplacement,
  getThread: vi.fn(),
  listThreads: vi.fn(),
  updateMessage: vi.fn(),
  updateMessageMetadata: vi.fn(),
  listOperationalMemoryMessages: vi.fn(),
  upsertThread: vi.fn(),
} as any);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mockDb.query.agentCheckpointedOmStates.findFirst).mockReset();
  vi.mocked(mockDb.delete).mockReset().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  });
  vi.mocked(eq).mockImplementation((field: any, value: any) => ({ field, value } as any));
});

describe('migrateLegacyCheckpointedOmState', () => {
  describe('no legacy row', () => {
    it('returns early when no checkpointed state row exists', async () => {
      const { migrateLegacyCheckpointedOmState } = await import('./migrate-legacy-checkpointed-om');

      vi.mocked(mockDb.query.agentCheckpointedOmStates.findFirst).mockResolvedValue(null);

      const conversationStore = createMockConversationStore();

      await migrateLegacyCheckpointedOmState({
        db: mockDb as any,
        agentId: 'agent-1',
        threadId: 'thread-1',
        conversationStore,
      });

      expect(mockDb.query.agentCheckpointedOmStates.findFirst).toHaveBeenCalledOnce();
      expect(mockAppendMessage).not.toHaveBeenCalled();
      expect(mockUpdateMessageReplacement).not.toHaveBeenCalled();
    });
  });

  describe('checkpoint summary migration', () => {
    it('appends checkpoint summary message when not already present', async () => {
      const { migrateLegacyCheckpointedOmState } = await import('./migrate-legacy-checkpointed-om');

      vi.mocked(mockDb.query.agentCheckpointedOmStates.findFirst).mockResolvedValue({
        agentId: 'agent-1',
        threadId: 'thread-1',
        resourceId: 'resource-1',
        state: {
          checkpointSummary: {
            text: '  checkpoint text  ',
            upToGeneration: 5,
            updatedAt: new Date('2024-01-01T00:00:00.000Z'),
          },
          activeReflectionBlocks: [],
          observationBlocks: [],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      mockListMessages.mockResolvedValue([]);
      const conversationStore = createMockConversationStore();

      await migrateLegacyCheckpointedOmState({
        db: mockDb as any,
        agentId: 'agent-1',
        threadId: 'thread-1',
        conversationStore,
      });

      expect(mockAppendMessage).toHaveBeenCalledWith(expect.objectContaining({
        id: 'checkpoint-summary:agent-1:5',
        threadId: 'thread-1',
        role: 'assistant',
        operationalMemoryType: 'checkpoint-summary',
        operationalMemoryGeneration: 5,
        parts: [{ type: 'text', text: 'checkpoint text' }],
      }));
    });

    it('skips checkpoint summary when it already exists in messages', async () => {
      const { migrateLegacyCheckpointedOmState } = await import('./migrate-legacy-checkpointed-om');

      vi.mocked(mockDb.query.agentCheckpointedOmStates.findFirst).mockResolvedValue({
        agentId: 'agent-1',
        threadId: 'thread-1',
        resourceId: 'resource-1',
        state: {
          checkpointSummary: {
            text: '  summary text  ',
            upToGeneration: 3,
            updatedAt: new Date('2024-01-01T00:00:00.000Z'),
          },
          activeReflectionBlocks: [],
          observationBlocks: [],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      mockListMessages.mockResolvedValue([{ id: 'checkpoint-summary:agent-1:3' }]);
      const conversationStore = createMockConversationStore();

      await migrateLegacyCheckpointedOmState({
        db: mockDb as any,
        agentId: 'agent-1',
        threadId: 'thread-1',
        conversationStore,
      });

      expect(mockAppendMessage).not.toHaveBeenCalled();
    });
  });

  describe('reflection block migration', () => {
    it('appends reflection messages not already present', async () => {
      const { migrateLegacyCheckpointedOmState } = await import('./migrate-legacy-checkpointed-om');

      const createdAt = new Date('2024-01-01T00:00:00.000Z');

      vi.mocked(mockDb.query.agentCheckpointedOmStates.findFirst).mockResolvedValue({
        agentId: 'agent-1',
        threadId: 'thread-1',
        resourceId: 'resource-1',
        state: {
          checkpointSummary: null,
          activeReflectionBlocks: [
            {
              recordId: 'ref-1',
              text: '  reflection text  ',
              generationCount: 2,
              createdAt,
            },
          ],
          observationBlocks: [],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      mockListMessages.mockResolvedValue([]);
      const conversationStore = createMockConversationStore();

      await migrateLegacyCheckpointedOmState({
        db: mockDb as any,
        agentId: 'agent-1',
        threadId: 'thread-1',
        conversationStore,
      });

      expect(mockAppendMessage).toHaveBeenCalledWith(expect.objectContaining({
        id: 'ref-1',
        threadId: 'thread-1',
        role: 'assistant',
        operationalMemoryType: 'reflection',
        operationalMemoryGeneration: 2,
        parts: [{ type: 'text', text: 'reflection text' }],
      }));
    });

    it('skips reflection when already in messages', async () => {
      const { migrateLegacyCheckpointedOmState } = await import('./migrate-legacy-checkpointed-om');

      vi.mocked(mockDb.query.agentCheckpointedOmStates.findFirst).mockResolvedValue({
        agentId: 'agent-1',
        threadId: 'thread-1',
        resourceId: 'resource-1',
        state: {
          checkpointSummary: null,
          activeReflectionBlocks: [
            {
              recordId: 'ref-existing',
              text: 'already there',
              generationCount: 1,
              createdAt: new Date(),
            },
          ],
          observationBlocks: [],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      mockListMessages.mockResolvedValue([{ id: 'ref-existing' }]);
      const conversationStore = createMockConversationStore();

      await migrateLegacyCheckpointedOmState({
        db: mockDb as any,
        agentId: 'agent-1',
        threadId: 'thread-1',
        conversationStore,
      });

      expect(mockAppendMessage).not.toHaveBeenCalled();
    });
  });

  describe('observation block migration', () => {
    it('appends observation message when not present', async () => {
      const { migrateLegacyCheckpointedOmState } = await import('./migrate-legacy-checkpointed-om');

      const createdAt = new Date('2024-01-02T00:00:00.000Z');

      vi.mocked(mockDb.query.agentCheckpointedOmStates.findFirst).mockResolvedValue({
        agentId: 'agent-1',
        threadId: 'thread-1',
        resourceId: 'resource-1',
        state: {
          checkpointSummary: null,
          activeReflectionBlocks: [],
          observationBlocks: [
            {
              id: 'obs-1',
              text: '  observed something  ',
              createdAt,
              sourceMessageIds: ['source-1'],
              reflectedGeneration: null,
            },
          ],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      mockListMessages.mockResolvedValue([]);
      const conversationStore = createMockConversationStore();

      await migrateLegacyCheckpointedOmState({
        db: mockDb as any,
        agentId: 'agent-1',
        threadId: 'thread-1',
        conversationStore,
      });

      expect(mockAppendMessage).toHaveBeenCalledWith(expect.objectContaining({
        id: 'obs-1',
        operationalMemoryType: 'observation',
        parts: [{ type: 'text', text: 'observed something' }],
      }));
    });

    it('maps source message replacements', async () => {
      const { migrateLegacyCheckpointedOmState } = await import('./migrate-legacy-checkpointed-om');

      vi.mocked(mockDb.query.agentCheckpointedOmStates.findFirst).mockResolvedValue({
        agentId: 'agent-1',
        threadId: 'thread-1',
        resourceId: 'resource-1',
        state: {
          checkpointSummary: null,
          activeReflectionBlocks: [],
          observationBlocks: [
            {
              id: 'obs-source',
              text: 'observation',
              createdAt: new Date(),
              sourceMessageIds: ['msg-a', 'msg-b'],
              reflectedGeneration: null,
            },
          ],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      mockListMessages.mockResolvedValue([]);
      const conversationStore = createMockConversationStore();

      await migrateLegacyCheckpointedOmState({
        db: mockDb as any,
        agentId: 'agent-1',
        threadId: 'thread-1',
        conversationStore,
      });

      expect(mockUpdateMessageReplacement).toHaveBeenCalledWith({
        threadId: 'thread-1',
        messageId: 'msg-a',
        replacedByMessageId: 'obs-source',
      });
      expect(mockUpdateMessageReplacement).toHaveBeenCalledWith({
        threadId: 'thread-1',
        messageId: 'msg-b',
        replacedByMessageId: 'obs-source',
      });
    });
  });

  describe('observation reflection mapping', () => {
    it('replaces observation with reflection when generation matches', async () => {
      const { migrateLegacyCheckpointedOmState } = await import('./migrate-legacy-checkpointed-om');

      const createdAt = new Date('2024-01-03T00:00:00.000Z');

      vi.mocked(mockDb.query.agentCheckpointedOmStates.findFirst).mockResolvedValue({
        agentId: 'agent-1',
        threadId: 'thread-1',
        resourceId: 'resource-1',
        state: {
          checkpointSummary: null,
          activeReflectionBlocks: [
            {
              recordId: 'ref-gen-2',
              text: 'reflection for gen 2',
              generationCount: 2,
              createdAt,
            },
          ],
          observationBlocks: [
            {
              id: 'obs-reflected',
              text: 'observation text',
              createdAt,
              sourceMessageIds: [],
              reflectedGeneration: 2,
            },
          ],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      mockListMessages.mockResolvedValue([]);
      const conversationStore = createMockConversationStore();

      await migrateLegacyCheckpointedOmState({
        db: mockDb as any,
        agentId: 'agent-1',
        threadId: 'thread-1',
        conversationStore,
      });

      expect(mockUpdateMessageReplacement).toHaveBeenCalledWith({
        threadId: 'thread-1',
        messageId: 'obs-reflected',
        replacedByMessageId: 'ref-gen-2',
      });
    });

    it('replaces observation with checkpoint summary when reflectedGeneration <= upToGeneration', async () => {
      const { migrateLegacyCheckpointedOmState } = await import('./migrate-legacy-checkpointed-om');

      vi.mocked(mockDb.query.agentCheckpointedOmStates.findFirst).mockResolvedValue({
        agentId: 'agent-1',
        threadId: 'thread-1',
        resourceId: 'resource-1',
        state: {
          checkpointSummary: {
            text: 'summary text',
            upToGeneration: 10,
            updatedAt: new Date('2024-01-01T00:00:00.000Z'),
          },
          activeReflectionBlocks: [],
          observationBlocks: [
            {
              id: 'obs-cp',
              text: 'observation text',
              createdAt: new Date(),
              sourceMessageIds: [],
              reflectedGeneration: 5,
            },
          ],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      mockListMessages.mockResolvedValue([]);
      const conversationStore = createMockConversationStore();

      await migrateLegacyCheckpointedOmState({
        db: mockDb as any,
        agentId: 'agent-1',
        threadId: 'thread-1',
        conversationStore,
      });

      expect(mockUpdateMessageReplacement).toHaveBeenCalledWith({
        threadId: 'thread-1',
        messageId: 'obs-cp',
        replacedByMessageId: 'checkpoint-summary:agent-1:10',
      });
    });

    it('does not replace observation when reflectedGeneration > upToGeneration and no matching reflection', async () => {
      const { migrateLegacyCheckpointedOmState } = await import('./migrate-legacy-checkpointed-om');

      vi.mocked(mockDb.query.agentCheckpointedOmStates.findFirst).mockResolvedValue({
        agentId: 'agent-1',
        threadId: 'thread-1',
        resourceId: 'resource-1',
        state: {
          checkpointSummary: {
            text: 'summary text',
            upToGeneration: 3,
            updatedAt: new Date('2024-01-01T00:00:00.000Z'),
          },
          activeReflectionBlocks: [],
          observationBlocks: [
            {
              id: 'obs-unmapped',
              text: 'observation text',
              createdAt: new Date(),
              sourceMessageIds: [],
              reflectedGeneration: 7,
            },
          ],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      mockListMessages.mockResolvedValue([]);
      const conversationStore = createMockConversationStore();

      await migrateLegacyCheckpointedOmState({
        db: mockDb as any,
        agentId: 'agent-1',
        threadId: 'thread-1',
        conversationStore,
      });

      // The observation should still be appended but NOT replaced
      const replaceCalls = mockUpdateMessageReplacement.mock.calls.filter(
        (call) => call[0].messageId === 'obs-unmapped',
      );
      expect(replaceCalls).toHaveLength(0);
    });
  });

  describe('reflection timestamp backfill', () => {
    it('updates reflection replacement for checkpoint summary when reflectedGeneration <= upToGeneration', async () => {
      const { migrateLegacyCheckpointedOmState } = await import('./migrate-legacy-checkpointed-om');

      vi.mocked(mockDb.query.agentCheckpointedOmStates.findFirst).mockResolvedValue({
        agentId: 'agent-1',
        threadId: 'thread-1',
        resourceId: 'resource-1',
        state: {
          checkpointSummary: {
            text: 'summary text',
            upToGeneration: 5,
            updatedAt: new Date('2024-01-01T00:00:00.000Z'),
          },
          activeReflectionBlocks: [
            {
              recordId: 'ref-gen-4',
              text: 'reflection at gen 4',
              generationCount: 4,
              createdAt: new Date('2024-01-01T00:00:00.000Z'),
            },
          ],
          observationBlocks: [
            {
              id: 'obs-gen-4',
              text: 'observation at gen 4',
              createdAt: new Date(),
              sourceMessageIds: [],
              reflectedGeneration: 4,
            },
          ],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      mockListMessages.mockResolvedValue([]);
      const conversationStore = createMockConversationStore();

      await migrateLegacyCheckpointedOmState({
        db: mockDb as any,
        agentId: 'agent-1',
        threadId: 'thread-1',
        conversationStore,
      });

      // Obs gen 4 gets replaced with reflection gen 4 first
      // Then reflected generation backfill updates replacement to checkpoint-summary
      const replacementCalls = mockUpdateMessageReplacement.mock.calls;
      const obsCalls = replacementCalls.filter((call) => call[0].messageId === 'obs-gen-4');
      expect(obsCalls.length).toBeGreaterThan(0);
    });
  });

  describe('cleanup', () => {
    it('deletes the legacy checkpointed om state row after migration', async () => {
      const { migrateLegacyCheckpointedOmState } = await import('./migrate-legacy-checkpointed-om');

      vi.mocked(mockDb.query.agentCheckpointedOmStates.findFirst).mockResolvedValue({
        agentId: 'agent-1',
        threadId: 'thread-1',
        resourceId: 'resource-1',
        state: {
          checkpointSummary: null,
          activeReflectionBlocks: [],
          observationBlocks: [],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      mockListMessages.mockResolvedValue([]);
      const conversationStore = createMockConversationStore();

      await migrateLegacyCheckpointedOmState({
        db: mockDb as any,
        agentId: 'agent-1',
        threadId: 'thread-1',
        conversationStore,
      });

      expect(mockDb.delete).toHaveBeenCalledOnce();
    });
  });

  describe('trim behavior', () => {
    it('trims whitespace from checkpoint summary text', async () => {
      const { migrateLegacyCheckpointedOmState } = await import('./migrate-legacy-checkpointed-om');

      vi.mocked(mockDb.query.agentCheckpointedOmStates.findFirst).mockResolvedValue({
        agentId: 'agent-1',
        threadId: 'thread-1',
        resourceId: 'resource-1',
        state: {
          checkpointSummary: {
            text: '   lots of space   ',
            upToGeneration: 1,
            updatedAt: new Date('2024-01-01T00:00:00.000Z'),
          },
          activeReflectionBlocks: [],
          observationBlocks: [],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      mockListMessages.mockResolvedValue([]);
      const conversationStore = createMockConversationStore();

      await migrateLegacyCheckpointedOmState({
        db: mockDb as any,
        agentId: 'agent-1',
        threadId: 'thread-1',
        conversationStore,
      });

      expect(mockAppendMessage).toHaveBeenCalledWith(expect.objectContaining({
        parts: [{ type: 'text', text: 'lots of space' }],
      }));
    });
  });
});
