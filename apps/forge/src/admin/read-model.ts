import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { createClient } from '@libsql/client';
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import type { MastraDBMessage } from '@mastra/core/agent';
import {
  createAgentMemory,
  createObservationalMemory,
  toMastraSafeIdentifier,
  type CommunicationMessageView,
  type CommunicationProviderMessage,
} from '@mastra-engine/core';

import type { Database } from '../database/index';
import {
  agents,
  agentExecutionContracts,
  agentExecutionSteps,
  agentMcpConfigs,
  agentProviders,
  agentSchedules,
  mcpServerConfigs,
} from '../database/schema';
import { getInternalAgentRegistry } from '../agents/internal-agent-registry';
import { createMicroErpReadModel } from '../micro-erp/read-model';
import { createCompanyPayables } from '../finance/company-payables';
import { createCapabilityStore } from '../capabilities/store';
import { forgeCapabilityIds } from '../capabilities/catalog';
import { decryptSecret } from '../encryption/crypto';
import { createAgentNotificationStore } from '../notifications/store';
import { createSystemIntegrationStore } from '../system-integrations/store';
import { createLlmSettingsStore } from '../llm/settings-store';
import { createLlmModelPriceStore } from '../llm/model-price-store';
import type { GitHubAppManager } from '../github/manager';
import { createSystemSettingsStore } from '../system-settings/store';
import type { InternalChatService } from '../communication/internal-chat-service';
import { listAgentWorkspaceSkills } from '../agents/workspace-skills';

const RECENT_STEP_LIMIT = 10;
const RECENT_CASH_MOVEMENT_LIMIT = 10;
const RECENT_NOTIFICATION_LIMIT = 10;
const RECENT_CONVERSATION_LIMIT = 10;

interface MastraMemoryStore {
  createThread(params: { resourceId?: string; threadId: string }): Promise<unknown>;
}

function hasCreateThread(store: unknown): store is MastraMemoryStore {
  return (
    typeof store === 'object' &&
    store !== null &&
    'createThread' in store &&
    typeof (store as MastraMemoryStore).createThread === 'function'
  );
}

