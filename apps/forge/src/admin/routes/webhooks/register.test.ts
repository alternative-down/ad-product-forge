import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerWebhookAdminRoutes } from './register';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

// Mock ../helpers — register.ts imports parseJsonBody, jsonResponse, forgeDebug from '../helpers'
// forgeDebug re-exports from @forge-runtime/core, so we let the core mock track calls
vi.mock('../helpers', () => ({
  parseJsonBody: vi.fn((bodyText: string, _schema?: unknown) => {
    if (!bodyText || bodyText.trim() === '{}' || bodyText.trim() === '') return {};
    try { return JSON.parse(bodyText); } catch { return {}; }
  }),
  jsonResponse: (body: unknown, status = 200) => ({
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  }),
}));

// Mock crypto — the secret is generated via createHash('sha256').update(createId()).digest('hex').slice(0, 32)
// We mock the chain so that digest('hex') returns a deterministic string (64 'a' chars in hex = 32 bytes)
// Then slice(0, 32) gives us 32 'a' chars
vi.mock('node:crypto', () => ({
  createHash: vi.fn().mockReturnValue({
    update: vi.fn().mockReturnValue({
      digest: vi.fn((encoding?: string) => {
        if (encoding === 'hex') {
          // 64 'a' chars in hex = 32 bytes of 0x61
          return '6161616161616161616161616161616161616161616161616161616161616161'; // 64 a's = 32 bytes
        }
        return Buffer.from('');
      }),
    }),
  }),
}));

vi.mock('../../../utils/id', () => ({
  createId: vi.fn().mockReturnValue('mock-id-12345'),
}));

// --- Mock store factory ---
function createMockStore() {
  return {
    createRoute: vi.fn(),
    listRoutesByAgent: vi.fn(),
    deactivateRoute: vi.fn(),
    listEventsByAgent: vi.fn(),
    markProcessed: vi.fn(),
  };
}

// --- HTTP server mock ---
function createMockHttpServer() {
  const routes: any[] = [];
  return {
    registerRoute: vi.fn((route: any) => routes.push(route)),
    _routes: routes,
  };
}

// --- Helpers ---
function parseBody(response: { status: number; body: string }) {
  return JSON.parse(response.body);
}

function getHandler(httpServer: ReturnType<typeof createMockHttpServer>, method: string, path: string) {
  const match = httpServer._routes.find((r: any) => r.method === method && r.path === path);
  if (!match) throw new Error(`Route ${method} ${path} not found in mock server`);
  return match.handler;
}

function makeRequest(body: unknown): { bodyText: string; path: string; query: URLSearchParams; method: string; headers: Record<string, string> } {
  return {
    bodyText: JSON.stringify(body),
    path: '/admin/webhooks/route/create',
    query: new URLSearchParams(),
    method: 'POST',
    headers: {},
  };
}

// Expected: first 32 chars of 64 'a's hex = '6161...' (32 chars)
const EXPECTED_SECRET = '61616161616161616161616161616161';

