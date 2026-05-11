/**
 * Unit tests for admin/routes/agents/skills-write.ts.
 * 4 route handlers: upload, delete, install-global, publish-global.
 * Zero prior coverage.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AdminRouteContext } from '../../routes';

// ─── All mocks hoisted so vi.mock factory can reference them ─────────────────

const { mockForgeDebug, mockReloadAgentIfLoaded } = vi.hoisted(() => ({
  mockForgeDebug: vi.fn(),
  mockReloadAgentIfLoaded: vi.fn().mockResolvedValue(undefined),
}));

const { mockInstallZip, mockDeleteSkill, mockInstallGlobal, mockPublishGlobal } = vi.hoisted(() => ({
  mockInstallZip: vi.fn().mockResolvedValue(['skill-a', 'skill-b']),
  mockDeleteSkill: vi.fn().mockResolvedValue(undefined),
  mockInstallGlobal: vi.fn().mockResolvedValue(undefined),
  mockPublishGlobal: vi.fn().mockResolvedValue('skill-x'),
}));

// Mock schemas for ../schemas/skills (skills-write.ts imports schemas directly from there)
const { mockUploadSchema, mockDeleteSchema, mockInstallGlobalSchema, mockPublishSchema } = vi.hoisted(() => ({
  mockUploadSchema: { parse: vi.fn(x => x), safeParse: vi.fn(x => ({ success: true, data: x })) },
  mockDeleteSchema: { parse: vi.fn(x => x), safeParse: vi.fn(x => ({ success: true, data: x })) },
  mockInstallGlobalSchema: { parse: vi.fn(x => x), safeParse: vi.fn(x => ({ success: true, data: x })) },
  mockPublishSchema: { parse: vi.fn(x => x), safeParse: vi.fn(x => ({ success: true, data: x })) },
}));

// Mock utilities from ../index
const { mockJsonResponse, mockParseJsonBody } = vi.hoisted(() => ({
  mockJsonResponse: vi.fn((body: unknown, status?: number) => ({
    status: status ?? 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })),
  mockParseJsonBody: vi.fn((text: string, schema: { parse: (x: unknown) => unknown }) =>
    schema.parse(JSON.parse(text)),
  ),
}));

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: mockForgeDebug,
  reloadAgentIfLoaded: mockReloadAgentIfLoaded,
}));

vi.mock('../../../agents/global-skills', () => ({
  installAgentWorkspaceSkillsFromZip: mockInstallZip,
  deleteAgentWorkspaceSkill: mockDeleteSkill,
  installGlobalSkillToAgentWorkspace: mockInstallGlobal,
  publishAgentWorkspaceSkillToGlobalCatalog: mockPublishGlobal,
}));

// Mock schemas — source imports uploadAgentSkillsSchema, etc. directly from here
vi.mock('../schemas/skills', () => ({
  uploadAgentSkillsSchema: mockUploadSchema,
  deleteAgentSkillSchema: mockDeleteSchema,
  installGlobalSkillForAgentSchema: mockInstallGlobalSchema,
  publishAgentSkillToGlobalSchema: mockPublishSchema,
}));

// Mock utilities from ../index
vi.mock('../index', () => ({
  parseJsonBody: mockParseJsonBody,
  jsonResponse: mockJsonResponse,
}));

// ─── Imports ────────────────────────────────────────────────────────────────

import { registerAgentSkillsWriteRoutes } from './skills-write';

// ─── Test helpers ───────────────────────────────────────────────────────────

function makeAgent(id = 'agent-1', name = 'Test Agent') {
  return { id, name, createdAt: Date.now() };
}

function mockDb(agent: ReturnType<typeof makeAgent> | null) {
  return {
    query: {
      agents: {
        findFirst: vi.fn().mockResolvedValue(agent),
      },
    },
  } as unknown as AdminRouteContext['db'];
}

function makeHttpServer() {
  const routes: Array<{ method: string; path: string; handler: any }> = [];
  return {
    registerRoute(route: { method: string; path: string; handler: any }) {
      routes.push(route);
    },
    getRoutes() { return routes; },
  };
}

function makeRequest(body: Record<string, unknown>) {
  return { bodyText: JSON.stringify(body) };
}

function parseBody(response: { body: string }) {
  return JSON.parse(response.body);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('registerAgentSkillsWriteRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReloadAgentIfLoaded.mockResolvedValue(undefined);
    mockForgeDebug.mockImplementation(() => {});
    mockParseJsonBody.mockImplementation((text: string, schema: { parse: (x: unknown) => unknown }) =>
      schema.parse(JSON.parse(text)),
    );
    mockUploadSchema.parse.mockImplementation((x: unknown) => x);
    mockDeleteSchema.parse.mockImplementation((x: unknown) => x);
    mockInstallGlobalSchema.parse.mockImplementation((x: unknown) => x);
    mockPublishSchema.parse.mockImplementation((x: unknown) => x);
    mockInstallZip.mockResolvedValue(['skill-a', 'skill-b']);
    mockDeleteSkill.mockResolvedValue(undefined);
    mockInstallGlobal.mockResolvedValue(undefined);
    mockPublishGlobal.mockResolvedValue('skill-x');
  });

  // ─── Route registration ───────────────────────────────────────────────────

  describe('route registration', () => {
    it('registers POST /admin/agent-skills/upload', () => {
      const httpServer = makeHttpServer();
      registerAgentSkillsWriteRoutes(httpServer, { db: mockDb(makeAgent()), loaderConfig: {}, workspaceBasePath: '/tmp' });
      const route = httpServer.getRoutes().find(r => r.path === '/admin/agent-skills/upload');
      expect(route).toBeDefined();
      expect(route!.method).toBe('POST');
    });

    it('registers POST /admin/agent-skills/delete', () => {
      const httpServer = makeHttpServer();
      registerAgentSkillsWriteRoutes(httpServer, { db: mockDb(makeAgent()), loaderConfig: {}, workspaceBasePath: '/tmp' });
      expect(httpServer.getRoutes().find(r => r.path === '/admin/agent-skills/delete')).toBeDefined();
    });

    it('registers POST /admin/agent-skills/install-global', () => {
      const httpServer = makeHttpServer();
      registerAgentSkillsWriteRoutes(httpServer, { db: mockDb(makeAgent()), loaderConfig: {}, workspaceBasePath: '/tmp' });
      expect(httpServer.getRoutes().find(r => r.path === '/admin/agent-skills/install-global')).toBeDefined();
    });

    it('registers POST /admin/agent-skills/publish-global', () => {
      const httpServer = makeHttpServer();
      registerAgentSkillsWriteRoutes(httpServer, { db: mockDb(makeAgent()), loaderConfig: {}, workspaceBasePath: '/tmp' });
      expect(httpServer.getRoutes().find(r => r.path === '/admin/agent-skills/publish-global')).toBeDefined();
    });

    it('registers exactly 4 routes', () => {
      const httpServer = makeHttpServer();
      registerAgentSkillsWriteRoutes(httpServer, { db: mockDb(makeAgent()), loaderConfig: {}, workspaceBasePath: '/tmp' });
      expect(httpServer.getRoutes()).toHaveLength(4);
    });
  });

  // ─── POST /admin/agent-skills/upload ─────────────────────────────────────

  describe('POST /admin/agent-skills/upload', () => {
    it('returns 404 when agent not found', async () => {
      const httpServer = makeHttpServer();
      registerAgentSkillsWriteRoutes(httpServer, { db: mockDb(null), loaderConfig: {}, workspaceBasePath: '/tmp' });
      const route = httpServer.getRoutes().find(r => r.path === '/admin/agent-skills/upload')!;
      const response = await route.handler(makeRequest({ agentId: 'unknown', archiveBase64: 'YQ==' }));
      expect(response.status).toBe(404);
      expect(parseBody(response)).toHaveProperty('error');
    });

    it('calls installAgentWorkspaceSkillsFromZip with correct args', async () => {
      const agent = makeAgent('agent-upload', 'Upload Agent');
      const httpServer = makeHttpServer();
      registerAgentSkillsWriteRoutes(httpServer, { db: mockDb(agent), loaderConfig: {}, workspaceBasePath: '/workspaces' });
      const route = httpServer.getRoutes().find(r => r.path === '/admin/agent-skills/upload')!;
      await route.handler(makeRequest({ agentId: 'agent-upload', archiveBase64: 'SGVsbG8gV29ybGQ=' }));
      expect(mockInstallZip).toHaveBeenCalledWith(expect.objectContaining({
        workspaceBasePath: '/workspaces',
        agent,
        zipBase64: 'SGVsbG8gV29ybGQ=',
      }));
    });

    it('returns 201 with installedSkillNames on success', async () => {
      mockInstallZip.mockResolvedValue(['skill-1', 'skill-2']);
      const httpServer = makeHttpServer();
      registerAgentSkillsWriteRoutes(httpServer, { db: mockDb(makeAgent()), loaderConfig: {}, workspaceBasePath: '/tmp' });
      const route = httpServer.getRoutes().find(r => r.path === '/admin/agent-skills/upload')!;
      const response = await route.handler(makeRequest({ agentId: 'agent-1', archiveBase64: 'YQ==' }));
      expect(response.status).toBe(201);
      expect(parseBody(response)).toMatchObject({
        success: true,
        agentId: 'agent-1',
        installedSkillNames: ['skill-1', 'skill-2'],
      });
    });

    it('calls reloadAgentIfLoaded after successful install', async () => {
      const db = mockDb(makeAgent());
      const loaderConfig = {};
      const httpServer = makeHttpServer();
      registerAgentSkillsWriteRoutes(httpServer, { db, loaderConfig, workspaceBasePath: '/tmp' });
      const route = httpServer.getRoutes().find(r => r.path === '/admin/agent-skills/upload')!;
      await route.handler(makeRequest({ agentId: 'agent-1', archiveBase64: 'YQ==' }));
      expect(mockReloadAgentIfLoaded).toHaveBeenCalledWith(db, loaderConfig, 'agent-1');
    });

    it('returns 500 on error and logs with forgeDebug', async () => {
      mockInstallZip.mockRejectedValue(new Error('Zip failed'));
      const httpServer = makeHttpServer();
      registerAgentSkillsWriteRoutes(httpServer, { db: mockDb(makeAgent()), loaderConfig: {}, workspaceBasePath: '/tmp' });
      const route = httpServer.getRoutes().find(r => r.path === '/admin/agent-skills/upload')!;
      const response = await route.handler(makeRequest({ agentId: 'agent-1', archiveBase64: 'YQ==' }));
      expect(response.status).toBe(500);
      expect(parseBody(response)).toHaveProperty('error', 'Zip failed');
      expect(mockForgeDebug).toHaveBeenCalledWith(expect.objectContaining({ scope: 'admin', level: 'error' }));
    });
  });

  // ─── POST /admin/agent-skills/delete ──────────────────────────────────────

  describe('POST /admin/agent-skills/delete', () => {
    it('returns 404 when agent not found', async () => {
      const httpServer = makeHttpServer();
      registerAgentSkillsWriteRoutes(httpServer, { db: mockDb(null), loaderConfig: {}, workspaceBasePath: '/tmp' });
      const route = httpServer.getRoutes().find(r => r.path === '/admin/agent-skills/delete')!;
      const response = await route.handler(makeRequest({ agentId: 'unknown', skillName: 'x' }));
      expect(response.status).toBe(404);
    });

    it('calls deleteAgentWorkspaceSkill with correct args', async () => {
      const agent = makeAgent('agent-del', 'Del Agent');
      const httpServer = makeHttpServer();
      registerAgentSkillsWriteRoutes(httpServer, { db: mockDb(agent), loaderConfig: {}, workspaceBasePath: '/ws' });
      const route = httpServer.getRoutes().find(r => r.path === '/admin/agent-skills/delete')!;
      await route.handler(makeRequest({ agentId: 'agent-del', skillName: 'my-skill' }));
      expect(mockDeleteSkill).toHaveBeenCalledWith(expect.objectContaining({
        workspaceBasePath: '/ws',
        agent,
        skillName: 'my-skill',
      }));
    });

    it('returns 200 with success and skillName on success', async () => {
      const httpServer = makeHttpServer();
      registerAgentSkillsWriteRoutes(httpServer, { db: mockDb(makeAgent()), loaderConfig: {}, workspaceBasePath: '/tmp' });
      const route = httpServer.getRoutes().find(r => r.path === '/admin/agent-skills/delete')!;
      const response = await route.handler(makeRequest({ agentId: 'agent-1', skillName: 'obsolete' }));
      expect(response.status).toBe(200);
      expect(parseBody(response)).toMatchObject({ success: true, agentId: 'agent-1', skillName: 'obsolete' });
    });

    it('calls reloadAgentIfLoaded after successful delete', async () => {
      const db = mockDb(makeAgent());
      const loaderConfig = {};
      const httpServer = makeHttpServer();
      registerAgentSkillsWriteRoutes(httpServer, { db, loaderConfig, workspaceBasePath: '/tmp' });
      const route = httpServer.getRoutes().find(r => r.path === '/admin/agent-skills/delete')!;
      await route.handler(makeRequest({ agentId: 'agent-1', skillName: 'x' }));
      expect(mockReloadAgentIfLoaded).toHaveBeenCalledWith(db, loaderConfig, 'agent-1');
    });

    it('returns 500 on error and logs with forgeDebug', async () => {
      mockDeleteSkill.mockRejectedValue(new Error('Delete failed'));
      const httpServer = makeHttpServer();
      registerAgentSkillsWriteRoutes(httpServer, { db: mockDb(makeAgent()), loaderConfig: {}, workspaceBasePath: '/tmp' });
      const route = httpServer.getRoutes().find(r => r.path === '/admin/agent-skills/delete')!;
      const response = await route.handler(makeRequest({ agentId: 'agent-1', skillName: 'x' }));
      expect(response.status).toBe(500);
      expect(parseBody(response)).toHaveProperty('error', 'Delete failed');
    });
  });

  // ─── POST /admin/agent-skills/install-global ──────────────────────────────

  describe('POST /admin/agent-skills/install-global', () => {
    it('returns 404 when agent not found', async () => {
      const httpServer = makeHttpServer();
      registerAgentSkillsWriteRoutes(httpServer, { db: mockDb(null), loaderConfig: {}, workspaceBasePath: '/tmp' });
      const route = httpServer.getRoutes().find(r => r.path === '/admin/agent-skills/install-global')!;
      const response = await route.handler(makeRequest({ agentId: 'unknown', skillName: 'x' }));
      expect(response.status).toBe(404);
    });

    it('calls installGlobalSkillToAgentWorkspace with correct args', async () => {
      const agent = makeAgent('agent-global', 'Global Agent');
      const httpServer = makeHttpServer();
      registerAgentSkillsWriteRoutes(httpServer, { db: mockDb(agent), loaderConfig: {}, workspaceBasePath: '/ws' });
      const route = httpServer.getRoutes().find(r => r.path === '/admin/agent-skills/install-global')!;
      await route.handler(makeRequest({ agentId: 'agent-global', skillName: 'fetch-data' }));
      expect(mockInstallGlobal).toHaveBeenCalledWith(expect.objectContaining({
        workspaceBasePath: '/ws',
        agent,
        skillName: 'fetch-data',
      }));
    });

    it('returns 200 with success on install', async () => {
      const httpServer = makeHttpServer();
      registerAgentSkillsWriteRoutes(httpServer, { db: mockDb(makeAgent()), loaderConfig: {}, workspaceBasePath: '/tmp' });
      const route = httpServer.getRoutes().find(r => r.path === '/admin/agent-skills/install-global')!;
      const response = await route.handler(makeRequest({ agentId: 'agent-1', skillName: 'fetch-data' }));
      expect(response.status).toBe(200);
      expect(parseBody(response)).toMatchObject({ success: true, agentId: 'agent-1', skillName: 'fetch-data' });
    });

    it('calls reloadAgentIfLoaded after successful install', async () => {
      const db = mockDb(makeAgent());
      const loaderConfig = {};
      const httpServer = makeHttpServer();
      registerAgentSkillsWriteRoutes(httpServer, { db, loaderConfig, workspaceBasePath: '/tmp' });
      const route = httpServer.getRoutes().find(r => r.path === '/admin/agent-skills/install-global')!;
      await route.handler(makeRequest({ agentId: 'agent-1', skillName: 'x' }));
      expect(mockReloadAgentIfLoaded).toHaveBeenCalledWith(db, loaderConfig, 'agent-1');
    });

    it('returns 500 on error and logs with forgeDebug', async () => {
      mockInstallGlobal.mockRejectedValue(new Error('Install failed'));
      const httpServer = makeHttpServer();
      registerAgentSkillsWriteRoutes(httpServer, { db: mockDb(makeAgent()), loaderConfig: {}, workspaceBasePath: '/tmp' });
      const route = httpServer.getRoutes().find(r => r.path === '/admin/agent-skills/install-global')!;
      const response = await route.handler(makeRequest({ agentId: 'agent-1', skillName: 'x' }));
      expect(response.status).toBe(500);
      expect(parseBody(response)).toHaveProperty('error', 'Install failed');
    });
  });

  // ─── POST /admin/agent-skills/publish-global ──────────────────────────────

  describe('POST /admin/agent-skills/publish-global', () => {
    it('returns 404 when agent not found', async () => {
      const httpServer = makeHttpServer();
      registerAgentSkillsWriteRoutes(httpServer, { db: mockDb(null), loaderConfig: {}, workspaceBasePath: '/tmp' });
      const route = httpServer.getRoutes().find(r => r.path === '/admin/agent-skills/publish-global')!;
      const response = await route.handler(makeRequest({ agentId: 'unknown', skillName: 'x' }));
      expect(response.status).toBe(404);
    });

    it('calls publishAgentWorkspaceSkillToGlobalCatalog with correct args', async () => {
      const agent = makeAgent('agent-pub', 'Pub Agent');
      const httpServer = makeHttpServer();
      registerAgentSkillsWriteRoutes(httpServer, { db: mockDb(agent), loaderConfig: {}, workspaceBasePath: '/ws' });
      const route = httpServer.getRoutes().find(r => r.path === '/admin/agent-skills/publish-global')!;
      await route.handler(makeRequest({ agentId: 'agent-pub', skillName: 'my-skill' }));
      expect(mockPublishGlobal).toHaveBeenCalledWith(expect.objectContaining({
        workspaceBasePath: '/ws',
        agent,
        skillName: 'my-skill',
      }));
    });

    it('returns 200 with publishedSkillName on success', async () => {
      mockPublishGlobal.mockResolvedValue('fetch-data-v2');
      const httpServer = makeHttpServer();
      registerAgentSkillsWriteRoutes(httpServer, { db: mockDb(makeAgent()), loaderConfig: {}, workspaceBasePath: '/tmp' });
      const route = httpServer.getRoutes().find(r => r.path === '/admin/agent-skills/publish-global')!;
      const response = await route.handler(makeRequest({ agentId: 'agent-1', skillName: 'fetch-data' }));
      expect(response.status).toBe(200);
      expect(parseBody(response)).toMatchObject({
        success: true,
        agentId: 'agent-1',
        publishedSkillName: 'fetch-data-v2',
      });
    });

    it('calls reloadAgentIfLoaded after successful publish', async () => {
      const db = mockDb(makeAgent());
      const loaderConfig = {};
      const httpServer = makeHttpServer();
      registerAgentSkillsWriteRoutes(httpServer, { db, loaderConfig, workspaceBasePath: '/tmp' });
      const route = httpServer.getRoutes().find(r => r.path === '/admin/agent-skills/publish-global')!;
      await route.handler(makeRequest({ agentId: 'agent-1', skillName: 'x' }));
      expect(mockReloadAgentIfLoaded).toHaveBeenCalledWith(db, loaderConfig, 'agent-1');
    });

    it('returns 500 on error and logs with forgeDebug', async () => {
      mockPublishGlobal.mockRejectedValue(new Error('Publish failed'));
      const httpServer = makeHttpServer();
      registerAgentSkillsWriteRoutes(httpServer, { db: mockDb(makeAgent()), loaderConfig: {}, workspaceBasePath: '/tmp' });
      const route = httpServer.getRoutes().find(r => r.path === '/admin/agent-skills/publish-global')!;
      const response = await route.handler(makeRequest({ agentId: 'agent-1', skillName: 'x' }));
      expect(response.status).toBe(500);
      expect(parseBody(response)).toHaveProperty('error', 'Publish failed');
    });
  });
});