export function createAdminReadModel(input: {
  db: Database;
  workspaceBasePath: string;
  githubApps: GitHubAppManager;
  internalChat: InternalChatService;
}) {
  const db = input.db;
  const finance = createMicroErpReadModel(db);
  const payables = createCompanyPayables(db);
  const capabilities = createCapabilityStore(db);
  const notifications = createAgentNotificationStore(db);
  const integrations = createSystemIntegrationStore(db);
  const llmSettings = createLlmSettingsStore(db);
  const llmModelPrices = createLlmModelPriceStore(db);
  const systemSettings = createSystemSettingsStore(db);

  async function getDashboard() {
    const [agentRows, balance, summary, activeContracts, cashMovements, roles] =
      await Promise.all([
        db.query.agents.findMany(),
        finance.getCompanyCashBalance(),
        finance.getCompanyCashSummary(),
        finance.listActiveInternalAgentContracts(),
        finance.listCompanyCashMovements({
          limit: RECENT_CASH_MOVEMENT_LIMIT,
        }),
        capabilities.listRoles(),
      ]);
    const registry = getInternalAgentRegistry();
    const loadedAgentIds = new Set(registry.list().map((entry) => entry.runtime.id));

    return {
      totals: {
        agents: agentRows.length,
        loadedAgents: loadedAgentIds.size,
        idleAgents: agentRows.filter((agent) => agent.executionState === 'idle').length,
        runningAgents: agentRows.filter((agent) => agent.executionState === 'running').length,
        roles: roles.length,
        activeContracts: activeContracts.items.length,
      },
      cash: {
        balanceUsd: balance.balanceUsd,
        summary,
        recentMovements: cashMovements.items,
      },
    };
  }

  async function listAgents() {
    const [agentRows, roleRows, providerRows, llmProfiles] = await Promise.all([
      db.query.agents.findMany({
        orderBy: (fields, { asc }) => [asc(fields.name)],
      }),
      capabilities.listRoles(),
      db.query.agentProviders.findMany(),
      llmSettings.listProfiles(),
    ]);
    const registry = getInternalAgentRegistry();
    const roleMap = new Map(roleRows.map((row) => [row.roleId, row]));
    const llmProfileMap = new Map(
      llmProfiles.map((row) => [
        row.profileId,
        {
          profileId: row.profileId,
          name: row.name,
          modelKey: row.modelKey,
        },
      ]),
    );
    const providerTypesByAgentId = new Map<string, string[]>();

    for (const provider of providerRows) {
      const existingTypes = providerTypesByAgentId.get(provider.agentId) ?? [];
      existingTypes.push(provider.providerType);
      providerTypesByAgentId.set(provider.agentId, existingTypes);
    }

    return agentRows.map((agent) => {
      const loadedAgent = registry.get(agent.id);
      const runnerSnapshot = loadedAgent?.runner.getSnapshot() ?? null;
      const role = agent.roleId ? (roleMap.get(agent.roleId) ?? null) : null;
      const modelProfile = llmProfileMap.get(agent.modelProfileId);
      const omModelProfile = llmProfileMap.get(agent.omModelProfileId);
      const executionState =
        runnerSnapshot && (runnerSnapshot.executing || runnerSnapshot.scheduled || runnerSnapshot.wake.pending)
          ? 'running'
          : agent.executionState;

      return {
        agentId: agent.id,
        name: agent.name,
        description: agent.description ?? undefined,
        executionState,
        roleId: agent.roleId,
        roleName: role?.name ?? null,
        modelProfile: modelProfile ?? null,
        omModelProfile: omModelProfile ?? null,
        loaded: Boolean(loadedAgent),
        runner: runnerSnapshot,
        providerTypes: (providerTypesByAgentId.get(agent.id) ?? []).sort(),
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
      };
    });
  }

  async function getAgent(agentId: string) {
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
    });

    if (!agent) {
      return null;
    }

    const [
      roles,
      llmProfiles,
      providerRows,
      agentMcpRows,
      recentSteps,
      agentScheduleRows,
      activeContract,
      recentNotifications,
      githubProvisioning,
    ] =
      await Promise.all([
        capabilities.listRoles(),
        llmSettings.listProfiles(),
        db.query.agentProviders.findMany({
          where: eq(agentProviders.agentId, agentId),
        }),
        db
          .select({
            configId: agentMcpConfigs.id,
            isActive: agentMcpConfigs.isActive,
            serverId: mcpServerConfigs.id,
            name: mcpServerConfigs.name,
            description: mcpServerConfigs.description,
            transport: mcpServerConfigs.transport,
            command: mcpServerConfigs.command,
            args: mcpServerConfigs.args,
            envVars: mcpServerConfigs.envVars,
            url: mcpServerConfigs.url,
            headers: mcpServerConfigs.headers,
            createdAt: mcpServerConfigs.createdAt,
            updatedAt: mcpServerConfigs.updatedAt,
          })
          .from(agentMcpConfigs)
          .innerJoin(mcpServerConfigs, eq(agentMcpConfigs.serverId, mcpServerConfigs.id))
          .where(eq(agentMcpConfigs.agentId, agentId)),
        db.query.agentExecutionSteps.findMany({
          where: eq(agentExecutionSteps.agentId, agentId),
          orderBy: [desc(agentExecutionSteps.createdAt)],
          limit: RECENT_STEP_LIMIT,
        }),
        db.query.agentSchedules.findMany({
          where: eq(agentSchedules.agentId, agentId),
          orderBy: [desc(agentSchedules.createdAt)],
        }),
        finance.getActiveInternalAgentContract(agentId),
        notifications.listNotifications({
          agentId,
          limit: RECENT_NOTIFICATION_LIMIT,
          markRead: false,
        }),
        input.githubApps.getAgentProvisioning(agentId),
      ]);
    const registry = getInternalAgentRegistry();
    const loadedAgent = registry.get(agentId);
    const roleMap = new Map(roles.map((row) => [row.roleId, row]));
    const llmProfileMap = new Map(
      llmProfiles.map((row) => [
        row.profileId,
        {
          profileId: row.profileId,
          name: row.name,
          modelKey: row.modelKey,
        },
      ]),
    );
    const role = agent.roleId ? (roleMap.get(agent.roleId) ?? null) : null;
    const modelProfile = llmProfileMap.get(agent.modelProfileId);
    const omModelProfile = llmProfileMap.get(agent.omModelProfileId);
    const heartbeat = agentScheduleRows.find((schedule) => schedule.kind === 'heartbeat') ?? null;
    const runnerSnapshot = loadedAgent?.runner.getSnapshot() ?? null;
    const executionState =
      runnerSnapshot && (runnerSnapshot.executing || runnerSnapshot.scheduled || runnerSnapshot.wake.pending)
        ? 'running'
        : agent.executionState;
    const contractSpendRows = activeContract
      ? await db
          .select({
            total: sql<number>`coalesce(sum(${agentExecutionSteps.costUsd}), 0)`,
          })
          .from(agentExecutionSteps)
          .where(eq(agentExecutionSteps.contractId, activeContract.contractId))
      : [];
    const spentUsd = contractSpendRows[0]?.total ?? 0;

    return {
      agentId: agent.id,
      name: agent.name,
      description: agent.description ?? undefined,
      instructions: agent.instructions,
      executionState,
      modelProfile: modelProfile ?? null,
      omModelProfile: omModelProfile ?? null,
      role: role && {
        ...role,
        description: role.description ?? null,
      },
      loaded: Boolean(loadedAgent),
      runner: runnerSnapshot,
      workspace: {
        autoSync: agent.workspaceAutoSync === 1,
        bm25: agent.workspaceBm25 === 1,
        embedder: agent.workspaceEmbedder,
        filesystem: agent.workspaceFilesystem ?? null,
        sandbox: agent.workspaceSandbox ?? null,
      },
      providers: providerRows
        .map((provider) => ({
          providerType: provider.providerType,
          createdAt: provider.createdAt,
          editable: provider.providerType !== 'internal-chat',
          credentials:
            provider.providerType === 'internal-chat'
              ? null
              : parseProviderCredentials(provider.encryptedCredentials),
        }))
        .sort((left, right) => left.providerType.localeCompare(right.providerType)),
      mcpServers: agentMcpRows
        .map((server) => ({
          configId: server.configId,
          serverId: server.serverId,
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
      githubProvisioning,
      skills: await listAgentWorkspaceSkills(input.workspaceBasePath, agent),
      activeContract: activeContract && {
        ...activeContract,
        spentUsd,
        spentPercent: activeContract.weeklyValueUsd > 0
          ? (spentUsd / activeContract.weeklyValueUsd) * 100
          : 0,
      },
      schedules: agentScheduleRows
        .filter((schedule) => schedule.kind === 'agent')
        .map(toScheduleSummary),
      heartbeat: heartbeat ? toScheduleSummary(heartbeat) : null,
      recentExecutionSteps: recentSteps.map((step) => {
        const { id, ...rest } = step;

        return {
          ...rest,
          stepId: id,
        };
      }),
      recentNotifications,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    };
  }

  async function listAgentRecentConversations(agentId: string) {
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
      columns: {
        id: true,
        name: true,
      },
    });

    if (!agent) {
      return null;
    }

    return listRecentConversations(input.workspaceBasePath, input.internalChat, agentId, agent.name);
  }

  async function listAgentExecutionSteps(input: {
    agentId: string;
    limit: number;
    offset: number;
  }) {
    const now = Date.now();
    const activeContract = await db.query.agentExecutionContracts.findFirst({
      where: and(
        eq(agentExecutionContracts.agentId, input.agentId),
        lte(agentExecutionContracts.startsAt, now),
        gte(agentExecutionContracts.endsAt, now),
      ),
      orderBy: [desc(agentExecutionContracts.endsAt)],
    });

    if (!activeContract) {
      return {
        items: [],
        hasMore: false,
      };
    }

    const rows = await db.query.agentExecutionSteps.findMany({
      where: eq(agentExecutionSteps.contractId, activeContract.id),
      orderBy: [desc(agentExecutionSteps.createdAt)],
      limit: input.limit,
      offset: input.offset,
    });

    return {
      items: rows.map((step) => {
        const { id, ...rest } = step;

        return {
          ...rest,
          stepId: id,
        };
      }),
      hasMore: rows.length === input.limit,
    };
  }

  async function listAgentThreadMessages(params: {
    agentId: string;
    page: number;
    perPage: number;
  }) {
    const items = await listThreadMessages(input.workspaceBasePath, params.agentId, {
      page: params.page,
      perPage: params.perPage,
    });

    return {
      items,
      hasMore: items.length === params.perPage,
    };
  }

  async function getAgentRuntimeMemory(agentId: string) {
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
    });

    if (!agent) {
      return null;
    }

    const mastraAgentId = toMastraSafeIdentifier(agentId);
    const agentDatabasePath = path.resolve(input.workspaceBasePath, agentId, 'database.db');
    const client = createClient({
      url: `file:${agentDatabasePath}`,
    });
    const storage = new LibSQLStore({
      id: `${mastraAgentId}_storage`,
      client,
    });
    const vector = new LibSQLVector({
      id: `${mastraAgentId}_vector`,
      url: `file:${agentDatabasePath}`,
    });

    if (hasCreateThread(storage.stores.memory)) {
      await storage.stores.memory.createThread({
        resourceId: mastraAgentId,
        threadId: mastraAgentId,
      });
    }

    const memory = createAgentMemory({
      storage,
      vector,
    });
    const observationalMemory = createObservationalMemory({
      storage,
      model: 'anthropic/claude-sonnet-4-20250514',
    });
    const [workingMemory, omRecord] = await Promise.all([
      memory.getWorkingMemory({
        threadId: mastraAgentId,
        resourceId: mastraAgentId,
      }),
      observationalMemory.getOrCreateRecord(mastraAgentId, mastraAgentId),
    ]);

    return {
      workingMemory: formatWorkingMemoryValue(workingMemory),
      observations: formatMemoryValue(omRecord.activeObservations),
      reflection: formatMemoryValue(omRecord.bufferedReflection),
      generationCount: omRecord.generationCount,
      updatedAt: omRecord.updatedAt.getTime(),
      lastObservedAt: omRecord.lastObservedAt?.getTime() ?? null,
    };
  }

  async function listAgentConversationMessages(params: {
    agentId: string;
    provider: string;
    targetKey: string;
    limit: number;
    offset: number;
  }) {
    if (params.provider === 'internal-chat') {
      const messages = await input.internalChat.getMessages({
        agentId: params.agentId,
        conversationKey: params.targetKey,
        limit: params.limit,
        offset: params.offset,
      });
      const accounts = await input.internalChat.listAccounts();
      const agentIdByAccountId = new Map(accounts.map((account) => [account.id, account.agentId ?? null]));

      return {
        items: messages.map((message: CommunicationProviderMessage) => ({
          ...message,
          authorAgentId: message.authorId ? (agentIdByAccountId.get(message.authorId) ?? null) : null,
        })),
        hasMore: messages.length === params.limit,
      };
    }

    const runtime = getInternalAgentRegistry().get(params.agentId)?.runtime;

    if (!runtime) {
      return {
        items: [],
        hasMore: false,
      };
    }

    const messages = await runtime.communication.getMessages({
      provider: params.provider,
      targetKey: params.targetKey,
      limit: params.limit,
      offset: params.offset,
    });

    return {
      items: messages.map((message) => ({
        ...message,
        authorAgentId: null,
      })),
      hasMore: messages.length === params.limit,
    };
  }

  async function listRoles() {
    const [roles, agentCounts] = await Promise.all([
      capabilities.listRoles(),
      db
        .select({
          roleId: agents.roleId,
          count: sql<number>`count(*)`,
        })
        .from(agents)
        .groupBy(agents.roleId),
    ]);
    const capabilityPermissions = await Promise.all(
      roles.map(async (role) => ({
        roleId: role.roleId,
        capabilityIds: await capabilities.listGrantedRoleCapabilities(role.roleId),
      })),
    );
    const assignedAgentCountByRoleId = new Map(
      agentCounts
        .filter((row) => row.roleId)
        .map((row) => [row.roleId as string, row.count]),
    );

    const capabilityMap = new Map(capabilityPermissions.map((row) => [row.roleId, row.capabilityIds]));

    return {
      availableCapabilityIds: forgeCapabilityIds,
      items: roles.map((role) => ({
        roleId: role.roleId,
        name: role.name,
        description: role.description,
        assignedAgentCount: assignedAgentCountByRoleId.get(role.roleId) ?? 0,
        capabilityIds: capabilityMap.get(role.roleId) ?? [],
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      })),
    };
  }

  async function listSystemIntegrations() {
    return integrations.listIntegrations();
  }

  async function getFinance() {
    const [balance, summary, movements, recurringPayables] = await Promise.all([
      finance.getCompanyCashBalance(),
      finance.getCompanyCashSummary(),
      finance.listCompanyCashMovements({ limit: 50 }),
      payables.listRecurringPayables(),
    ]);

    return {
      balanceUsd: balance.balanceUsd,
      summary,
      movements,
      recurringPayables,
    };
  }

  async function getFinanceContracts() {
    const contracts = await finance.listActiveInternalAgentContracts();
    const contractIds = contracts.items.map((contract) => contract.contractId);

    if (contractIds.length === 0) {
      return contracts;
    }

    const spendRows = await db
      .select({
        contractId: agentExecutionSteps.contractId,
        total: sql<number>`coalesce(sum(${agentExecutionSteps.costUsd}), 0)`,
      })
      .from(agentExecutionSteps)
      .where(inArray(agentExecutionSteps.contractId, contractIds))
      .groupBy(agentExecutionSteps.contractId);
    const spentUsdByContractId = new Map(
      spendRows.map((row) => [row.contractId, row.total]),
    );

    return {
      ...contracts,
      items: contracts.items.map((contract) => {
        const spentUsd = spentUsdByContractId.get(contract.contractId) ?? 0;

        return {
          ...contract,
          spentUsd,
          spentPercent: contract.weeklyValueUsd > 0
            ? (spentUsd / contract.weeklyValueUsd) * 100
            : 0,
        };
      }),
    };
  }

  async function getSystemLlm() {
    const [profiles, defaults, prices] = await Promise.all([
      llmSettings.listProfiles(),
      llmSettings.getDefaults(),
      llmModelPrices.listPrices(),
    ]);

    return {
      defaults,
      profiles,
      prices,
    };
  }

  async function getSystemSettings() {
    return systemSettings.getSettings();
  }

  async function getApplicationMigrations() {
    const journalPath = path.resolve(process.cwd(), 'migrations/meta/_journal.json');
    const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
      entries: Array<{
        idx: number;
        when: number;
        tag: string;
      }>;
    };
    const appliedRows = await db.all<{
      id: number;
      hash: string;
      createdAt: number;
    }>(sql`
      select
        id,
        hash,
        created_at as createdAt
      from __drizzle_migrations
      order by created_at asc
    `);
    const appliedByCreatedAt = new Map(appliedRows.map((row) => [Number(row.createdAt), row]));

    return {
      applied: appliedRows,
      entries: journal.entries.map((entry) => {
        const applied = appliedByCreatedAt.get(entry.when);

        return {
          idx: entry.idx,
          tag: entry.tag,
          createdAt: entry.when,
          applied: Boolean(applied),
          hash: applied?.hash ?? null,
          rowId: applied?.id ?? null,
        };
      }),
    };
  }

  return {
    getDashboard,
    listAgents,
    getAgent,
    listAgentRecentConversations,
    listAgentExecutionSteps,
    listAgentThreadMessages,
    getAgentRuntimeMemory,
    listAgentConversationMessages,
    listRoles,
    listSystemIntegrations,
    getSystemSettings,
    getSystemLlm,
    getApplicationMigrations,
    getFinance,
    getFinanceContracts,
  };
}

