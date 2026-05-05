import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import v8 from 'node:v8';
import { createClient } from '@libsql/client';
import {
  getAnthropicCliAuthFilePath,
  getAnthropicSetupTokenFilePath,
  getOpenAICodexCliAuthFilePath,
  LibsqlConversationStore,
  oauthStore,
  syncAnthropicCredential,
  syncOpenAICodexCredential,
  forgeDebug,
  toMastraSafeIdentifier,
} from '@forge-runtime/core';

import type { Database } from '../database/index';
import type { AgentLoaderConfig } from '../agents/agent-loader';
import { loadAgent } from '../agents/agent-loader';
import { getInternalAgentRegistry } from '../agents/internal-agent-registry';
import { createCapabilityStore } from '../capabilities/store';
import {
  changeAgentRoleFromAdmin,
  reloadAgentIfLoaded,
  reloadAgentsForRole,
  updateInternalChatProviderProfile,
} from '../capabilities/runtime';
import type { createForgeHttpServer } from '../http/server';
import type { createAgentScheduleManager } from '../schedules/manager';
import { createAdminReadModel } from './read-model';
import { createFinanceReadModel } from './read-model/finance';
import { getFinanceOverview } from './read-model/finance-overview';
import { createCompanyPayables } from '../finance/company-payables';
import { getRecurringPayables } from './read-model/payables-overview';
import { createMicroErpReadModel } from '../micro-erp/read-model';
import { runInternalHiring, runInternalTermination } from '../agents/internal-agent-lifecycle';
import type { AgentEmailManager } from '../email/migadu-manager';
import type { CoolifyManager } from '../coolify/manager';
import type { GitHubAppManager } from '../github/manager';
import {
  agentCheckpointedOmStates,
  agentLongTermMemoryStates,
  agentLongTermMemoryRecallStates,
  agentMcpConfigs,
  agents,
  agentProviders,
  agentRoles,
  mcpServerConfigs,
} from '../database/schema';
import { encryptSecret } from '../encryption/crypto';
import { parseProviderCredentials } from '../communication/provider-loader';
import { createId } from '../utils/id';
import { createSystemIntegrationStore } from '../system-integrations/store';
import type { InternalChatService } from '../communication/internal-chat-service';
import { createCompanyCashOperations } from '../finance/company-cash-operations';
import { createCompanyPayables } from '../finance/company-payables';
import { createLlmSettingsStore } from '../llm/settings-store';
import { createLlmModelPriceStore } from '../llm/model-price-store';
import { topUpActiveAgentContract } from '../agents/top-up-agent-contract';
import { adjustAgentContractBudget } from '../agents/adjust-agent-contract-budget';
import { renewAgentContract } from '../agents/renew-agent-contract';
import { createSystemSettingsStore } from '../system-settings/store';
import { createAgentContractStore } from '../agents/agent-contract-store';
import {
  deleteAgentWorkspaceSkill,
  installAgentWorkspaceSkillsFromZip,
} from '../agents/workspace-skills';
import {
  deleteGlobalSkill,
  installGlobalSkillToAgentWorkspace,
  installGlobalSkillsFromZip,
  listGlobalSkills,
  publishAgentWorkspaceSkillToGlobalCatalog,
} from '../agents/global-skills';

import { mcpServerFieldsSchema, discordProviderDeleteSignalSchema } from './schemas.js';
import { registerInternalChatRoutes } from './routes/internal-chat/index.js';
import {
  registerAgentReadRoutes,
  registerAgentOperationRoutes,
  registerAgentWriteOpsRoutes,
  registerAgentStepsRoutes,
  registerAgentConversationsRoutes,
  registerAgentMemoryRoutes,
  registerAgentMetricsRoutes,
  registerAgentContractRoutes,
  registerAgentMcpRoutes,
  registerAgentSchedulesRoutes,
  registerAgentNotificationsRoutes,
} from './routes/agents/index.js';
import {
  normalizeOptionalText,
  normalizeJsonText,
  parseJsonBody,
  jsonResponse,
  summarizeHealthcheckThreadMessage,
  extractLatestHealthcheckMessagePreview,
  summarizeActiveItems,
} from './routes/helpers.js';

