/**
 * System Write Routes Tests - Phase 4 of #719
 * Tests for extracted system route write submodule
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncOpenAICodexCredential, syncAnthropicCredential } from '@forge-runtime/core';
import { registerSystemWriteRoutes } from './write';

// --- Mocks for file-level imports ---

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
  oauthStore: {
    read: vi.fn().mockResolvedValue({}),
    getDefaultPath: vi.fn().mockReturnValue('/tmp/oauth-store.json'),
  },
  syncOpenAICodexCredential: vi.fn().mockResolvedValue(undefined),
  syncAnthropicCredential: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../http/server', () => ({
  jsonResponse: vi.fn((body: unknown, status = 200) => ({
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  })),
}));

vi.mock('../helpers.js', () => ({
  jsonResponse: vi.fn((body: unknown, status = 200) => ({
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  })),
  parseJsonBody: vi.fn((bodyText: string, _schema: { parse: (v: unknown) => unknown }) => {
    if (!bodyText || bodyText.trim() === '') return {};
    try {
      return JSON.parse(bodyText);
    } catch {
      return {};
    }
  }),
  normalizeOptionalText: vi.fn((v?: string) => (v?.trim() ? v.trim() : null)),
  normalizeJsonText: vi.fn().mockReturnValue(null),
  fsPathExists: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../../database/schema', () => ({
  mcpServerConfigs: { id: Symbol('mcpServerConfigs.id') },
  agentMcpConfigs: { serverId: Symbol('agentMcpConfigs.serverId') },
}));

vi.mock('../../../database/index', () => ({}));

vi.mock('../../../agents/global-skills.js', () => ({
  installGlobalSkillsFromZip: vi.fn().mockResolvedValue({ installedSkillNames: [] }),
  deleteGlobalSkill: vi.fn().mockResolvedValue(undefined),
}));

// --- Helpers ---

function makeMockHttpServer() {
  const routes: Array<{ method: string; path: string; handler: unknown }> = [];
  return {
    routes,
    registerRoute: vi.fn((route: { method: string; path: string; handler: unknown }) => {
      routes.push(route);
    }),
  };
}

function makeMockDb() {
  const servers = new Map();
  const profiles = new Map();
  const lastInsertedId = { current: null };
  const lastInsertedData = { current: null };

  return {
    insert: vi.fn((table) => ({
      values: vi.fn((data) => {
        const id = data?.id || data?.profileId || 'mock-id-' + Date.now();
        lastInsertedId.current = id;
        lastInsertedData.current = { ...data, id };
        if (table && table.name) {
          // Drizzle table object
        }
        servers.set(id, { ...data, id });
        profiles.set(id, { ...data, id });
        return Promise.resolve({ rowsAffected: 1 });
      }),
    })),
    update: vi.fn((table) => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve({ rowsAffected: 1 })),
      })),
    })),
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue({ rowsAffected: 1 }) })),
    query: {
      mcpServerConfigs: {
        findFirst: vi.fn(({ where }) => {
          // Drizzle where can be an object with eq conditions
          // e.g., { id: 'some-id' } from eq(mcpServerConfigs.id, 'some-id')
          // The where object keys match column names
          if (where && typeof where === 'object') {
            for (const [key, value] of Object.entries(where)) {
              if (typeof value === 'string' && servers.has(value)) {
                return Promise.resolve(servers.get(value));
              }
            }
          }
          // If no match in where, return last inserted server
          const lastId = lastInsertedId.current;
          return Promise.resolve(lastId ? servers.get(lastId) || null : null);
        }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      llmProfiles: {
        findFirst: vi.fn(({ where }) => {
          for (const v of Object.values(where || {})) {
            if (typeof v === 'string') {
              return Promise.resolve(profiles.get(v) || null);
            }
          }
          // If no where, return last inserted profile
          return Promise.resolve((lastInsertedData.current as any)?.profileId ? profiles.get((lastInsertedData.current as any).profileId) || (lastInsertedData.current as any) : null);
        }),
      },
      agentMcpConfigs: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
  };
}

function makeMockSystemSettings() {
  return {
    upsertSettings: vi.fn().mockResolvedValue({}),
  };
}

function makeMockLlmSettings() {
  return {
    upsertProfile: vi.fn((body) => Promise.resolve({ profileId: body?.profileId || 'profile-default' })),
    deleteProfile: vi.fn().mockResolvedValue(undefined),
    updateDefaults: vi.fn().mockResolvedValue({}),
  };
}

function makeMockLlmModelPrices() {
  return {
    upsertPrice: vi.fn().mockResolvedValue({}),
  };
}

function makeMockIntegrations() {
  return {
    upsert: vi.fn().mockResolvedValue({ integrationId: 'int-abc' }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockRegistry() {
  return {
    list: vi.fn().mockReturnValue([]),
    add: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockLoader() {
  return vi.fn().mockResolvedValue({ id: 'mock-agent-runtime' });
}

function makeMockRequest(bodyText = '{}') {
  return { bodyText } as unknown as import('../../../http/server').HttpRequest;
}

// --- Tests ---

describe('registerSystemWriteRoutes', () => {
  let mockServer: ReturnType<typeof makeMockHttpServer>;
  let mockDb: ReturnType<typeof makeMockDb>;
  let mockSystemSettings: ReturnType<typeof makeMockSystemSettings>;
  let mockLlmSettings: ReturnType<typeof makeMockLlmSettings>;
  let mockLlmModelPrices: ReturnType<typeof makeMockLlmModelPrices>;
  let mockIntegrations: ReturnType<typeof makeMockIntegrations>;
  let mockRegistry: ReturnType<typeof makeMockRegistry>;
  let mockLoader: ReturnType<typeof makeMockLoader>;

  beforeEach(() => {
    vi.stubGlobal('forgeDebug', vi.fn());
    mockServer = makeMockHttpServer();
    mockDb = makeMockDb();
    mockSystemSettings = makeMockSystemSettings();
    mockLlmSettings = makeMockLlmSettings();
    mockLlmModelPrices = makeMockLlmModelPrices();
    mockIntegrations = makeMockIntegrations();
    mockRegistry = makeMockRegistry();
    mockLoader = makeMockLoader();
    vi.clearAllMocks();
  });

  function buildInput() {
    return {
      httpServer: mockServer as any,
      db: mockDb as any,
      workspaceBasePath: '/mock/workspace',
      loaderConfig: {} as any,
      systemSettings: mockSystemSettings as any,
      llmSettings: mockLlmSettings as any,
      llmModelPrices: mockLlmModelPrices as any,
      integrations: mockIntegrations as any,
      registry: mockRegistry as any,
      loadAgent: mockLoader as any,
    };
  }

  describe('route registration', () => {
    it('registers all 11 routes', () => {
      registerSystemWriteRoutes(buildInput());
      expect(mockServer.registerRoute).toHaveBeenCalledTimes(12);
      expect(mockServer.routes).toHaveLength(12);
    });

    it('registers settings/upsert as POST', () => {
      registerSystemWriteRoutes(buildInput());
      const route = mockServer.routes.find(r => r.path === '/admin/system/settings/upsert');
      expect(route).toBeDefined();
      expect(route!.method).toBe('POST');
    });

    it('registers mcp/upsert as POST', () => {
      registerSystemWriteRoutes(buildInput());
      const route = mockServer.routes.find(r => r.path === '/admin/system/mcp/upsert');
      expect(route).toBeDefined();
      expect(route!.method).toBe('POST');
    });

    it('registers mcp/delete as POST', () => {
      registerSystemWriteRoutes(buildInput());
      const route = mockServer.routes.find(r => r.path === '/admin/system/mcp/delete');
      expect(route).toBeDefined();
      expect(route!.method).toBe('POST');
    });

    it('registers skills/upload as POST', () => {
      registerSystemWriteRoutes(buildInput());
      const route = mockServer.routes.find(r => r.path === '/admin/system/skills/upload');
      expect(route).toBeDefined();
      expect(route!.method).toBe('POST');
    });

    it('registers skills/delete as POST', () => {
      registerSystemWriteRoutes(buildInput());
      const route = mockServer.routes.find(r => r.path === '/admin/system/skills/delete');
      expect(route).toBeDefined();
      expect(route!.method).toBe('POST');
    });

    it('registers llm/price/upsert as POST', () => {
      registerSystemWriteRoutes(buildInput());
      const route = mockServer.routes.find(r => r.path === '/admin/system/llm/price/upsert');
      expect(route).toBeDefined();
      expect(route!.method).toBe('POST');
    });

    it('registers integration/upsert as POST', () => {
      registerSystemWriteRoutes(buildInput());
      const route = mockServer.routes.find(r => r.path === '/admin/system/integration/upsert');
      expect(route).toBeDefined();
      expect(route!.method).toBe('POST');
    });

    it('registers integration/delete as POST', () => {
      registerSystemWriteRoutes(buildInput());
      const route = mockServer.routes.find(r => r.path === '/admin/system/integration/delete');
      expect(route).toBeDefined();
      expect(route!.method).toBe('POST');
    });

    it('registers llm/profile/upsert as POST', () => {
      registerSystemWriteRoutes(buildInput());
      const route = mockServer.routes.find(r => r.path === '/admin/system/llm/profile/upsert');
      expect(route).toBeDefined();
      expect(route!.method).toBe('POST');
    });

    it('registers llm/profile/delete as POST', () => {
      registerSystemWriteRoutes(buildInput());
      const route = mockServer.routes.find(r => r.path === '/admin/system/llm/profile/delete');
      expect(route).toBeDefined();
      expect(route!.method).toBe('POST');
    });

    it('registers llm/defaults/update as POST', () => {
      registerSystemWriteRoutes(buildInput());
      const route = mockServer.routes.find(r => r.path === '/admin/system/llm/defaults/update');
      expect(route).toBeDefined();
      expect(route!.method).toBe('POST');
    });

    it('registers oauth/sync as POST', () => {
      registerSystemWriteRoutes(buildInput());
      const route = mockServer.routes.find(r => r.path === '/admin/system/oauth/sync');
      expect(route).toBeDefined();
      expect(route!.method).toBe('POST');
    });
  });

  describe('handler: settings/upsert', () => {
    it('calls systemSettings.upsertSettings with parsed body', async () => {
      registerSystemWriteRoutes(buildInput());

      const route = mockServer.routes.find(r => r.path === '/admin/system/settings/upsert');
      const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;
      await handler(makeMockRequest(JSON.stringify({
        companyName: ' Acme Corp ',
        companyContext: ' Testing context ',
        stepDelayEnabled: true,
      })));

      expect(mockSystemSettings.upsertSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          companyName: 'Acme Corp',
          companyContext: 'Testing context',
          stepDelayEnabled: true,
        }),
      );
    });

    it('calls loadAgent and registry.add for each active agent', async () => {
      mockRegistry.list.mockReturnValue([
        { runtime: { id: 'agent-1' } },
        { runtime: { id: 'agent-2' } },
      ]);

      registerSystemWriteRoutes(buildInput());

      const route = mockServer.routes.find(r => r.path === '/admin/system/settings/upsert');
      const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;
      await handler(makeMockRequest(JSON.stringify({ companyName: 'Test', companyContext: 'Test Context', agentConfig: {} })));

      expect(mockLoader).toHaveBeenCalledTimes(2);
      expect(mockRegistry.add).toHaveBeenCalledTimes(2);
    });

    it('handles empty body gracefully', async () => {
      registerSystemWriteRoutes(buildInput());

      const route = mockServer.routes.find(r => r.path === '/admin/system/settings/upsert');
      const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;
      await handler(makeMockRequest(JSON.stringify({ companyName: 'Test', companyContext: 'Test Context' })));

      expect(mockSystemSettings.upsertSettings).toHaveBeenCalled();
    });
  });

  describe('handler: mcp/upsert', () => {
    it('inserts new MCP server when no serverId provided', async () => {
      registerSystemWriteRoutes(buildInput());

      const route = mockServer.routes.find(r => r.path === '/admin/system/mcp/upsert');
      const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;
      const result = await handler(makeMockRequest(JSON.stringify({
        name: 'Test MCP Server',
        transport: 'stdio',
        command: 'npx',
        args: ['--flag'],
        isActive: true,
      }))) as { body: string };

      const parsed = JSON.parse(result.body);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(parsed.serverId).toBeDefined();
    });

    it('updates existing MCP server when serverId provided', async () => {
      registerSystemWriteRoutes(buildInput());

      const route = mockServer.routes.find(r => r.path === '/admin/system/mcp/upsert');
      const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;
      await handler(makeMockRequest(JSON.stringify({
        serverId: 'existing-server-id',
        name: 'Updated Server',
        transport: 'stdio',
        command: 'node',
        isActive: false,
      })));

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('handles http_streamable transport with url and headers', async () => {
      registerSystemWriteRoutes(buildInput());

      const route = mockServer.routes.find(r => r.path === '/admin/system/mcp/upsert');
      const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;
      await handler(makeMockRequest(JSON.stringify({
        name: 'HTTP MCP',
        transport: 'http_streamable',
        url: 'https://mcp.example.com',
        headersText: '{"Authorization": "Bearer token"}',
        isActive: true,
      })));

      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('handler: mcp/delete', () => {
    it('deletes MCP server and returns success', async () => {
      registerSystemWriteRoutes(buildInput());

      const route = mockServer.routes.find(r => r.path === '/admin/system/mcp/delete');
      const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;
      const result = await handler(makeMockRequest(JSON.stringify({
        serverId: 'server-to-delete',
      })));

      expect(mockDb.delete).toHaveBeenCalled();
      const parsed = JSON.parse((result as any).body); expect(parsed).toEqual({ success: true, serverId: 'server-to-delete' });
    });

    it('deletes linked agent configs and reloads agents', async () => {
      mockDb.query.agentMcpConfigs.findMany.mockResolvedValue([
        { agentId: 'agent-linked-1', id: 'config-1' },
      ]);

      registerSystemWriteRoutes(buildInput());

      const route = mockServer.routes.find(r => r.path === '/admin/system/mcp/delete');
      const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;
      await handler(makeMockRequest(JSON.stringify({
        serverId: 'server-with-links',
      })));

      expect(mockDb.delete).toHaveBeenCalled(); // agentMcpConfigs
      expect(mockLoader).toHaveBeenCalled();
      expect(mockRegistry.add).toHaveBeenCalled();
    });
  });

  describe('handler: skills/upload', () => {
    it('calls installGlobalSkillsFromZip with archiveBase64', async () => {
      const { installGlobalSkillsFromZip } = await import('../../../agents/global-skills.js');

      registerSystemWriteRoutes(buildInput());

      const route = mockServer.routes.find(r => r.path === '/admin/system/skills/upload');
      const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;
      await handler(makeMockRequest(JSON.stringify({
        archiveBase64: 'UEsDBBQAAAAAA',
      })));

      expect(installGlobalSkillsFromZip).toHaveBeenCalledWith({
        workspaceBasePath: '/mock/workspace',
        zipBase64: 'UEsDBBQAAAAAA',
      });
    });

    it('returns 201 status on successful skill upload', async () => {
      registerSystemWriteRoutes(buildInput());

      const route = mockServer.routes.find(r => r.path === '/admin/system/skills/upload');
      const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;
      const result = await handler(makeMockRequest('{}')) as { status: number };

      expect(result.status).toBe(201);
    });
  });

  describe('handler: skills/delete', () => {
    it('calls deleteGlobalSkill with skillName', async () => {
      const { deleteGlobalSkill } = await import('../../../agents/global-skills.js');

      registerSystemWriteRoutes(buildInput());

      const route = mockServer.routes.find(r => r.path === '/admin/system/skills/delete');
      const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;
      await handler(makeMockRequest(JSON.stringify({
        skillName: 'my-test-skill',
      })));

      expect(deleteGlobalSkill).toHaveBeenCalledWith({
        workspaceBasePath: '/mock/workspace',
        skillName: 'my-test-skill',
      });
    });

    it('returns success with skillName', async () => {
      registerSystemWriteRoutes(buildInput());

      const route = mockServer.routes.find(r => r.path === '/admin/system/skills/delete');
      const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;
      const result = await handler(makeMockRequest(JSON.stringify({
        skillName: 'to-delete',
      })));

      const parsed = JSON.parse((result as any).body); expect(parsed).toEqual({ success: true, skillName: 'to-delete' });
    });
  });

  describe('handler: llm/price/upsert', () => {
    it('calls llmModelPrices.upsertPrice with parsed body', async () => {
      registerSystemWriteRoutes(buildInput());

      const route = mockServer.routes.find(r => r.path === '/admin/system/llm/price/upsert');
      const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;
      await handler(makeMockRequest(JSON.stringify({
        provider: 'openai',
        modelId: 'gpt-4o-mini',
        modality: 'text',
        inputPricePer1mTokens: 0.15,
        outputPricePer1mTokens: 0.60,
      })));

      expect(mockLlmModelPrices.upsertPrice).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'openai',
          modelId: 'gpt-4o-mini',
          modality: 'text',
        }),
      );
    });
  });

  describe('handler: integration/upsert', () => {
    it('calls integrations.upsert with parsed body', async () => {
      registerSystemWriteRoutes(buildInput());

      const route = mockServer.routes.find(r => r.path === '/admin/system/integration/upsert');
      const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;
      await handler(makeMockRequest(JSON.stringify({
        integrationType: 'webhook',
        name: 'Test Webhook',
        configJson: '{"url":"https://example.com"}',
        isActive: true,
      })));

      expect(mockIntegrations.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          integrationType: 'webhook',
          name: 'Test Webhook',
        }),
      );
    });
  });

  describe('handler: integration/delete', () => {
    it('calls integrations.delete with integrationId', async () => {
      registerSystemWriteRoutes(buildInput());

      const route = mockServer.routes.find(r => r.path === '/admin/system/integration/delete');
      const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;
      await handler(makeMockRequest(JSON.stringify({
        integrationId: 'int-to-delete',
      })));

      expect(mockIntegrations.delete).toHaveBeenCalledWith({ id: 'int-to-delete' });
    });

    it('returns success', async () => {
      registerSystemWriteRoutes(buildInput());

      const route = mockServer.routes.find(r => r.path === '/admin/system/integration/delete');
      const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;
      const result = await handler(makeMockRequest(JSON.stringify({
        integrationId: 'int-abc',
      })));

      const parsed = JSON.parse((result as any).body); expect(parsed).toEqual({ success: true, integrationId: 'int-abc' });
    });
  });

  describe('handler: llm/profile/upsert', () => {
    it('calls llmSettings.upsertProfile with parsed body', async () => {
      registerSystemWriteRoutes(buildInput());

      const route = mockServer.routes.find(r => r.path === '/admin/system/llm/profile/upsert');
      const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;
      await handler(makeMockRequest(JSON.stringify({
        profileId: 'profile-test',
        name: 'Test Profile',
        modelId: 'gpt-4o',
        temperature: 0.7,
        maxTokens: 2048,
        systemPrompt: 'You are a helpful assistant.',
      })));

      expect(mockLlmSettings.upsertProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: 'profile-test',
          name: 'Test Profile',
          modelId: 'gpt-4o',
        }),
      );
    });

    it('returns profile with profileId', async () => {
      registerSystemWriteRoutes(buildInput());

      const route = mockServer.routes.find(r => r.path === '/admin/system/llm/profile/upsert');
      const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;
      const result = await handler(makeMockRequest(JSON.stringify({
        profileId: 'profile-abc',
        name: 'My Profile',
        modelId: 'claude-3-5-sonnet',
      }))) as { body: string; status?: number };

      const parsed = JSON.parse(result.body);
      expect(parsed.profileId).toBe('profile-abc');
    });
  });

  describe('handler: llm/profile/delete', () => {
    it('calls llmSettings.deleteProfile with profileId', async () => {
      registerSystemWriteRoutes(buildInput());

      const route = mockServer.routes.find(r => r.path === '/admin/system/llm/profile/delete');
      const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;
      await handler(makeMockRequest(JSON.stringify({
        profileId: 'profile-to-delete',
      })));

      expect(mockLlmSettings.deleteProfile).toHaveBeenCalledWith({ profileId: 'profile-to-delete' });
    });

    it('returns success with profileId', async () => {
      registerSystemWriteRoutes(buildInput());

      const route = mockServer.routes.find(r => r.path === '/admin/system/llm/profile/delete');
      const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;
      const result = await handler(makeMockRequest(JSON.stringify({
        profileId: 'profile-xyz',
      })));

      const parsed = JSON.parse((result as any).body); expect(parsed).toEqual({ success: true, profileId: 'profile-xyz' });
    });
  });

  describe('handler: llm/defaults/update', () => {
    it('calls llmSettings.updateDefaults with parsed body', async () => {
      registerSystemWriteRoutes(buildInput());

      const route = mockServer.routes.find(r => r.path === '/admin/system/llm/defaults/update');
      const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;
      await handler(makeMockRequest(JSON.stringify({
        defaultModelId: 'gpt-4o',
        defaultTemperature: 0.8,
      })));

      expect(mockLlmSettings.updateDefaults).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultModelId: 'gpt-4o',
          defaultTemperature: 0.8,
        }),
      );
    });
  });
  describe('handler: oauth/sync', () => {
    it('syncs openai-codex when providerId is openai-codex', async () => {
      registerSystemWriteRoutes(buildInput());

      const route = mockServer.routes.find(r => r.path === '/admin/system/oauth/sync');
      const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;
      await handler(makeMockRequest(JSON.stringify({
        providerId: 'openai-codex',
      })));

      expect(vi.mocked(syncOpenAICodexCredential)).toHaveBeenCalled();
    });

    it('syncs anthropic when providerId is anthropic', async () => {
      registerSystemWriteRoutes(buildInput());

      const route = mockServer.routes.find(r => r.path === '/admin/system/oauth/sync');
      const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;
      await handler(makeMockRequest(JSON.stringify({
        providerId: 'anthropic',
      })));

      expect(vi.mocked(syncAnthropicCredential)).toHaveBeenCalled();
    });

    it('syncs both providers when providerId is all', async () => {
      registerSystemWriteRoutes(buildInput());

      const route = mockServer.routes.find(r => r.path === '/admin/system/oauth/sync');
      const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;
      await handler(makeMockRequest(JSON.stringify({
        providerId: 'all',
      })));

      expect(vi.mocked(syncOpenAICodexCredential)).toHaveBeenCalled();
      expect(vi.mocked(syncAnthropicCredential)).toHaveBeenCalled();
    });

    it('returns error in results when sync throws', async () => {
      vi.mocked(syncOpenAICodexCredential).mockImplementationOnce(
        () => Promise.reject(new Error('Credential file not found'))
      );

      registerSystemWriteRoutes(buildInput());

      const route = mockServer.routes.find(r => r.path === '/admin/system/oauth/sync');
      const handler = route!.handler as (req: { bodyText: string }) => Promise<unknown>;
      const raw = await handler(makeMockRequest(JSON.stringify({
        providerId: 'openai-codex',
      }))) as { body: string };
      const parsed = JSON.parse(raw.body) as { results?: Array<{ providerId: string; synced: boolean; error?: string }> };

      expect(parsed.results).toBeDefined();
      const openaiResult = parsed.results!.find(r => r.providerId === 'openai-codex');
      expect(openaiResult!.synced).toBe(false);
      expect(openaiResult!.error).toBe('Credential file not found');
    });
  });
});
