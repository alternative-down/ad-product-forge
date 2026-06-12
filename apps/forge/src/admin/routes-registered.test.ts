/**
 * L#19 tripwire for #5677: registerAdminRoutes must register all expected admin routes.
 *
 * Bug class: P0-masked pre-existing bug (L#NN-17 Class 1: missing route registration).
 * When a route function is imported with an underscore prefix (unused import), the route
 * is never registered, causing HTTP 404 at runtime.
 *
 * This test verifies that all expected admin routes are registered by calling
 * registerAdminRoutes with a mock httpServer and asserting the expected routes
 * are in the registered list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Database } from '../database/client';

interface RegisteredRoute {
  method: string;
  path: string;
}

function createMockHttpServer() {
  const routes: RegisteredRoute[] = [];
  return {
    routes,
    registerRoute: (route: RegisteredRoute) => routes.push(route),
  };
}

describe('L#19 tripwire: registerAdminRoutes route registration (#5677)', () => {
  let httpServer: ReturnType<typeof createMockHttpServer>;
  let mockDb: Database;

  beforeEach(() => {
    httpServer = createMockHttpServer();
    mockDb = {} as Database;
  });

  it('registers GET /admin/agents (list agents)', async () => {
    const { registerAdminRoutes } = await import('./routes');
    await registerAdminRoutes({
      httpServer: httpServer as any,
      db: mockDb,
    } as any);
    expect(
      httpServer.routes.find((r) => r.path === '/admin/agents' && r.method === 'GET'),
    ).toBeDefined();
  });

  it('registers GET /admin/agents/:agentId (single agent)', async () => {
    const { registerAdminRoutes } = await import('./routes');
    await registerAdminRoutes({
      httpServer: httpServer as any,
      db: mockDb,
    } as any);
    expect(
      httpServer.routes.find(
        (r) => r.path === '/admin/agents/:agentId' && r.method === 'GET',
      ),
    ).toBeDefined();
  });
});