async function listRecentConversations(
  workspaceBasePath: string,
  internalChat: InternalChatService,
  agentId: string,
  agentName: string,
) {
  const [externalConversations, internalConversations] = await Promise.all([
    listRecentExternalConversations(workspaceBasePath, agentId, agentName),
    listRecentInternalChatConversations(internalChat, agentId, agentName),
  ]);

  return [...internalConversations, ...externalConversations]
    .sort((left, right) => Number(right.updatedAt) - Number(left.updatedAt))
    .slice(0, RECENT_CONVERSATION_LIMIT);
}

async function listRecentExternalConversations(_workspaceBasePath: string, _agentId: string, _agentName: string) {
  const runtime = getInternalAgentRegistry().get(_agentId)?.runtime;

  if (!runtime) {
    return [];
  }

  try {
    const rows = await runtime.communication.listConversations({
      limit: RECENT_CONVERSATION_LIMIT,
    });

    return rows
      .filter((conversation): conversation is (typeof rows)[number] => conversation.provider !== 'internal-chat')
      .map((conversation: (typeof rows)[number]) => {
        const participants = collectConversationParticipants({
          name: conversation.name,
          participants: conversation.participants,
          messages: conversation.messages.map((message: CommunicationMessageView) => ({
            authorDisplayName: message.authorDisplayName,
          })),
        });

        return {
          conversationId: `${conversation.provider}:${conversation.targetKey}`,
          conversationKey: conversation.targetKey,
          provider: conversation.provider,
          type: participants.length > 2 ? 'group' : 'dm',
          name: conversation.name ?? undefined,
          participants,
          updatedAt: Date.parse(conversation.latestMessageAt) || 0,
          messages: conversation.messages.map((message: CommunicationMessageView) => ({
            messageId: message.messageId,
            content: message.content,
            unread: message.unread,
            authorDisplayName: message.authorDisplayName ?? 'Unknown author',
            createdAt: Date.parse(message.createdAt) || 0,
          })),
        };
      });
  } catch (error) {
    console.error(`[AdminReadModel] Failed to load external conversations for agent ${_agentId}:`, error);
    return [];
  }
}