export * from './routes/schemas.js';
import { registerFinanceReadRoutes, registerFinanceWriteRoutes } from './routes/finance/index.js';
import { registerWebhookAdminRoutes } from './routes/webhooks/index.js';
import { createWebhookStore } from '../webhooks/store';
import { createWebhookHandler } from '../webhooks/handler';

import { registerSystemReadRoutes, registerSystemWriteRoutes } from './routes/system/index.js';
import { reloadAgentMcp, reloadLinkedAgentsForMcpServer } from './routes/mcp-helpers.js';


export interface AdminRouteContext {
  db: Database;
  httpServer: ReturnType<typeof createForgeHttpServer>;
  loaderConfig: AgentLoaderConfig;
  schedules: ReturnType<typeof createAgentScheduleManager>;
  workspaceBasePath: string;
  githubApps: GitHubAppManager;
  emailMailboxes: AgentEmailManager | null;
  coolify: CoolifyManager | null;
  integrations: ReturnType<typeof createSystemIntegrationStore>;
  internalChat: InternalChatService;
}

export function registerAdminRoutes(input: AdminRouteContext) {
  const readModel = createAdminReadModel({
    db: input.db,
    workspaceBasePath: input.workspaceBasePath,
    githubApps: input.githubApps,
    internalChat: input.internalChat,
  });

  // Inline finance read model (extracted from createAdminReadModel)
  const finance = createMicroErpReadModel(input.db);
  const payables = createCompanyPayables(input.db);
  const financeRM = createFinanceReadModel({ db: input.db });
  const financeReadModel = {
    getFinance: async () => {
      const [overview, recurringPayables] = await Promise.all([
        getFinanceOverview(finance),
        getRecurringPayables(payables),
      ]);
      return { ...overview, recurringPayables };
    },
    getFinanceContracts: financeRM.getFinanceContracts,
  };

  const capabilities = createCapabilityStore(input.db);
  const integrations = input.integrations;
  const llmSettings = createLlmSettingsStore(input.db);
  const llmModelPrices = createLlmModelPriceStore(input.db);
  const systemSettings = createSystemSettingsStore(input.db);
  const agentContracts = createAgentContractStore(input.db);
  const registry = getInternalAgentRegistry();
  const companyCash = createCompanyCashOperations(input.db);
  const companyPayables = createCompanyPayables(input.db);

  // Agent operations bundle (used by write-ops routes)
  const ops = {
    loadAgent,
    topUpActiveAgentContract,
    adjustAgentContractBudget,
    renewAgentContract,
    runInternalHiring,
    runInternalTermination,
    changeAgentRoleFromAdmin,
  };

  // Pass the real registry to submodules (FIX #1046: was previously a snapshot copy)
  registerAgentOperationRoutes(input.httpServer, { internalChat: input.internalChat }, registry);
  registerAgentWriteOpsRoutes(input.httpServer, input, registry, ops);

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/overview',
    handler: async () => {
      try {
        return jsonResponse(await readModel.getDashboard());
      } catch (err) {
        console.error('[/admin/overview] Error:', err);
        return jsonResponse({ error: 'Internal error' }, 500);
      }
    },
  });
  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/roles',
    handler: async () => jsonResponse(await readModel.listRoles()),
  });

  // System GET routes (extracted to ./routes/system/read.ts)
  registerSystemReadRoutes({
    httpServer: input.httpServer,
    db: input.db,
    registry,
    readModel,
    workspaceBasePath: input.workspaceBasePath,
  });

  // Finance GET routes (extracted to ./routes/finance/read.ts)
  registerFinanceReadRoutes(input.httpServer, financeReadModel);

  // Fragmented agent detail routes (#1587)
  registerAgentStepsRoutes(input.httpServer, {
    listAgentExecutionSteps: readModel.listAgentExecutionSteps,
    listAgentRecentConversations: readModel.listAgentRecentConversations,
    getAgentRuntimeMemory: readModel.getAgentRuntimeMemory,
    listRecentAgentHomeMetricSnapshots: readModel.listRecentAgentHomeMetricSnapshots,
  });
  registerAgentConversationsRoutes(input.httpServer, {
    listAgentExecutionSteps: readModel.listAgentExecutionSteps,
    listAgentRecentConversations: readModel.listAgentRecentConversations,
    getAgentRuntimeMemory: readModel.getAgentRuntimeMemory,
    listRecentAgentHomeMetricSnapshots: readModel.listRecentAgentHomeMetricSnapshots,
  });
  registerAgentMemoryRoutes(input.httpServer, {
    listAgentExecutionSteps: readModel.listAgentExecutionSteps,
    listAgentRecentConversations: readModel.listAgentRecentConversations,
    getAgentRuntimeMemory: readModel.getAgentRuntimeMemory,
    listRecentAgentHomeMetricSnapshots: readModel.listRecentAgentHomeMetricSnapshots,
  });
  registerAgentMetricsRoutes(input.httpServer, {
    listAgentExecutionSteps: readModel.listAgentExecutionSteps,
    listAgentRecentConversations: readModel.listAgentRecentConversations,
    getAgentRuntimeMemory: readModel.getAgentRuntimeMemory,
    listRecentAgentHomeMetricSnapshots: readModel.listRecentAgentHomeMetricSnapshots,
  });
  registerAgentContractRoutes(input.httpServer, {
    listAgentContracts: readModel.listAgentContracts,
  });
  registerAgentMcpRoutes(input.httpServer, {
    listAgentMcpServers: readModel.listAgentMcpServers,
  });
  registerAgentSchedulesRoutes(input.httpServer, {
    listAgentSchedules: readModel.listAgentSchedules,
  });
  registerAgentNotificationsRoutes(input.httpServer, {
    listAgentNotifications: readModel.listAgentNotifications,
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-provider/upsert',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, upsertAgentProviderSchema);
        if (body.providerType === 'discord') {
          const deleteSignal = discordProviderDeleteSignalSchema.parse(body.credentials);

          if (deleteSignal.token.trim().length === 0) {
            await input.db
              .delete(agentProviders)
              .where(
                and(
                  eq(agentProviders.agentId, body.agentId),
                  eq(agentProviders.providerType, body.providerType),
                ),
              );

            await reloadAgentIfLoaded(input.db, input.loaderConfig, body.agentId);

            return jsonResponse({ success: true, agentId: body.agentId, providerType: body.providerType });
          }
        }

        const credentials = parseProviderCredentials(body.providerType, body.credentials);
        const encryptedCredentials = encryptSecret(JSON.stringify(credentials));
        const existing = await input.db.query.agentProviders.findFirst({
          where: and(
            eq(agentProviders.agentId, body.agentId),
            eq(agentProviders.providerType, body.providerType),
          ),
        });

        if (existing) {
          await input.db
            .update(agentProviders)
            .set({
              encryptedCredentials,
            })
            .where(eq(agentProviders.id, existing.id));
        } else {
          await input.db.insert(agentProviders).values({
            id: createId(),
            agentId: body.agentId,
            providerType: body.providerType,
            encryptedCredentials,
            createdAt: Date.now(),
          });
        }

        await reloadAgentIfLoaded(input.db, input.loaderConfig, body.agentId);

        return jsonResponse({ success: true, agentId: body.agentId, providerType: body.providerType });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-provider/delete',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, deleteAgentProviderSchema);

        await input.db
          .delete(agentProviders)
          .where(
            and(
              eq(agentProviders.agentId, body.agentId),
              eq(agentProviders.providerType, body.providerType),
            ),
          );

        await reloadAgentIfLoaded(input.db, input.loaderConfig, body.agentId);

        return jsonResponse({ success: true, agentId: body.agentId, providerType: body.providerType });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-mcp/create',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, createAgentMcpServerSchema);
        const timestamp = new Date().toISOString();
        const serverId = createId();
        const configId = createId();

        await input.db.insert(mcpServerConfigs).values({
          id: serverId,
          name: body.name,
          description: normalizeOptionalText(body.description),
          transport: body.transport,
          command: body.transport === 'stdio' ? body.command : null,
          args: body.transport === 'stdio' ? normalizeJsonText(body.argsText, 'argsText', 'array') : null,
          envVars: body.transport === 'stdio' ? normalizeJsonText(body.envVarsText, 'envVarsText', 'object') : null,
          url: body.transport === 'http_streamable' ? body.url : null,
          headers: body.transport === 'http_streamable' ? normalizeJsonText(body.headersText, 'headersText', 'object') : null,
          version: 1,
          isActive: body.isActive ? 1 : 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        await input.db.insert(agentMcpConfigs).values({
          id: configId,
          agentId: body.agentId,
          serverId,
          isActive: body.isActive ? 1 : 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        await reloadAgentMcp(input.db, input.loaderConfig, body.agentId);

        return jsonResponse({ success: true, agentId: body.agentId, configId, serverId }, 201);
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed', context: { error } });
        return jsonResponse({ error: error instanceof Exception ? error.message : String(error) }, 500);
      }
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-mcp/update',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, updateAgentMcpServerSchema);
        const timestamp = new Date().toISOString();

        await input.db
          .update(mcpServerConfigs)
          .set({
            name: body.name,
            description: normalizeOptionalText(body.description),
            transport: body.transport,
            command: body.transport === 'stdio' ? body.command : null,
            args: body.transport === 'stdio' ? normalizeJsonText(body.argsText, 'argsText', 'array') : null,
            envVars: body.transport === 'stdio' ? normalizeJsonText(body.envVarsText, 'envVarsText', 'object') : null,
            url: body.transport === 'http_streamable' ? body.url : null,
            headers: body.transport === 'http_streamable' ? normalizeJsonText(body.headersText, 'headersText', 'object') : null,
            isActive: body.isActive ? 1 : 0,
            updatedAt: timestamp,
          })
          .where(eq(mcpServerConfigs.id, body.serverId));

        await input.db
          .update(agentMcpConfigs)
          .set({
            isActive: body.isActive ? 1 : 0,
            updatedAt: timestamp,
          })
          .where(and(eq(agentMcpConfigs.id, body.configId), eq(agentMcpConfigs.agentId, body.agentId)));

        await reloadAgentMcp(input.db, input.loaderConfig, body.agentId);

        return jsonResponse({ success: true, agentId: body.agentId, configId: body.configId, serverId: body.serverId });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-mcp/delete',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, deleteAgentMcpServerSchema);

        await input.db
          .delete(agentMcpConfigs)
          .where(and(eq(agentMcpConfigs.id, body.configId), eq(agentMcpConfigs.agentId, body.agentId)));

        const remainingLinks = await input.db.query.agentMcpConfigs.findMany({
          where: eq(agentMcpConfigs.serverId, body.serverId),
          columns: {
            id: true,
          },
        });

        if (remainingLinks.length === 0) {
          await input.db.delete(mcpServerConfigs).where(eq(mcpServerConfigs.id, body.serverId));
        }

        await reloadAgentMcp(input.db, input.loaderConfig, body.agentId);

        return jsonResponse({ success: true, agentId: body.agentId, configId: body.configId, serverId: body.serverId });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-mcp/assign',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, assignAgentMcpServerSchema);
        const existing = await input.db.query.agentMcpConfigs.findFirst({
          where: and(
            eq(agentMcpConfigs.agentId, body.agentId),
            eq(agentMcpConfigs.serverId, body.serverId),
          ),
        });

        if (existing) {
          await input.db
            .update(agentMcpConfigs)
            .set({
              isActive: body.isActive ? 1 : 0,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(agentMcpConfigs.id, existing.id));

          await reloadAgentMcp(input.db, input.loaderConfig, body.agentId);

          return jsonResponse({
            success: true,
            agentId: body.agentId,
            configId: existing.id,
            serverId: body.serverId,
          });
        }

        const timestamp = new Date().toISOString();
        const configId = createId();

        await input.db.insert(agentMcpConfigs).values({
          id: configId,
          agentId: body.agentId,
          serverId: body.serverId,
          isActive: body.isActive ? 1 : 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        await reloadAgentMcp(input.db, input.loaderConfig, body.agentId);

        return jsonResponse({ success: true, agentId: body.agentId, configId, serverId: body.serverId }, 201);
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-mcp/set-active',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, setAgentMcpServerActiveSchema);

        await input.db
          .update(agentMcpConfigs)
          .set({
            isActive: body.isActive ? 1 : 0,
            updatedAt: new Date().toISOString(),
          })
          .where(and(eq(agentMcpConfigs.id, body.configId), eq(agentMcpConfigs.agentId, body.agentId)));

        await reloadAgentMcp(input.db, input.loaderConfig, body.agentId);

        return jsonResponse({
          success: true,
          agentId: body.agentId,
          configId: body.configId,
          isActive: body.isActive,
        });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-mcp/detach',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, detachAgentMcpServerSchema);
        const config = await input.db.query.agentMcpConfigs.findFirst({
          where: and(eq(agentMcpConfigs.id, body.configId), eq(agentMcpConfigs.agentId, body.agentId)),
        });

        if (!config) {
          return jsonResponse({ error: `Agent MCP config not found: ${body.configId}` }, 404);
        }

        await input.db.delete(agentMcpConfigs).where(eq(agentMcpConfigs.id, body.configId));
        await reloadAgentMcp(input.db, input.loaderConfig, body.agentId);

        return jsonResponse({
          success: true,
          agentId: body.agentId,
          configId: body.configId,
        });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-skills/upload',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, uploadAgentSkillsSchema);
        const agent = await input.db.query.agents.findFirst({
          where: eq(agents.id, body.agentId),
        });

        if (!agent) {
          return jsonResponse({ error: `Agent not found: ${body.agentId}` }, 404);
        }

        const installedSkillNames = await installAgentWorkspaceSkillsFromZip({
          workspaceBasePath: input.workspaceBasePath,
          agent,
          zipBase64: body.archiveBase64,
        });

        // Mastra exposes workspace skill refresh APIs (for example workspace.skills.refresh()).
        // Reload is acceptable here because skill changes are rare, but this is the place to
        // switch to explicit skill refresh if we want to avoid full runtime recreation later.
        await reloadAgentIfLoaded(input.db, input.loaderConfig, body.agentId);

        return jsonResponse({
          success: true,
          agentId: body.agentId,
          installedSkillNames,
        }, 201);
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-skills/delete',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, deleteAgentSkillSchema);
        const agent = await input.db.query.agents.findFirst({
          where: eq(agents.id, body.agentId),
        });

        if (!agent) {
          return jsonResponse({ error: `Agent not found: ${body.agentId}` }, 404);
        }

        await deleteAgentWorkspaceSkill({
          workspaceBasePath: input.workspaceBasePath,
          agent,
          skillName: body.skillName,
        });

        // Mastra exposes workspace skill refresh APIs (for example workspace.skills.refresh()).
        // Reload is acceptable here because skill changes are rare, but this is the place to
        // switch to explicit skill refresh if we want to avoid full runtime recreation later.
        await reloadAgentIfLoaded(input.db, input.loaderConfig, body.agentId);

        return jsonResponse({
          success: true,
          agentId: body.agentId,
          skillName: body.skillName,
        });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-skills/install-global',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, installGlobalSkillForAgentSchema);
        const agent = await input.db.query.agents.findFirst({
          where: eq(agents.id, body.agentId),
        });

        if (!agent) {
          return jsonResponse({ error: `Agent not found: ${body.agentId}` }, 404);
        }

        await installGlobalSkillToAgentWorkspace({
          workspaceBasePath: input.workspaceBasePath,
          agent,
          skillName: body.skillName,
        });

        await reloadAgentIfLoaded(input.db, input.loaderConfig, body.agentId);

        return jsonResponse({
          success: true,
          agentId: body.agentId,
          skillName: body.skillName,
        });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-skills/publish-global',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, publishAgentSkillToGlobalSchema);
        const agent = await input.db.query.agents.findFirst({
          where: eq(agents.id, body.agentId),
        });

        if (!agent) {
          return jsonResponse({ error: `Agent not found: ${body.agentId}` }, 404);
        }

        await publishAgentWorkspaceSkillToGlobalCatalog({
          workspaceBasePath: input.workspaceBasePath,
          agent,
          skillName: body.skillName,
        });

        return jsonResponse({
          success: true,
          agentId: body.agentId,
          skillName: body.skillName,
        });
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-schedule/create',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, createScheduleSchema);
        const scheduleInput = body.scheduleType === 'cron'
          ? {
              name: body.name,
              description: body.description,
              scheduleType: body.scheduleType,
              cronExpression: body.cronExpression!,
              timezone: body.timezone,
              content: body.content,
              wakeWhenRunning: body.wakeWhenRunning,
            }
          : {
              name: body.name,
              description: body.description,
              scheduleType: body.scheduleType,
              scheduledDate: body.scheduledDate!,
              timezone: body.timezone,
              content: body.content,
              wakeWhenRunning: body.wakeWhenRunning,
            };
        const schedule = await input.schedules.createSchedule(body.agentId, scheduleInput);
        return jsonResponse(schedule, 201);
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-schedule/update',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, updateScheduleSchema);
        const schedule = await input.schedules.updateOwnedSchedule(body.agentId, body.scheduleId, {
          name: body.name,
          description: body.description,
          scheduleType: body.scheduleType,
          cronExpression: body.cronExpression,
          scheduledDate: body.scheduledDate,
          timezone: body.timezone,
          content: body.content,
          wakeWhenRunning: body.wakeWhenRunning,
          isActive: body.isActive,
        });
        return jsonResponse(schedule);
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-schedule/delete',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, deleteScheduleSchema);
        const result = await input.schedules.deleteSchedule(body.agentId, body.scheduleId);
        return jsonResponse(result);
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role/create',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, createRoleSchema);
      return jsonResponse(await capabilities.createRole(body), 201);
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Failed to create role', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role/update',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, updateRoleSchema);
        const result = await capabilities.updateRole(body);
        void reloadAgentsForRole(input.db, input.loaderConfig, body.roleId).catch((error) => {
          forgeDebug({ scope: 'admin', level: 'error', message: 'Failed to reload agents for role', context: { roleId: body.roleId, error } });
        });
        return jsonResponse(result);
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Failed to update role', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role/delete',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, deleteRoleSchema);
        return jsonResponse(await capabilities.deleteRole(body.roleId));
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Failed to delete role', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role-capability/add',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, roleCapabilitySchema);
        const result = await capabilities.manageRoleCapability({
          action: 'add',
          roleId: body.roleId,
          capabilityId: body.capabilityId,
        });
        await reloadAgentsForRole(input.db, input.loaderConfig, body.roleId);
        return jsonResponse(result);
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Failed to add role capability', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role-capability/remove',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, roleCapabilitySchema);
        const result = await capabilities.manageRoleCapability({
          action: 'remove',
          roleId: body.roleId,
          capabilityId: body.capabilityId,
        });
        await reloadAgentsForRole(input.db, input.loaderConfig, body.roleId);
        return jsonResponse(result);
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Failed to remove role capability', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role-tool-permission/add',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, roleToolPermissionSchema);
        const result = await capabilities.addRoleToolPermission(body);
        await reloadAgentsForRole(input.db, input.loaderConfig, body.roleId);
        return jsonResponse(result);
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Failed to add role tool permission', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role-workflow-permission/add',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, roleWorkflowPermissionSchema);
        const result = await capabilities.addRoleWorkflowPermission(body);
        await reloadAgentsForRole(input.db, input.loaderConfig, body.roleId);
        return jsonResponse(result);
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Failed to add role workflow permission', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role-workflow-permission/remove',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, roleWorkflowPermissionSchema);
        const result = await capabilities.removeRoleWorkflowPermission(body);
        await reloadAgentsForRole(input.db, input.loaderConfig, body.roleId);
        return jsonResponse(result);
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Failed to remove role workflow permission', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/role-tool-permission/remove',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, roleToolPermissionSchema);
        const result = await capabilities.removeRoleToolPermission(body);
        await reloadAgentsForRole(input.db, input.loaderConfig, body.roleId);
        return jsonResponse(result);
      } catch (error) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Failed to remove role tool permission', context: { error } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // System POST routes (extracted to ./routes/system/write.ts)
  registerSystemWriteRoutes({
    httpServer: input.httpServer,
    db: input.db,
    workspaceBasePath: input.workspaceBasePath,
    loaderConfig: input.loaderConfig,
    registry,
    loadAgent,
    systemSettings,
    llmSettings,
    llmModelPrices,
    integrations,
  });

  registerFinanceWriteRoutes(input.httpServer, {
    companyCash,
    companyPayables,
  });

  const webhookStore = createWebhookStore(input.db);
  const webhookHandler = createWebhookHandler({
    store: webhookStore,
    notifyAgent(input) {
      const entry = registry.get(input.agentId);
      if (!entry) { return; }
      entry.runner.notifyExternalEvent({
        type: input.type,
        groupKey: input.groupKey,
        idempotencyKey: input.idempotencyKey,
        text: input.content,
        timestamp: input.timestamp,
      });
    },
  });

  // Public webhook endpoint: POST /webhooks/:routeId
  input.httpServer.registerRoute({
    method: 'POST',
    path: '/webhooks/:routeId',
    handler: (req) => webhookHandler.handleWebhook(req),
  });

  registerWebhookAdminRoutes(input.httpServer, webhookStore);
}

