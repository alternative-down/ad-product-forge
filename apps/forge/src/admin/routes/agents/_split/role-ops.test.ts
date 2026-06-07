import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

// vi.hoisted is hoisted alongside vi.mock and evaluated at module init time,
// before the static import of role-ops runs. The mock factory uses the same
// mockCapabilities object reference, so vi.mocked().mockResolvedValue() in
// tests can control the same functions that role-ops.ts calls.
const mockCapabilities = vi.hoisted(() => ({
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  addRoleToolPermission: vi.fn(),
  removeRoleToolPermission: vi.fn(),
}));

vi.mock('../../../../capabilities/store.ts', () => ({
  createCapabilityStore: vi.fn(() => mockCapabilities),
}));

import { registerRoleOps } from './role-ops';

interface MockRoute {
  method: string;
  path: string;
  handler: (req: { bodyText: string }) => Promise<{ status: number; body: string }>;
}
interface MockHttpServer {
  registerRoute: ReturnType<typeof vi.fn>;
}

function makeRequest(body: unknown): { bodyText: string } {
  return { bodyText: JSON.stringify(body) };
}

function getRouteHandler(
  httpServer: MockHttpServer,
  method: string,
  path: string,
): (req: { bodyText: string }) => Promise<{ status: number; body: string }> {
  const calls = httpServer.registerRoute.mock.calls as Array<[MockRoute]>;
  const match = calls.find((c) => c[0].method === method && c[0].path === path);
  if (!match) throw new Error(`Route ${method} ${path} not found`);
  return match[0].handler;
}

