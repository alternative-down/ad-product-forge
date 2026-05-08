import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
  reloadAgentIfLoaded: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ type: 'eq', a, b })),
}));

vi.mock('../../../agents/global-skills', () => ({
  installAgentWorkspaceSkillsFromZip: vi.fn(),
  deleteAgentWorkspaceSkill: vi.fn(),
  installGlobalSkillToAgentWorkspace: vi.fn(),
  publishAgentWorkspaceSkillToGlobalCatalog: vi.fn(),
}));

vi.mock('../index', () => ({
  parseJsonBody: vi.fn().mockImplementation((bodyText, _schema) => JSON.parse(bodyText)),
  jsonResponse: vi.fn((body, status) => ({ body, status: status ?? 200 })),
}));

import { registerAgentSkillsWriteRoutes } from './skills-write';
import type { HttpRequest } from '../../../http/server';

function createMockDb() {
  return {
    query: {
      agents: {
        findFirst: vi.fn(),
      },
    },
  };
}

function createMockHttpServer() {
  const routes: Array<{ method: string; path: string; handler: Function }> = [];
  return {
    registerRoute: vi.fn((route) => routes.push(route)),
    _routes: routes,
  };
}

function mockRequest(body: object, path: string): HttpRequest {
  return { method: 'POST', path, bodyText: JSON.stringify(body), query: '', headers: {} } as any;
}

