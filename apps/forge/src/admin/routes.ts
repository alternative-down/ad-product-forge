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
import { runInternalHiring, runInternalTermination } from '../agents/internal-agent-lifecycle';
import type { AgentEmailManager } from '../email/migadu-manager';
import type { CoolifyManager } from '../coolify/manager';
import type { GitHubAppManager } from '../github/manager';
import {
  agentCheckpointedOmStates,
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

export * from './schemas.js';

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
  const agentContracts = createAgentContractStore(input.db);
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
    path: '/admin/system/healthcheck',
    handler: async () => jsonResponse(await buildSystemHealthcheck(registry, readModel)),
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
    path: '/admin/agent/ltm-thread-messages',
    handler: async (request) => {
      const query = agentThreadMessagesQuerySchema.parse({
        agentId: request.query.get('agentId'),
        page: request.query.get('page') ?? undefined,
        perPage: request.query.get('perPage') ?? undefined,
      });

      return jsonResponse(
        await readModel.listAgentLongTermMemoryThreadMessages({
          agentId: query.agentId,
          page: query.page,
          perPage: query.perPage,
        }),
      );
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/clear-history',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, clearAgentHistorySchema);

      await clearAgentHistory({
        db: input.db,
        workspaceBasePath: input.workspaceBasePath,
        agentId: body.agentId,
        includeLongTermMemoryThread: body.includeLongTermMemoryThread,
      });
      await reloadAgentIfLoaded(input.db, input.loaderConfig, body.agentId);

      return jsonResponse({
        success: true,
        agentId: body.agentId,
        includeLongTermMemoryThread: body.includeLongTermMemoryThread,
      });
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
    path: '/admin/agent/om-debug-export',
    handler: async (request) => {
      const { agentId } = agentIdQuerySchema.parse({
        agentId: request.query.get('agentId'),
      });
      const snapshot = await readModel.getAgentOmDebugExport(agentId);

      if (!snapshot) {
        return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
      }

      return jsonResponse(snapshot);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/ltm-recall-search',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, agentLongTermMemoryRecallSearchSchema);
      return jsonResponse(
        await readModel.debugAgentLongTermMemoryRecallSearch(body.agentId, {
          query: body.query,
        }),
      );
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
    path: '/admin/system/mcp',
    handler: async () =>
      jsonResponse(
        (
          await input.db.select().from(mcpServerConfigs)
        )
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
          .sort((left, right) => left.name.localeCompare(right.name)),
      ),
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/migrations',
    handler: async () => jsonResponse(await readModel.getApplicationMigrations()),
  });

  input.httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/skills',
    handler: async () => jsonResponse(await listGlobalSkills(input.workspaceBasePath)),
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
    path: '/admin/system/mcp/upsert',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, upsertSystemMcpServerSchema);
      const timestamp = new Date().toISOString();
      const serverId = body.serverId ?? createId();

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
        await input.db.update(mcpServerConfigs).set(values).where(eq(mcpServerConfigs.id, body.serverId));
      } else {
        await input.db.insert(mcpServerConfigs).values({
          id: serverId,
          ...values,
          version: 1,
          createdAt: timestamp,
        });
      }

      await reloadLinkedAgentsForMcpServer(input.db, input.loaderConfig, serverId);

      const server = await input.db.query.mcpServerConfigs.findFirst({
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

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/mcp/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteSystemMcpServerSchema);
      const linkedConfigs = await input.db.query.agentMcpConfigs.findMany({
        where: eq(agentMcpConfigs.serverId, body.serverId),
        columns: {
          agentId: true,
          id: true,
        },
      });

      for (const linkedConfig of linkedConfigs) {
        await input.db.delete(agentMcpConfigs).where(eq(agentMcpConfigs.id, linkedConfig.id));
      }

      await input.db.delete(mcpServerConfigs).where(eq(mcpServerConfigs.id, body.serverId));

      for (const linkedConfig of linkedConfigs) {
        await reloadAgentMcp(input.db, input.loaderConfig, linkedConfig.agentId);
      }

      return jsonResponse({ success: true, serverId: body.serverId });
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/skills/upload',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, uploadSystemSkillsSchema);
      const installedSkillNames = await installGlobalSkillsFromZip({
        workspaceBasePath: input.workspaceBasePath,
        zipBase64: body.archiveBase64,
      });

      return jsonResponse({ success: true, installedSkillNames }, 201);
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/system/skills/delete',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, deleteSystemSkillSchema);
      await deleteGlobalSkill({
        workspaceBasePath: input.workspaceBasePath,
        skillName: body.skillName,
      });

      return jsonResponse({ success: true, skillName: body.skillName });
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
    handler: async () => jsonResponse(await readOauthState()),
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
    path: '/admin/agent/force-idle',
    handler: async (request) => {
      const { agentId } = parseJsonBody(request.bodyText, agentActionSchema);
      const entry = registry.get(agentId);

      if (entry) {
        await entry.runner.forceIdle();
      } else {
        await agentContracts.setExecutionState(agentId, 'idle');
      }

      return jsonResponse({ success: true, agentId });
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/rewakeup',
    handler: async (request) => {
      const { agentId } = parseJsonBody(request.bodyText, agentActionSchema);
      let entry = registry.get(agentId);

      if (entry) {
        await entry.runner.forceIdle();
      } else {
        await agentContracts.setExecutionState(agentId, 'idle');
        const runtime = await loadAgent(input.db, {
          ...input.loaderConfig,
          agentId,
        });
        entry = await registry.add(input.db, runtime);
      }

      entry.runner.notifyExternalEvent({
        type: 'admin-rewakeup',
        groupKey: `admin-rewakeup:${agentId}`,
        groupMetadata: {
          Source: 'admin',
        },
        idempotencyKey: `admin-rewakeup:${agentId}:${Date.now()}`,
        text: 'Admin requested a forced rewakeup. Rebuild context and continue work from the current state.',
        timestamp: Date.now(),
      });

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
    path: '/admin/agent/contract/renew',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, renewAgentContractSchema);
      return jsonResponse(await renewAgentContract(input.db, body));
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
    path: '/admin/agent/github-manifest-config/update',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, updateAgentGitHubManifestConfigSchema);
      const provisioning = await input.githubApps.updateAgentManifestConfig({
        agentId: body.agentId,
        manifestConfig: body.manifestConfig,
      });

      return jsonResponse(provisioning);
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
    path: '/admin/agent-mcp/assign',
    handler: async (request) => {
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
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-mcp/set-active',
    handler: async (request) => {
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
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-mcp/detach',
    handler: async (request) => {
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
    path: '/admin/agent-skills/install-global',
    handler: async (request) => {
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
    },
  });

  input.httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-skills/publish-global',
    handler: async (request) => {
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
        wakeWhenRunning: body.wakeWhenRunning,
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
        state: await readOauthState(),
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
  await reloadAgentIfLoaded(db, loaderConfig, agentId);
}

async function reloadLinkedAgentsForMcpServer(
  db: Database,
  loaderConfig: AgentLoaderConfig,
  serverId: string,
) {
  const linkedConfigs = await db.query.agentMcpConfigs.findMany({
    where: eq(agentMcpConfigs.serverId, serverId),
    columns: {
      agentId: true,
    },
  });

  for (const linkedConfig of linkedConfigs) {
    await reloadAgentMcp(db, loaderConfig, linkedConfig.agentId);
  }
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

async function clearAgentHistory(input: {
  db: Database;
  workspaceBasePath: string;
  agentId: string;
  includeLongTermMemoryThread: boolean;
}) {
  const agentDatabasePath = path.resolve(input.workspaceBasePath, input.agentId, 'database.db');
  const threadIds = [
    toMastraSafeIdentifier(input.agentId),
    ...(input.includeLongTermMemoryThread
      ? [toMastraSafeIdentifier(`${input.agentId}_long_term_memory`)]
      : []),
  ];

  for (const threadId of threadIds) {
    const client = createClient({
      url: `file:${agentDatabasePath}`,
    });
    const conversationStore = new LibsqlConversationStore({
      client,
      tablePrefix: threadId,
    });

    try {
      await conversationStore.clearThread(threadId);
    } finally {
      client.close();
    }
  }

  await input.db.delete(agentCheckpointedOmStates).where(eq(agentCheckpointedOmStates.agentId, input.agentId));
  await input.db
    .delete(agentLongTermMemoryRecallStates)
    .where(eq(agentLongTermMemoryRecallStates.agentId, input.agentId));
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

async function readOauthState() {
  const storePath = oauthStore.getDefaultPath();
  const store = await oauthStore.read(storePath);
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

async function buildSystemHealthcheck(
  registry: ReturnType<typeof getInternalAgentRegistry>,
  readModel: ReturnType<typeof createAdminReadModel>,
) {
  const HEALTHCHECK_SNAPSHOT_LIMIT = 100;
  const processWithDiagnostics = process as NodeJS.Process & {
    _getActiveHandles?: () => unknown[];
    _getActiveRequests?: () => unknown[];
  };
  const memoryUsage = process.memoryUsage();
  const activeHandles = processWithDiagnostics._getActiveHandles?.() ?? [];
  const activeRequests = processWithDiagnostics._getActiveRequests?.() ?? [];
  const [fdSummary, agentSnapshots, overview, agents] = await Promise.all([
    readProcessFileDescriptorSummary(),
    Promise.all(
      registry.list().map(async (entry) => {
        const longTermMemory = entry.runtime.longTermMemory
          ? await entry.runtime.longTermMemory.readSnapshot().catch((err) => { console.error("[safe-catch]", err); return null; })
          : null;

        return {
          agentId: entry.runtime.id,
          mastraId: entry.runtime.mastraId,
          pricingModelKey: entry.runtime.pricingModelKey,
          modelProfileId: entry.runtime.modelProfileId ?? null,
          runner: entry.runner.getSnapshot(),
          longTermMemory,
        };
      }),
    ),
    readModel.getDashboard(),
    readModel.listAgents(),
  ]);
  const homeAgentMap = new Map(agents.map((agent) => [agent.agentId, agent]));
  const recentActivityByAgentId = new Map(await Promise.all(
    agentSnapshots.map(async (agentSnapshot) => {
      const [agentThread, ltmThread, homeMetricSnapshots] = await Promise.all([
        readModel.listAgentThreadMessages({
          agentId: agentSnapshot.agentId,
          page: 0,
          perPage: 1,
        }),
        readModel.listAgentLongTermMemoryThreadMessages({
          agentId: agentSnapshot.agentId,
          page: 0,
          perPage: 1,
        }),
        readModel.listRecentAgentHomeMetricSnapshots({
          agentId: agentSnapshot.agentId,
          limit: HEALTHCHECK_SNAPSHOT_LIMIT,
        }),
      ]);

      return [
        agentSnapshot.agentId,
        {
          agentThread: agentThread.items.map(summarizeHealthcheckThreadMessage),
          ltmThread: ltmThread.items.map(summarizeHealthcheckThreadMessage),
          homeMetricSnapshots,
        },
      ] as const;
    }),
  ));

  return {
    now: new Date().toISOString(),
    process: {
      pid: process.pid,
      ppid: process.ppid,
      uptimeSeconds: process.uptime(),
      cwd: process.cwd(),
      nodeVersion: process.version,
      memoryUsage: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers,
      },
      heapStatistics: v8.getHeapStatistics(),
      heapSpaceStatistics: v8.getHeapSpaceStatistics(),
      resourceUsage: process.resourceUsage(),
    },
    activity: {
      activeHandleCount: activeHandles.length,
      activeHandles: summarizeActiveItems(activeHandles),
      activeRequestCount: activeRequests.length,
      activeRequests: summarizeActiveItems(activeRequests),
    },
    fileDescriptors: fdSummary,
    home: {
      overview,
      agents,
    },
    agents: {
      loadedCount: agentSnapshots.length,
      items: agentSnapshots.map((agentSnapshot) => {
        const homeAgent = homeAgentMap.get(agentSnapshot.agentId);

        return {
          ...agentSnapshot,
          recentExecution: recentActivityByAgentId.get(agentSnapshot.agentId) ?? {
            agentThread: [],
            ltmThread: [],
            homeMetricSnapshots: [],
          },
          homeAgent: homeAgent
            ? {
                executionState: homeAgent.executionState,
                lastStepAt: homeAgent.overview.lastStepAt,
                lastStepContextTokens: homeAgent.overview.lastStepContextTokens,
                lastStepTokens: homeAgent.overview.lastStepTokens,
                lastStepPreview: homeAgent.overview.lastStepPreview,
                averageStepIntervalMs: homeAgent.overview.averageStepIntervalMs,
                om: homeAgent.overview.om,
                lastExecutionError: homeAgent.lastExecutionError,
                lastExecutionErrorAt: homeAgent.lastExecutionErrorAt,
              }
            : null,
        };
      }),
    },
  };
}

function summarizeHealthcheckThreadMessage(message: {
  id: string;
  role: string;
  createdAt: number;
  type: string | null;
  content?: unknown;
}) {
  const content = message.content && typeof message.content === 'object'
    ? message.content as {
        content?: unknown;
        reasoning?: unknown;
        parts?: unknown;
      }
    : null;
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  const partTypes = parts
    .flatMap((part) =>
      part && typeof part === 'object' && 'type' in part && typeof part.type === 'string'
        ? [part.type]
        : [])
    .slice(0, 20);
  const preview = extractLatestHealthcheckMessagePreview(message.content);
  const hasReasoning =
    typeof content?.reasoning === 'string' && content.reasoning.trim().length > 0
    || parts.some((part) =>
      part && typeof part === 'object' && 'type' in part && part.type === 'reasoning');

  return {
    id: message.id,
    role: message.role,
    createdAt: message.createdAt,
    type: message.type,
    preview,
    hasReasoning,
    partTypes,
  };
}

function extractLatestHealthcheckMessagePreview(content: unknown) {
  if (!content || typeof content !== 'object') {
    return null;
  }

  const record = content as {
    content?: unknown;
    reasoning?: unknown;
    parts?: unknown;
  };
  const parts = Array.isArray(record.parts) ? record.parts : [];

  for (const part of [...parts].reverse()) {
    if (
      part
      && typeof part === 'object'
      && 'type' in part
      && 'text' in part
      && (part.type === 'text' || part.type === 'reasoning')
      && typeof part.text === 'string'
      && part.text.trim()
    ) {
      return part.text.trim().slice(0, 280);
    }
  }

  if (typeof record.content === 'string' && record.content.trim()) {
    return record.content.trim().slice(0, 280);
  }

  if (typeof record.reasoning === 'string' && record.reasoning.trim()) {
    return record.reasoning.trim().slice(0, 280);
  }

  return null;
}

async function readProcessFileDescriptorSummary() {
  const fdRoot = '/proc/self/fd';
  const entries = await fsPromises.readdir(fdRoot).catch(() => []);
  const targetCounts = new Map<string, number>();

  await Promise.all(entries.map(async (entry) => {
    const target = await fsPromises.readlink(`${fdRoot}/${entry}`).catch((err) => { console.error("[safe-catch]", err); return null; });

    if (!target) {
      return;
    }

    targetCounts.set(target, (targetCounts.get(target) ?? 0) + 1);
  }));

  return {
    count: entries.length,
    topTargets: Array.from(targetCounts.entries())
      .map(([target, count]) => ({ target, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 50),
  };
}

function summarizeActiveItems(items: unknown[]) {
  const summary = new Map<string, number>();

  for (const item of items) {
    const name = typeof item === 'object' && item !== null && 'constructor' in item
      ? (item as { constructor?: { name?: string } }).constructor?.name ?? 'unknown'
      : typeof item;

    summary.set(name, (summary.get(name) ?? 0) + 1);
  }

  return Array.from(summary.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count);
}
