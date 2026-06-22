import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerWebhookAdminRoutes } from './register';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
  errorMsg: vi.fn((err) => err instanceof Error ? err.message : typeof err === "string" ? err : String(err).replace(/^Error: /, "")),
  withToolErrorLogging: vi.fn(async (params) => {
    try {
      return { valid: true, data: await params.fn() };
    } catch (error) {
      // Mirror the real impl: use errorMsg-style formatting
      const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error).replace(/^Error: /, '');
      return { valid: false, error: msg, hint: params.hint || '' };
    }
  })
}));

// Mock ../helpers — register.ts imports parseJsonBody, jsonResponse, forgeDebug from '../helpers'
// forgeDebug re-exports from @forge-runtime/core, so we let the core mock track calls
vi.mock('../helpers', () => ({
  parseJsonBody: vi.fn((bodyText: string, _schema?: unknown) => {
    if (!bodyText || bodyText.trim() === '{}' || bodyText.trim() === '') return {};
    try {
      return JSON.parse(bodyText);
    } catch {
      return {};
    }
  }),
  jsonResponse: (body: unknown, status = 200) => ({
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  }),
}));

// Mock encryption helper — secret generation + encryption now lives in store.ts
// (encryptSecret uses randomBytes + AES-256-GCM with ENCRYPTION_KEY).
// register.ts no longer calls crypto directly — secrets are returned by store.
vi.mock('../../../encryption/crypto', () => ({
  encryptSecret: vi.fn((plaintext: string) => `enc(${plaintext})`),
  decryptSecret: vi.fn((encrypted: string) => encrypted.replace(/^enc\((.*)\)$/, '$1')),
}));

vi.mock('../../../utils/id', () => ({
  createId: vi.fn().mockReturnValue('mock-id-12345'),
}));

// --- Mock store factory ---
// New shape after #5894: createRoute + rotateRouteSecret return
// { route, plaintextSecret }. Handler route secret is NOT generated in
// register.ts anymore — store.createRoute generates 32 random bytes.
function createMockStore() {
  return {
    createRoute: vi.fn(),
    getRoute: vi.fn(),
    listRoutesByAgent: vi.fn(),
    deactivateRoute: vi.fn(),
    rotateRouteSecret: vi.fn(),
    listEventsByAgent: vi.fn(),
    markProcessed: vi.fn(),
    markFailed: vi.fn(),
  };
}

// --- HTTP server mock ---
type MockRoute = { method: string; path: string; handler: unknown };

function createMockHttpServer() {
  const routes: MockRoute[] = [];
  return {
    registerRoute: vi.fn((route: MockRoute) => routes.push(route)),
    _routes: routes,
  };
}

// --- Helpers ---
function parseBody(response: { status: number; body: string }) {
  return JSON.parse(response.body);
}

function getHandler(
  httpServer: ReturnType<typeof createMockHttpServer>,
  method: string,
  path: string,
) {
  const match = httpServer._routes.find((r) => r.method === method && r.path === path);
  if (!match) throw new Error(`Route ${method} ${path} not found in mock server`);
  return match.handler;
}

function makeRequest(body: unknown): {
  bodyText: string;
  path: string;
  query: URLSearchParams;
  method: string;
  headers: Record<string, string>;
} {
  return {
    bodyText: JSON.stringify(body),
    path: '/admin/webhooks/route/create',
    query: new URLSearchParams(),
    method: 'POST',
    headers: {},
  };
}

