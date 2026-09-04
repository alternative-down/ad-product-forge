import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createAgentConversationsReadModel } from './agents-conversations';

const mockListRecentConversations = vi.hoisted(() => vi.fn());
const mockListThreadMessages = vi.hoisted(() => vi.fn());
const mockToMastraSafeIdentifier = vi.hoisted(() => vi.fn((v: string) => `safe_${v}`));
const mockForgeDebug = vi.hoisted(() => vi.fn());
const mockAgentRegistryGet = vi.hoisted(() => vi.fn());

vi.mock('./conversation-helpers', () => ({
  listRecentConversations: mockListRecentConversations,
  listThreadMessages: mockListThreadMessages,
}));
vi.mock('@forge-runtime/core', () => ({
  toMastraSafeIdentifier: mockToMastraSafeIdentifier,
  forgeDebug: mockForgeDebug,
}));
vi.mock('../../agents/internal-agent-registry', () => ({
  getInternalAgentRegistry: () => ({ get: mockAgentRegistryGet }),
}));

function makeMockInternalChat(overrides: Record<string, unknown> = {}) {
  return {
    getMessages: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    messageId: 'message-1',
    provider: 'internal-chat',
    authorId: 'account-1',
    targetKey: 'conversation-1',
    content: 'message',
    attachments: [],
    unread: false,
    createdAt: new Date(0).toISOString(),
    authorDisplayName: 'Nicolas',
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
    mockAgentRegistryGet.mockReset();
    mockListRecentConversations.mockResolvedValue([]);
    mockListThreadMessages.mockResolvedValue({ items: [], totalPages: 0, currentPage: 1 });
  });

  describe('listAgentRecentConversations', () => {
    it('calls listRecentConversations with agentId and default limit 10', async () => {
      mockListRecentConversations.mockResolvedValue([]);
      const mockChat = makeMockInternalChat();
      const model = createAgentConversationsReadModel({
        db: makeMockDb() as unknown as Parameters<
          typeof createAgentConversationsReadModel
        >[0]['db'],
        workspaceBasePath: '/tmp',
        internalChat: mockChat as unknown as Parameters<
          typeof createAgentConversationsReadModel
        >[0]['internalChat'],
      });
      await model.listAgentRecentConversations('agent-42');
      expect(mockListRecentConversations).toHaveBeenCalledWith(
        '/tmp',
        mockChat,
        'agent-42',
        'agent-42',
      );
    });

    it('passes custom limit to listRecentConversations', async () => {
      mockListRecentConversations.mockResolvedValue([]);
      const mockChat = makeMockInternalChat();
      const model = createAgentConversationsReadModel({
        db: makeMockDb() as unknown as Parameters<
          typeof createAgentConversationsReadModel
        >[0]['db'],
        workspaceBasePath: '/tmp',
        internalChat: mockChat as unknown as Parameters<
          typeof createAgentConversationsReadModel
        >[0]['internalChat'],
      });
      await model.listAgentRecentConversations('agent-1', 25);
      expect(mockListRecentConversations).toHaveBeenCalledWith(
        '/tmp',
        mockChat,
        'agent-1',
        'agent-1',
      );
    });

    it('returns conversations from listRecentConversations', async () => {
      const conversations = [
        { id: 'conv-1', title: 'Test Conv', lastMessageAt: 12345 },
        { id: 'conv-2', title: 'Another', lastMessageAt: 67890 },
      ];
      mockListRecentConversations.mockResolvedValue(conversations);
      const model = createAgentConversationsReadModel({
        db: makeMockDb() as unknown as Parameters<
          typeof createAgentConversationsReadModel
        >[0]['db'],
        workspaceBasePath: '/tmp',
        internalChat: makeMockInternalChat() as unknown as Parameters<
          typeof createAgentConversationsReadModel
        >[0]['internalChat'],
      });
      const result = await model.listAgentRecentConversations('agent-1');
      expect(result).toEqual(conversations);
    });
  });

  describe('listAgentConversationMessages', () => {
    it('calls internal chat with the requested conversation and one extra row', async () => {
      const mockChat = makeMockInternalChat();
      const model = createAgentConversationsReadModel({
        db: makeMockDb() as unknown as Parameters<
          typeof createAgentConversationsReadModel
        >[0]['db'],
        workspaceBasePath: '/tmp',
        internalChat: mockChat as unknown as Parameters<
          typeof createAgentConversationsReadModel
        >[0]['internalChat'],
      });
      await model.listAgentConversationMessages({
        agentId: 'agent-1',
        provider: 'internal-chat',
        targetKey: 'conv-abc',
        limit: 20,
        offset: 0,
      });
      expect(mockChat.getMessages).toHaveBeenCalledWith({
        agentId: 'agent-1',
        conversationKey: 'conv-abc',
        limit: 21,
        offset: 0,
      });
    });

    it('maps messages with authorAgentId set to null', async () => {
      const messages = [
        makeMessage({ messageId: 'one', content: 'hello' }),
        makeMessage({ messageId: 'two', content: 'hi there' }),
      ];
      const mockChat = makeMockInternalChat({
        getMessages: vi.fn().mockResolvedValue(messages),
      });
      const model = createAgentConversationsReadModel({
        db: makeMockDb() as unknown as Parameters<
          typeof createAgentConversationsReadModel
        >[0]['db'],
        workspaceBasePath: '/tmp',
        internalChat: mockChat as unknown as Parameters<
          typeof createAgentConversationsReadModel
        >[0]['internalChat'],
      });
      const result = await model.listAgentConversationMessages({
        agentId: 'agent-1',
        provider: 'internal-chat',
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
      const messages = [makeMessage({ content: 'msg', provider: 'internal-chat', targetKey: 'k' })];
      const mockChat = makeMockInternalChat({
        getMessages: vi.fn().mockResolvedValue(messages),
      });
      const model = createAgentConversationsReadModel({
        db: makeMockDb() as unknown as Parameters<
          typeof createAgentConversationsReadModel
        >[0]['db'],
        workspaceBasePath: '/tmp',
        internalChat: mockChat as unknown as Parameters<
          typeof createAgentConversationsReadModel
        >[0]['internalChat'],
      });
      const result = await model.listAgentConversationMessages({
        agentId: 'agent-1',
        provider: 'internal-chat',
        targetKey: 'k',
        limit: 10,
        offset: 0,
      });
      expect(result.items[0]).toMatchObject({ content: 'msg', provider: 'internal-chat' });
    });

    it('loads Discord messages through the agent communication runtime', async () => {
      const getMessages = vi.fn().mockResolvedValue([makeMessage({ provider: 'discord' })]);
      mockAgentRegistryGet.mockReturnValue({ runtime: { communication: { getMessages } } });
      const model = createAgentConversationsReadModel({
        db: makeMockDb() as never,
        workspaceBasePath: '/tmp',
        internalChat: makeMockInternalChat() as never,
      });

      const result = await model.listAgentConversationMessages({
        agentId: 'agent-1',
        provider: 'discord',
        targetKey: 'channel-1',
        limit: 10,
        offset: 20,
      });

      expect(getMessages).toHaveBeenCalledWith({
        provider: 'discord',
        targetKey: 'channel-1',
        limit: 11,
        offset: 20,
      });
      expect(result.items).toHaveLength(1);
    });
  });

  describe('listAgentThreadMessages', () => {
    it('calls listThreadMessages with workspaceBasePath, agentId, and pagination params', async () => {
      mockListThreadMessages.mockResolvedValue({ items: [], totalPages: 0, currentPage: 1 });
      const model = createAgentConversationsReadModel({
        db: makeMockDb() as unknown as Parameters<
          typeof createAgentConversationsReadModel
        >[0]['db'],
        workspaceBasePath: '/workspace/agent-1',
        internalChat: makeMockInternalChat() as unknown as Parameters<
          typeof createAgentConversationsReadModel
        >[0]['internalChat'],
      });
      await model.listAgentThreadMessages({ agentId: 'agent-1', page: 2, perPage: 25 });
      expect(mockListThreadMessages).toHaveBeenCalledWith('/workspace/agent-1', 'agent-1', {
        page: 2,
        perPage: 25,
      });
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
        db: makeMockDb() as unknown as Parameters<
          typeof createAgentConversationsReadModel
        >[0]['db'],
        workspaceBasePath: '/tmp',
        internalChat: makeMockInternalChat() as unknown as Parameters<
          typeof createAgentConversationsReadModel
        >[0]['internalChat'],
      });
      const result = await model.listAgentThreadMessages({
        agentId: 'agent-1',
        page: 1,
        perPage: 50,
      });
      expect(result).toEqual(threadResult);
    });
  });
});
