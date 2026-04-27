import { jsonResponse } from '../index.js';
import { listGlobalSkills } from '../../../agents/global-skills.js';
import { mcpServerConfigs } from '../../../database/schema.js';

export function registerSystemReadRoutes(
  httpServer: { registerRoute: (route: unknown) => void },
  { registry, readModel, db, workspaceBasePath }: {
    registry: { list: () => Array<{ runtime: { id: string }; constructor: { name: string } }> };
    readModel: {
      listSystemIntegrations: () => Promise<unknown>;
      getSystemSettings: () => Promise<unknown>;
      getSystemLlm: () => Promise<unknown>;
      getApplicationMigrations: () => Promise<unknown>;
      getAgentRuntimeMemory: (agentId: string) => Promise<unknown>;
      listAgentRecentConversations: (opts: { agentId: string; limit: number }) => Promise<unknown>;
      listAgentExecutionSteps: (opts: { agentId: string; limit: number }) => Promise<unknown>;
    };
    db: { select: () => { from: (table: unknown) => { all: () => Promise<unknown[]> } } };
    workspaceBasePath: string;
  },
) {
  // GET /admin/system/healthcheck
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/healthcheck',
    handler: async () => {
      const agents = registry.list();
      const items = [];

      for (const entry of agents) {
        const [runtimeMemory, recentConversations, executionSteps] = await Promise.all([
          readModel.getAgentRuntimeMemory(entry.runtime.id),
          readModel.listAgentRecentConversations({ agentId: entry.runtime.id, limit: 1 }),
          readModel.listAgentExecutionSteps({ agentId: entry.runtime.id, limit: 1 }),
        ]);

        items.push({
          type: entry.constructor.name,
          runtime: entry.runtime,
          runtimeMemory,
          recentConversations,
          executionSteps,
        });
      }

      return jsonResponse({ agents: items });
    },
  });

  // GET /admin/system/integrations
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/integrations',
    handler: async () => jsonResponse(await readModel.listSystemIntegrations()),
  });

  // GET /admin/system/settings
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/settings',
    handler: async () => jsonResponse(await readModel.getSystemSettings()),
  });

  // GET /admin/system/llm
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/llm',
    handler: async () => jsonResponse(await readModel.getSystemLlm()),
  });

  // GET /admin/system/mcp
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/mcp',
    handler: async () => {
      const servers = await db.select().from(mcpServerConfigs).all();
      return jsonResponse(
        servers
          .map((server: unknown) => {
            const s = server as {
              id: string; name: string; description: string | null; transport: string;
              command: string | null; args: string | null; envVars: string | null;
              url: string | null; headers: string | null; isActive: number; createdAt: string; updatedAt: string
            };
            return {
              serverId: s.id,
              name: s.name,
              description: s.description ?? undefined,
              transport: s.transport as 'stdio' | 'http_streamable',
              command: s.command ?? '',
              argsText: s.args ?? '',
              envVarsText: s.envVars ?? '',
              url: s.url ?? '',
              headersText: s.headers ?? '',
              isActive: s.isActive === 1,
              createdAt: s.createdAt,
              updatedAt: s.updatedAt,
            };
          })
          .sort((left: { name: string }, right: { name: string }) => left.name.localeCompare(right.name)),
      );
    },
  });

  // GET /admin/system/migrations
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/migrations',
    handler: async () => jsonResponse(await readModel.getApplicationMigrations()),
  });

  // GET /admin/system/skills
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/skills',
    handler: async () => jsonResponse(await listGlobalSkills(workspaceBasePath)),
  });

  // GET /admin/system/oauth
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/oauth',
    handler: async () => {
      const { oauthStore } = await import('@forge-runtime/core');
      const defaultPath = oauthStore.getDefaultPath();
      const stored = await oauthStore.read(defaultPath);
      return jsonResponse({
        anthropic: { exists: !!stored?.anthropic },
        openaiCodex: { exists: !!stored?.['openai-codex'] },
      });
    },
  });
}