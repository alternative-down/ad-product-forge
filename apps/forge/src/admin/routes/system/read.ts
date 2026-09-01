/**
 * System Admin Read Routes
 *
 * Refactored from createAdminReadModel (#1575).
 * Each route creates only the stores it needs.
 *
 * Stores are passed directly instead of via a read-model wrapper.
 *
 * Migrated from Format B (legacy try/catch + forgeDebug) to safeRoute wrapper
 * (Phase 3 admin route pattern) per L#NN-50 family #6 + #6727 C21 finding.
 * Tripwire re-enablement target: clears 8 of 11 pre-existing Format B sites.
 */
import { mcpServerConfigs } from '../../../database/schema';

import type { Database } from '../../../database/client';
import type { InternalAgentRegistry } from '../../../agents/internal-agent-registry';
import type { createForgeHttpServer } from '../../../http/server';
import { buildOauthState } from './oauth-state';
import { buildSystemHealthcheck } from './healthcheck';
import { listGlobalSkills } from '../../../agents/global-skills';
import { jsonResponse } from '../index';
import { safeRoute } from '../agents/admin-route-error-helper';
import type { CapabilityStore } from '../../../capabilities/store';
import type { SystemIntegrationStore } from '../../../system-integrations/store';
import type { LlmSettingsStore } from '../../../llm/settings-store';
import type { LlmModelPriceStore } from '../../../llm/model-price-store';
import type { SystemSettingsStore } from '../../../system-settings/store';

interface SystemReadRoutesInput {
  httpServer: ReturnType<typeof createForgeHttpServer>;
  db: Database;
  registry: InternalAgentRegistry;
  workspaceBasePath: string;
  // Individual stores instead of a read-model wrapper
  capabilities: CapabilityStore;
  integrations: SystemIntegrationStore;
  llmSettings: LlmSettingsStore;
  llmModelPrices: LlmModelPriceStore;
  systemSettings: SystemSettingsStore;
  readModel: {
    getAgent: (agentId: string) => Promise<unknown>;
    getApplicationMigrations: () => Promise<unknown>;
  };
}

export function registerSystemReadRoutes(input: SystemReadRoutesInput) {
  const {
    httpServer,
    db,
    registry,
    workspaceBasePath,
    capabilities: _capabilities,
    integrations,
    llmSettings,
    llmModelPrices,
    systemSettings,
    readModel,
  } = input;

  // GET /admin/system/healthcheck
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/healthcheck',
    handler: safeRoute('/admin/system/healthcheck', async () => {
      const healthcheck = await buildSystemHealthcheck(
        registry,
        readModel as unknown as Parameters<typeof buildSystemHealthcheck>[1],
      );
      return jsonResponse(healthcheck);
    }),
  });

  // GET /admin/system/integrations
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/integrations',
    handler: safeRoute('/admin/system/integrations', async () => {
      const [summaries, migadu, coolify, github, minimax] = await Promise.all([
        integrations.listIntegrations(),
        integrations.getMigaduConfig(),
        integrations.getCoolifyConfig(),
        integrations.getGitHubConfig(),
        integrations.getMinimaxConfig(),
      ]);
      const configByProvider = { migadu, coolify, github, minimax };

      return jsonResponse(
        summaries.map((integration) => ({
          ...integration,
          config: configByProvider[integration.providerType],
        })),
      );
    }),
  });

  // GET /admin/system/settings
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/settings',
    handler: safeRoute('/admin/system/settings', async () => {
      return jsonResponse(await systemSettings.getSettings());
    }),
  });

  // GET /admin/system/llm
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/llm',
    handler: safeRoute('/admin/system/llm', async () => {
      const [profiles, defaults, prices] = await Promise.all([
        llmSettings.listProfiles(),
        llmSettings.getDefaults(),
        llmModelPrices.listPrices(),
      ]);
      return jsonResponse({ profiles, defaults, prices });
    }),
  });

  // GET /admin/system/mcp
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/mcp',
    handler: safeRoute('/admin/system/mcp', async () => {
      const servers = await db.select().from(mcpServerConfigs).all();
      const formatted = servers
        .map((server) => ({
          serverId: server.id,
          name: server.name,
          description: server.description ?? undefined,
          transport: server.transport as 'stdio' | 'http_streamable',
          command: server.command ?? '',
          argsText: server.args ?? '',
          envVarsText: server.envVars ?? '',
          url: server.url ?? '',
          headersText: server.headers ?? '',
          isActive: server.isActive === 1,
          createdAt: server.createdAt,
          updatedAt: server.updatedAt,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return jsonResponse(formatted);
    }),
  });

  // GET /admin/system/migrations
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/migrations',
    handler: safeRoute('/admin/system/migrations', async () => {
      return jsonResponse(await readModel.getApplicationMigrations());
    }),
  });

  // GET /admin/system/skills
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/skills',
    handler: safeRoute('/admin/system/skills', async () => {
      return jsonResponse(await listGlobalSkills(workspaceBasePath));
    }),
  });

  // GET /admin/system/oauth
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/oauth',
    handler: safeRoute('/admin/system/oauth', async () => {
      return jsonResponse(await buildOauthState());
    }),
  });
}
