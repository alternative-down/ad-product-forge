import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerAccountRoutes } from './internal-chat-account-routes';

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
    listAccounts: vi.fn().mockResolvedValue([
      { id: 'acc-001', slug: 'alice', displayName: 'Alice', description: 'desc', agentId: null },
      { id: 'acc-002', slug: 'bob', displayName: 'Bob', description: null, agentId: 'agent-1' },
    ]),
    registerExternalAccount: vi.fn().mockResolvedValue({ accountId: 'acc-new', slug: 'charlie', displayName: 'Charlie' }),
    updateExternalAccount: vi.fn().mockResolvedValue({ accountId: 'acc-upd', slug: 'alice-upd', displayName: 'Alice Updated' }),
    deleteExternalAccount: vi.fn().mockResolvedValue({ success: true }),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('registerAccountRoutes', () => {
  let httpServer: ReturnType<typeof createMockHttpServer>;
  let mockInternalChat: ReturnType<typeof createMockInternalChat>;

  beforeEach(() => {
    httpServer = createMockHttpServer();
    mockInternalChat = createMockInternalChat();
    mockForgeDebug.mockClear();
  });

  it('registers all 5 account routes', () => {
    registerAccountRoutes(httpServer, mockInternalChat as never);
    expect(httpServer.routes).toHaveLength(5);
  });

  it('registers GET /admin/internal-chat/accounts', () => {
    registerAccountRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/accounts');
    expect(route).toBeDefined();
    expect(route!.method).toBe('GET');
  });

  it('GET /admin/internal-chat/accounts returns only non-agent accounts', async () => {
    registerAccountRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/accounts');
    const result = await route!.handler() as { body: string };
    const body = JSON.parse(result.body);
    expect(body).toHaveLength(1);
    expect(body[0].accountId).toBe('acc-001');
    expect(body[0].slug).toBe('alice');
  });

  it('registers GET /admin/internal-chat/contacts', () => {
    registerAccountRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/contacts');
    expect(route).toBeDefined();
    expect(route!.method).toBe('GET');
  });

  it('GET /admin/internal-chat/contacts returns all accounts with isAgent flag', async () => {
    registerAccountRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/contacts');
    const result = await route!.handler() as { body: string };
    const body = JSON.parse(result.body);
    expect(body).toHaveLength(2);
    expect(body[1].isAgent).toBe(true);
    expect(body[0].isAgent).toBe(false);
  });

  it('registers POST /admin/internal-chat/account/create', () => {
    registerAccountRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/account/create');
    expect(route).toBeDefined();
    expect(route!.method).toBe('POST');
  });

  it('POST /admin/internal-chat/account/create delegates to registerExternalAccount with correct args', async () => {
    registerAccountRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/account/create');
    const result = await route!.handler({ bodyText: JSON.stringify({ provider: 'internal-chat', targetKey: 'charlie', name: 'Charlie' }) }) as { body: string };
    expect(mockInternalChat.registerExternalAccount).toHaveBeenCalledWith({
      slug: 'charlie',
      displayName: 'Charlie',
    });
    expect(JSON.parse(result.body)).toEqual({ accountId: 'acc-new', slug: 'charlie', displayName: 'Charlie' });
  });

  it('registers POST /admin/internal-chat/account/update', () => {
    registerAccountRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/account/update');
    expect(route).toBeDefined();
    expect(route!.method).toBe('POST');
  });

  it('POST /admin/internal-chat/account/update delegates with correct fields', async () => {
    registerAccountRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/account/update');
    await route!.handler({ bodyText: JSON.stringify({ accountId: 'acc-upd', name: 'Updated', webhookUrl: 'https://example.com' }) });
    expect(mockInternalChat.updateExternalAccount).toHaveBeenCalledWith({
      accountId: 'acc-upd',
      displayName: 'Updated',
      webhookUrl: 'https://example.com',
    });
  });

  it('registers POST /admin/internal-chat/account/delete', () => {
    registerAccountRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/account/delete');
    expect(route).toBeDefined();
    expect(route!.method).toBe('POST');
  });

  it('POST /admin/internal-chat/account/delete delegates to deleteExternalAccount', async () => {
    registerAccountRoutes(httpServer, mockInternalChat as never);
    const route = httpServer.routes.find(r => r.path === '/admin/internal-chat/account/delete');
    await route!.handler({ bodyText: JSON.stringify({ accountId: 'acc-001' }) });
    expect(mockInternalChat.deleteExternalAccount).toHaveBeenCalledWith({ accountId: 'acc-001' });
  });
});
