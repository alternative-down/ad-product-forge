/**
 * System Admin Write Routes - Phase 4 of #719
 * POST routes that perform system-level operations extracted from routes.ts
 */

import {
  syncOpenAICodexCredential,
  syncAnthropicCredential,
} from '@forge-runtime/core';
import { buildOauthState } from './oauth-state.js';
import { eq } from 'drizzle-orm';
import {
  jsonResponse,
  parseJsonBody,
  normalizeOptionalText,
  normalizeJsonText,
} from '../helpers.js';
import {
  upsertSystemSettingsSchema,
  upsertSystemMcpServerSchema,
  deleteSystemMcpServerSchema,
  uploadSystemSkillsSchema,
  deleteSystemSkillSchema,
  upsertLlmModelPriceSchema,
  upsertSystemIntegrationSchema,
  deleteSystemIntegrationSchema,
  upsertLlmProfileSchema,
  deleteLlmProfileSchema,
  updateLlmDefaultsSchema,
  syncOauthSchema,
} from '../schemas.js';
import type { Database } from '../../../database/index.js';
import { mcpServerConfigs, agentMcpConfigs } from '../../../database/schema.js';
import {
  installGlobalSkillsFromZip,
  deleteGlobalSkill,
} from '../../../agents/global-skills.js';
import type { AgentLoaderConfig } from '../../../agents/agent-loader.js';
import { createForgeHttpServer } from '../../../http/server.js';
import type { SystemSettingsStore } from '../../../system-settings/store.js';
import type { LlmSettingsStore } from '../../../llm/settings-store.js';
import type { LlmModelPriceStore } from '../../../llm/model-price-store.js';
import { createSystemIntegrationStore } from '../../../system-integrations/store.js';
import { getInternalAgentRegistry } from '../../../agents/internal-agent-registry.js';
import { loadAgent } from '../../../agents/agent-loader.js';

interface SystemWriteRoutesInput {
  httpServer: ReturnType<typeof createForgeHttpServer>;
  db: Database;
  workspaceBasePath: string;
  loaderConfig: AgentLoaderConfig;
  systemSettings: SystemSettingsStore;
  llmSettings: LlmSettingsStore;
  llmModelPrices: LlmModelPriceStore;
  integrations: ReturnType<typeof createSystemIntegrationStore>;
  registry: ReturnType<typeof getInternalAgentRegistry>;
  loadAgent: typeof loadAgent;
}