describe('registerWebhookAdminRoutes', () => {
  let httpServer: ReturnType<typeof createMockHttpServer>;
  let store: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    httpServer = createMockHttpServer();
    store = createMockStore();
    vi.clearAllMocks();
  });

  describe('route registration', () => {
    it('registers POST /admin/webhooks/route/create', () => {
      registerWebhookAdminRoutes(httpServer, store);
      const route = httpServer._routes.find((r: any) => r.path === '/admin/webhooks/route/create');
      expect(route).toBeDefined();
      expect(route.method).toBe('POST');
    });

    it('registers GET /admin/webhooks/routes', () => {
      registerWebhookAdminRoutes(httpServer, store);
      const route = httpServer._routes.find((r: any) => r.path === '/admin/webhooks/routes');
      expect(route).toBeDefined();
      expect(route.method).toBe('GET');
    });

    it('registers POST /admin/webhooks/route/deactivate', () => {
      registerWebhookAdminRoutes(httpServer, store);
      const route = httpServer._routes.find((r: any) => r.path === '/admin/webhooks/route/deactivate');
      expect(route).toBeDefined();
      expect(route.method).toBe('POST');
    });

    it('registers GET /admin/webhooks/events', () => {
      registerWebhookAdminRoutes(httpServer, store);
      const route = httpServer._routes.find((r: any) => r.path === '/admin/webhooks/events');
      expect(route).toBeDefined();
      expect(route.method).toBe('GET');
    });

    it('registers POST /admin/webhooks/event/mark-processed', () => {
      registerWebhookAdminRoutes(httpServer, store);
      const route = httpServer._routes.find((r: any) => r.path === '/admin/webhooks/event/mark-processed');
      expect(route).toBeDefined();
      expect(route.method).toBe('POST');
    });
  });

  describe('POST /admin/webhooks/route/create', () => {
    it('creates a webhook route and returns 201 with routeId and secret', async () => {
      registerWebhookAdminRoutes(httpServer, store);
      const handler = getHandler(httpServer, 'POST', '/admin/webhooks/route/create');

      store.createRoute.mockResolvedValueOnce({
        routeId: 'route-abc',
        secret: EXPECTED_SECRET,
        agentId: 'agent-1',
        name: 'My Webhook',
        isActive: true,
        createdAt: Date.now(),
      });

      const response = await handler(makeRequest({ agentId: 'agent-1', name: 'My Webhook' }));

      expect(response.status).toBe(201);
      const body = parseBody(response);
      expect(body.routeId).toBe('route-abc');
      expect(body.secret).toBe(EXPECTED_SECRET);
      expect(store.createRoute).toHaveBeenCalledWith(expect.objectContaining({
        agentId: 'agent-1',
        name: 'My Webhook',
        secret: EXPECTED_SECRET,
      }));
    });

    it('passes createId() output into createHash to generate the secret', async () => {
      registerWebhookAdminRoutes(httpServer, store);
      const handler = getHandler(httpServer, 'POST', '/admin/webhooks/route/create');

      store.createRoute.mockImplementation(async (input: { agentId: string; name: string; secret: string }) => ({
        routeId: 'route-1',
        secret: input.secret,
        agentId: input.agentId,
        name: input.name,
        isActive: true,
        createdAt: Date.now(),
      }));

      const response = await handler(makeRequest({ agentId: 'agent-1', name: 'Test' }));
      const body = parseBody(response);

      // Secret is the first 32 chars of the hex digest of 32 bytes of 0x61
      expect(body.secret).toBe(EXPECTED_SECRET);
      // createId was called to seed the hash
      const { createId } = await import('../../../utils/id');
      expect(createId).toHaveBeenCalled();
    });
  });

  describe('GET /admin/webhooks/routes', () => {
    it('returns 400 when agentId is missing', async () => {
      registerWebhookAdminRoutes(httpServer, store);
      const handler = getHandler(httpServer, 'GET', '/admin/webhooks/routes');

      const req = { bodyText: '', path: '/admin/webhooks/routes', query: new URLSearchParams(), method: 'GET', headers: {} };
      const response = await handler(req);

      expect(response.status).toBe(400);
      expect(parseBody(response).error).toBe('agentId required');
    });

    it('returns routes for a given agentId', async () => {
      registerWebhookAdminRoutes(httpServer, store);
      const handler = getHandler(httpServer, 'GET', '/admin/webhooks/routes');

      store.listRoutesByAgent.mockResolvedValueOnce([
        { routeId: 'route-1', name: 'Webhook One', isActive: true, createdAt: 1000 },
        { routeId: 'route-2', name: 'Webhook Two', isActive: false, createdAt: 2000 },
      ]);

      const req = {
        bodyText: '',
        path: '/admin/webhooks/routes?agentId=agent-1',
        query: new URLSearchParams('agentId=agent-1'),
        method: 'GET',
        headers: {},
      };
      const response = await handler(req);

      expect(response.status).toBe(200);
      const body = parseBody(response);
      expect(body.routes).toHaveLength(2);
      expect(body.routes[0]).toMatchObject({ routeId: 'route-1', name: 'Webhook One' });
    });
  });

  describe('POST /admin/webhooks/route/deactivate', () => {
    it('deactivates a route and returns success', async () => {
      registerWebhookAdminRoutes(httpServer, store);
      const handler = getHandler(httpServer, 'POST', '/admin/webhooks/route/deactivate');

      store.deactivateRoute.mockResolvedValueOnce(undefined);

      const response = await handler(makeRequest({ routeId: 'route-xyz' }));

      expect(response.status).toBe(200);
      expect(parseBody(response).success).toBe(true);
      expect(store.deactivateRoute).toHaveBeenCalledWith('route-xyz');
    });
  });

  describe('GET /admin/webhooks/events', () => {
    it('returns 400 when agentId is missing', async () => {
      registerWebhookAdminRoutes(httpServer, store);
      const handler = getHandler(httpServer, 'GET', '/admin/webhooks/events');

      const req = { bodyText: '', path: '/admin/webhooks/events', query: new URLSearchParams(), method: 'GET', headers: {} };
      const response = await handler(req);

      expect(response.status).toBe(400);
      expect(parseBody(response).error).toBe('agentId required');
    });

    it('returns events for a given agentId', async () => {
      registerWebhookAdminRoutes(httpServer, store);
      const handler = getHandler(httpServer, 'GET', '/admin/webhooks/events');

      store.listEventsByAgent.mockResolvedValueOnce([
        { eventId: 'evt-1', routeId: 'route-1', status: 'pending', receivedAt: 3000 },
        { eventId: 'evt-2', routeId: 'route-2', status: 'processed', receivedAt: 4000 },
      ]);

      const req = {
        bodyText: '',
        path: '/admin/webhooks/events?agentId=agent-1',
        query: new URLSearchParams('agentId=agent-1'),
        method: 'GET',
        headers: {},
      };
      const response = await handler(req);

      expect(response.status).toBe(200);
      const body = parseBody(response);
      expect(body.events).toHaveLength(2);
      expect(body.events[0]).toMatchObject({ eventId: 'evt-1', status: 'pending' });
    });
  });

  describe('POST /admin/webhooks/event/mark-processed', () => {
    it('marks an event as processed and returns success', async () => {
      registerWebhookAdminRoutes(httpServer, store);
      const handler = getHandler(httpServer, 'POST', '/admin/webhooks/event/mark-processed');

      store.markProcessed.mockResolvedValueOnce(undefined);

      const response = await handler(makeRequest({ eventId: 'evt-123' }));

      expect(response.status).toBe(200);
      expect(parseBody(response).success).toBe(true);
      expect(store.markProcessed).toHaveBeenCalledWith('evt-123');
    });
  });
  describe('error handling', () => {
    it('returns 500 when createRoute throws', async () => {
      store.createRoute.mockRejectedValueOnce(new Error('DB constraint violation'));
      registerWebhookAdminRoutes(httpServer, store);
      const handler = getHandler(httpServer, 'POST', '/admin/webhooks/route/create');
      const response = await handler(makeRequest({ agentId: 'agent-42', name: 'Test' }));
      expect(response.status).toBe(500);
      expect(parseBody(response).error).toBe('DB constraint violation');
    });

    it('forgeDebug is called on createRoute failure', async () => {
      const { forgeDebug } = await vi.importMock('@forge-runtime/core');
      store.createRoute.mockRejectedValueOnce(new Error('boom'));
      registerWebhookAdminRoutes(httpServer, store);
      const handler = getHandler(httpServer, 'POST', '/admin/webhooks/route/create');
      await handler(makeRequest({ agentId: 'agent-42', name: 'Test' }));
      expect(forgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'admin', level: 'error' }),
      );
    });

    it('returns 500 when listRoutesByAgent throws', async () => {
      store.listRoutesByAgent.mockRejectedValueOnce(new Error('DB error'));
      registerWebhookAdminRoutes(httpServer, store);
      const handler = getHandler(httpServer, 'GET', '/admin/webhooks/routes');
      const req = { bodyText: '', path: '/admin/webhooks/routes', query: new URLSearchParams([['agentId', 'agent-42']]), method: 'GET', headers: {} };
      const response = await handler(req);
      expect(response.status).toBe(500);
    });

    it('returns 500 when deactivateRoute throws', async () => {
      store.deactivateRoute.mockRejectedValueOnce(new Error('DB write error'));
      registerWebhookAdminRoutes(httpServer, store);
      const handler = getHandler(httpServer, 'POST', '/admin/webhooks/route/deactivate');
      const response = await handler(makeRequest({ routeId: 'route-xyz' }));
      expect(response.status).toBe(500);
      expect(parseBody(response).error).toBe('DB write error');
    });

    it('returns 500 when listEventsByAgent throws', async () => {
      store.listEventsByAgent.mockRejectedValueOnce(new Error('DB error'));
      registerWebhookAdminRoutes(httpServer, store);
      const handler = getHandler(httpServer, 'GET', '/admin/webhooks/events');
      const req = { bodyText: '', path: '/admin/webhooks/events', query: new URLSearchParams([['agentId', 'agent-42']]), method: 'GET', headers: {} };
      const response = await handler(req);
      expect(response.status).toBe(500);
    });

    it('returns 500 when markProcessed throws', async () => {
      store.markProcessed.mockRejectedValueOnce(new Error('DB error'));
      registerWebhookAdminRoutes(httpServer, store);
      const handler = getHandler(httpServer, 'POST', '/admin/webhooks/event/mark-processed');
      const response = await handler(makeRequest({ eventId: 'evt-123' }));
      expect(response.status).toBe(500);
      expect(parseBody(response).error).toBe('DB error');
    });
  });

});
