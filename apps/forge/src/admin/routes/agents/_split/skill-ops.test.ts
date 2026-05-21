import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));
vi.mock('../../../../agents/global-skills', () => ({
  installGlobalSkillsFromZip: vi.fn().mockResolvedValue(['skill-a', 'skill-b']),
  deleteGlobalSkill: vi.fn().mockResolvedValue(undefined),
  installGlobalSkillToAgentWorkspace: vi.fn().mockResolvedValue(undefined),
  publishAgentWorkspaceSkillToGlobalCatalog: vi
    .fn()
    .mockResolvedValue({ destPath: '/global/skills/test-skill' }),
}));

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

describe('registerSkillOps', () => {
  let httpServer: MockHttpServer;
  let db: {
    query: { agents: { findFirst: ReturnType<typeof vi.fn> } };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    httpServer = { registerRoute: vi.fn() };
    db = {
      query: {
        agents: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ id: 'agent-123', workspaceFilesystem: '/w/agent-123' }),
        },
      },
    };
  });

  describe('POST /admin/agent/skills/publish-to-global', () => {
    it('registers the route', async () => {
      const { registerSkillOps } = await import('./skill-ops');
      registerSkillOps(httpServer as any, db as any, { workspaceBasePath: '/w' });
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/agent/skills/publish-to-global' }),
      );
    });

    it('publishes agent skill to global catalog', async () => {
      const { registerSkillOps } = await import('./skill-ops');
      registerSkillOps(httpServer as any, db as any, { workspaceBasePath: '/w' });
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/skills/publish-to-global');

      const response = await handler(makeRequest({ agentId: 'agent-123', skillName: 'my-skill' }));

      const body = JSON.parse(response.body);
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.skillName).toBe('my-skill');
      expect(body.destPath).toBeDefined();
    });

    it('returns 404 when agent not found', async () => {
      const notFoundDb = {
        query: { agents: { findFirst: vi.fn().mockResolvedValue(null) } },
      };
      const { registerSkillOps } = await import('./skill-ops');
      registerSkillOps(httpServer as any, notFoundDb as any, { workspaceBasePath: '/w' });
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/skills/publish-to-global');

      const response = await handler(makeRequest({ agentId: 'nonexistent', skillName: 'skill' }));

      expect(response.status).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('not found');
    });

    it('returns 500 on publish error', async () => {
      const { publishAgentWorkspaceSkillToGlobalCatalog } =
        await import('../../../../agents/global-skills');
      vi.mocked(publishAgentWorkspaceSkillToGlobalCatalog).mockRejectedValue(
        new Error('Publish failed'),
      );
      const { registerSkillOps } = await import('./skill-ops');
      registerSkillOps(httpServer as any, db as any, { workspaceBasePath: '/w' });
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/skills/publish-to-global');

      const response = await handler(makeRequest({ agentId: 'agent-123', skillName: 'skill' }));

      expect(response.status).toBe(500);
    });
  });

  describe('POST /admin/agent/skills/install-global', () => {
    it('registers the route', async () => {
      const { registerSkillOps } = await import('./skill-ops');
      registerSkillOps(httpServer as any, db as any, { workspaceBasePath: '/w' });
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/agent/skills/install-global' }),
      );
    });

    it('installs global skill to agent workspace', async () => {
      const { registerSkillOps } = await import('./skill-ops');
      registerSkillOps(httpServer as any, db as any, { workspaceBasePath: '/w' });
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/skills/install-global');

      const response = await handler(
        makeRequest({ agentId: 'agent-123', skillName: 'my-global-skill' }),
      );

      const body = JSON.parse(response.body);
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it('returns 404 when agent not found', async () => {
      const notFoundDb = {
        query: { agents: { findFirst: vi.fn().mockResolvedValue(null) } },
      };
      const { registerSkillOps } = await import('./skill-ops');
      registerSkillOps(httpServer as any, notFoundDb as any, { workspaceBasePath: '/w' });
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/skills/install-global');

      const response = await handler(makeRequest({ agentId: 'nonexistent', skillName: 'skill' }));

      expect(response.status).toBe(404);
    });
  });

  describe('POST /admin/agent/skills/upload', () => {
    it('registers the route', async () => {
      const { registerSkillOps } = await import('./skill-ops');
      registerSkillOps(httpServer as any, db as any, { workspaceBasePath: '/w' });
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/agent/skills/upload' }),
      );
    });

    it('installs skills from base64 zip', async () => {
      const { registerSkillOps } = await import('./skill-ops');
      registerSkillOps(httpServer as any, db as any, { workspaceBasePath: '/w' });
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/skills/upload');

      const response = await handler(makeRequest({ skillsZipBase64: 'UEsDBBQACQAAAA==' }));

      // Log raw response before parse
      const body = JSON.parse(response.body);
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.skillNames).toContain('skill-a');
    });
  });

  describe('POST /admin/agent/skills/delete', () => {
    it('registers the route', async () => {
      const { registerSkillOps } = await import('./skill-ops');
      registerSkillOps(httpServer as any, db as any, { workspaceBasePath: '/w' });
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/agent/skills/delete' }),
      );
    });

    it('deletes global skill', async () => {
      const { deleteGlobalSkill } = await import('../../../../agents/global-skills');
      vi.mocked(deleteGlobalSkill).mockResolvedValue(undefined);
      const { registerSkillOps } = await import('./skill-ops');
      registerSkillOps(httpServer as any, db as any, { workspaceBasePath: '/w' });
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/skills/delete');

      const response = await handler(makeRequest({ agentId: 'agent-123', skillName: 'old-skill' }));

      const body = JSON.parse(response.body);
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });
  });
});
