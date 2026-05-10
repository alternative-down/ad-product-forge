import { describe, expect, test, vi, beforeEach } from 'vitest';
import { registerInternalChatRoutes } from './index';

type Route = { method: string; path: string; handler: (req?: any) => any };

function createMockHttpServer() {
  const routes: Route[] = [];
  return {
    routes,
    registerRoute(route: Route) { routes.push(route); },
  };
}

function createMockInternalChat() {
  return {
    listAccounts: vi.fn().mockResolvedValue([
      { id: 'acc-001', slug: 'alice', displayName: 'Alice', description: 'desc', agentId: null },
      { id: 'acc-002', slug: 'bob', displayName: 'Bob', description: null, agentId: 'agent-1' },
    ]),
    registerExternalAccount: vi.fn().mockResolvedValue({ accountId: 'acc-new', slug: 'charlie', displayName: 'Charlie' }),
    updateExternalAccount: vi.fn().mockResolvedValue({ accountId: 'acc-upd', slug: 'alice-upd', displayName: 'Alice Updated' }),
    deleteExternalAccount: vi.fn().mockResolvedValue({ success: true }),
    createExternalChatGroup: vi.fn().mockResolvedValue({ conversationId: 'grp-001', conversationKey: 'conv-grp-001' }),
    listConversationsByAccount: vi.fn().mockResolvedValue([
      {
        targetKey: 'conv-001', provider: 'internal-chat', latestMessageAt: '2024-01-01T10:00:00Z',
        name: 'Team Chat', participants: ['acc-001', 'acc-002'],
        messages: [{ messageId: 'msg-001', provider: 'internal-chat', content: 'Hello', unread: false, authorDisplayName: 'Alice', createdAt: '2024-01-01T10:00:00Z', attachments: [] }],
      },
    ]),
    getMessagesByAccount: vi.fn().mockResolvedValue([
      { messageId: 'msg-002', authorId: 'acc-001', authorDisplayName: 'Alice', content: 'Hi there', createdAt: '2024-01-01T11:00:00Z', attachments: [] },
    ]),
    getMessageAttachmentByAccount: vi.fn().mockResolvedValue({ name: 'file.txt', contentType: 'text/plain', sizeBytes: 100, data: Buffer.from('hello') }),
    ensureDirectConversationByAccount: vi.fn().mockResolvedValue({ conversationId: 'dm-001', conversationKey: 'conv-dm-001' }),
    updateGroupByAccount: vi.fn().mockResolvedValue({ conversationId: 'conv-001', name: 'Updated Name' }),
    archiveConversationByAccount: vi.fn().mockResolvedValue({ archived: true }),
    listGroupMembersByAccount: vi.fn().mockResolvedValue([{ participantKey: 'acc-001', role: 'admin' }]),
    addMemberToGroupByAccount: vi.fn().mockResolvedValue({ success: true }),
    updateMemberRoleByAccount: vi.fn().mockResolvedValue({ success: true }),
    removeMemberFromGroupByAccount: vi.fn().mockResolvedValue({ success: true }),
    sendMessage: vi.fn().mockResolvedValue({ messageId: 'msg-new' }),
  };
}