async function listRecentInternalChatConversations(
  internalChat: InternalChatService,
  agentId: string,
  agentName: string,
) {
  try {
    const rows = await internalChat.listRecentConversations(agentId, RECENT_CONVERSATION_LIMIT);

    return Promise.all(rows.map(async (conversation) => {
      const internalConversation = await internalChat.getConversationForAgent(agentId, conversation.targetKey);
      const groupParticipants = await listInternalChatGroupParticipants(internalChat, agentId, conversation.targetKey);
      const participants = collectConversationParticipants({
        name: conversation.name,
        participants: groupParticipants.length > 0 ? groupParticipants : conversation.participants,
        messages: conversation.messages.map((message) => ({
          authorDisplayName: message.authorDisplayName ?? agentName,
        })),
      });

      return {
        conversationId: conversation.targetKey,
        conversationKey: conversation.targetKey,
        provider: conversation.provider,
        type: internalConversation?.type === 'group' ? 'group' : 'dm',
        name: conversation.name ?? undefined,
        participants,
        updatedAt: Date.parse(conversation.latestMessageAt) || 0,
        messages: conversation.messages.map((message) => ({
          messageId: message.messageId,
          content: message.content,
          unread: message.unread,
          authorDisplayName: message.authorDisplayName ?? agentName,
          createdAt: Date.parse(message.createdAt) || 0,
        })),
      };
    }));
  } catch (error) {
    console.error(`[AdminReadModel] Failed to load internal-chat conversations for agent ${agentId}:`, error);
    return [];
  }
}

