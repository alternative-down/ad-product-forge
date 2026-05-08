import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../utils/id', () => ({
  createId: vi.fn().mockReturnValue('mock-id-12345'),
}));

vi.mock('../helpers', () => ({
  parseJsonBody: vi.fn().mockImplementation((bodyText, schema) => {
    return JSON.parse(bodyText);
  }),
  jsonResponse: vi.fn((body, status = 200) => ({ status, body })),
}));

vi.mock('../../../webhooks/store', () => ({
  createWebhookStore: vi.fn(),
}));

import { registerWebhookAdminRoutes } from './register';
import type { HttpRequest } from '../../http/server';

function createMockStore() {
  return {
    createRoute: vi.fn(),
    listRoutesByAgent: vi.fn(),
    deactivateRoute: vi.fn(),
    listEventsByAgent: vi.fn(),
    markProcessed: vi.fn(),
    markFailed: vi.fn(),
  };
}

function createMockHttpServer() {
  const routes: Array<{ method: string; path: string; handler: Function }> = [];
  return {
    registerRoute: vi.fn((route) => routes.push(route)),
    _routes: routes,
  };
}

function createMockRequest(bodyText: string, path = '/admin/webhooks/route/create', query = ''): HttpRequest {
  return {
    method: 'POST',
    path,
    query,
    bodyText,
    headers: {},
  } as any;
}