describe('registerInternalChatRoutes', () => {
  let httpServer: ReturnType<typeof createMockHttpServer>;
  let mockChat: ReturnType<typeof createMockInternalChat>;

  beforeEach(() => {
    httpServer = createMockHttpServer();
    mockChat = createMockInternalChat();
    registerInternalChatRoutes(httpServer, mockChat as any);
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Route registration
  // -------------------------------------------------------------------------
  test('registers 16 routes total', () => { expect(httpServer.routes).toHaveLength(16); });
  test('6 GET routes and 10 POST routes', () => {
    expect(httpServer.routes.filter(r => r.method === 'GET')).toHaveLength(6);
    expect(httpServer.routes.filter(r => r.method === 'POST')).toHaveLength(10);
  });
  test('all expected paths are registered', () => {
    const paths = httpServer.routes.map(r => r.path).sort();
    expect(paths).toEqual([
      '/admin/internal-chat/accounts',
      '/admin/internal-chat/contacts',
      '/admin/internal-chat/account/create',
      '/admin/internal-chat/account/update',
      '/admin/internal-chat/account/delete',
      '/admin/internal-chat/conversations',
      '/admin/internal-chat/messages',
      '/admin/internal-chat/message-attachment',
      '/admin/internal-chat/conversation/create',
      '/admin/internal-chat/conversation/send',
      '/admin/internal-chat/conversation/update',
      '/admin/internal-chat/conversation/archive',
      '/admin/internal-chat/group-members',
      '/admin/internal-chat/group-member/add',
      '/admin/internal-chat/group-member/update-role',
      '/admin/internal-chat/group-member/remove',
    ].sort());
  });

  // -------------------------------------------------------------------------
  // GET /admin/internal-chat/accounts
  // -------------------------------------------------------------------------
  test('GET /admin/internal-chat/accounts — filters out agent accounts and maps fields', async () => {
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/accounts');
    const res = await route!.handler();
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual([{ accountId: 'acc-001', slug: 'alice', displayName: 'Alice', description: 'desc' }]);
  });

  // -------------------------------------------------------------------------
  // GET /admin/internal-chat/contacts
  // -------------------------------------------------------------------------
  test('GET /admin/internal-chat/contacts — returns all accounts with isAgent flag and null coalesced description', async () => {
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/contacts');
    const res = await route!.handler();
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual([
      { accountId: 'acc-001', agentId: null, slug: 'alice', displayName: 'Alice', description: 'desc', isAgent: false },
      { accountId: 'acc-002', agentId: 'agent-1', slug: 'bob', displayName: 'Bob', description: '', isAgent: true },
    ]);
  });

  // -------------------------------------------------------------------------
  // GET /admin/internal-chat/conversations
  // -------------------------------------------------------------------------
  test('GET /admin/internal-chat/conversations — returns 400 when accountId missing', async () => {
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/conversations');
    const res = await route!.handler({ query: new Map(), bodyText: '' });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toBe('accountId required');
  });
  test('GET /admin/internal-chat/conversations — delegates with limit 100', async () => {
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/conversations');
    const res = await route!.handler({ query: new Map([['accountId', 'acc-001']]), bodyText: '' });
    expect(mockChat.listConversationsByAccount).toHaveBeenCalledWith({ accountId: 'acc-001', limit: 100 });
    expect(res.status).toBe(200);
  });
  test('GET /admin/internal-chat/conversations — maps conversation fields correctly', async () => {
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/conversations');
    const res = await route!.handler({ query: new Map([['accountId', 'acc-001']]), bodyText: '' });
    const body = JSON.parse(res.body);
    expect(body[0].conversationId).toBe('conv-001');
    expect(body[0].conversationKey).toBe('conv-001');
    expect(body[0].provider).toBe('internal-chat');
    expect(body[0].type).toBe('group');
    expect(body[0].name).toBe('Team Chat');
    expect(body[0].updatedAt).toBe(Date.parse('2024-01-01T10:00:00Z'));
    expect(body[0].messages[0].messageId).toBe('msg-001');
    expect(body[0].messages[0].content).toBe('Hello');
    expect(body[0].messages[0].unread).toBe(false);
    expect(body[0].messages[0].authorDisplayName).toBe('Alice');
    expect(body[0].messages[0].createdAt).toBe(Date.parse('2024-01-01T10:00:00Z'));
  });
  test('GET /admin/internal-chat/conversations — dm type when single participant', async () => {
    mockChat.listConversationsByAccount.mockResolvedValueOnce([
      { targetKey: 'conv-dm', provider: 'internal-chat', latestMessageAt: '2024-01-01T10:00:00Z', participants: ['acc-001'], messages: [] },
    ]);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/conversations');
    const res = await route!.handler({ query: new Map([['accountId', 'acc-001']]), bodyText: '' });
    expect(JSON.parse(res.body)[0].type).toBe('dm');
  });

  // -------------------------------------------------------------------------
  // GET /admin/internal-chat/messages
  // -------------------------------------------------------------------------
  test('GET /admin/internal-chat/messages — returns 400 when accountId missing', async () => {
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/messages');
    const res = await route!.handler({ query: new Map(), bodyText: '' });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toBe('accountId and conversationId required');
  });
  test('GET /admin/internal-chat/messages — returns 400 when conversationId missing', async () => {
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/messages');
    const res = await route!.handler({ query: new Map([['accountId', 'acc-001']]), bodyText: '' });
    expect(res.status).toBe(400);
  });
  test('GET /admin/internal-chat/messages — delegates with parsed limit and offset', async () => {
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/messages');
    const res = await route!.handler({ query: new Map([['accountId', 'acc-001'], ['conversationId', 'conv-001'], ['limit', '10'], ['offset', '5']]), bodyText: '' });
    expect(mockChat.getMessagesByAccount).toHaveBeenCalledWith({ accountId: 'acc-001', conversationKey: 'conv-001', limit: 10, offset: 5 });
    expect(res.status).toBe(200);
  });
  test('GET /admin/internal-chat/messages — hasMore true when items equal limit', async () => {
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/messages');
    const res = await route!.handler({ query: new Map([['accountId', 'acc-001'], ['conversationId', 'conv-001'], ['limit', '1']]), bodyText: '' });
    expect(JSON.parse(res.body).hasMore).toBe(true);
  });
  test('GET /admin/internal-chat/messages — hasMore false when items less than limit', async () => {
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/messages');
    const res = await route!.handler({ query: new Map([['accountId', 'acc-001'], ['conversationId', 'conv-001'], ['limit', '100']]), bodyText: '' });
    expect(JSON.parse(res.body).hasMore).toBe(false);
  });
  test('GET /admin/internal-chat/messages — maps message fields correctly', async () => {
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/messages');
    const res = await route!.handler({ query: new Map([['accountId', 'acc-001'], ['conversationId', 'conv-001']]), bodyText: '' });
    const body = JSON.parse(res.body);
    expect(body.items[0].messageId).toBe('msg-002');
    expect(body.items[0].authorAccountId).toBe('acc-001');
    expect(body.items[0].authorDisplayName).toBe('Alice');
    expect(body.items[0].createdAt).toBe(Date.parse('2024-01-01T11:00:00Z'));
    expect(body.items[0].attachments).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // GET /admin/internal-chat/message-attachment
  // -------------------------------------------------------------------------
  test('GET /admin/internal-chat/message-attachment — returns 400 when params missing', async () => {
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/message-attachment');
    const res = await route!.handler({ query: new Map(), bodyText: '' });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toBe('Missing required query params');
  });
  test('GET /admin/internal-chat/message-attachment — returns file with correct headers', async () => {
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/message-attachment');
    const res = await route!.handler({ query: new Map([['accountId', 'acc-001'], ['conversationId', 'conv-001'], ['messageId', 'msg-001'], ['attachmentName', 'file.txt']]), bodyText: '' });
    expect(mockChat.getMessageAttachmentByAccount).toHaveBeenCalledWith({ accountId: 'acc-001', conversationId: 'conv-001', messageId: 'msg-001', attachmentName: 'file.txt' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/plain');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-disposition']).toBe('inline; filename="file.txt"');
  });

  // -------------------------------------------------------------------------
  // GET /admin/internal-chat/group-members
  // -------------------------------------------------------------------------
  test('GET /admin/internal-chat/group-members — returns 400 when accountId missing', async () => {
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/group-members');
    const res = await route!.handler({ query: new Map(), bodyText: '' });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toBe('accountId and conversationId required');
  });
  test('GET /admin/internal-chat/group-members — delegates to listGroupMembersByAccount', async () => {
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/group-members');
    const res = await route!.handler({ query: new Map([['accountId', 'acc-001'], ['conversationId', 'conv-001']]), bodyText: '' });
    expect(mockChat.listGroupMembersByAccount).toHaveBeenCalledWith({ accountId: 'acc-001', groupId: 'conv-001' });
    expect(res.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // POST /admin/internal-chat/account/create
  // -------------------------------------------------------------------------
  // FIXED: handler reads body.targetKey (→ slug) and body.name (→ displayName)
  test('POST /admin/internal-chat/account/create — delegates with correct field mapping', async () => {
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/account/create');
    const body = JSON.stringify({ provider: 'internal-chat', targetKey: 'acc-key', name: 'Test Account' });
    const res = await route!.handler({ query: new Map(), bodyText: body });
    expect(mockChat.registerExternalAccount).toHaveBeenCalledWith({
      slug: 'acc-key',
      displayName: 'Test Account',
    });
    expect(res.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // POST /admin/internal-chat/account/update
  // -------------------------------------------------------------------------
  // FIXED: handler reads body.name (→ displayName) and body.webhookUrl
  test('POST /admin/internal-chat/account/update — delegates with correct field mapping including webhookUrl', async () => {
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/account/update');
    const body = JSON.stringify({ accountId: 'acc-upd', name: 'Updated', webhookUrl: 'https://example.com/webhook' });
    const res = await route!.handler({ query: new Map(), bodyText: body });
    expect(mockChat.updateExternalAccount).toHaveBeenCalledWith({
      accountId: 'acc-upd',
      displayName: 'Updated',
      webhookUrl: 'https://example.com/webhook',
    });
    expect(res.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // POST /admin/internal-chat/account/delete
  // -------------------------------------------------------------------------
  test('POST /admin/internal-chat/account/delete — delegates to deleteExternalAccount', async () => {
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/account/delete');
    const res = await route!.handler({ query: new Map(), bodyText: JSON.stringify({ accountId: 'acc-del' }) });
    expect(mockChat.deleteExternalAccount).toHaveBeenCalledWith({ accountId: 'acc-del' });
    expect(res.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // POST /admin/internal-chat/conversation/create
  // -------------------------------------------------------------------------
  // FIXED: body.type undefined → always group branch (dm branch unreachable).
  // accountId stripped by schema — read from query param instead.
  test('POST /admin/internal-chat/conversation/create — always creates group, accountId from query', async () => {
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/conversation/create');
    const body = JSON.stringify({ accountId: 'acc-001', name: 'Team Alpha', memberKeys: ['acc-002', 'acc-003'] });
    const res = await route!.handler({ query: new Map([['accountId', 'acc-001']]), bodyText: body });
    // createExternalChatGroup called (dm branch unreachable)
    expect(mockChat.createExternalChatGroup).toHaveBeenCalledTimes(1);
    const call = mockChat.createExternalChatGroup.mock.calls[0][0];
    expect(call.accountId).toBe('acc-001');
    expect(call.name).toBe('Team Alpha');
    expect(call.conversationKey).toMatch(/^conv_[0-9]+_[a-z0-9]+$/);
    // addMemberToGroupByAccount called twice (once per member)
    expect(mockChat.addMemberToGroupByAccount).toHaveBeenCalledTimes(2);
    expect(mockChat.addMemberToGroupByAccount).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-001', role: 'normal' }));
    // ensureDirectConversationByAccount is NOT called
    expect(mockChat.ensureDirectConversationByAccount).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // POST /admin/internal-chat/conversation/send
  // -------------------------------------------------------------------------
  // FIXED: handler uses (body.attachments ?? []) so missing attachments is safe
  test('POST /admin/internal-chat/conversation/send — delegates correctly without attachments', async () => {
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/conversation/send');
    const body = JSON.stringify({ conversationId: 'conv-001', content: 'Hello!' });
    const res = await route!.handler({ query: new Map(), bodyText: body });
    expect(mockChat.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      targetKey: 'conv-001',
      content: 'Hello!',
      attachments: [],
    }));
    expect(res.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // POST /admin/internal-chat/group-member/add
  // -------------------------------------------------------------------------
  // FIXED: accountId from query, participantKey → participantAccountId
  test('POST /admin/internal-chat/group-member/add — delegates with accountId from query and participantKey', async () => {
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/group-member/add');
    const body = JSON.stringify({ conversationId: 'conv-001', participantKey: 'acc-002', role: 'admin' });
    const res = await route!.handler({ query: new Map([['accountId', 'acc-001']]), bodyText: body });
    expect(mockChat.addMemberToGroupByAccount).toHaveBeenCalledWith({
      accountId: 'acc-001',
      groupId: 'conv-001',
      participantAccountId: 'acc-002',
      role: 'admin',
    });
    expect(res.status).toBe(200);
  });

  // FIXED: accountId from query, participantKey → participantAccountId
  test('POST /admin/internal-chat/group-member/update-role — delegates with accountId from query and participantKey', async () => {
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/group-member/update-role');
    const body = JSON.stringify({ conversationId: 'conv-001', participantKey: 'acc-002', role: 'normal' });
    const res = await route!.handler({ query: new Map([['accountId', 'acc-001']]), bodyText: body });
    expect(mockChat.updateMemberRoleByAccount).toHaveBeenCalledWith({
      accountId: 'acc-001',
      groupId: 'conv-001',
      participantAccountId: 'acc-002',
      role: 'normal',
    });
    expect(res.status).toBe(200);
  });

  // FIXED: accountId from query, participantKey → participantAccountId
  test('POST /admin/internal-chat/group-member/remove — delegates with accountId from query and participantKey', async () => {
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/group-member/remove');
    const body = JSON.stringify({ conversationId: 'conv-001', participantKey: 'acc-002' });
    const res = await route!.handler({ query: new Map([['accountId', 'acc-001']]), bodyText: body });
    expect(mockChat.removeMemberFromGroupByAccount).toHaveBeenCalledWith({
      accountId: 'acc-001',
      groupId: 'conv-001',
      participantAccountId: 'acc-002',
    });
    expect(res.status).toBe(200);
  });
});