function collectConversationParticipants(input: {
  name?: string;
  participants?: string[];
  messages: Array<{
    authorDisplayName?: string;
  }>;
}) {
  const participants = new Set<string>();

  for (const participant of input.participants ?? []) {
    if (participant && participant !== input.name) {
      participants.add(participant);
    }
  }

  for (const message of input.messages) {
    if (message.authorDisplayName && message.authorDisplayName !== input.name) {
      participants.add(message.authorDisplayName);
    }
  }

  return [...participants];
}

async function listInternalChatGroupParticipants(
  internalChat: InternalChatService,
  agentId: string,
  conversationKey: string,
) {
  try {
    const conversation = await internalChat.getConversationForAgent(agentId, conversationKey);

    if (!conversation || conversation.type !== 'group') {
      return [];
    }

    const members = await internalChat.listGroupMembers({
      agentId,
      groupId: conversationKey,
    });
    return members.map((member) => member.participantName);
  } catch {
    return [];
  }
}

async function listThreadMessages(
  workspaceBasePath: string,
  agentId: string,
  input: {
    page: number;
    perPage: number;
  },
) {
  try {
    const mastraAgentId = toMastraSafeIdentifier(agentId);
    const agentDatabasePath = path.resolve(workspaceBasePath, agentId, 'database.db');
    const client = createClient({
      url: `file:${agentDatabasePath}`,
    });
    const storage = new LibSQLStore({
      id: `${mastraAgentId}_storage`,
      client,
    });
    const memory = storage.stores.memory;

    if (!memory) {
      return [];
    }

    if (hasCreateThread(memory)) {
      await memory.createThread({
        resourceId: mastraAgentId,
        threadId: mastraAgentId,
      });
    }

    const result = await memory.listMessages({
      threadId: mastraAgentId,
      resourceId: mastraAgentId,
      page: input.page,
      perPage: input.perPage,
      orderBy: {
        field: 'createdAt',
        direction: 'DESC',
      },
    });
    return result.messages.map((message: MastraDBMessage) => ({
      id: message.id,
      role: message.role,
      createdAt: message.createdAt.getTime(),
      threadId: message.threadId ?? null,
      resourceId: message.resourceId ?? null,
      type: message.type ?? null,
      content: message.content,
    }));
  } catch (error) {
    console.error(`[AdminReadModel] Failed to load recent thread messages for agent ${agentId}:`, error);
    return [];
  }
}