describe('registerWebhookAdminRoutes', () => {
  let store: ReturnType<typeof createMockStore>;
  let httpServer: ReturnType<typeof createMockHttpServer>;

  beforeEach(() => {
    store = createMockStore();
    httpServer = createMockHttpServer();
    vi.clearAllMocks();
  });

  describe('POST /admin/webhooks/route/create', () => {
    it('registers the route on the httpServer', () => {
      registerWebhookAdminRoutes(httpServer as any, store as any);
      expect(httpServer.registerRoute).toHaveBeenCalledTimes(5);
      const route = httpServer._routes.find((r) => r.path === '/admin/webhooks/route/create' && r.method === 'POST');
      expect(route).toBeDefined();
    });

    it('returns 201 with routeId and secret on success', async () => {
      store.createRoute.mockResolvedValueOnce({ routeId: 'route-xyz', agentId: 'agent-1', name: 'Test', secret: 'abc123', isActive: true, createdAt: 1, updatedAt: 1 });
      registerWebhookAdminRoutes(httpServer as any, store as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/webhooks/route/create')!.handler;
      const response = await handler(createMockRequest(JSON.stringify({ agentId: 'agent-1', name: 'Test' })));
      expect(response.status).toBe(201);
      expect(response.body.routeId).toBe('route-xyz');
      expect(response.body.secret).toBeTruthy();
    });

    it('calls store.createRoute with agentId and name', async () => {
      store.createRoute.mockResolvedValueOnce({ routeId: 'r1', agentId: 'agent-99', name: 'My Webhook', secret: 'x', isActive: true, createdAt: 1, updatedAt: 1 });
      registerWebhookAdminRoutes(httpServer as any, store as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/webhooks/route/create')!.handler;
      await handler(createMockRequest(JSON.stringify({ agentId: 'agent-99', name: 'My Webhook' })));
      expect(store.createRoute).toHaveBeenCalledWith(expect.objectContaining({
        agentId: 'agent-99',
        name: 'My Webhook',
        secret: expect.any(String),
      }));
    });
  });

  describe('GET /admin/webhooks/routes', () => {
    it('registers the route', () => {
      registerWebhookAdminRoutes(httpServer as any, store as any);
      const route = httpServer._routes.find((r) => r.path === '/admin/webhooks/routes' && r.method === 'GET');
      expect(route).toBeDefined();
    });

    it('returns 400 when agentId is missing from query', async () => {
      registerWebhookAdminRoutes(httpServer as any, store as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/webhooks/routes')!.handler;
      const response = await handler(createMockRequest('', '/admin/webhooks/routes', ''));
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('agentId required');
    });

    it('returns routes for the agent with masked data', async () => {
      store.listRoutesByAgent.mockResolvedValueOnce([
        { routeId: 'r1', name: 'Route 1', isActive: true, createdAt: 1000 },
        { routeId: 'r2', name: 'Route 2', isActive: false, createdAt: 2000 },
      ]);
      registerWebhookAdminRoutes(httpServer as any, store as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/webhooks/routes')!.handler;
      const response = await handler(createMockRequest('', '/admin/webhooks/routes', 'agentId=agent-1'));
      expect(response.body.routes).toHaveLength(2);
      expect(response.body.routes[0]).toMatchObject({ routeId: 'r1', name: 'Route 1', isActive: true, createdAt: 1000 });
      expect(store.listRoutesByAgent).toHaveBeenCalledWith('agent-1');
    });

    it('does not expose secret in response', async () => {
      store.listRoutesByAgent.mockResolvedValueOnce([{ routeId: 'r1', name: 'X', isActive: true, createdAt: 1, secret: 'should-not-be-exposed' }]);
      registerWebhookAdminRoutes(httpServer as any, store as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/webhooks/routes')!.handler;
      const response = await handler(createMockRequest('', '/admin/webhooks/routes', 'agentId=agent-1'));
      expect(response.body.routes[0]).not.toHaveProperty('secret');
    });
  });

  describe('POST /admin/webhooks/route/deactivate', () => {
    it('registers the route', () => {
      registerWebhookAdminRoutes(httpServer as any, store as any);
      const route = httpServer._routes.find((r) => r.path === '/admin/webhooks/route/deactivate' && r.method === 'POST');
      expect(route).toBeDefined();
    });

    it('returns success on deactivation', async () => {
      store.deactivateRoute.mockResolvedValueOnce(undefined);
      registerWebhookAdminRoutes(httpServer as any, store as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/webhooks/route/deactivate')!.handler;
      const response = await handler(createMockRequest(JSON.stringify({ routeId: 'route-deactivate-me' })));
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(store.deactivateRoute).toHaveBeenCalledWith('route-deactivate-me');
    });
  });

  describe('GET /admin/webhooks/events', () => {
    it('registers the route', () => {
      registerWebhookAdminRoutes(httpServer as any, store as any);
      const route = httpServer._routes.find((r) => r.path === '/admin/webhooks/events' && r.method === 'GET');
      expect(route).toBeDefined();
    });

    it('returns 400 when agentId is missing', async () => {
      registerWebhookAdminRoutes(httpServer as any, store as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/webhooks/events')!.handler;
      const response = await handler(createMockRequest('', '/admin/webhooks/events', ''));
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('agentId required');
    });

    it('returns events with masked fields', async () => {
      store.listEventsByAgent.mockResolvedValueOnce([
        { eventId: 'evt-1', routeId: 'route-1', status: 'pending', receivedAt: 5000, payload: { secret: 'data' }, headers: {} },
      ]);
      registerWebhookAdminRoutes(httpServer as any, store as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/webhooks/events')!.handler;
      const response = await handler(createMockRequest('', '/admin/webhooks/events', 'agentId=agent-1'));
      expect(response.body.events).toHaveLength(1);
      expect(response.body.events[0]).toMatchObject({ eventId: 'evt-1', routeId: 'route-1', status: 'pending', receivedAt: 5000 });
    });
  });

  describe('POST /admin/webhooks/event/mark-processed', () => {
    it('registers the route', () => {
      registerWebhookAdminRoutes(httpServer as any, store as any);
      const route = httpServer._routes.find((r) => r.path === '/admin/webhooks/event/mark-processed' && r.method === 'POST');
      expect(route).toBeDefined();
    });

    it('returns success on mark processed', async () => {
      store.markProcessed.mockResolvedValueOnce(undefined);
      registerWebhookAdminRoutes(httpServer as any, store as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/webhooks/event/mark-processed')!.handler;
      const response = await handler(createMockRequest(JSON.stringify({ eventId: 'evt-abc' })));
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(store.markProcessed).toHaveBeenCalledWith('evt-abc');
    });
  });
});