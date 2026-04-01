import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { desc, eq, sql } from 'drizzle-orm';
import { createClient } from '@libsql/client';
import { LibSQLStore } from '@mastra/libsql';
import { toMastraSafeIdentifier } from '@mastra-engine/core';

import type { Database } from '../database/index';
import { agents, agentExecutionSteps, agentProviders, agentSchedules } from '../database/schema';
import { getInternalAgentRegistry } from '../agents/internal-agent-registry';
import { createMicroErpReadModel } from '../micro-erp/read-model';
import { createCompanyPayables } from '../finance/company-payables';
import { createCapabilityStore } from '../capabilities/store';
import { forgeCustomToolIds, forgeWorkflowIds } from '../capabilities/catalog';
import { decryptSecret } from '../encryption/crypto';
import { createAgentNotificationStore } from '../notifications/store';
import { createSystemIntegrationStore } from '../system-integrations/store';
import { createLlmSettingsStore } from '../llm/settings-store';
import { createLlmModelPriceStore } from '../llm/model-price-store';
import type { GitHubAppManager } from '../github/manager';
import { createSystemSettingsStore } from '../system-settings/store';
import type { InternalChatService } from '../communication/internal-chat-service';

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
    const [agentRows, balance, summary, activeContracts, cashMovements, functions, roles] =
      await Promise.all([
        db.query.agents.findMany(),
        finance.getCompanyCashBalance(),
        finance.getCompanyCashSummary(),
        finance.listActiveInternalAgentContracts(),
        finance.listCompanyCashMovements({
          limit: RECENT_CASH_MOVEMENT_LIMIT,
        }),
        capabilities.listFunctions(),
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
        functions: functions.length,
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
    const [agentRows, functionRows, providerRows, llmProfiles] = await Promise.all([
      db.query.agents.findMany({
        orderBy: (fields, { asc }) => [asc(fields.name)],
      }),
      capabilities.listFunctions(),
      db.query.agentProviders.findMany(),
      llmSettings.listProfiles(),
    ]);
    const registry = getInternalAgentRegistry();
    const functionMap = new Map(functionRows.map((row) => [row.functionId, row]));
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
      const agentFunction = agent.functionId ? (functionMap.get(agent.functionId) ?? null) : null;
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
        functionId: agent.functionId,
        functionName: agentFunction?.name ?? null,
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
      functions,
      llmProfiles,
      providerRows,
      recentSteps,
      agentScheduleRows,
      activeContract,
      recentNotifications,
      recentConversations,
      githubProvisioning,
    ] =
      await Promise.all([
        capabilities.listFunctions(),
        llmSettings.listProfiles(),
        db.query.agentProviders.findMany({
          where: eq(agentProviders.agentId, agentId),
        }),
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
        }),
        listRecentConversations(input.workspaceBasePath, input.internalChat, agentId, agent.name),
        input.githubApps.getAgentProvisioning(agentId),
      ]);
    const registry = getInternalAgentRegistry();
    const loadedAgent = registry.get(agentId);
    const functionMap = new Map(functions.map((row) => [row.functionId, row]));
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
    const agentFunction = agent.functionId ? (functionMap.get(agent.functionId) ?? null) : null;
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
      function: agentFunction && {
        ...agentFunction,
        description: agentFunction.description ?? null,
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
      githubProvisioning,
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
      recentConversations,
      recentThreadMessages: await listRecentThreadMessages(input.workspaceBasePath, agentId),
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    };
  }

  async function listFunctions() {
    const [functions, agentCounts] = await Promise.all([
      capabilities.listFunctions(),
      db
        .select({
          functionId: agents.functionId,
          count: sql<number>`count(*)`,
        })
        .from(agents)
        .groupBy(agents.functionId),
    ]);
    const countMap = new Map(
      agentCounts
        .filter((row) => row.functionId)
        .map((row) => [row.functionId as string, row.count]),
    );

    return functions.map((agentFunction) => ({
      ...agentFunction,
      assignedAgentCount: countMap.get(agentFunction.functionId) ?? 0,
    }));
  }

  async function listRoles() {
    const [roles, functions] = await Promise.all([
      capabilities.listRoles(),
      capabilities.listFunctions(),
    ]);
    const [toolPermissions, workflowPermissions] = await Promise.all([
      Promise.all(
        roles.map(async (role) => ({
          roleId: role.roleId,
          toolIds: await capabilities.listRoleToolPermissions(role.roleId),
        })),
      ),
      Promise.all(
        roles.map(async (role) => ({
          roleId: role.roleId,
          workflowIds: await capabilities.listRoleWorkflowPermissions(role.roleId),
        })),
      ),
    ]);
    const functionCountByRoleId = new Map<string, number>();

    for (const agentFunction of functions) {
      for (const roleId of agentFunction.roleIds) {
        functionCountByRoleId.set(
          roleId,
          (functionCountByRoleId.get(roleId) ?? 0) + 1,
        );
      }
    }

    const toolMap = new Map(toolPermissions.map((row) => [row.roleId, row.toolIds]));
    const workflowMap = new Map(workflowPermissions.map((row) => [row.roleId, row.workflowIds]));

    return {
      availableToolIds: forgeCustomToolIds,
      availableWorkflowIds: forgeWorkflowIds,
      items: roles.map((role) => ({
        roleId: role.roleId,
        name: role.name,
        description: role.description,
        assignedFunctionCount: functionCountByRoleId.get(role.roleId) ?? 0,
        toolIds: toolMap.get(role.roleId) ?? [],
        workflowIds: workflowMap.get(role.roleId) ?? [],
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
    listFunctions,
    listRoles,
    listSystemIntegrations,
    getSystemSettings,
    getSystemLlm,
    getApplicationMigrations,
    getFinance,
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
      .filter((conversation) => conversation.provider !== 'internal-chat')
      .map((conversation) => ({
        conversationId: `${conversation.provider}:${conversation.targetKey}`,
        conversationKey: conversation.targetKey,
        provider: conversation.provider,
        type: 'conversation',
        name: conversation.name ?? undefined,
        participants: [...(conversation.participants ?? [])],
        updatedAt: Date.parse(conversation.latestMessageAt) || 0,
        messages: conversation.messages.map((message) => ({
          messageId: message.messageId,
          content: message.content,
          unread: message.unread,
          authorDisplayName: message.authorDisplayName ?? 'Unknown author',
          createdAt: Date.parse(message.createdAt) || 0,
        })),
      }));
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

    return rows.map((conversation) => {
      const participants = new Set<string>();
      const conversationName = conversation.name ?? 'Conversation';

      participants.add(agentName);
      if (conversationName !== 'Conversation') {
        participants.add(conversationName);
      }

      for (const message of conversation.messages) {
        if (message.authorDisplayName) {
          participants.add(message.authorDisplayName);
        }
      }

      return {
        conversationId: conversation.targetKey,
        conversationKey: conversation.targetKey,
        provider: conversation.provider,
        type: participants.size > 2 ? 'group' : 'dm',
        name: conversation.name ?? undefined,
        participants: [...participants],
        updatedAt: Date.parse(conversation.latestMessageAt) || 0,
        messages: conversation.messages.map((message) => ({
          messageId: message.messageId,
          content: message.content,
          unread: message.unread,
          authorDisplayName: message.authorDisplayName ?? agentName,
          createdAt: Date.parse(message.createdAt) || 0,
        })),
      };
    });
  } catch (error) {
    console.error(`[AdminReadModel] Failed to load internal-chat conversations for agent ${agentId}:`, error);
    return [];
  }
}

async function listRecentThreadMessages(workspaceBasePath: string, agentId: string) {
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
      page: 0,
      perPage: 20,
      orderBy: {
        field: 'createdAt',
        direction: 'DESC',
      },
    });

    type ThreadMessageRecord = (typeof result.messages)[number];
    type ThreadMessagePart = NonNullable<ThreadMessageRecord['content']['parts']>[number];

    function collectThreadText(message: ThreadMessageRecord) {
      const textParts: string[] = [];
      const reasoningParts: string[] = [];
      const toolCalls: Array<{
        toolCallId: string;
        toolName: string;
        state: 'partial-call' | 'call';
        args: unknown;
      }> = [];
      const toolResults: Array<{
        toolCallId: string;
        toolName: string;
        args: unknown;
        result: unknown;
      }> = [];
      const otherParts: Array<{
        type: 'source' | 'file' | 'step-start';
        summary: string;
        data: unknown;
      }> = [];

      for (const part of message.content.parts ?? []) {
        collectThreadPart(part, {
          textParts,
          reasoningParts,
          toolCalls,
          toolResults,
          otherParts,
        });
      }

      return {
        content:
          typeof message.content.content === 'string'
            ? message.content.content.trim()
            : textParts.join('\n').trim(),
        reasoning: reasoningParts.join('\n\n').trim(),
        toolCalls,
        toolResults,
        otherParts,
      };
    }

    function collectThreadPart(
      part: ThreadMessagePart,
      output: {
        textParts: string[];
        reasoningParts: string[];
        toolCalls: Array<{
          toolCallId: string;
          toolName: string;
          state: 'partial-call' | 'call';
          args: unknown;
        }>;
        toolResults: Array<{
          toolCallId: string;
          toolName: string;
          args: unknown;
          result: unknown;
        }>;
        otherParts: Array<{
          type: 'source' | 'file' | 'step-start';
          summary: string;
          data: unknown;
        }>;
      },
    ) {
      if (part.type === 'text') {
        const text = part.text.trim();
        if (text) {
          output.textParts.push(text);
        }
        return;
      }

      if (part.type === 'reasoning') {
        const reasoning = part.reasoning.trim();
        if (reasoning) {
          output.reasoningParts.push(reasoning);
        }
        return;
      }

      if (part.type !== 'tool-invocation') {
        if (part.type === 'source') {
          output.otherParts.push({
            type: 'source',
            summary: part.source.title?.trim() || part.source.url,
            data: {
              title: part.source.title ?? null,
              url: part.source.url,
            },
          });
          return;
        }

        if (part.type === 'file') {
          output.otherParts.push({
            type: 'file',
            summary: part.mimeType,
            data: {
              mimeType: part.mimeType,
            },
          });
          return;
        }

        if (part.type === 'step-start') {
          output.otherParts.push({
            type: 'step-start',
            summary: 'Step start',
            data: {
              type: part.type,
            },
          });
        }
        return;
      }

      const invocation = part.toolInvocation;

      if (invocation.state === 'result') {
        output.toolResults.push({
          toolCallId: invocation.toolCallId,
          toolName: invocation.toolName,
          args: invocation.args,
          result: invocation.result,
        });
        return;
      }

      output.toolCalls.push({
        toolCallId: invocation.toolCallId,
        toolName: invocation.toolName,
        state: invocation.state,
        args: invocation.args,
      });
    }

    return result.messages.map((message) => {
      const threadContent = collectThreadText(message);

      return {
        messageId: message.id,
        role: message.role,
        type: message.type ?? null,
        content: threadContent.content,
        reasoning: threadContent.reasoning,
        toolCalls: threadContent.toolCalls,
        toolResults: threadContent.toolResults,
        otherParts: threadContent.otherParts,
        createdAt: message.createdAt.getTime(),
      };
    });
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
    isActive: row.isActive === 1,
    lastTriggeredAt: row.lastTriggeredAt ?? undefined,
    nextTriggerAt: row.nextTriggerAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