export function registerSystemWriteRoutes(input: SystemWriteRoutesInput) {
  const {
    httpServer,
    db,
    workspaceBasePath,
    loaderConfig,
    systemSettings,
    llmSettings,
    llmModelPrices,
    integrations,
    registry,
    loadAgent: loadAgentFn,
  } = input;

  // POST /admin/system/settings/upsert
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/settings/upsert',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, upsertSystemSettingsSchema);
      const result = await systemSettings.upsertSettings({
        companyName: body.companyName.trim(),
        companyContext: body.companyContext.trim(),
        stepDelayEnabled: body.stepDelayEnabled,
        communicationDmFlushingEnabled: body.communicationDmFlushingEnabled,
        communicationGroupFlushingEnabled: body.communicationGroupFlushingEnabled,
        memoryLastMessagesFullEnabled: body.memoryLastMessagesFullEnabled,
        memoryLastMessagesCount: body.memoryLastMessagesCount,
        tokenCountFilterEnabled: body.tokenCountFilterEnabled,
        tokenCountFilterLimit: body.tokenCountFilterLimit,
        checkpointedOmEnabled: body.checkpointedOmEnabled,
        checkpointedOmTotalContextTokens: body.checkpointedOmTotalContextTokens,
        checkpointedOmRecentRawTokens: body.checkpointedOmRecentRawTokens,
        checkpointedOmRawObservationBatchTokens: body.checkpointedOmRawObservationBatchTokens,
        checkpointedOmObservationReflectionBatchTokens:
          body.checkpointedOmObservationReflectionBatchTokens,
        checkpointedOmObservationSupportTokens: body.checkpointedOmObservationSupportTokens,
        checkpointedOmReflectionSupportTokens: body.checkpointedOmReflectionSupportTokens,
        ltmRecallSearchMode: body.ltmRecallSearchMode,
        ltmRecallWorkspaceTopK: body.ltmRecallWorkspaceTopK,
        ltmRecallGraphTopK: body.ltmRecallGraphTopK,
        ltmRecallGraphThreshold: body.ltmRecallGraphThreshold,
        ltmRecallGraphRandomWalkSteps: body.ltmRecallGraphRandomWalkSteps,
        ltmRecallGraphIncludeSources: body.ltmRecallGraphIncludeSources,
        ltmRecallScoreThreshold: body.ltmRecallScoreThreshold,
        ltmRecallDocumentCount: body.ltmRecallDocumentCount,
      });

      for (const entry of registry.list()) {
        const runtime = await loadAgentFn(db, {
          ...loaderConfig,
          agentId: entry.runtime.id,
        });
        await registry.add(db, runtime);
      }

      return jsonResponse(result);
    },
  });

  // POST /admin/system/mcp/upsert
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/mcp/upsert',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, upsertSystemMcpServerSchema);
      const timestamp = new Date().toISOString();
      const serverId = body.serverId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const values = {
        name: body.name,
        description: normalizeOptionalText(body.description),
        transport: body.transport,
        command: body.transport === 'stdio' ? body.command : null,
        args: body.transport === 'stdio' ? normalizeJsonText(body.argsText, 'argsText', 'array') : null,
        envVars: body.transport === 'stdio' ? normalizeJsonText(body.envVarsText, 'envVarsText', 'object') : null,
        url: body.transport === 'http_streamable' ? body.url : null,
        headers: body.transport === 'http_streamable'
          ? normalizeJsonText(body.headersText, 'headersText', 'object')
          : null,
        isActive: body.isActive ? 1 : 0,
        updatedAt: timestamp,
      };

      if (body.serverId) {
        await db.update(mcpServerConfigs).set(values).where(eq(mcpServerConfigs.id, body.serverId));
      } else {
        await db.insert(mcpServerConfigs).values({
          id: serverId,
          ...values,
          version: 1,
          createdAt: timestamp,
        });
      }

      const linkedConfigs = await db.query.agentMcpConfigs.findMany({
        where: eq(agentMcpConfigs.serverId, serverId),
        columns: { agentId: true },
      });
      for (const linkedConfig of linkedConfigs) {
        const runtime = await loadAgentFn(db, { ...loaderConfig, agentId: linkedConfig.agentId });
        await registry.add(db, runtime);
      }

      const server = await db.query.mcpServerConfigs.findFirst({
        where: eq(mcpServerConfigs.id, serverId),
      });

      return jsonResponse({
        serverId,
        name: server?.name ?? body.name,
        description: server?.description ?? undefined,
        transport: (server?.transport ?? body.transport) as 'stdio' | 'http_streamable',
        command: server?.command ?? '',
        argsText: server?.args ?? '',
        envVarsText: server?.envVars ?? '',
        url: server?.url ?? '',
        headersText: server?.headers ?? '',
        isActive: (server?.isActive ?? (body.isActive ? 1 : 0)) === 1,
        createdAt: server?.createdAt ?? timestamp,
        updatedAt: server?.updatedAt ?? timestamp,
      });
    },
  });

  // POST /admin/system/mcp/delete
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/mcp/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteSystemMcpServerSchema);
      const linkedConfigs = await db.query.agentMcpConfigs.findMany({
        where: eq(agentMcpConfigs.serverId, body.serverId),
        columns: { agentId: true, id: true },
      });

      for (const linkedConfig of linkedConfigs) {
        await db.delete(agentMcpConfigs).where(eq(agentMcpConfigs.id, linkedConfig.id));
        const runtime = await loadAgentFn(db, { ...loaderConfig, agentId: linkedConfig.agentId });
        await registry.add(db, runtime);
      }

      await db.delete(mcpServerConfigs).where(eq(mcpServerConfigs.id, body.serverId));

      return jsonResponse({ success: true, serverId: body.serverId });
    },
  });

  // POST /admin/system/skills/upload
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/skills/upload',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, uploadSystemSkillsSchema);
      const installedSkillNames = await installGlobalSkillsFromZip({
        workspaceBasePath,
        zipBase64: body.archiveBase64,
      });
      return jsonResponse({ success: true, installedSkillNames }, 201);
    },
  });

  // POST /admin/system/skills/delete
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/skills/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteSystemSkillSchema);
      await deleteGlobalSkill({
        workspaceBasePath,
        skillName: body.skillName,
      });
      return jsonResponse({ success: true, skillName: body.skillName });
    },
  });

  // POST /admin/system/llm/price/upsert
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/llm/price/upsert',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, upsertLlmModelPriceSchema);
      return jsonResponse(await llmModelPrices.upsertPrice(body));
    },
  });

  // POST /admin/system/integration/upsert
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/integration/upsert',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, upsertSystemIntegrationSchema);
      return jsonResponse(await integrations.upsert(body));
    },
  });

  // POST /admin/system/integration/delete
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/integration/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteSystemIntegrationSchema);
      await integrations.delete({ id: body.integrationId });
      return jsonResponse({ success: true, integrationId: body.integrationId });
    },
  });

  // POST /admin/system/llm/profile/upsert
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/llm/profile/upsert',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, upsertLlmProfileSchema);
      return jsonResponse(await llmSettings.upsertProfile(body));
    },
  });

  // POST /admin/system/llm/profile/delete
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/llm/profile/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteLlmProfileSchema);
      await llmSettings.deleteProfile({ profileId: body.profileId });
      return jsonResponse({ success: true, profileId: body.profileId });
    },
  });

  // POST /admin/system/llm/defaults/update
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/llm/defaults/update',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, updateLlmDefaultsSchema);
      return jsonResponse(await llmSettings.updateDefaults(body));
    },
  });

  // POST /admin/system/oauth/sync
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/oauth/sync',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, syncOauthSchema);
      const providerIds: Array<'openai-codex' | 'anthropic'> =
        body.providerId === 'all' ? ['openai-codex', 'anthropic'] : [body.providerId];
      const results: Array<{ providerId: 'openai-codex' | 'anthropic'; synced: boolean; error?: string }> = [];

      for (const providerId of providerIds) {
        try {
          if (providerId === 'openai-codex') {
            await syncOpenAICodexCredential();
          } else {
            await syncAnthropicCredential();
          }
          results.push({ providerId, synced: true });
        } catch (error) {
          results.push({
            providerId,
            synced: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return jsonResponse({ state: await buildOauthState(), results });
    },
  });
}
