import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

vi.mock('../../../webhooks/store', () => ({
  createWebhookStore: vi.fn(),
}));

vi.mock('../helpers', () => ({
  parseJsonBody: vi.fn().mockImplementation((bodyText, _schema) => JSON.parse(bodyText)),
  jsonResponse: vi.fn((body, status = 200) => ({ status, body })),
}));

vi.mock('../../../utils/id', () => ({
  createId: vi.fn().mockReturnValue('mock-id-12345'),
}));

import { registerWebhookAdminRoutes } from './index';
import type { HttpRequest } from '../../../http/server';

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

function mockRequest(bodyText: string, path = '/admin/webhooks/route/create'): HttpRequest {
  return { method: 'POST', path, query: '', bodyText, headers: {} } as any;
}

function getRequest(path: string, query = ''): HttpRequest {
  return { method: 'GET', path, query, bodyText: '', headers: {} } as any;
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
    it('registers the route', () => {
      registerWebhookAdminRoutes(httpServer as any, store);
      const route = httpServer._routes.find((r) => r.path === '/admin/webhooks/route/create');
      expect(route).toBeDefined();
      expect(route?.method).toBe('POST');
    });

    it('returns 201 with routeId and secret on success', async () => {
      store.createRoute.mockResolvedValueOnce({ routeId: 'r-123', secret: 's-456' });
      registerWebhookAdminRoutes(httpServer as any, store);
      const handler = httpServer._routes.find((r) => r.path === '/admin/webhooks/route/create')!.handler;
      const response = await handler(mockRequest(JSON.stringify({ agentId: 'a1', name: 'My Hook' })));

      expect(response.status).toBe(201);
      expect(response.body.routeId).toBe('r-123');
      expect(response.body.secret).toBeDefined();
    });
  });

  describe('GET /admin/webhooks/routes', () => {
    it('registers the route', () => {
      registerWebhookAdminRoutes(httpServer as any, store);
      const route = httpServer._routes.find((r) => r.path === '/admin/webhooks/routes');
      expect(route).toBeDefined();
      expect(route?.method).toBe('GET');
    });

    it('returns 400 when agentId missing', async () => {
      registerWebhookAdminRoutes(httpServer as any, store);
      const handler = httpServer._routes.find((r) => r.path === '/admin/webhooks/routes')!.handler;
      const response = await handler(getRequest('/admin/webhooks/routes'));

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('agentId');
    });

    it('returns routes array on success', async () => {
      store.listRoutesByAgent.mockResolvedValueOnce([
        { routeId: 'r-1', name: 'hook-1', isActive: true, createdAt: 123 },
        { routeId: 'r-2', name: 'hook-2', isActive: false, createdAt: 456 },
      ]);
      registerWebhookAdminRoutes(httpServer as any, store);
      const handler = httpServer._routes.find((r) => r.path === '/admin/webhooks/routes')!.handler;
      const response = await handler(getRequest('/admin/webhooks/routes?agentId=agent-1'));

      expect(response.status).toBe(200);
      expect(response.body.routes).toHaveLength(2);
      expect(response.body.routes[0].routeId).toBe('r-1');
    });
  });

  describe('POST /admin/webhooks/route/deactivate', () => {
    it('registers the route', () => {
      registerWebhookAdminRoutes(httpServer as any, store);
      const route = httpServer._routes.find((r) => r.path === '/admin/webhooks/route/deactivate');
      expect(route).toBeDefined();
      expect(route?.method).toBe('POST');
    });

    it('returns 200 on success', async () => {
      store.deactivateRoute.mockResolvedValueOnce(undefined);
      registerWebhookAdminRoutes(httpServer as any, store);
      const handler = httpServer._routes.find((r) => r.path === '/admin/webhooks/route/deactivate')!.handler;
      const response = await handler(mockRequest(JSON.stringify({ routeId: 'r-999' })));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /admin/webhooks/events', () => {
    it('registers the route', () => {
      registerWebhookAdminRoutes(httpServer as any, store);
      const route = httpServer._routes.find((r) => r.path === '/admin/webhooks/events');
      expect(route).toBeDefined();
      expect(route?.method).toBe('GET');
    });

    it('returns 400 when agentId missing', async () => {
      registerWebhookAdminRoutes(httpServer as any, store);
      const handler = httpServer._routes.find((r) => r.path === '/admin/webhooks/events')!.handler;
      const response = await handler(getRequest('/admin/webhooks/events'));

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('agentId');
    });

    it('returns events array on success', async () => {
      store.listEventsByAgent.mockResolvedValueOnce([
        { eventId: 'e-1', routeId: 'r-1', status: 'pending', receivedAt: 789 },
      ]);
      registerWebhookAdminRoutes(httpServer as any, store);
      const handler = httpServer._routes.find((r) => r.path === '/admin/webhooks/events')!.handler;
      const response = await handler(getRequest('/admin/webhooks/events?agentId=agent-1'));

      expect(response.status).toBe(200);
      expect(response.body.events).toHaveLength(1);
      expect(response.body.events[0].eventId).toBe('e-1');
    });
  });

  describe('POST /admin/webhooks/event/mark-processed', () => {
    it('registers the route', () => {
      registerWebhookAdminRoutes(httpServer as any, store);
      const route = httpServer._routes.find((r) => r.path === '/admin/webhooks/event/mark-processed');
      expect(route).toBeDefined();
      expect(route?.method).toBe('POST');
    });

    it('returns 200 on success', async () => {
      store.markProcessed.mockResolvedValueOnce(undefined);
      registerWebhookAdminRoutes(httpServer as any, store);
      const handler = httpServer._routes.find((r) => r.path === '/admin/webhooks/event/mark-processed')!.handler;
      const response = await handler(mockRequest(JSON.stringify({ eventId: 'e-123' })));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('route registration', () => {
    it('registers all 5 routes', () => {
      registerWebhookAdminRoutes(httpServer as any, store);
      expect(httpServer._routes).toHaveLength(5);
    });

    it('each route has correct HTTP method', () => {
      registerWebhookAdminRoutes(httpServer as any, store);
      const methods = httpServer._routes.map((r) => r.method);
      expect(methods.filter((m) => m === 'GET')).toHaveLength(2);
      expect(methods.filter((m) => m === 'POST')).toHaveLength(3);
    });
  });
});