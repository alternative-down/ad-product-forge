import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createAgentConversationsReadModel } from './agents-conversations';

const mockListRecentConversations = vi.hoisted(() => vi.fn());
const mockListThreadMessages = vi.hoisted(() => vi.fn());
const mockToMastraSafeIdentifier = vi.hoisted(() => vi.fn((v: string) => `safe_${v}`));
const mockForgeDebug = vi.hoisted(() => vi.fn());

vi.mock('./conversation-helpers', () => ({
  listRecentConversations: mockListRecentConversations,
  listThreadMessages: mockListThreadMessages,
}));
vi.mock('@forge-runtime/core', () => ({
  toMastraSafeIdentifier: mockToMastraSafeIdentifier,
  forgeDebug: mockForgeDebug,
}));

function makeMockInternalChat(overrides: Record<string, unknown> = {}) {
  return {
    listMessages: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeMockDb() {
  return {};
}

describe('createAgentConversationsReadModel', () => {
  beforeEach(() => {
    mockListRecentConversations.mockReset();
    mockListThreadMessages.mockReset();
    mockToMastraSafeIdentifier.mockReset();
    mockToMastraSafeIdentifier.mockImplementation((v: string) => `safe_${v}`);
    mockForgeDebug.mockReset();
    mockListRecentConversations.mockResolvedValue([]);
    mockListThreadMessages.mockResolvedValue({ items: [], totalPages: 0, currentPage: 1 });
  });

  describe('listAgentRecentConversations', () => {
    it('calls listRecentConversations with agentId and default limit 10', async () => {
      mockListRecentConversations.mockResolvedValue([]);
      const model = createAgentConversationsReadModel({
        db: makeMockDb() as Parameters<typeof createAgentConversationsReadModel>[0]['db'],
        workspaceBasePath: '/tmp',
        internalChat: makeMockInternalChat() as Parameters<typeof createAgentConversationsReadModel>[0]['internalChat'],
      });
      await model.listAgentRecentConversations('agent-42');
      expect(mockListRecentConversations).toHaveBeenCalledWith('agent-42', 10);
    });

    it('passes custom limit to listRecentConversations', async () => {
      mockListRecentConversations.mockResolvedValue([]);
      const model = createAgentConversationsReadModel({
        db: makeMockDb() as Parameters<typeof createAgentConversationsReadModel>[0]['db'],
        workspaceBasePath: '/tmp',
        internalChat: makeMockInternalChat() as Parameters<typeof createAgentConversationsReadModel>[0]['internalChat'],
      });
      await model.listAgentRecentConversations('agent-1', 25);
      expect(mockListRecentConversations).toHaveBeenCalledWith('agent-1', 25);
    });

    it('returns conversations from listRecentConversations', async () => {
      const conversations = [
        { id: 'conv-1', title: 'Test Conv', lastMessageAt: 12345 },
        { id: 'conv-2', title: 'Another', lastMessageAt: 67890 },
      ];
      mockListRecentConversations.mockResolvedValue(conversations);
      const model = createAgentConversationsReadModel({
        db: makeMockDb() as Parameters<typeof createAgentConversationsReadModel>[0]['db'],
        workspaceBasePath: '/tmp',
        internalChat: makeMockInternalChat() as Parameters<typeof createAgentConversationsReadModel>[0]['internalChat'],
      });
      const result = await model.listAgentRecentConversations('agent-1');
      expect(result).toEqual(conversations);
    });
  });

  describe('listAgentConversationMessages', () => {
    it('calls internalChat.listMessages with correct params', async () => {
      const mockChat = makeMockInternalChat();
      const model = createAgentConversationsReadModel({
        db: makeMockDb() as Parameters<typeof createAgentConversationsReadModel>[0]['db'],
        workspaceBasePath: '/tmp',
        internalChat: mockChat as Parameters<typeof createAgentConversationsReadModel>[0]['internalChat'],
      });
      await model.listAgentConversationMessages({
        agentId: 'agent-1',
        provider: 'test-provider',
        targetKey: 'conv-abc',
        limit: 20,
        offset: 0,
      });
      expect(mockChat.listMessages).toHaveBeenCalledWith({
        provider: 'test-provider',
        targetKey: 'conv-abc',
        limit: 20,
        offset: 0,
      });
    });

    it('maps messages with authorAgentId set to null', async () => {
      const messages = [
        { content: 'hello', role: 'user', createdAt: 100 },
        { content: 'hi there', role: 'assistant', createdAt: 101 },
      ];
      const mockChat = makeMockInternalChat({
        listMessages: vi.fn().mockResolvedValue(messages),
      });
      const model = createAgentConversationsReadModel({
        db: makeMockDb() as Parameters<typeof createAgentConversationsReadModel>[0]['db'],
        workspaceBasePath: '/tmp',
        internalChat: mockChat as Parameters<typeof createAgentConversationsReadModel>[0]['internalChat'],
      });
      const result = await model.listAgentConversationMessages({
        agentId: 'agent-1',
        provider: 'p',
        targetKey: 'k',
        limit: 10,
        offset: 0,
      });
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toHaveProperty('authorAgentId', null);
      expect(result.items[1]).toHaveProperty('authorAgentId', null);
      expect(result.hasMore).toBe(false);
    });

    it('maps each message preserving all CommunicationMessageView fields', async () => {
      const messages = [
        { content: 'msg', role: 'user', createdAt: 500, provider: 't', targetKey: 'k' },
      ];
      const mockChat = makeMockInternalChat({
        listMessages: vi.fn().mockResolvedValue(messages),
      });
      const model = createAgentConversationsReadModel({
        db: makeMockDb() as Parameters<typeof createAgentConversationsReadModel>[0]['db'],
        workspaceBasePath: '/tmp',
        internalChat: mockChat as Parameters<typeof createAgentConversationsReadModel>[0]['internalChat'],
      });
      const result = await model.listAgentConversationMessages({
        agentId: 'agent-1',
        provider: 'p',
        targetKey: 'k',
        limit: 10,
        offset: 0,
      });
      expect(result.items[0]).toMatchObject({ content: 'msg', role: 'user', createdAt: 500 });
    });
  });

  describe('listAgentThreadMessages', () => {
    it('calls listThreadMessages with workspaceBasePath, agentId, and pagination params', async () => {
      mockListThreadMessages.mockResolvedValue({ items: [], totalPages: 0, currentPage: 1 });
      const model = createAgentConversationsReadModel({
        db: makeMockDb() as Parameters<typeof createAgentConversationsReadModel>[0]['db'],
        workspaceBasePath: '/workspace/agent-1',
        internalChat: makeMockInternalChat() as Parameters<typeof createAgentConversationsReadModel>[0]['internalChat'],
      });
      await model.listAgentThreadMessages({ agentId: 'agent-1', page: 2, perPage: 25 });
      expect(mockListThreadMessages).toHaveBeenCalledWith(
        '/workspace/agent-1',
        'agent-1',
        { page: 2, perPage: 25 },
      );
    });

    it('returns items, totalPages, and currentPage from listThreadMessages', async () => {
      const threadResult = {
        items: [
          { content: 'thread msg 1', role: 'user', createdAt: 200 },
          { content: 'thread msg 2', role: 'assistant', createdAt: 201 },
        ],
        totalPages: 3,
        currentPage: 1,
      };
      mockListThreadMessages.mockResolvedValue(threadResult);
      const model = createAgentConversationsReadModel({
        db: makeMockDb() as Parameters<typeof createAgentConversationsReadModel>[0]['db'],
        workspaceBasePath: '/tmp',
        internalChat: makeMockInternalChat() as Parameters<typeof createAgentConversationsReadModel>[0]['internalChat'],
      });
      const result = await model.listAgentThreadMessages({ agentId: 'agent-1', page: 1, perPage: 50 });
      expect(result).toEqual(threadResult);
    });
  });

  describe('listAgentLongTermMemoryThreadMessages', () => {
    it('calls listThreadMessages with long_term_memory threadId and agent-prefixed tablePrefix', async () => {
      mockListThreadMessages.mockResolvedValue({ items: [], totalPages: 0, currentPage: 1 });
      mockToMastraSafeIdentifier.mockImplementation((v: string) => `safe_${v}`);
      const model = createAgentConversationsReadModel({
        db: makeMockDb() as Parameters<typeof createAgentConversationsReadModel>[0]['db'],
        workspaceBasePath: '/base',
        internalChat: makeMockInternalChat() as Parameters<typeof createAgentConversationsReadModel>[0]['internalChat'],
      });
      await model.listAgentLongTermMemoryThreadMessages({ agentId: 'my-agent', page: 1, perPage: 50 });
      expect(mockListThreadMessages).toHaveBeenCalledWith('/base', 'my-agent', {
        page: 1,
        perPage: 50,
        threadId: 'safe_my-agent_long_term_memory',
        tablePrefix: 'safe_my-agent',
      });
    });

    it('passes through items and pagination from listThreadMessages', async () => {
      const ltmResult = {
        items: [{ content: 'memory', role: 'system', createdAt: 999 }],
        totalPages: 1,
        currentPage: 1,
      };
      mockListThreadMessages.mockResolvedValue(ltmResult);
      const model = createAgentConversationsReadModel({
        db: makeMockDb() as Parameters<typeof createAgentConversationsReadModel>[0]['db'],
        workspaceBasePath: '/tmp',
        internalChat: makeMockInternalChat() as Parameters<typeof createAgentConversationsReadModel>[0]['internalChat'],
      });
      const result = await model.listAgentLongTermMemoryThreadMessages({ agentId: 'agent-1', page: 1, perPage: 50 });
      expect(result).toEqual(ltmResult);
    });
  });
});