function parseProviderCredentials(encryptedCredentials: string) {
  const decrypted = decryptSecret(encryptedCredentials);

  try {
    return JSON.parse(decrypted) as unknown;
  } catch {
    return decrypted;
  }
}

function toScheduleSummary(row: typeof agentSchedules.$inferSelect) {
  const isHeartbeat = row.kind === 'heartbeat';

  return {
    scheduleId: row.id,
    kind: row.kind as 'agent' | 'heartbeat',
    name: row.name,
    description: row.description ?? undefined,
    scheduleType: row.scheduleType as 'cron' | 'date',
    cronExpression: row.cronExpression ?? undefined,
    scheduledDate: row.scheduledDate ?? undefined,
    timezone: row.timezone,
    content: row.content,
    wakeWhenRunning: isHeartbeat ? false : row.wakeWhenRunning === 1,
    isActive: row.isActive === 1,
    lastTriggeredAt: row.lastTriggeredAt ?? undefined,
    nextTriggerAt: row.nextTriggerAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function formatMemoryValue(value: string | null | undefined) {
  if (!value || !value.trim()) {
    return null;
  }

  return value.trim();
}

function formatWorkingMemoryValue(value: string | null | undefined) {
  if (!value || !value.trim()) {
    return null;
  }

  const trimmed = value.trim();

  try {
    return renderWorkingMemoryMarkdown(JSON.parse(trimmed));
  } catch {
    return trimmed;
  }
}

function renderWorkingMemoryMarkdown(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value, null, 2);
  }

  const sections = Object.entries(value)
    .filter(([, sectionValue]) => sectionValue && typeof sectionValue === 'object' && !Array.isArray(sectionValue))
    .map(([sectionKey, sectionValue]) => {
      const entries = Object.entries(sectionValue as Record<string, unknown>)
        .filter(([, item]) => typeof item === 'string' && item.trim())
        .map(([fieldKey, item]) => `- **${humanizeMemoryKey(fieldKey)}**: ${String(item).trim()}`);

      if (entries.length === 0) {
        return null;
      }

      return [`## ${humanizeMemoryKey(sectionKey)}`, ...entries].join('\n');
    })
    .filter(Boolean);

  if (sections.length === 0) {
    return JSON.stringify(value, null, 2);
  }

  return sections.join('\n\n');
}

function humanizeMemoryKey(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
