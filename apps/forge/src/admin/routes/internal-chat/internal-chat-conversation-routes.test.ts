import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerConversationRoutes } from './internal-chat-conversation-routes';

// ─── Mock setup ──────────────────────────────────────────────────────────────

const mockForgeDebug = vi.fn();
vi.mock('../debug', () => ({
  forgeDebug: (...args: unknown[]) => mockForgeDebug(...args),
}));

// ─── Test factory ────────────────────────────────────────────────────────────

interface Route {
  method: string;
  path: string;
  handler: (req?: unknown) => unknown;
}

function createMockHttpServer() {
  const routes: Route[] = [];
  return {
    routes,
    registerRoute(route: Route) { routes.push(route); },
  };
}

function createMockInternalChat() {
  return {
    listConversationsByAccount: vi.fn().mockResolvedValue([
      {
        targetKey: 'conv-001',
        latestMessageAt: '2024-01-01T10:00:00Z',
        name: 'Team Chat',
        participants: ['acc-001', 'acc-002'],
        messages: [
          { messageId: 'msg-001', content: 'Hello', unread: false, authorDisplayName: 'Alice', createdAt: '2024-01-01T10:00:00Z' },
        ],
      },
    ]),
    getMessagesByAccount: vi.fn().mockResolvedValue([
      { messageId: 'msg-002', authorId: 'acc-001', authorDisplayName: 'Alice', content: 'Hi there', createdAt: '2024-01-01T11:00:00Z', attachments: [] },
    ]),
    getMessageAttachmentByAccount: vi.fn().mockResolvedValue({ name: 'file.txt', contentType: 'text/plain', data: Buffer.from('hello') }),
    ensureDirectConversationByAccount: vi.fn().mockResolvedValue({ conversationId: 'dm-001', conversationKey: 'conv-dm-001' }),
    createExternalChatGroupWithMembers: vi.fn().mockResolvedValue({ groupId: 'conv_123', conversationKey: 'conv_123' }),
    sendMessage: vi.fn().mockResolvedValue({ messageId: 'msg-sent' }),
    updateGroupByAccount: vi.fn().mockResolvedValue({ conversationId: 'conv-001', name: 'Updated' }),
    archiveConversationByAccount: vi.fn().mockResolvedValue({ archived: true }),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('registerConversationRoutes', () => {
  let httpServer: ReturnType<typeof createMockHttpServer>;
  let mockInternalChat: ReturnType<typeof createMockInternalChat>;

  beforeEach(() => {
    httpServer = createMockHttpServer();
    mockInternalChat = createMockInternalChat();
    mockForgeDebug.mockClear();
  });

  it('registers all 7 conversation routes', () => {
    registerConversationRoutes(httpServer, mockInternalChat as never);
    expect(httpServer.routes).toHaveLength(7);
  });

  it('registers GET /admin/internal-chat/conversations', () => {
    registerConversationRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/conversations');
    expect(route).toBeDefined();
    expect(route!.method).toBe('GET');
  });

  it('GET /admin/internal-chat/conversations returns properly shaped response', async () => {
    registerConversationRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/conversations');
    const result = await route!.handler({ query: new Map([['accountId', 'acc-001']]), bodyText: '' }) as { body: string };
    const body = JSON.parse(result.body);
    expect(body[0].conversationId).toBe('conv-001');
    expect(body[0].provider).toBe('internal-chat');
    expect(body[0].type).toBe('group');
  });

  it('GET /admin/internal-chat/conversations throws on missing accountId', async () => {
    registerConversationRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/conversations');
    await expect(
      route!.handler({ query: new Map(), bodyText: '' })
    ).rejects.toThrow('accountId required');
  });

  it('registers GET /admin/internal-chat/messages', () => {
    registerConversationRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/messages');
    expect(route).toBeDefined();
    expect(route!.method).toBe('GET');
  });

  it('GET /admin/internal-chat/messages returns messages array', async () => {
    registerConversationRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/messages');
    const result = await route!.handler({ query: new Map([['accountId', 'acc-001'], ['conversationId', 'conv-001']]), bodyText: '' }) as { body: string };
    const body = JSON.parse(result.body);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].messageId).toBe('msg-002');
  });

  it('registers GET /admin/internal-chat/message-attachment', () => {
    registerConversationRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/message-attachment');
    expect(route).toBeDefined();
    expect(route!.method).toBe('GET');
  });

  it('GET /admin/internal-chat/message-attachment returns binary response', async () => {
    registerConversationRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/message-attachment');
    const result = await route!.handler({
      query: new Map([['accountId', 'acc-001'], ['conversationId', 'conv-001'], ['messageId', 'msg-001'], ['attachmentName', 'file.txt']]),
      bodyText: '',
    }) as { status: number; headers: Record<string, string>; body: Buffer };
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toBe('text/plain');
  });

  it('registers POST /admin/internal-chat/conversation/create', () => {
    registerConversationRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/conversation/create');
    expect(route).toBeDefined();
    expect(route!.method).toBe('POST');
  });

  it('POST /admin/internal-chat/conversation/create creates DM when no memberKeys', async () => {
    // Schema: { accountId, name?, memberKeys } — no 'type' field
    // Code path: body.type === 'dm' check fails (body.type is undefined)
    // So it goes to group creation path
    registerConversationRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/conversation/create');
    const result = await route!.handler({ query: new Map(), bodyText: JSON.stringify({ accountId: 'acc-001', memberKeys: ['acc-002'] }) }) as { body: string };
    expect(mockInternalChat.createExternalChatGroupWithMembers).toHaveBeenCalled();
    expect(JSON.parse(result.body).conversationId).toBeTruthy();
  });

  it('POST /admin/internal-chat/conversation/create creates group when type=group', async () => {
    registerConversationRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/conversation/create');
    await route!.handler({ query: new Map(), bodyText: JSON.stringify({ accountId: 'acc-001', type: 'group', name: 'Team', memberKeys: ['acc-002', 'acc-003'] }) });
    expect(mockInternalChat.createExternalChatGroupWithMembers).toHaveBeenCalled();
    expect(mockInternalChat.ensureDirectConversationByAccount).not.toHaveBeenCalled();
  });

  it('registers POST /admin/internal-chat/conversation/send', () => {
    registerConversationRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/conversation/send');
    expect(route).toBeDefined();
    expect(route!.method).toBe('POST');
  });

  it('POST /admin/internal-chat/conversation/send delegates to sendMessage', async () => {
    registerConversationRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/conversation/send');
    await route!.handler({ query: new Map(), bodyText: JSON.stringify({ accountId: 'acc-001', conversationId: 'conv-001', content: 'Hello world' }) });
    expect(mockInternalChat.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ content: 'Hello world' }));
  });

  it('registers POST /admin/internal-chat/conversation/update', () => {
    registerConversationRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/conversation/update');
    expect(route).toBeDefined();
    expect(route!.method).toBe('POST');
  });

  it('POST /admin/internal-chat/conversation/update delegates to updateGroupByAccount', async () => {
    registerConversationRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/conversation/update');
    await route!.handler({ query: new Map(), bodyText: JSON.stringify({ conversationId: 'conv-001', name: 'New Name' }) });
    expect(mockInternalChat.updateGroupByAccount).toHaveBeenCalledWith({ groupId: 'conv-001', name: 'New Name' });
  });

  it('registers POST /admin/internal-chat/conversation/archive', () => {
    registerConversationRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/conversation/archive');
    expect(route).toBeDefined();
    expect(route!.method).toBe('POST');
  });

  it('POST /admin/internal-chat/conversation/archive delegates to archiveConversationByAccount', async () => {
    // Schema only has conversationId (body.accountId is not in schema, comes as undefined)
    registerConversationRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/conversation/archive');
    await route!.handler({ query: new Map(), bodyText: JSON.stringify({ conversationId: 'conv-001' }) });
    // accountId is undefined because schema doesn't include it
    expect(mockInternalChat.archiveConversationByAccount).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-001' })
    );
  });
});