describe('registerAgentSkillsWriteRoutes', () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let httpServer: ReturnType<typeof createMockHttpServer>;

  beforeEach(() => {
    mockDb = createMockDb();
    httpServer = createMockHttpServer();
    vi.clearAllMocks();
  });

  // ── POST /admin/agent-skills/upload ────────────────────────────────────────

  describe('POST /admin/agent-skills/upload', () => {
    it('registers the route', () => {
      registerAgentSkillsWriteRoutes(httpServer as any, { db: mockDb as any, loaderConfig: {}, workspaceBasePath: '/base' } as any);
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-skills/upload' && r.method === 'POST');
      expect(route).toBeDefined();
    });

    it('returns 404 when agent not found', async () => {
      mockDb.query.agents.findFirst.mockResolvedValueOnce(null);
      registerAgentSkillsWriteRoutes(httpServer as any, { db: mockDb as any, loaderConfig: {}, workspaceBasePath: '/base' } as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/agent-skills/upload')!.handler;
      const response = await handler(mockRequest({ agentId: 'ghost-agent', archiveBase64: 'xxx' }, '/admin/agent-skills/upload'));
      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    it('returns 201 with installed skill names on success', async () => {
      const { installAgentWorkspaceSkillsFromZip } = await import('../../../agents/global-skills');
      const { reloadAgentIfLoaded } = await import('@forge-runtime/core');
      mockDb.query.agents.findFirst.mockResolvedValueOnce({ id: 'agent-1', workspaceFilesystem: '/ws' });
      installAgentWorkspaceSkillsFromZip.mockResolvedValueOnce(['skill-a', 'skill-b']);

      registerAgentSkillsWriteRoutes(httpServer as any, { db: mockDb as any, loaderConfig: {}, workspaceBasePath: '/base' } as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/agent-skills/upload')!.handler;
      const response = await handler(mockRequest({ agentId: 'agent-1', archiveBase64: 'base64data' }, '/admin/agent-skills/upload'));

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.installedSkillNames).toEqual(['skill-a', 'skill-b']);
    });

    it('returns 500 on error', async () => {
      mockDb.query.agents.findFirst.mockResolvedValueOnce({ id: 'agent-1', workspaceFilesystem: '/ws' });
      const { installAgentWorkspaceSkillsFromZip } = await import('../../../agents/global-skills');
      installAgentWorkspaceSkillsFromZip.mockRejectedValueOnce(new Error('Bad zip'));

      registerAgentSkillsWriteRoutes(httpServer as any, { db: mockDb as any, loaderConfig: {}, workspaceBasePath: '/base' } as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/agent-skills/upload')!.handler;
      const response = await handler(mockRequest({ agentId: 'agent-1', archiveBase64: 'bad' }, '/admin/agent-skills/upload'));
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Bad zip');
    });
  });

  // ── POST /admin/agent-skills/delete ───────────────────────────────────────

  describe('POST /admin/agent-skills/delete', () => {
    it('registers the route', () => {
      registerAgentSkillsWriteRoutes(httpServer as any, { db: mockDb as any, loaderConfig: {}, workspaceBasePath: '/base' } as any);
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-skills/delete' && r.method === 'POST');
      expect(route).toBeDefined();
    });

    it('returns 404 when agent not found', async () => {
      mockDb.query.agents.findFirst.mockResolvedValueOnce(null);
      registerAgentSkillsWriteRoutes(httpServer as any, { db: mockDb as any, loaderConfig: {}, workspaceBasePath: '/base' } as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/agent-skills/delete')!.handler;
      const response = await handler(mockRequest({ agentId: 'ghost', skillName: 'x' }, '/admin/agent-skills/delete'));
      expect(response.status).toBe(404);
    });

    it('returns success with agentId and skillName on delete', async () => {
      mockDb.query.agents.findFirst.mockResolvedValueOnce({ id: 'agent-1', workspaceFilesystem: '/ws' });
      const { deleteAgentWorkspaceSkill } = await import('../../../agents/global-skills');
      deleteAgentWorkspaceSkill.mockResolvedValueOnce(undefined);

      registerAgentSkillsWriteRoutes(httpServer as any, { db: mockDb as any, loaderConfig: {}, workspaceBasePath: '/base' } as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/agent-skills/delete')!.handler;
      const response = await handler(mockRequest({ agentId: 'agent-1', skillName: 'dead-skill' }, '/admin/agent-skills/delete'));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.skillName).toBe('dead-skill');
    });

    it('returns 500 on delete error', async () => {
      mockDb.query.agents.findFirst.mockResolvedValueOnce({ id: 'agent-1', workspaceFilesystem: '/ws' });
      const { deleteAgentWorkspaceSkill } = await import('../../../agents/global-skills');
      deleteAgentWorkspaceSkill.mockRejectedValueOnce(new Error('Delete failed'));

      registerAgentSkillsWriteRoutes(httpServer as any, { db: mockDb as any, loaderConfig: {}, workspaceBasePath: '/base' } as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/agent-skills/delete')!.handler;
      const response = await handler(mockRequest({ agentId: 'agent-1', skillName: 'x' }, '/admin/agent-skills/delete'));
      expect(response.status).toBe(500);
    });
  });

  // ── POST /admin/agent-skills/install-global ────────────────────────────────

  describe('POST /admin/agent-skills/install-global', () => {
    it('registers the route', () => {
      registerAgentSkillsWriteRoutes(httpServer as any, { db: mockDb as any, loaderConfig: {}, workspaceBasePath: '/base' } as any);
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-skills/install-global' && r.method === 'POST');
      expect(route).toBeDefined();
    });

    it('returns 404 when agent not found', async () => {
      mockDb.query.agents.findFirst.mockResolvedValueOnce(null);
      registerAgentSkillsWriteRoutes(httpServer as any, { db: mockDb as any, loaderConfig: {}, workspaceBasePath: '/base' } as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/agent-skills/install-global')!.handler;
      const response = await handler(mockRequest({ agentId: 'no-such', skillName: 'my-skill' }, '/admin/agent-skills/install-global'));
      expect(response.status).toBe(404);
    });

    it('returns 200 on successful install', async () => {
      mockDb.query.agents.findFirst.mockResolvedValueOnce({ id: 'agent-1', workspaceFilesystem: '/ws' });
      const { installGlobalSkillToAgentWorkspace } = await import('../../../agents/global-skills');
      installGlobalSkillToAgentWorkspace.mockResolvedValueOnce(undefined);

      registerAgentSkillsWriteRoutes(httpServer as any, { db: mockDb as any, loaderConfig: {}, workspaceBasePath: '/base' } as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/agent-skills/install-global')!.handler;
      const response = await handler(mockRequest({ agentId: 'agent-1', skillName: 'global-skill' }, '/admin/agent-skills/install-global'));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.skillName).toBe('global-skill');
    });

    it('returns 500 on install error', async () => {
      mockDb.query.agents.findFirst.mockResolvedValueOnce({ id: 'agent-1', workspaceFilesystem: '/ws' });
      const { installGlobalSkillToAgentWorkspace } = await import('../../../agents/global-skills');
      installGlobalSkillToAgentWorkspace.mockRejectedValueOnce(new Error('Install failed'));

      registerAgentSkillsWriteRoutes(httpServer as any, { db: mockDb as any, loaderConfig: {}, workspaceBasePath: '/base' } as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/agent-skills/install-global')!.handler;
      const response = await handler(mockRequest({ agentId: 'agent-1', skillName: 'x' }, '/admin/agent-skills/install-global'));
      expect(response.status).toBe(500);
    });
  });

  // ── POST /admin/agent-skills/publish ─────────────────────────────────────

  describe('POST /admin/agent-skills/publish', () => {
    it('registers the route', () => {
      registerAgentSkillsWriteRoutes(httpServer as any, { db: mockDb as any, loaderConfig: {}, workspaceBasePath: '/base' } as any);
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-skills/publish-global' && r.method === 'POST');
      expect(route).toBeDefined();
    });

    it('returns 404 when agent not found', async () => {
      mockDb.query.agents.findFirst.mockResolvedValueOnce(null);
      registerAgentSkillsWriteRoutes(httpServer as any, { db: mockDb as any, loaderConfig: {}, workspaceBasePath: '/base' } as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/agent-skills/publish-global')!.handler;
      const response = await handler(mockRequest({ agentId: 'ghost', skillName: 'x' }, '/admin/agent-skills/publish-global'));
      expect(response.status).toBe(404);
    });

    it('returns 200 on successful publish', async () => {
      mockDb.query.agents.findFirst.mockResolvedValueOnce({ id: 'agent-1', workspaceFilesystem: '/ws' });
      const { publishAgentWorkspaceSkillToGlobalCatalog } = await import('../../../agents/global-skills');
      publishAgentWorkspaceSkillToGlobalCatalog.mockResolvedValueOnce('local-skill');

      registerAgentSkillsWriteRoutes(httpServer as any, { db: mockDb as any, loaderConfig: {}, workspaceBasePath: '/base' } as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/agent-skills/publish-global')!.handler;
      const response = await handler(mockRequest({ agentId: 'agent-1', skillName: 'local-skill' }, '/admin/agent-skills/publish-global'));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.publishedSkillName).toBe('local-skill');
    });

    it('returns 500 on publish error', async () => {
      mockDb.query.agents.findFirst.mockResolvedValueOnce({ id: 'agent-1', workspaceFilesystem: '/ws' });
      const { publishAgentWorkspaceSkillToGlobalCatalog } = await import('../../../agents/global-skills');
      publishAgentWorkspaceSkillToGlobalCatalog.mockRejectedValueOnce(new Error('Publish failed'));

      registerAgentSkillsWriteRoutes(httpServer as any, { db: mockDb as any, loaderConfig: {}, workspaceBasePath: '/base' } as any);
      const handler = httpServer._routes.find((r) => r.path === '/admin/agent-skills/publish-global')!.handler;
      const response = await handler(mockRequest({ agentId: 'agent-1', skillName: 'x' }, '/admin/agent-skills/publish-global'));
      expect(response.status).toBe(500);
    });
  });
});