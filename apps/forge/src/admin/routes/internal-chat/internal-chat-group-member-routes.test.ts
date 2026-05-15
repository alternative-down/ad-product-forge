import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerGroupMemberRoutes } from './internal-chat-group-member-routes';
import type { InternalChatService } from '../../../communication/internal-chat-service';

describe('registerGroupMemberRoutes', () => {
  let httpServer: { registerRoute: ReturnType<typeof vi.fn> };
  let mockInternalChat: {
    listGroupMembersByAccount: ReturnType<typeof vi.fn>;
    addMemberToGroupByAccount: ReturnType<typeof vi.fn>;
    updateMemberRoleByAccount: ReturnType<typeof vi.fn>;
    removeMemberFromGroupByAccount: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.resetModules();
    httpServer = { registerRoute: vi.fn() };
    mockInternalChat = {
      listGroupMembersByAccount: vi.fn().mockResolvedValue([{ memberId: 'm1', accountId: 'acc-002', role: 'normal' }]),
      addMemberToGroupByAccount: vi.fn().mockResolvedValue({ memberId: 'm-new' }),
      updateMemberRoleByAccount: vi.fn().mockResolvedValue({ memberId: 'm-001' }),
      removeMemberFromGroupByAccount: vi.fn().mockResolvedValue({ removed: true }),
    };
  });

  afterEach(() => { vi.restoreAllMocks(); });

  // ─── Registration tests ──────────────────────────────────────────────────

  it('registers GET /admin/internal-chat/group-members', () => {
    registerGroupMemberRoutes(httpServer as never, mockInternalChat as never);
    expect(httpServer.registerRoute).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/admin/internal-chat/group-members' })
    );
  });

  it('registers POST /admin/internal-chat/group-member/add', () => {
    registerGroupMemberRoutes(httpServer as never, mockInternalChat as never);
    expect(httpServer.registerRoute).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', path: '/admin/internal-chat/group-member/add' })
    );
  });

  it('registers POST /admin/internal-chat/group-member/update-role', () => {
    registerGroupMemberRoutes(httpServer as never, mockInternalChat as never);
    expect(httpServer.registerRoute).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', path: '/admin/internal-chat/group-member/update-role' })
    );
  });

  it('registers POST /admin/internal-chat/group-member/remove', () => {
    registerGroupMemberRoutes(httpServer as never, mockInternalChat as never);
    expect(httpServer.registerRoute).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', path: '/admin/internal-chat/group-member/remove' })
    );
  });

  // ─── GET /admin/internal-chat/group-members ───────────────────────────────

  it('GET /admin/internal-chat/group-members delegates to listGroupMembersByAccount', async () => {
    registerGroupMemberRoutes(httpServer as never, mockInternalChat as never);
    const route = httpServer.registerRoute.mock.calls.find(
      (call: unknown[]) => (call[0] as {path: string}).path === '/admin/internal-chat/group-members'
    )![0] as { handler: (req: unknown) => unknown };
    const result = await route.handler({
      query: new Map([['accountId', 'acc-001'], ['conversationId', 'conv-001']]),
      bodyText: '',
    }) as { body: string };
    expect(mockInternalChat.listGroupMembersByAccount).toHaveBeenCalledWith({
      accountId: 'acc-001',
      groupId: 'conv-001',
    });
    expect(JSON.parse(result.body)).toEqual([{ memberId: 'm1', accountId: 'acc-002', role: 'normal' }]);
  });

  it('GET /admin/internal-chat/group-members returns 400 when accountId missing', async () => {
    registerGroupMemberRoutes(httpServer as never, mockInternalChat as never);
    const route = httpServer.registerRoute.mock.calls.find(
      (call: unknown[]) => (call[0] as {path: string}).path === '/admin/internal-chat/group-members'
    )![0] as { handler: (req: unknown) => unknown };
    const result = await route.handler({
      query: new Map([['conversationId', 'conv-001']]),
      bodyText: '',
    }) as { body: string; status: number };
    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'accountId and conversationId required' });
  });

  it('GET /admin/internal-chat/group-members returns 400 when conversationId missing', async () => {
    registerGroupMemberRoutes(httpServer as never, mockInternalChat as never);
    const route = httpServer.registerRoute.mock.calls.find(
      (call: unknown[]) => (call[0] as {path: string}).path === '/admin/internal-chat/group-members'
    )![0] as { handler: (req: unknown) => unknown };
    const result = await route.handler({
      query: new Map([['accountId', 'acc-001']]),
      bodyText: '',
    }) as { body: string; status: number };
    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'accountId and conversationId required' });
  });

  // ─── POST /admin/internal-chat/group-member/add ──────────────────────────

  it('POST /admin/internal-chat/group-member/add delegates to addMemberToGroupByAccount', async () => {
    registerGroupMemberRoutes(httpServer as never, mockInternalChat as never);
    const route = httpServer.registerRoute.mock.calls.find(
      (call: unknown[]) => (call[0] as {path: string}).path === '/admin/internal-chat/group-member/add'
    )![0] as { handler: (req: unknown) => unknown };
    const result = await route.handler({
      query: new Map([['accountId', 'acc-001']]),
      bodyText: JSON.stringify({ conversationId: 'conv-001', participantKey: 'acc-002', role: 'admin' }),
    }) as { body: string };
    expect(mockInternalChat.addMemberToGroupByAccount).toHaveBeenCalledWith({
      accountId: 'acc-001',
      groupId: 'conv-001',
      participantAccountId: 'acc-002',
      role: 'admin',
    });
    expect(JSON.parse(result.body)).toEqual({ memberId: 'm-new' });
  });

  it('POST /admin/internal-chat/group-member/add uses role=normal when not provided', async () => {
    registerGroupMemberRoutes(httpServer as never, mockInternalChat as never);
    const route = httpServer.registerRoute.mock.calls.find(
      (call: unknown[]) => (call[0] as {path: string}).path === '/admin/internal-chat/group-member/add'
    )![0] as { handler: (req: unknown) => unknown };
    const result = await route.handler({
      query: new Map([['accountId', 'acc-001']]),
      bodyText: JSON.stringify({ conversationId: 'conv-001', participantKey: 'acc-002' }),
    }) as { body: string };
    expect(mockInternalChat.addMemberToGroupByAccount).toHaveBeenCalledWith({
      accountId: 'acc-001',
      groupId: 'conv-001',
      participantAccountId: 'acc-002',
      role: 'normal',
    });
    expect(JSON.parse(result.body)).toEqual({ memberId: 'm-new' });
  });

  it('POST /admin/internal-chat/group-member/add returns 400 when accountId missing', async () => {
    registerGroupMemberRoutes(httpServer as never, mockInternalChat as never);
    const route = httpServer.registerRoute.mock.calls.find(
      (call: unknown[]) => (call[0] as {path: string}).path === '/admin/internal-chat/group-member/add'
    )![0] as { handler: (req: unknown) => unknown };
    const result = await route.handler({
      query: new Map(),
      bodyText: JSON.stringify({ conversationId: 'conv-001', participantKey: 'acc-002' }),
    }) as { body: string; status: number };
    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'accountId required' });
  });

  // ─── POST /admin/internal-chat/group-member/update-role ──────────────────

  it('POST /admin/internal-chat/group-member/update-role delegates to updateMemberRoleByAccount', async () => {
    registerGroupMemberRoutes(httpServer as never, mockInternalChat as never);
    const route = httpServer.registerRoute.mock.calls.find(
      (call: unknown[]) => (call[0] as {path: string}).path === '/admin/internal-chat/group-member/update-role'
    )![0] as { handler: (req: unknown) => unknown };
    const result = await route.handler({
      query: new Map([['accountId', 'acc-001']]),
      bodyText: JSON.stringify({ conversationId: 'conv-001', participantKey: 'acc-002', role: 'admin' }),
    }) as { body: string };
    expect(mockInternalChat.updateMemberRoleByAccount).toHaveBeenCalledWith({
      accountId: 'acc-001',
      groupId: 'conv-001',
      participantAccountId: 'acc-002',
      role: 'admin',
    });
    expect(JSON.parse(result.body)).toEqual({ memberId: 'm-001' });
  });

  it('POST /admin/internal-chat/group-member/update-role returns 400 when accountId missing', async () => {
    registerGroupMemberRoutes(httpServer as never, mockInternalChat as never);
    const route = httpServer.registerRoute.mock.calls.find(
      (call: unknown[]) => (call[0] as {path: string}).path === '/admin/internal-chat/group-member/update-role'
    )![0] as { handler: (req: unknown) => unknown };
    const result = await route.handler({
      query: new Map(),
      bodyText: JSON.stringify({ conversationId: 'conv-001', participantKey: 'acc-002', role: 'admin' }),
    }) as { body: string; status: number };
    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'accountId required' });
  });

  // ─── POST /admin/internal-chat/group-member/remove ─────────────────────

  it('POST /admin/internal-chat/group-member/remove delegates to removeMemberFromGroupByAccount', async () => {
    registerGroupMemberRoutes(httpServer as never, mockInternalChat as never);
    const route = httpServer.registerRoute.mock.calls.find(
      (call: unknown[]) => (call[0] as {path: string}).path === '/admin/internal-chat/group-member/remove'
    )![0] as { handler: (req: unknown) => unknown };
    const result = await route.handler({
      query: new Map([['accountId', 'acc-001']]),
      bodyText: JSON.stringify({ conversationId: 'conv-001', participantKey: 'acc-002' }),
    }) as { body: string };
    expect(mockInternalChat.removeMemberFromGroupByAccount).toHaveBeenCalledWith({
      accountId: 'acc-001',
      groupId: 'conv-001',
      participantAccountId: 'acc-002',
    });
    expect(JSON.parse(result.body)).toEqual({ removed: true });
  });

  it('POST /admin/internal-chat/group-member/remove returns 400 when accountId missing', async () => {
    registerGroupMemberRoutes(httpServer as never, mockInternalChat as never);
    const route = httpServer.registerRoute.mock.calls.find(
      (call: unknown[]) => (call[0] as {path: string}).path === '/admin/internal-chat/group-member/remove'
    )![0] as { handler: (req: unknown) => unknown };
    const result = await route.handler({
      query: new Map(),
      bodyText: JSON.stringify({ conversationId: 'conv-001', participantKey: 'acc-002' }),
    }) as { body: string; status: number };
    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'accountId required' });
  });
});
