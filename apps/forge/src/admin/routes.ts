import { z as _z } from 'zod';
import { eq as _eq, and as _and } from 'drizzle-orm';
import * as _fs from 'node:fs';
import * as _fsPromises from 'node:fs/promises';
import * as _path from 'node:path';
import * as _v8 from 'node:v8';
import { createClient as _createClient } from '@libsql/client';
import {
  getAnthropicCliAuthFilePath as _getAnthropicCliAuthFilePath,
  getAnthropicSetupTokenFilePath as _getAnthropicSetupTokenFilePath,
  getOpenAICodexCliAuthFilePath as _getOpenAICodexCliAuthFilePath,
  LibsqlConversationStore as _LibsqlConversationStore,
  oauthStore as _oauthStore,
  syncAnthropicCredential as _syncAnthropicCredential,
  syncOpenAICodexCredential as _syncOpenAICodexCredential,
  forgeDebug as _forgeDebug,
  toMastraSafeIdentifier as _toMastraSafeIdentifier,
} from '@forge-runtime/core';

import type { Database } from '../database/client';
import type { AgentLoaderConfig } from '../agents/agent-loader';
import { loadAgent } from '../agents/agent-loader';
import {
  getInternalAgentRegistry,
  createPerAgentEmailManager,
} from '../agents/internal-agent-registry';
import { createCapabilityStore } from '../capabilities/store';
import { changeAgentRoleFromAdmin } from '../capabilities/runtime';
import type { createForgeHttpServer } from '../http/server';
import type { createAgentScheduleManager } from '../schedules/manager';
import { createCompanyPayables } from '../finance/company-payables';
import { createAdminReadModel } from './read-model';
import { createSystemReadModel } from './read-model/system';
import { createMicroErpReadModel } from '../micro-erp/read-model';
import { runInternalHiring, runInternalTermination } from '../agents/internal-agent-lifecycle';
import type { AgentEmailManager } from '../email/migadu-manager';
import type { CoolifyManager } from '../coolify/manager';
import type { GitHubAppManager } from '../github/manager';
import {
  agentCheckpointedOmStates as _agentCheckpointedOmStates,
  agentLongTermMemoryStates as _agentLongTermMemoryStates,
  agentLongTermMemoryRecallStates as _agentLongTermMemoryRecallStates,
  agentMcpConfigs as _agentMcpConfigs,
  agents as _agents,
  agentProviders as _agentProviders,
  agentRoles as _agentRoles,
  mcpServerConfigs as _mcpServerConfigs,
} from '../database/schema';
import { encryptSecret as _encryptSecret } from '../encryption/crypto';
import { createId as _createId } from '../utils/id';
import { createSystemIntegrationStore } from '../system-integrations/store';
import type { InternalChatService } from '../communication/internal-chat-service';
import { createCompanyCashOperations } from '../finance/company-cash-operations';
import { createLlmSettingsStore } from '../llm/settings-store';
import { createLlmModelPriceStore } from '../llm/model-price-store';
import { topUpActiveAgentContract } from '../agents/top-up-agent-contract';
import { adjustAgentContractBudget } from '../agents/adjust-agent-contract-budget';
import { renewAgentContract } from '../agents/renew-agent-contract';
import { createSystemSettingsStore } from '../system-settings/store';
import { createAgentContractStore } from '../agents/agent-contract-store';
import {
  deleteAgentWorkspaceSkill as _deleteAgentWorkspaceSkill,
  installAgentWorkspaceSkillsFromZip as _installAgentWorkspaceSkillsFromZip,
} from '../agents/workspace-skills';
import {
  deleteGlobalSkill as _deleteGlobalSkill,
  installGlobalSkillToAgentWorkspace as _installGlobalSkillToAgentWorkspace,
  installGlobalSkillsFromZip as _installGlobalSkillsFromZip,
  listGlobalSkills as _listGlobalSkills,
  publishAgentWorkspaceSkillToGlobalCatalog as _publishAgentWorkspaceSkillToGlobalCatalog,
} from '../agents/global-skills';

