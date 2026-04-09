import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import fs from 'node:fs';
import {
  getAnthropicCliAuthFilePath,
  getAnthropicSetupTokenFilePath,
  getOpenAICodexCliAuthFilePath,
  oauthStore,
  syncAnthropicCredential,
  syncOpenAICodexCredential,
} from '@mastra-engine/core';

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
import { runInternalHiring, runInternalTermination } from '../agents/internal-agent-lifecycle';
import type { AgentEmailManager } from '../email/migadu-manager';
import type { CoolifyManager } from '../coolify/manager';
import type { GitHubAppManager } from '../github/manager';
import {
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
import { createSystemSettingsStore } from '../system-settings/store';
import { clearAgentMCPClient } from '../agents/mcp/client-manager';
import {
  deleteAgentWorkspaceSkill,
  installAgentWorkspaceSkillsFromZip,
} from '../agents/workspace-skills';

const agentIdQuerySchema = z.object({
  agentId: z.string().min(1),
});

const agentExecutionStepsQuerySchema = z.object({
  agentId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const agentThreadMessagesQuerySchema = z.object({
  agentId: z.string().min(1),
  page: z.coerce.number().int().min(0).default(0),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

const agentConversationMessagesQuerySchema = z.object({
  agentId: z.string().min(1),
  provider: z.string().min(1),
  targetKey: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const roleToolPermissionSchema = z.object({
  roleId: z.string().min(1),
  toolId: z.string().min(1),
});

const roleWorkflowPermissionSchema = z.object({
  roleId: z.string().min(1),
  workflowId: z.string().min(1),
});

const roleCapabilitySchema = z.object({
  roleId: z.string().min(1),
  capabilityId: z.string().min(1),
});

const createRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const updateRoleSchema = z.object({
  roleId: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
});

const deleteRoleSchema = z.object({
  roleId: z.string().min(1),
});

const createScheduleSchema = z.object({
  agentId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  scheduleType: z.enum(['cron', 'date']),
  cronExpression: z.string().min(1).optional(),
  scheduledDate: z.string().min(1).optional(),
  timezone: z.string().min(1).default('UTC'),
  content: z.string().min(1),
});

const updateScheduleSchema = z.object({
  agentId: z.string().min(1),
  scheduleId: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  scheduleType: z.enum(['cron', 'date']).optional(),
  cronExpression: z.string().min(1).optional().nullable(),
  scheduledDate: z.string().min(1).optional().nullable(),
  timezone: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

const deleteScheduleSchema = z.object({
  agentId: z.string().min(1),
  scheduleId: z.string().min(1),
});

const agentActionSchema = z.object({
  agentId: z.string().min(1),
});

const adminInternalChatSendSchema = z.object({
  agentId: z.string().min(1),
  targetKey: z.string().min(1).optional(),
  senderSlug: z.string().trim().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  senderDisplayName: z.string().trim().min(1),
  content: z.string().trim().min(1),
});

const createExternalInternalChatAccountSchema = z.object({
  slug: z.string().trim().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  displayName: z.string().trim().min(1),
  description: z.string().trim().optional(),
});

const updateExternalInternalChatAccountSchema = z.object({
  accountId: z.string().min(1),
  slug: z.string().trim().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  displayName: z.string().trim().min(1),
  description: z.string().trim().optional(),
});

const deleteExternalInternalChatAccountSchema = z.object({
  accountId: z.string().min(1),
});

const internalChatAccountIdQuerySchema = z.object({
  accountId: z.string().min(1),
});

const internalChatMessagesQuerySchema = z.object({
  accountId: z.string().min(1),
  conversationId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const internalChatMessageAttachmentQuerySchema = z.object({
  accountId: z.string().min(1),
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
  attachmentName: z.string().min(1),
});

const createInternalChatConversationSchema = z.object({
  accountId: z.string().min(1),
  type: z.enum(['dm', 'group']),
  name: z.string().trim().optional(),
  participantAccountIds: z.array(z.string().min(1)).min(1),
});

const sendInternalChatConversationMessageSchema = z.object({
  accountId: z.string().min(1),
  conversationId: z.string().min(1),
  content: z.string().trim().default(''),
  attachments: z.array(z.object({
    name: z.string().min(1),
    contentType: z.string().optional(),
    dataBase64: z.string().min(1),
  })).default([]),
}).refine(
  (value) => value.content.length > 0 || value.attachments.length > 0,
  {
    message: 'Message content or attachments are required.',
  },
);

const updateInternalChatConversationSchema = z.object({
  accountId: z.string().min(1),
  conversationId: z.string().min(1),
  name: z.string().trim().min(1),
});

const archiveInternalChatConversationSchema = z.object({
  accountId: z.string().min(1),
  conversationId: z.string().min(1),
});

const internalChatGroupMembersQuerySchema = z.object({
  accountId: z.string().min(1),
  conversationId: z.string().min(1),
});

const addInternalChatGroupMemberSchema = z.object({
  accountId: z.string().min(1),
  conversationId: z.string().min(1),
  participantAccountId: z.string().min(1),
  role: z.enum(['admin', 'normal']).default('normal'),
});

const updateInternalChatGroupMemberRoleSchema = z.object({
  accountId: z.string().min(1),
  conversationId: z.string().min(1),
  participantAccountId: z.string().min(1),
  role: z.enum(['admin', 'normal']),
});

const removeInternalChatGroupMemberSchema = z.object({
  accountId: z.string().min(1),
  conversationId: z.string().min(1),
  participantAccountId: z.string().min(1),
});

const topUpAgentContractSchema = z.object({
  agentId: z.string().min(1),
  amountUsd: z.coerce.number().positive(),
});

const adjustAgentContractBudgetSchema = z.object({
  agentId: z.string().min(1),
  newBudgetUsd: z.coerce.number().min(0),
});

const hireAgentSchema = z.object({
  hiringRequest: z.string().min(1),
  additionalContext: z.string().optional(),
  weeklyBudgetUsd: z.coerce.number().positive(),
});

const terminateAgentSchema = z.object({
  agentId: z.string().min(1),
});

const changeAgentRoleSchema = z.object({
  agentId: z.string().min(1),
  roleId: z.string().min(1),
});

const updateAgentConfigSchema = z.object({
  agentId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  instructions: z.string().min(1),
  workspaceAutoSync: z.boolean(),
  workspaceBm25: z.boolean(),
  modelProfileId: z.string().min(1),
  omModelProfileId: z.string().min(1),
});

const upsertAgentProviderSchema = z.object({
  agentId: z.string().min(1),
  providerType: z.enum(['discord', 'email']),
  credentials: z.unknown(),
});

const deleteAgentProviderSchema = z.object({
  agentId: z.string().min(1),
  providerType: z.enum(['discord', 'email']),
});

const mcpServerFieldsSchema = z.discriminatedUnion('transport', [
  z.object({
    transport: z.literal('stdio'),
    command: z.string().trim().min(1),
    argsText: z.string().optional().default(''),
    envVarsText: z.string().optional().default(''),
    url: z.string().optional().default(''),
    headersText: z.string().optional().default(''),
  }),
  z.object({
    transport: z.literal('http_streamable'),
    url: z.string().trim().url(),
    headersText: z.string().optional().default(''),
    command: z.string().optional().default(''),
    argsText: z.string().optional().default(''),
    envVarsText: z.string().optional().default(''),
  }),
]);

const createAgentMcpServerSchema = z
  .object({
    agentId: z.string().min(1),
    name: z.string().trim().min(1),
    description: z.string().trim().optional().default(''),
    isActive: z.boolean().default(true),
  })
  .and(mcpServerFieldsSchema);

const updateAgentMcpServerSchema = z
  .object({
    agentId: z.string().min(1),
    configId: z.string().min(1),
    serverId: z.string().min(1),
    name: z.string().trim().min(1),
    description: z.string().trim().optional().default(''),
    isActive: z.boolean().default(true),
  })
  .and(mcpServerFieldsSchema);

const deleteAgentMcpServerSchema = z.object({
  agentId: z.string().min(1),
  configId: z.string().min(1),
  serverId: z.string().min(1),
});

const uploadAgentSkillsSchema = z.object({
  agentId: z.string().min(1),
  archiveBase64: z.string().min(1),
});

const deleteAgentSkillSchema = z.object({
  agentId: z.string().min(1),
  skillName: z.string().min(1),
});

const systemIntegrationProviderSchema = z.enum(['migadu', 'coolify', 'github', 'minimax']);

const upsertSystemIntegrationSchema = z.discriminatedUnion('providerType', [
  z.object({
    providerType: z.literal('migadu'),
    isEnabled: z.boolean().default(true),
    config: z.object({
      apiUser: z.string().email(),
      apiKey: z.string().min(1),
    }),
  }),
  z.object({
    providerType: z.literal('coolify'),
    isEnabled: z.boolean().default(true),
    config: z.object({
      baseUrl: z.string().url(),
      adminToken: z.string().min(1),
      serverId: z.string().min(1),
      destinationId: z.string().min(1),
      applicationsBaseDomain: z.string().min(1).optional(),
    }),
  }),
  z.object({
    providerType: z.literal('github'),
    isEnabled: z.boolean().default(true),
    config: z.object({
      organization: z.string().min(1),
      appHomeUrl: z.string().url(),
    }),
  }),
  z.object({
    providerType: z.literal('minimax'),
    isEnabled: z.boolean().default(true),
    config: z.object({
      apiKey: z.string().min(1),
    }),
  }),
]);

const deleteSystemIntegrationSchema = z.object({
  providerType: systemIntegrationProviderSchema,
});

const upsertLlmProfileSchema = z.object({
  profileId: z.string().min(1).optional(),
  name: z.string().min(1),
  modelKey: z.string().min(1),
  baseUrl: z.string().url().optional().nullable(),
  apiKey: z.string().min(1),
  contractCostMultiplier: z.coerce.number().positive().default(1),
  isEnabled: z.boolean().default(true),
});

const deleteLlmProfileSchema = z.object({
  profileId: z.string().min(1),
});

const updateLlmDefaultsSchema = z.object({
  primaryProfileId: z.string().min(1),
  omProfileId: z.string().min(1),
  hiringRhProfileId: z.string().min(1),
});

const upsertLlmModelPriceSchema = z.object({
  modelKey: z.string().min(1),
  inputPerMillionUsd: z.coerce.number().nonnegative(),
  inputCachePerMillionUsd: z.coerce.number().nonnegative(),
  outputPerMillionUsd: z.coerce.number().nonnegative(),
});

const upsertSystemSettingsSchema = z.object({
  companyName: z.string(),
  companyContext: z.string(),
  stepDelayEnabled: z.boolean().default(true),
});

const oauthSyncProviderSchema = z.enum(['openai-codex', 'anthropic', 'all']);

const syncOauthSchema = z.object({
  providerId: oauthSyncProviderSchema.default('all'),
});

const createInvestmentSchema = z.object({
  amountUsd: z.coerce.number().positive(),
  description: z.string().optional(),
  effectiveAt: z.string().optional(),
});

const createPayableSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('single'),
    name: z.string().min(1),
    description: z.string().optional(),
    amountUsd: z.coerce.number().positive(),
    dueAt: z.string().min(1),
  }),
  z.object({
    kind: z.literal('recurring'),
    name: z.string().min(1),
    description: z.string().optional(),
    amountUsd: z.coerce.number().positive(),
    dueAt: z.string().min(1),
    recurrencePeriod: z.enum(['weekly', 'monthly', 'yearly']),
  }),
]);

const ledgerEntryActionSchema = z.object({
  entryId: z.string().min(1),
  effectiveAt: z.string().optional(),
});

const recurringPayableStatusSchema = z.object({
  payableId: z.string().min(1),
  isActive: z.boolean(),
});

export function registerAdminRoutes(input: {
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
}) {
  const readModel = createAdminReadModel({
    db: input.db,
    workspaceBasePath: input.workspaceBasePath,
    githubApps: input.githubApps,
    internalChat: input.internalChat,
  });
  const capabilities = createCapabilityStore(input.db);
  const integrations = input.integrations;
  const llmSettings = createLlmSettingsStore(input.db);
  const llmModelPrices = createLlmModelPriceStore(input.db);
  const systemSettings = createSystemSettingsStore(input.db);
  const registry = getInternalAgentRegistry();
  const companyCash = createCompanyCashOperations(input.db);
  const companyPayables = createCompanyPayables(input.db);

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/overview',
    handler: async () => jsonResponse(await readModel.getDashboard()),
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agents',
    handler: async () => jsonResponse(await readModel.listAgents()),
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent',
    handler: async (request) => {
      const { agentId } = agentIdQuerySchema.parse({
        agentId: request.query.get('agentId'),
      });
      const agent = await readModel.getAgent(agentId);

      if (!agent) {
        return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
      }

      return jsonResponse(agent);
    },
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/recent-conversations',
    handler: async (request) => {
      const { agentId } = agentIdQuerySchema.parse({
        agentId: request.query.get('agentId'),
      });
      const conversations = await readModel.listAgentRecentConversations(agentId);

      if (!conversations) {
        return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
      }

      return jsonResponse(conversations);
    },
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/execution-steps',
    handler: async (request) => {
      const query = agentExecutionStepsQuerySchema.parse({
        agentId: request.query.get('agentId'),
        limit: request.query.get('limit') ?? undefined,
        offset: request.query.get('offset') ?? undefined,
      });

      return jsonResponse(await readModel.listAgentExecutionSteps(query));
    },
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/thread-messages',
    handler: async (request) => {
      const query = agentThreadMessagesQuerySchema.parse({
        agentId: request.query.get('agentId'),
        page: request.query.get('page') ?? undefined,
        perPage: request.query.get('perPage') ?? undefined,
      });

      return jsonResponse(await readModel.listAgentThreadMessages(query));
    },
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/runtime-memory',
    handler: async (request) => {
      const { agentId } = agentIdQuerySchema.parse({
        agentId: request.query.get('agentId'),
      });
      const snapshot = await readModel.getAgentRuntimeMemory(agentId);

      if (!snapshot) {
        return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
      }

      return jsonResponse(snapshot);
    },
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/agent/conversation-messages',
    handler: async (request) => {
      const query = agentConversationMessagesQuerySchema.parse({
        agentId: request.query.get('agentId'),
        provider: request.query.get('provider'),
        targetKey: request.query.get('targetKey'),
        limit: request.query.get('limit') ?? undefined,
        offset: request.query.get('offset') ?? undefined,
      });

      return jsonResponse(await readModel.listAgentConversationMessages(query));
    },
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/roles',
    handler: async () => jsonResponse(await readModel.listRoles()),
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/integrations',
    handler: async () => jsonResponse(await readModel.listSystemIntegrations()),
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/settings',
    handler: async () => jsonResponse(await readModel.getSystemSettings()),
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/llm',
    handler: async () => jsonResponse(await readModel.getSystemLlm()),
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/migrations',
    handler: async () => jsonResponse(await readModel.getApplicationMigrations()),
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/settings/upsert',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, upsertSystemSettingsSchema);
      const result = await systemSettings.upsertSettings({
        companyName: body.companyName.trim(),
        companyContext: body.companyContext.trim(),
        stepDelayEnabled: body.stepDelayEnabled,
      });
      const registry = getInternalAgentRegistry();

      for (const entry of registry.list()) {
        const runtime = await loadAgent(input.db, {
          ...input.loaderConfig,
          agentId: entry.runtime.id,
        });

        await registry.add(input.db, runtime);
      }

      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/llm/price/upsert',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, upsertLlmModelPriceSchema);
      return jsonResponse(await llmModelPrices.upsertPrice(body));
    },
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/oauth',
    handler: async () => jsonResponse(readOauthState()),
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/finance',
    handler: async () => jsonResponse(await readModel.getFinance()),
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/finance/contracts',
    handler: async () => jsonResponse(await readModel.getFinanceContracts()),
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/wake',
    handler: async (request) => {
      const { agentId } = parseJsonBody(request.bodyText, agentActionSchema);
      const entry = registry.get(agentId);
      const timestamp = Date.now();

      if (!entry) {
        return jsonResponse({ error: `Loaded agent not found: ${agentId}` }, 404);
      }

      entry.runner.notifyExternalEvent({
        type: 'manual-wake',
        groupKey: `manual-wake:${agentId}`,
        groupMetadata: {
          Source: 'admin-console',
          AgentId: agentId,
        },
        idempotencyKey: `manual-wake:${agentId}:${timestamp}`,
        text: 'Manual wake requested from admin console.',
        timestamp,
      });
      return jsonResponse({ success: true });
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/internal-chat/send',
    handler: async (request) => {
      const payload = parseJsonBody(request.bodyText, adminInternalChatSendSchema);
      const sender = await input.internalChat.registerExternalAccount({
        slug: payload.senderSlug,
        displayName: payload.senderDisplayName,
      });
      const sent = await input.internalChat.sendMessage({
        accountId: sender.accountId,
        targetKey: payload.targetKey ?? payload.agentId,
        content: payload.content,
        attachments: [],
      });

      return jsonResponse({
        success: true,
        conversationKey: sent.conversationKey,
        messageId: sent.messageId,
      });
    },
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/internal-chat/accounts',
    handler: async () => {
      const accounts = await input.internalChat.listAccounts();

      return jsonResponse(
        accounts
          .filter((account) => account.agentId === null)
          .map((account) => ({
            accountId: account.id,
            slug: account.slug,
            displayName: account.displayName,
            description: account.description ?? '',
          })),
      );
    },
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/internal-chat/contacts',
    handler: async () => {
      const accounts = await input.internalChat.listAccounts();

      return jsonResponse(
        accounts.map((account) => ({
          accountId: account.id,
          agentId: account.agentId,
          slug: account.slug,
          displayName: account.displayName,
          description: account.description ?? '',
          isAgent: Boolean(account.agentId),
        })),
      );
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/internal-chat/account/create',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, createExternalInternalChatAccountSchema);
      return jsonResponse(
        await input.internalChat.registerExternalAccount({
          slug: body.slug,
          displayName: body.displayName,
          description: body.description,
        }),
      );
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/internal-chat/account/update',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, updateExternalInternalChatAccountSchema);
      return jsonResponse(
        await input.internalChat.updateExternalAccount({
          accountId: body.accountId,
          slug: body.slug,
          displayName: body.displayName,
          description: body.description,
        }),
      );
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/internal-chat/account/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteExternalInternalChatAccountSchema);
      return jsonResponse(await input.internalChat.deleteExternalAccount(body));
    },
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/internal-chat/conversations',
    handler: async (request) => {
      const query = internalChatAccountIdQuerySchema.parse({
        accountId: request.query.get('accountId'),
      });
      const items = await input.internalChat.listConversationsByAccount({
        accountId: query.accountId,
        limit: 100,
      });

        return jsonResponse(items.map((conversation) => ({
          conversationId: conversation.targetKey,
          conversationKey: conversation.targetKey,
          provider: 'internal-chat',
          type: (conversation.participants ?? []).length > 1 ? 'group' : 'dm',
          name: conversation.name ?? conversation.targetKey,
          participants: conversation.participants ?? [],
          updatedAt: Date.parse(conversation.latestMessageAt),
          messages: conversation.messages.map((message) => ({
            messageId: message.messageId,
          content: message.content,
          unread: message.unread,
          authorDisplayName: message.authorDisplayName,
          createdAt: Date.parse(message.createdAt),
        })),
      })));
    },
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/internal-chat/messages',
    handler: async (request) => {
      const query = internalChatMessagesQuerySchema.parse({
        accountId: request.query.get('accountId'),
        conversationId: request.query.get('conversationId'),
        limit: request.query.get('limit') ?? undefined,
        offset: request.query.get('offset') ?? undefined,
      });
      const items = await input.internalChat.getMessagesByAccount({
        accountId: query.accountId,
        conversationKey: query.conversationId,
        limit: query.limit,
        offset: query.offset,
      });

      return jsonResponse({
        items: items.map((message) => ({
          messageId: message.messageId,
          authorAccountId: message.authorId,
          authorDisplayName: message.authorDisplayName,
          content: message.content,
          createdAt: Date.parse(message.createdAt),
          attachments: message.attachments?.map((attachment) => ({
            name: attachment.name,
            contentType: attachment.contentType,
            sizeBytes: attachment.sizeBytes,
          })) ?? [],
        })),
        hasMore: items.length === query.limit,
      });
    },
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/internal-chat/message-attachment',
    handler: async (request) => {
      const query = internalChatMessageAttachmentQuerySchema.parse({
        accountId: request.query.get('accountId'),
        conversationId: request.query.get('conversationId'),
        messageId: request.query.get('messageId'),
        attachmentName: request.query.get('attachmentName'),
      });
      const attachment = await input.internalChat.getMessageAttachmentByAccount({
        accountId: query.accountId,
        conversationId: query.conversationId,
        messageId: query.messageId,
        attachmentName: query.attachmentName,
      });

      return {
        status: 200,
        headers: {
          'content-type': attachment.contentType ?? 'application/octet-stream',
          'content-disposition': `inline; filename="${encodeURIComponent(attachment.name)}"`,
          'cache-control': 'no-store',
        },
        body: Buffer.from(attachment.data),
      };
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/internal-chat/conversation/create',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, createInternalChatConversationSchema);

      if (body.type === 'dm') {
        const conversation = await input.internalChat.ensureDirectConversationByAccount({
          accountId: body.accountId,
          participantAccountId: body.participantAccountIds[0] as string,
        });

        return jsonResponse({
          conversationId: conversation.conversationId,
          conversationKey: conversation.conversationKey,
        });
      }

      const conversationKey = createId();
      await input.internalChat.createExternalChatGroup({
        accountId: body.accountId,
        conversationKey,
        name: body.name?.trim() || 'Novo grupo',
      });

      for (const participantAccountId of body.participantAccountIds) {
        await input.internalChat.addMemberToGroupByAccount({
          accountId: body.accountId,
          groupId: conversationKey,
          participantAccountId,
          role: 'normal',
        });
      }

      return jsonResponse({
        conversationId: conversationKey,
        conversationKey,
      });
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/internal-chat/conversation/send',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, sendInternalChatConversationMessageSchema);
      return jsonResponse(await input.internalChat.sendMessage({
        accountId: body.accountId,
        targetKey: body.conversationId,
        content: body.content,
        attachments: body.attachments.map((attachment) => ({
          name: attachment.name,
          contentType: attachment.contentType,
          data: Uint8Array.from(Buffer.from(attachment.dataBase64, 'base64')),
        })),
      }));
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/internal-chat/conversation/update',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, updateInternalChatConversationSchema);
      return jsonResponse(await input.internalChat.updateGroupByAccount({
        accountId: body.accountId,
        groupId: body.conversationId,
        name: body.name,
      }));
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/internal-chat/conversation/archive',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, archiveInternalChatConversationSchema);
      return jsonResponse(await input.internalChat.archiveConversationByAccount(body));
    },
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/internal-chat/group-members',
    handler: async (request) => {
      const query = internalChatGroupMembersQuerySchema.parse({
        accountId: request.query.get('accountId'),
        conversationId: request.query.get('conversationId'),
      });
      return jsonResponse(await input.internalChat.listGroupMembersByAccount({
        accountId: query.accountId,
        groupId: query.conversationId,
      }));
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/internal-chat/group-member/add',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, addInternalChatGroupMemberSchema);
      return jsonResponse(await input.internalChat.addMemberToGroupByAccount({
        accountId: body.accountId,
        groupId: body.conversationId,
        participantAccountId: body.participantAccountId,
        role: body.role,
      }));
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/internal-chat/group-member/update-role',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, updateInternalChatGroupMemberRoleSchema);
      return jsonResponse(await input.internalChat.updateMemberRoleByAccount({
        accountId: body.accountId,
        groupId: body.conversationId,
        participantAccountId: body.participantAccountId,
        role: body.role,
      }));
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/internal-chat/group-member/remove',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, removeInternalChatGroupMemberSchema);
      return jsonResponse(await input.internalChat.removeMemberFromGroupByAccount({
        accountId: body.accountId,
        groupId: body.conversationId,
        participantAccountId: body.participantAccountId,
      }));
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/reload',
    handler: async (request) => {
      const { agentId } = parseJsonBody(request.bodyText, agentActionSchema);
      const runtime = await loadAgent(input.db, {
        ...input.loaderConfig,
        agentId,
      });
      await registry.add(input.db, runtime);

      return jsonResponse({ success: true, agentId });
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/contract/top-up',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, topUpAgentContractSchema);
      return jsonResponse(await topUpActiveAgentContract(input.db, body));
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/contract/adjust-budget',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, adjustAgentContractBudgetSchema);
      return jsonResponse(await adjustAgentContractBudget(input.db, body));
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/hire',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, hireAgentSchema);
      const result = await runInternalHiring(input.db, {
        hiringRequest: body.hiringRequest,
        additionalContext: body.additionalContext,
        weeklyBudgetUsd: body.weeklyBudgetUsd,
        workspaceBasePath: input.workspaceBasePath,
        workflows: input.loaderConfig.workflows,
        githubApps: input.githubApps,
        emailMailboxes: input.emailMailboxes,
        coolify: input.coolify,
        schedules: input.schedules,
        internalChat: input.internalChat,
      });

      return jsonResponse(result, 201);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/terminate',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, terminateAgentSchema);
      const result = await runInternalTermination(input.db, {
        agentId: body.agentId,
        workspaceBasePath: input.workspaceBasePath,
        githubApps: input.githubApps,
        emailMailboxes: input.emailMailboxes,
        coolify: input.coolify,
        schedules: input.schedules,
      });

      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/change-role',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, changeAgentRoleSchema);
      const result = await changeAgentRoleFromAdmin({
        db: input.db,
        loaderConfig: input.loaderConfig,
        targetAgentId: body.agentId,
        roleId: body.roleId,
      });

      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/update-config',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, updateAgentConfigSchema);
      const agent = await input.db.query.agents.findFirst({
        where: eq(agents.id, body.agentId),
      });

      if (!agent) {
        return jsonResponse({ error: `Agent not found: ${body.agentId}` }, 404);
      }

      await input.db
        .update(agents)
        .set({
          name: body.name,
          description: body.description ?? null,
          instructions: body.instructions,
          workspaceAutoSync: body.workspaceAutoSync ? 1 : 0,
          workspaceBm25: body.workspaceBm25 ? 1 : 0,
          modelProfileId: body.modelProfileId,
          omModelProfileId: body.omModelProfileId,
          updatedAt: Date.now(),
        })
        .where(eq(agents.id, body.agentId));

      const role = agent.roleId
        ? await input.db.query.agentRoles.findFirst({
            where: eq(agentRoles.id, agent.roleId),
          })
        : null;

      await updateInternalChatProviderProfile(input.db, {
        agentId: body.agentId,
        displayName: body.name,
        description: role?.description ?? role?.name ?? body.name,
      });

      await reloadAgentIfLoaded(input.db, input.loaderConfig, body.agentId);

      return jsonResponse({ success: true, agentId: body.agentId });
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-provider/upsert',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, upsertAgentProviderSchema);
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
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-provider/delete',
    handler: async (request) => {
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
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-mcp/create',
    handler: async (request) => {
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
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-mcp/update',
    handler: async (request) => {
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
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-mcp/delete',
    handler: async (request) => {
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
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-skills/upload',
    handler: async (request) => {
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
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-skills/delete',
    handler: async (request) => {
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
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-schedule/create',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, createScheduleSchema);
      const scheduleInput = body.scheduleType === 'cron'
        ? {
            name: body.name,
            description: body.description,
            scheduleType: body.scheduleType,
            cronExpression: body.cronExpression!,
            timezone: body.timezone,
            content: body.content,
          }
        : {
            name: body.name,
            description: body.description,
            scheduleType: body.scheduleType,
            scheduledDate: body.scheduledDate!,
            timezone: body.timezone,
            content: body.content,
          };
      const schedule = await input.schedules.createSchedule(body.agentId, scheduleInput);
      return jsonResponse(schedule, 201);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-schedule/update',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, updateScheduleSchema);
      const schedule = await input.schedules.updateOwnedSchedule(body.agentId, body.scheduleId, {
        name: body.name,
        description: body.description,
        scheduleType: body.scheduleType,
        cronExpression: body.cronExpression,
        scheduledDate: body.scheduledDate,
        timezone: body.timezone,
        content: body.content,
        isActive: body.isActive,
      });
      return jsonResponse(schedule);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-schedule/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteScheduleSchema);
      const result = await input.schedules.deleteSchedule(body.agentId, body.scheduleId);
      return jsonResponse(result);
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
        console.error('[Admin] Failed to create role:', error);
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
          console.error('[Admin] Failed to reload agents for role ' + body.roleId + ':', error);
        });
        return jsonResponse(result);
      } catch (error) {
        console.error('[Admin] Failed to update role:', error);
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
        console.error('[Admin] Failed to delete role:', error);
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
        console.error('[Admin] Failed to add role capability:', error);
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
        console.error('[Admin] Failed to remove role capability:', error);
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
        console.error('[Admin] Failed to add role tool permission:', error);
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
        console.error('[Admin] Failed to add role workflow permission:', error);
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
        console.error('[Admin] Failed to remove role workflow permission:', error);
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
        console.error('[Admin] Failed to remove role tool permission:', error);
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/integration/upsert',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, upsertSystemIntegrationSchema);
      const result = await integrations.upsertIntegration(body);

      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/integration/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteSystemIntegrationSchema);
      await integrations.deleteIntegration(body.providerType);
      return jsonResponse({ success: true, providerType: body.providerType });
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/llm/profile/upsert',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, upsertLlmProfileSchema);
      return jsonResponse(await llmSettings.upsertProfile(body));
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/llm/profile/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteLlmProfileSchema);
      await llmSettings.deleteProfile(body.profileId);
      return jsonResponse({ success: true, profileId: body.profileId });
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/llm/defaults/update',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, updateLlmDefaultsSchema);
      return jsonResponse(await llmSettings.updateDefaults(body));
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/oauth/sync',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, syncOauthSchema);
      const providerIds: Array<'openai-codex' | 'anthropic'> =
        body.providerId === 'all' ? ['openai-codex', 'anthropic'] : [body.providerId];
      const results: Array<{
        providerId: 'openai-codex' | 'anthropic';
        synced: boolean;
        error?: string;
      }> = [];

      for (const providerId of providerIds) {
        try {
          if (providerId === 'openai-codex') {
            await syncOpenAICodexCredential();
          } else {
            await syncAnthropicCredential();
          }

          results.push({
            providerId,
            synced: true,
          });
        } catch (error) {
          results.push({
            providerId,
            synced: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return jsonResponse({
        state: readOauthState(),
        results,
      });
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/finance/investment/create',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, createInvestmentSchema);
      const effectiveAt = body.effectiveAt ? new Date(body.effectiveAt).getTime() : Date.now();

      await companyCash.recordCashIn({
        type: 'owner-investment',
        amountUsd: body.amountUsd,
        description: body.description ?? 'Manual owner investment',
        effectiveAt,
      });

      return jsonResponse({ success: true });
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/finance/payable/create',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, createPayableSchema);
      const dueAt = new Date(body.dueAt).getTime();

      if (!Number.isFinite(dueAt)) {
        throw new Error('Invalid payable dueAt');
      }

      if (body.kind === 'single') {
        const result = await companyCash.scheduleCashOut({
          type: 'manual-payable',
          amountUsd: body.amountUsd,
          description: body.description ?? body.name,
          referenceType: 'manual-payable',
          referenceId: createId(),
          dueAt,
        });

        return jsonResponse({
          kind: body.kind,
          entryId: result.entryId,
        }, 201);
      }

      const result = await companyPayables.createRecurringPayable({
        name: body.name,
        description: body.description,
        amountUsd: body.amountUsd,
        recurrencePeriod: body.recurrencePeriod,
        dueAt,
      });

      return jsonResponse({
        kind: body.kind,
        payableId: result.payableId,
        entryId: result.entryId,
      }, 201);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/finance/ledger/post',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, ledgerEntryActionSchema);
      const effectiveAt = body.effectiveAt ? new Date(body.effectiveAt).getTime() : undefined;
      const result = await companyCash.postPlannedEntry(body.entryId, { effectiveAt });

      await companyPayables.syncRecurringPayableOccurrence({
        entryId: body.entryId,
      });

      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/finance/ledger/cancel',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, ledgerEntryActionSchema);
      const result = await companyCash.cancelPlannedEntry(body.entryId);

      await companyPayables.syncRecurringPayableOccurrence({
        entryId: body.entryId,
      });

      return jsonResponse(result);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/finance/recurring-payable/set-active',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, recurringPayableStatusSchema);
      const result = await companyPayables.setRecurringPayableActive(body.payableId, body.isActive);
      return jsonResponse(result);
    },
  });

}

async function reloadAgentMcp(db: Database, loaderConfig: AgentLoaderConfig, agentId: string) {
  clearAgentMCPClient(agentId);
  await reloadAgentIfLoaded(db, loaderConfig, agentId);
}

function normalizeOptionalText(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeJsonText(
  value: string | undefined,
  fieldName: string,
  expectedShape: 'array' | 'object',
) {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  const parsed = JSON.parse(normalized);
  const valid =
    expectedShape === 'array'
      ? Array.isArray(parsed)
      : typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);

  if (!valid) {
    throw new Error(`${fieldName} must be a JSON ${expectedShape}`);
  }

  return JSON.stringify(parsed);
}

function parseJsonBody<TSchema extends z.ZodTypeAny>(
  bodyText: string,
  schema: TSchema,
): z.infer<TSchema> {
  const parsed = bodyText.trim().length === 0 ? {} : JSON.parse(bodyText);
  return schema.parse(parsed);
}

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

function readOauthState() {
  const storePath = oauthStore.getDefaultPath();
  const store = oauthStore.read(storePath);
  const openAICodexPath = getOpenAICodexCliAuthFilePath();
  const anthropicSetupTokenPath = getAnthropicSetupTokenFilePath();
  const anthropicCliPath = getAnthropicCliAuthFilePath();

  return {
    storePath,
    providers: [
      {
        providerId: 'openai-codex' as const,
        sourcePath: openAICodexPath,
        sourcePresent: fs.existsSync(openAICodexPath),
        synced: Boolean(store['openai-codex']),
        hasRefresh: Boolean(store['openai-codex']?.refresh),
        expiresAt: store['openai-codex']?.expires ?? null,
        accountId: store['openai-codex']?.accountId ?? null,
      },
      {
        providerId: 'anthropic' as const,
        sourcePath: `${anthropicSetupTokenPath} or ${anthropicCliPath}`,
        sourcePresent: fs.existsSync(anthropicSetupTokenPath) || fs.existsSync(anthropicCliPath),
        synced: Boolean(store.anthropic),
        hasRefresh: Boolean(store.anthropic?.refresh),
        expiresAt: store.anthropic?.expires ?? null,
        accountId: store.anthropic?.accountId ?? null,
      },
    ],
  };
}