describe('registerRoleOps', () => {
  let httpServer: MockHttpServer;
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCapabilities.createRole.mockReset();
    mockCapabilities.updateRole.mockReset();
    mockCapabilities.deleteRole.mockReset();
    mockCapabilities.addRoleToolPermission.mockReset();
    mockCapabilities.removeRoleToolPermission.mockReset();
    httpServer = { registerRoute: vi.fn() };
    mockDb = {
      query: {
        agentRoles: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
    };
  });

  describe('POST /admin/roles/create', () => {
    it('registers the route', () => {
      registerRoleOps(httpServer as any, mockDb);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/roles/create' }),
      );
    });

    it('calls capabilities.createRole and returns roleId', async () => {
      mockCapabilities.createRole.mockResolvedValue({ roleId: 'role-abc', name: 'Admin' });
      registerRoleOps(httpServer as any, mockDb);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/roles/create');

      const response = await handler(makeRequest({ name: 'Admin', description: 'Full access' }));

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.roleId).toBe('role-abc');
      expect(mockCapabilities.createRole).toHaveBeenCalledWith({ name: 'Admin', description: 'Full access' });
    });

    it('works without optional description', async () => {
      mockCapabilities.createRole.mockResolvedValue({ roleId: 'role-xyz', name: 'Viewer' });
      registerRoleOps(httpServer as any, mockDb);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/roles/create');

      const response = await handler(makeRequest({ name: 'Viewer' }));

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('Viewer');
    });

    it('returns 500 on create error', async () => {
      mockCapabilities.createRole.mockRejectedValue(new Error('DB write failed'));
      registerRoleOps(httpServer as any, mockDb);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/roles/create');

      const response = await handler(makeRequest({ name: 'Admin' }));

      expect(response.status).toBe(500);
    });
  });

  describe('POST /admin/roles/update', () => {
    it('registers the route', () => {
      registerRoleOps(httpServer as any, mockDb);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/roles/update' }),
      );
    });

    it('calls capabilities.updateRole and returns updated role', async () => {
      mockCapabilities.updateRole.mockResolvedValue({ roleId: 'role-123', name: 'Updated Admin' });
      registerRoleOps(httpServer as any, mockDb);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/roles/update');

      const response = await handler(makeRequest({ roleId: 'role-123', name: 'Updated Admin', description: 'Changed' }));

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.roleId).toBe('role-123');
      expect(mockCapabilities.updateRole).toHaveBeenCalledWith({ roleId: 'role-123', name: 'Updated Admin', description: 'Changed' });
    });

    it('returns 500 on update error', async () => {
      mockCapabilities.updateRole.mockRejectedValue(new Error('Update failed'));
      registerRoleOps(httpServer as any, mockDb);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/roles/update');

      const response = await handler(makeRequest({ roleId: 'role-123', name: 'Test' }));

      expect(response.status).toBe(500);
    });
  });

  describe('POST /admin/roles/delete', () => {
    it('registers the route', () => {
      registerRoleOps(httpServer as any, mockDb);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/roles/delete' }),
      );
    });

    it('calls capabilities.deleteRole and returns roleId', async () => {
      mockCapabilities.deleteRole.mockResolvedValue(undefined);
      registerRoleOps(httpServer as any, mockDb);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/roles/delete');

      const response = await handler(makeRequest({ roleId: 'role-delete-me' }));

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.roleId).toBe('role-delete-me');
      expect(mockCapabilities.deleteRole).toHaveBeenCalledWith('role-delete-me');
    });

    it('returns 409 when role has assignments (typed ROLE_HAS_ASSIGNED_AGENTS code)', async () => {
      const err = new Error('Cannot delete role with assigned agents') as Error & {
        code: 'ROLE_HAS_ASSIGNED_AGENTS';
      };
      err.code = 'ROLE_HAS_ASSIGNED_AGENTS';
      mockCapabilities.deleteRole.mockRejectedValue(err);
      registerRoleOps(httpServer as any, mockDb);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/roles/delete');

      const response = await handler(makeRequest({ roleId: 'role-protected' }));

      expect(response.status).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Cannot delete role');
    });

    it('logs error with scope admin (not admin:roles) when delete fails', async () => {
      const err = new Error('Cannot delete role with assigned agents') as Error & {
        code: 'ROLE_HAS_ASSIGNED_AGENTS';
      };
      err.code = 'ROLE_HAS_ASSIGNED_AGENTS';
      mockCapabilities.deleteRole.mockRejectedValue(err);
      const { forgeDebug } = await import('@forge-runtime/core');
      registerRoleOps(httpServer as any, mockDb);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/roles/delete');

      await handler(makeRequest({ roleId: 'role-protected' }));

      const calls = (forgeDebug as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => c[0]);
      const matchingCall = calls.find(
        (c: any) => c.message === '/admin/roles/delete route handler failed',
      );
      expect(matchingCall).toBeDefined();
      expect(matchingCall?.scope).toBe('admin');
      expect(matchingCall?.scope).not.toBe('admin:roles');
      expect(matchingCall?.context?.path).toBe('/admin/roles/delete');
    });

    it('returns 500 on other delete errors', async () => {
      mockCapabilities.deleteRole.mockRejectedValue(new Error('Unknown error'));
      registerRoleOps(httpServer as any, mockDb);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/roles/delete');

      const response = await handler(makeRequest({ roleId: 'role-123' }));

      expect(response.status).toBe(500);
    });
  });

  describe('POST /admin/roles/tool-permissions', () => {
    it('registers the route', () => {
      registerRoleOps(httpServer as any, mockDb);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/roles/tool-permissions' }),
      );
    });

    it('calls addRoleToolPermission when allowed is true', async () => {
      mockCapabilities.addRoleToolPermission.mockResolvedValue(undefined);
      registerRoleOps(httpServer as any, mockDb);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/roles/tool-permissions');

      const response = await handler(makeRequest({ roleId: 'role-perms', toolName: 'read_files', allowed: true }));

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.toolId).toBe('read_files');
      expect(body.allowed).toBe(true);
      expect(mockCapabilities.addRoleToolPermission).toHaveBeenCalledWith({ roleId: 'role-perms', toolId: 'read_files' });
      expect(mockCapabilities.removeRoleToolPermission).not.toHaveBeenCalled();
    });

    it('calls removeRoleToolPermission when allowed is false', async () => {
      mockCapabilities.removeRoleToolPermission.mockResolvedValue(undefined);
      registerRoleOps(httpServer as any, mockDb);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/roles/tool-permissions');

      const response = await handler(makeRequest({ roleId: 'role-perms', toolName: 'write_files', allowed: false }));

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.allowed).toBe(false);
      expect(mockCapabilities.removeRoleToolPermission).toHaveBeenCalledWith({ roleId: 'role-perms', toolId: 'write_files' });
      expect(mockCapabilities.addRoleToolPermission).not.toHaveBeenCalled();
    });

    it('returns 500 on permission error', async () => {
      mockCapabilities.addRoleToolPermission.mockRejectedValue(new Error('Permission set failed'));
      registerRoleOps(httpServer as any, mockDb);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/roles/tool-permissions');

      const response = await handler(makeRequest({ roleId: 'role-123', toolName: 'exec', allowed: true }));

      expect(response.status).toBe(500);
    });
  });
});