import {
  roleToolPermissionSchema as _roleToolPermissionSchema,
  roleWorkflowPermissionSchema as _roleWorkflowPermissionSchema} from './schemas';
import {
  updateRoleSchema as _updateRoleSchema,
  deleteRoleSchema as _deleteRoleSchema,
  roleCapabilitySchema as _roleCapabilitySchema,
} from './routes/schemas/roles';
import { registerInternalChatRoutes as _registerInternalChatRoutes } from './routes/internal-chat/index';
import {
  registerAgentBaseRoutes,
  registerAgentStepsRoutes,
  registerAgentConversationsRoutes,
  registerAgentMemoryRoutes,
  registerAgentMetricsRoutes,
  registerAgentContractRoutes,
  registerAgentMcpRoutes,
  registerAgentSchedulesRoutes,
  registerAgentNotificationsRoutes,
  registerAgentProviderMcpRoutes,
} from './routes/agents/detail-read';
import { registerAgentReadRoutes as _registerAgentReadRoutes } from './routes/agents/read';
import { registerAgentWriteRoutes as _registerAgentWriteRoutes } from './routes/agents/write';
import { registerAgentOperationRoutes } from './routes/agents/operations';
import { registerAgentWriteOpsRoutes } from './routes/agents/write-ops';
import { registerAgentSkillsWriteRoutes } from './routes/agents/skills-write';
import { registerAgentSchedulesWriteRoutes } from './routes/agents/schedule-write';
import {
  normalizeOptionalText as _normalizeOptionalText,
  normalizeJsonText as _normalizeJsonText,
  parseJsonBody as _parseJsonBody,
  jsonResponse as _jsonResponse,
  summarizeHealthcheckThreadMessage as _summarizeHealthcheckThreadMessage,
  extractLatestHealthcheckMessagePreview as _extractLatestHealthcheckMessagePreview,
  summarizeActiveItems as _summarizeActiveItems,
} from './routes/helpers';

import { registerFinanceReadRoutes } from './routes/finance/read';
import { registerFinanceWriteRoutes } from './routes/finance/write';
import { registerAdminWebhooks } from './routes/webhooks/register';

import { registerSystemReadRoutes } from './routes/system/read';
import { registerSystemWriteRoutes } from './routes/system/write';
import { registerDashboardRoutes } from './routes/dashboard';
import {
  reloadAgentMcp as _reloadAgentMcp,
  reloadLinkedAgentsForMcpServer as _reloadLinkedAgentsForMcpServer,
} from './routes/mcp-helpers';

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const emailMailboxes = createPerAgentEmailManager(input.db);

  // Stores created locally in route files (finance in finance/read.ts)
  const finance = createMicroErpReadModel(input.db);
  const companyPayables = createCompanyPayables(input.db);
  const capabilities = createCapabilityStore(input.db);
  const integrations = input.integrations;
  const llmSettings = createLlmSettingsStore(input.db);
  const llmModelPrices = createLlmModelPriceStore(input.db);
  const systemSettings = createSystemSettingsStore(input.db);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  registerAgentOperationRoutes(
    input.httpServer,
    { internalChat: input.internalChat },
    registry,
  );

  registerAgentSkillsWriteRoutes(input.httpServer, {
    db: input.db,
    loaderConfig: input.loaderConfig,
    workspaceBasePath: input.workspaceBasePath,
  });
  registerAgentSchedulesWriteRoutes(input.httpServer, {
    schedules: input.schedules,
  });
  registerAgentWriteOpsRoutes(input.httpServer, input, registry, ops);

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
  registerFinanceReadRoutes(input.httpServer, input.db);

  // Fragmented agent detail routes (#1587) — stores created directly in route files (#1574)
  registerAgentBaseRoutes(input.httpServer, readModel.getAgent);
  registerAgentStepsRoutes(input.httpServer, input.db);
  registerAgentConversationsRoutes(input.httpServer, readModel.listAgentRecentConversations);
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

  // registerRoleRoutes({ httpServer: input.httpServer, db: input.db, loaderConfig: input.loaderConfig });

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

  registerAdminWebhooks({
    httpServer: input.httpServer,
    db: input.db,
    registry,
  });
}