// Deterministic test secret (43 chars base64url-encoded 32 bytes).
const TEST_PLAINTEXT_SECRET = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';

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
      registerWebhookAdminRoutes(
        httpServer as never,
        store as unknown as Parameters<typeof registerWebhookAdminRoutes>[1],
      );
      const route = httpServer._routes.find((r) => r.path === '/admin/webhooks/route/create');
      expect(route).toBeDefined();
      expect((route as { method: string }).method).toBe('POST');
    });

    it('registers POST /admin/webhooks/route/rotate-secret (NEW for #5894)', () => {
      registerWebhookAdminRoutes(
        httpServer as never,
        store as unknown as Parameters<typeof registerWebhookAdminRoutes>[1],
      );
      const route = httpServer._routes.find(
        (r) => r.path === '/admin/webhooks/route/rotate-secret',
      );
      expect(route).toBeDefined();
      expect((route as { method: string }).method).toBe('POST');
    });

    it('registers GET /admin/webhooks/routes', () => {
      registerWebhookAdminRoutes(
        httpServer as never,
        store as unknown as Parameters<typeof registerWebhookAdminRoutes>[1],
      );
      const route = httpServer._routes.find((r) => r.path === '/admin/webhooks/routes');
      expect(route).toBeDefined();
      expect((route as { method: string }).method).toBe('GET');
    });

    it('registers POST /admin/webhooks/route/deactivate', () => {
      registerWebhookAdminRoutes(
        httpServer as never,
        store as unknown as Parameters<typeof registerWebhookAdminRoutes>[1],
      );
      const route = httpServer._routes.find((r) => r.path === '/admin/webhooks/route/deactivate');
      expect(route).toBeDefined();
      expect((route as { method: string }).method).toBe('POST');
    });

    it('registers GET /admin/webhooks/events', () => {
      registerWebhookAdminRoutes(
        httpServer as never,
        store as unknown as Parameters<typeof registerWebhookAdminRoutes>[1],
      );
      const route = httpServer._routes.find((r) => r.path === '/admin/webhooks/events');
      expect(route).toBeDefined();
      expect((route as { method: string }).method).toBe('GET');
    });

    it('registers POST /admin/webhooks/event/mark-processed', () => {
      registerWebhookAdminRoutes(
        httpServer as never,
        store as unknown as Parameters<typeof registerWebhookAdminRoutes>[1],
      );
      const route = httpServer._routes.find(
        (r) => r.path === '/admin/webhooks/event/mark-processed',
      );
      expect(route).toBeDefined();
      expect((route as { method: string }).method).toBe('POST');
    });
  });

  describe('POST /admin/webhooks/route/create', () => {
    it('creates a webhook route and returns 201 with routeId and secret (one-time)', async () => {
      registerWebhookAdminRoutes(
        httpServer as never,
        store as unknown as Parameters<typeof registerWebhookAdminRoutes>[1],
      );
      const handler = getHandler(httpServer, 'POST', '/admin/webhooks/route/create') as (
        req: unknown,
      ) => Promise<{ status: number; body: string }>;

      // New shape after #5894: createRoute returns { route, plaintextSecret }
      store.createRoute.mockResolvedValueOnce({
        route: { routeId: 'route-abc', name: 'My Webhook' },
        plaintextSecret: TEST_PLAINTEXT_SECRET,
      });

      const response = await (
        handler as (req: unknown) => Promise<{ status: number; body: string }>
      )(makeRequest({ agentId: 'agent-1', name: 'My Webhook' }));

      expect(response.status).toBe(201);
      const body = parseBody(response);
      expect(body.routeId).toBe('route-abc');
      expect(body.secret).toBe(TEST_PLAINTEXT_SECRET);
      // store.createRoute called WITHOUT `secret` — secret generation is internal.
      expect(store.createRoute).toHaveBeenCalledWith({
        agentId: 'agent-1',
        name: 'My Webhook',
      });
    });

    it('does NOT pass any plaintext secret into store.createRoute (security boundary)', async () => {
      registerWebhookAdminRoutes(
        httpServer as never,
        store as unknown as Parameters<typeof registerWebhookAdminRoutes>[1],
      );
      const handler = getHandler(httpServer, 'POST', '/admin/webhooks/route/create') as (
        req: unknown,
      ) => Promise<{ status: number; body: string }>;

      store.createRoute.mockResolvedValueOnce({
        route: { routeId: 'route-xyz', name: 'X' },
        plaintextSecret: TEST_PLAINTEXT_SECRET,
      });

      await (
        handler as (req: unknown) => Promise<{ status: number; body: string }>
      )(makeRequest({ agentId: 'a', name: 'X' }));

      const callArgs = store.createRoute.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs).not.toHaveProperty('secret');
    });
  });

  describe('POST /admin/webhooks/route/rotate-secret (NEW for #5894)', () => {
    it('rotates a secret and returns the new plaintext secret one-time', async () => {
      registerWebhookAdminRoutes(
        httpServer as never,
        store as unknown as Parameters<typeof registerWebhookAdminRoutes>[1],
      );
      const handler = getHandler(httpServer, 'POST', '/admin/webhooks/route/rotate-secret') as (
        req: unknown,
      ) => Promise<{ status: number; body: string }>;

      store.rotateRouteSecret.mockResolvedValueOnce({
        route: {
          routeId: 'route-abc',
          secretLastFour: 'DEFG',
        },
        plaintextSecret: TEST_PLAINTEXT_SECRET,
      });

      const response = await (
        handler as (req: unknown) => Promise<{ status: number; body: string }>
      )(makeRequest({ routeId: 'route-abc' }));

      expect(response.status).toBe(200);
      const body = parseBody(response);
      expect(body.routeId).toBe('route-abc');
      expect(body.secret).toBe(TEST_PLAINTEXT_SECRET);
      expect(body.secretLastFour).toBe('DEFG');
      expect(store.rotateRouteSecret).toHaveBeenCalledWith('route-abc');
    });
  });

  describe('GET /admin/webhooks/routes', () => {
    it('returns routes with secretLastFour (NEVER the full secret)', async () => {
      registerWebhookAdminRoutes(
        httpServer as never,
        store as unknown as Parameters<typeof registerWebhookAdminRoutes>[1],
      );
      const handler = getHandler(httpServer, 'GET', '/admin/webhooks/routes') as (
        req: unknown,
      ) => Promise<{ status: number; body: string }>;

      store.listRoutesByAgent.mockResolvedValueOnce([
        {
          routeId: 'route-1',
          name: 'Hook 1',
          isActive: 1,
          createdAt: 1700000000000,
          secretLastFour: 'aB3x',
        },
      ]);

      const req = {
        bodyText: '',
        path: '/admin/webhooks/routes?agentId=agent-1',
        query: new URLSearchParams('agentId=agent-1'),
        method: 'GET',
        headers: {},
      };
      const response = await (
        handler as (req: unknown) => Promise<{ status: number; body: string }>
      )(req);

      expect(response.status).toBe(200);
      const body = parseBody(response);
      expect(body.routes).toHaveLength(1);
      expect(body.routes[0].secretLastFour).toBe('aB3x');
      // CRITICAL: full secret MUST NOT appear in any list response.
      expect(body.routes[0].secret).toBeUndefined();
      expect(body.routes[0].secretEncrypted).toBeUndefined();
    });

    it('returns 400 if agentId missing', async () => {
      registerWebhookAdminRoutes(
        httpServer as never,
        store as unknown as Parameters<typeof registerWebhookAdminRoutes>[1],
      );
      const handler = getHandler(httpServer, 'GET', '/admin/webhooks/routes') as (
        req: unknown,
      ) => Promise<{ status: number; body: string }>;

      const req = {
        bodyText: '',
        path: '/admin/webhooks/routes',
        query: new URLSearchParams(''),
        method: 'GET',
        headers: {},
      };
      const response = await (
        handler as (req: unknown) => Promise<{ status: number; body: string }>
      )(req);

      expect(response.status).toBe(400);
      expect(store.listRoutesByAgent).not.toHaveBeenCalled();
    });
  });

  describe('POST /admin/webhooks/route/deactivate', () => {
    it('calls store.deactivateRoute and returns success', async () => {
      registerWebhookAdminRoutes(
        httpServer as never,
        store as unknown as Parameters<typeof registerWebhookAdminRoutes>[1],
      );
      const handler = getHandler(httpServer, 'POST', '/admin/webhooks/route/deactivate') as (
        req: unknown,
      ) => Promise<{ status: number; body: string }>;

      store.deactivateRoute.mockResolvedValueOnce(undefined);

      const response = await (
        handler as (req: unknown) => Promise<{ status: number; body: string }>
      )(makeRequest({ routeId: 'route-1' }));

      expect(response.status).toBe(200);
      expect(parseBody(response).success).toBe(true);
      expect(store.deactivateRoute).toHaveBeenCalledWith('route-1');
    });
  });
});
