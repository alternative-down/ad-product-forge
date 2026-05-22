import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

const mockPublishAgentWorkspaceSkillToGlobalCatalog = vi.hoisted(() => vi.fn());
const mockInstallGlobalSkillToAgentWorkspace = vi.hoisted(() => vi.fn());
const mockInstallGlobalSkillsFromZip = vi.hoisted(() => vi.fn());
const mockDeleteGlobalSkill = vi.hoisted(() => vi.fn());

vi.mock('../../../../agents/global-skills', () => ({
  publishAgentWorkspaceSkillToGlobalCatalog: mockPublishAgentWorkspaceSkillToGlobalCatalog,
  installGlobalSkillToAgentWorkspace: mockInstallGlobalSkillToAgentWorkspace,
  installGlobalSkillsFromZip: mockInstallGlobalSkillsFromZip,
  deleteGlobalSkill: mockDeleteGlobalSkill,
}));

import { registerSkillOps } from './skill-ops';

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
  let mockDb: any;
  let mockInput: { workspaceBasePath: string };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPublishAgentWorkspaceSkillToGlobalCatalog.mockReset();
    mockInstallGlobalSkillToAgentWorkspace.mockReset();
    mockInstallGlobalSkillsFromZip.mockReset();
    mockDeleteGlobalSkill.mockReset();
    mockPublishAgentWorkspaceSkillToGlobalCatalog.mockResolvedValue({ destPath: '/global/skills/my-skill' });
    mockInstallGlobalSkillToAgentWorkspace.mockResolvedValue({ installed: true });
    mockInstallGlobalSkillsFromZip.mockResolvedValue(['skill-a', 'skill-b']);
    mockDeleteGlobalSkill.mockResolvedValue(undefined);
    httpServer = { registerRoute: vi.fn() };
    mockDb = {
      query: {
        agents: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ id: 'agent-test', workspaceFilesystem: '/workspace/test' }),
        },
      },
    };
    mockInput = { workspaceBasePath: '/agents/workspaces' };
  });

  describe('POST /admin/agent/skills/publish-to-global', () => {
    it('registers the route', () => {
      registerSkillOps(httpServer as any, mockDb, mockInput);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/admin/agent/skills/publish-to-global',
        }),
      );
    });

    it('calls publishAgentWorkspaceSkillToGlobalCatalog and returns destPath', async () => {
      registerSkillOps(httpServer as any, mockDb, mockInput);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/skills/publish-to-global');

      const response = await handler(makeRequest({ agentId: 'agent-test', skillName: 'my-skill' }));

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.destPath).toBe('/global/skills/my-skill');
      expect(body.skillName).toBe('my-skill');
      expect(mockPublishAgentWorkspaceSkillToGlobalCatalog).toHaveBeenCalledWith({
        workspaceBasePath: '/agents/workspaces',
        agent: { id: 'agent-test', workspaceFilesystem: '/workspace/test' },
        skillName: 'my-skill',
      });
    });

    it('returns 404 when agent not found', async () => {
      mockDb.query.agents.findFirst.mockResolvedValue(null);
      registerSkillOps(httpServer as any, mockDb, mockInput);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/skills/publish-to-global');

      const response = await handler(makeRequest({ agentId: 'nonexistent', skillName: 'skill' }));

      expect(response.status).toBe(404);
      expect(JSON.parse(response.body).error).toContain('Agent not found');
    });

    it('returns 500 on publish error', async () => {
      mockPublishAgentWorkspaceSkillToGlobalCatalog.mockRejectedValue(new Error('Publish failed'));
      registerSkillOps(httpServer as any, mockDb, mockInput);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/skills/publish-to-global');

      const response = await handler(makeRequest({ agentId: 'agent-test', skillName: 'skill' }));

      expect(response.status).toBe(500);
    });
  });

  describe('POST /admin/agent/skills/install-global', () => {
    it('registers the route', () => {
      registerSkillOps(httpServer as any, mockDb, mockInput);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/admin/agent/skills/install-global',
        }),
      );
    });

    it('calls installGlobalSkillToAgentWorkspace and returns success', async () => {
      registerSkillOps(httpServer as any, mockDb, mockInput);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/skills/install-global');

      const response = await handler(makeRequest({ agentId: 'agent-test', skillName: 'global-skill' }));

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.agentId).toBe('agent-test');
      expect(body.skillName).toBe('global-skill');
      expect(mockInstallGlobalSkillToAgentWorkspace).toHaveBeenCalledWith({
        workspaceBasePath: '/agents/workspaces',
        agent: { id: 'agent-test', workspaceFilesystem: '/workspace/test' },
        skillName: 'global-skill',
      });
    });

    it('returns 404 when agent not found', async () => {
      mockDb.query.agents.findFirst.mockResolvedValue(null);
      registerSkillOps(httpServer as any, mockDb, mockInput);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/skills/install-global');

      const response = await handler(makeRequest({ agentId: 'nonexistent', skillName: 'skill' }));

      expect(response.status).toBe(404);
    });

    it('returns 500 on install error', async () => {
      mockInstallGlobalSkillToAgentWorkspace.mockRejectedValue(new Error('Install failed'));
      registerSkillOps(httpServer as any, mockDb, mockInput);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/skills/install-global');

      const response = await handler(makeRequest({ agentId: 'agent-test', skillName: 'skill' }));

      expect(response.status).toBe(500);
    });
  });

  describe('POST /admin/agent/skills/upload', () => {
    it('registers the route', () => {
      registerSkillOps(httpServer as any, mockDb, mockInput);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/admin/agent/skills/upload',
        }),
      );
    });

    it('calls installGlobalSkillsFromZip and returns skill names', async () => {
      registerSkillOps(httpServer as any, mockDb, mockInput);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/skills/upload');

      const response = await handler(
        makeRequest({ skillsZipBase64: 'UEsDBBQABgAIAAAAIQAqZGPjnFIAAAAAAA==' }),
      );

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.skillNames).toEqual(['skill-a', 'skill-b']);
      expect(mockInstallGlobalSkillsFromZip).toHaveBeenCalledWith({
        workspaceBasePath: '/agents/workspaces',
        zipBase64: 'UEsDBBQABgAIAAAAIQAqZGPjnFIAAAAAAA==',
      });
    });

    it('returns 500 on zip install error', async () => {
      mockInstallGlobalSkillsFromZip.mockRejectedValue(new Error('Zip install failed'));
      registerSkillOps(httpServer as any, mockDb, mockInput);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/skills/upload');

      const response = await handler(makeRequest({ skillsZipBase64: 'invalid' }));

      expect(response.status).toBe(500);
    });
  });

  describe('POST /admin/agent/skills/delete', () => {
    it('registers the route', () => {
      registerSkillOps(httpServer as any, mockDb, mockInput);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/admin/agent/skills/delete',
        }),
      );
    });

    it('calls deleteGlobalSkill and returns success', async () => {
      registerSkillOps(httpServer as any, mockDb, mockInput);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/skills/delete');

      const response = await handler(makeRequest({ agentId: 'agent-test', skillName: 'dead-skill' }));

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(mockDeleteGlobalSkill).toHaveBeenCalledWith({
        workspaceBasePath: '/agents/workspaces',
        skillName: 'dead-skill',
      });
    });

    it('returns 500 on invalid input', async () => {
      registerSkillOps(httpServer as any, mockDb, mockInput);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/skills/delete');

      const response = await handler(makeRequest({ agentId: 'agent-test' }));

      expect(response.status).toBe(500);
    });

    it('returns 500 on delete error', async () => {
      mockDeleteGlobalSkill.mockRejectedValue(new Error('Delete failed'));
      registerSkillOps(httpServer as any, mockDb, mockInput);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/skills/delete');

      const response = await handler(makeRequest({ agentId: 'agent-test', skillName: 'skill' }));

      expect(response.status).toBe(500);
    });
  });
});