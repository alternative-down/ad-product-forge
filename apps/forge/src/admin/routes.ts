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

import type {Database} from '../database/client'
import type { AgentLoaderConfig } from '../agents/agent-loader';
import { loadAgent } from '../agents/agent-loader';
import { getInternalAgentRegistry, createPerAgentEmailManager } from '../agents/internal-agent-registry';
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
import { createCompanyPayables } from '../finance/company-payables';
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
import { createMicroErpReadModel } from '../micro-erp/read-model';
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
import { registerAgentProviderMcpRoutes } from './routes/agents/provider-mcp.js';
import { registerInternalChatRoutes } from './routes/internal-chat/index.js';
import { registerAgentReadRoutes } from './routes/agents/read.js';
import { registerAgentWriteRoutes } from './routes/agents/write.js';
import { registerAgentOperationRoutes } from './routes/agents/operations.js';
import { registerAgentWriteOpsRoutes } from './routes/agents/write-ops.js';
import { registerAgentSkillsWriteRoutes } from './routes/agents/skills-write.js';
import { registerAgentSchedulesWriteRoutes } from './routes/agents/schedule-write.js';
import {
  normalizeOptionalText,
  normalizeJsonText,
  parseJsonBody,
  jsonResponse,
  summarizeHealthcheckThreadMessage,
  extractLatestHealthcheckMessagePreview,
  summarizeActiveItems,
} from './routes/helpers.js';

import { registerFinanceReadRoutes } from './routes/finance/read.js';
import { registerFinanceWriteRoutes } from './routes/finance/write.js';
import { registerWebhookAdminRoutes } from './routes/webhooks/register';
import { createWebhookStore } from '../webhooks/store';
import { createWebhookHandler } from '../webhooks/handler';

import { registerSystemReadRoutes } from './routes/system/read.js';
import { registerSystemWriteRoutes } from './routes/system/write.js';
import { registerDashboardRoutes } from './routes/dashboard';
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

  // Per-agent email manager for admin route operations (hire/terminate)
  const emailMailboxes = createPerAgentEmailManager(input.db);

  // Stores created locally in route files (finance in finance/read.ts)
  const finance = createMicroErpReadModel(input.db);
  const payables = createCompanyPayables(input.db);
  const companyPayables = createCompanyPayables(input.db);
  const capabilities = createCapabilityStore(input.db);
  const integrations = input.integrations;
  const llmSettings = createLlmSettingsStore(input.db);
  const llmModelPrices = createLlmModelPriceStore(input.db);
  const systemSettings = createSystemSettingsStore(input.db);
  const agentContracts = createAgentContractStore(input.db);
  const systemRM = createSystemReadModel({ db: input.db });
  const registry = getInternalAgentRegistry();
  const companyCash = createCompanyCashOperations(input.db);

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


  registerAgentSkillsWriteRoutes(input.httpServer, {
    db: input.db,
    loaderConfig: input.loaderConfig,
    workspaceBasePath: input.workspaceBasePath,
  });
  registerAgentSchedulesWriteRoutes(input.httpServer, {
    schedules: input.schedules,
  });
  registerAgentWriteOpsRoutes(input.httpServer, input, registry, ops);

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/overview',
    handler: async () => jsonResponse(await readModel.getDashboard()),
  });
  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/roles',
    handler: async () => jsonResponse(await readModel.listRoles()),
  });

  // Dashboard overview and roles (extracted to ./routes/dashboard.ts)
  // Tech-debt: simple overview/roles are still registered above (#1874 duplicates)
  registerDashboardRoutes({
    httpServer: input.httpServer,
    db: input.db,
    registry,
    finance,
    readModel,
    systemRM,
  });

  // System GET routes (extracted to ./routes/system/read.ts)
  registerSystemReadRoutes({
    httpServer: input.httpServer,
    db: input.db,
    registry,
    workspaceBasePath: input.workspaceBasePath,
    capabilities,
    integrations,
    llmSettings,
    llmModelPrices,
    systemSettings,
    readModel: {
      getAgent: readModel.getAgent,
      getApplicationMigrations: readModel.getApplicationMigrations,
    },
  });

  // Finance GET routes (extracted to ./routes/finance/read.ts)
  registerFinanceReadRoutes(input.httpServer, input.db, finance, companyPayables);

  // Fragmented agent detail routes (#1587) — stores created directly in route files (#1574)
  registerAgentBaseRoutes(input.httpServer, input.db, {
    getAgent: readModel.getAgent,
  });
  registerAgentStepsRoutes(input.httpServer, input.db);
  registerAgentConversationsRoutes(input.httpServer, {
    listAgentRecentConversations: readModel.listAgentRecentConversations,
  });
  registerAgentMemoryRoutes(input.httpServer, {
    getAgentRuntimeMemory: readModel.getAgentRuntimeMemory,
  });
  registerAgentMetricsRoutes(input.httpServer, input.db);
  registerAgentContractRoutes(input.httpServer, input.db);
  registerAgentMcpRoutes(input.httpServer, input.db);
  registerAgentSchedulesRoutes(input.httpServer, input.db);
  registerAgentNotificationsRoutes(input.httpServer, input.db);


  // Agent provider (credentials) and MCP server routes (extracted to ./routes/agents/provider-mcp.ts)
  // NOTE: role routes still inline (#1874 iter 2)
  registerAgentProviderMcpRoutes({
    httpServer: input.httpServer,
    db: input.db,
    loaderConfig: input.loaderConfig,
  });


  input.httpServer.registerRoute({
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

