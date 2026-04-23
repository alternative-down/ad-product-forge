import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { createClient } from '@libsql/client';
import {
  LibsqlConversationStore,
  toMastraSafeIdentifier,
  type CommunicationMessageView,
  type CommunicationProviderMessage,
} from '@forge-runtime/core';

import type { Database } from '../database/index';
import {
  agents,
  agentExecutionContracts,
  agentExecutionSteps,
  agentMcpConfigs,
  agentNotifications,
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
import { createAgentCheckpointedOmStateStore } from '../agents/checkpointed-om-state-store';
import type { AgentLongTermMemoryRecallDebugSearchInput } from '../agents/agent-long-term-memory-recall';
import {
  createAgentLongTermMemoryStore,
  type LongTermMemoryRecallSnapshot,
  type LongTermMemoryState,
} from '../agents/agent-long-term-memory-store';

const RECENT_STEP_LIMIT = 10;
const RECENT_CASH_MOVEMENT_LIMIT = 10;
const RECENT_NOTIFICATION_LIMIT = 10;
const RECENT_CONVERSATION_LIMIT = 10;
const ADMIN_OBSERVABILITY_READ_TIMEOUT_MS = 5_000;

type RuntimeStoredMessage = {
  id: string;
  role?: string;
  type?: string;
  content?: unknown;
  threadId?: string | null;
  resourceId?: string | null;
  createdAt?: string | Date;
};

type RuntimeStoredMessagePart = {
  type: string;
  text?: string;
  [key: string]: unknown;
};

type ClosableLibsqlClient = ReturnType<typeof createClient> & {
  close?: () => void | Promise<void>;
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timer: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function closeLibsqlClient(client: ClosableLibsqlClient) {
  await client.close?.();
}

function isMemoryRecallText(value: string) {
  return /^\s*<memory-recall\b[\s\S]*<\/memory-recall>\s*$/u.test(value);
}

function splitMemoryRecallSegments(value: string) {
  const segments: Array<{
    kind: 'text' | 'memory-recall';
    value: string;
  }> = [];
  const pattern = /<memory-recall\b[\s\S]*?<\/memory-recall>/gu;
  let lastIndex = 0;

  for (const match of value.matchAll(pattern)) {
    const matchStart = match.index ?? 0;
    const matchText = match[0];
    const before = value.slice(lastIndex, matchStart).trim();

    if (before) {
      segments.push({
        kind: 'text',
        value: before,
      });
    }

    segments.push({
      kind: 'memory-recall',
      value: matchText.trim(),
    });
    lastIndex = matchStart + matchText.length;
  }

  const after = value.slice(lastIndex).trim();

  if (after) {
    segments.push({
      kind: 'text',
      value: after,
    });
  }

  return segments;
}

function extractLatestMessagePreview(content: unknown) {
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
    if (!part || typeof part !== 'object') {
      continue;
    }

    if (
      'type' in part &&
      (part.type === 'text' || part.type === 'reasoning') &&
      'text' in part &&
      typeof part.text === 'string'
    ) {
      const text = splitMemoryRecallSegments(part.text)
        .filter((segment) => segment.kind === 'text')
        .map((segment) => segment.value)
        .join('\n')
        .trim();

      if (text && !isMemoryRecallText(text)) {
        return truncatePreview(text);
      }
    }
  }

  if (typeof record.content === 'string' && record.content.trim()) {
    const text = splitMemoryRecallSegments(record.content)
      .filter((segment) => segment.kind === 'text')
      .map((segment) => segment.value)
      .join('\n')
      .trim();

    if (text && !isMemoryRecallText(text)) {
      return truncatePreview(text);
    }
  }

  if (typeof record.reasoning === 'string' && record.reasoning.trim()) {
    return truncatePreview(record.reasoning.trim());
  }

  return null;
}

function extractLatestMessageToolBadge(content: unknown) {
  if (!content || typeof content !== 'object') {
    return null;
  }

  const record = content as {
    parts?: unknown;
    toolInvocations?: unknown;
    content?: unknown;
  };
  const parts = Array.isArray(record.parts) ? record.parts : [];
  const topLevelToolInvocations = Array.isArray(record.toolInvocations) ? record.toolInvocations : [];

  for (const part of [...parts].reverse()) {
    if (!part || typeof part !== 'object' || !('type' in part) || part.type !== 'text' || typeof part.text !== 'string') {
      continue;
    }

    if (splitMemoryRecallSegments(part.text).some((segment) => segment.kind === 'memory-recall')) {
      return { icon: '🧠', label: 'Recall' };
    }
  }

  if (
    typeof record.content === 'string'
    && splitMemoryRecallSegments(record.content).some((segment) => segment.kind === 'memory-recall')
  ) {
    return { icon: '🧠', label: 'Recall' };
  }

  for (const part of [...parts].reverse()) {
    if (!part || typeof part !== 'object' || !('type' in part) || part.type !== 'tool-invocation') {
      continue;
    }

    if (!('toolInvocation' in part) || !part.toolInvocation || typeof part.toolInvocation !== 'object') {
      continue;
    }

    const toolName = 'toolName' in part.toolInvocation && typeof part.toolInvocation.toolName === 'string'
      ? part.toolInvocation.toolName
      : null;

    if (toolName) {
      return toToolBadge(toolName);
    }
  }

  for (const invocation of [...topLevelToolInvocations].reverse()) {
    if (!invocation || typeof invocation !== 'object' || !('toolName' in invocation) || typeof invocation.toolName !== 'string') {
      continue;
    }

    return toToolBadge(invocation.toolName);
  }

  return null;
}

function toToolBadge(toolName: string) {
  const normalizedToolName = toolName.toLowerCase();

  if (
    normalizedToolName.includes('workspace_execute_command') ||
    normalizedToolName.includes('workspace_read_file') ||
    normalizedToolName.includes('workspace_write_file') ||
    normalizedToolName.includes('workspace_list_files')
  ) {
    return { icon: '🛠', label: 'Workspace' };
  }

  if (normalizedToolName.includes('github')) {
    return { icon: '🐙', label: 'GitHub' };
  }

  if (
    normalizedToolName.includes('conversation') ||
    normalizedToolName.includes('chat') ||
    normalizedToolName.includes('message') ||
    normalizedToolName.includes('notification')
  ) {
    return { icon: '💬', label: 'Chat' };
  }

  if (normalizedToolName.includes('search') || normalizedToolName.includes('web')) {
    return { icon: '🔎', label: 'Busca' };
  }

  return null;
}

function truncatePreview(value: string) {
  return value.length > 220 ? `${value.slice(0, 217).trimEnd()}...` : value;
}

async function readLongTermMemoryRecallSnapshot(db: Database, agentId: string) {
  const state = await createAgentLongTermMemoryStore(db, {
    agentId,
  }).readRecallState();

  return state.snapshot;
}

async function readLongTermMemoryState(db: Database, agentId: string) {
  const state = await createAgentLongTermMemoryStore(db, {
    agentId,
  }).readState();

  return state satisfies LongTermMemoryState;
}

async function readCheckpointedOmState(db: Database, agentId: string) {
  try {
    return await createAgentCheckpointedOmStateStore(db, {
      agentId,
    }).readState();
  } catch (error) {
    console.error(`[AdminReadModel] Failed to load checkpointed OM state for agent ${agentId}:`, error);
    return null;
  }
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
        absentAgents: agentRows.filter((agent) => agent.executionState === 'absent').length,
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
    const [agentRows, roleRows, providerRows, llmProfiles, unreadNotificationRows] = await Promise.all([
      db.query.agents.findMany({
        orderBy: (fields, { asc }) => [asc(fields.name)],
      }),
      capabilities.listRoles(),
      db.query.agentProviders.findMany(),
      llmSettings.listProfiles(),
      db
        .select({
          agentId: agentNotifications.agentId,
          count: sql<number>`count(*)`,
        })
        .from(agentNotifications)
        .where(sql`${agentNotifications.readAt} is null`)
        .groupBy(agentNotifications.agentId),
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
    const unreadNotificationCountByAgentId = new Map(
      unreadNotificationRows.map((row) => [row.agentId, row.count]),
    );
    const recentStepsByAgentId = new Map(
      await Promise.all(
        agentRows.map(async (agent) => [
          agent.id,
          await db.query.agentExecutionSteps.findMany({
            where: and(
              eq(agentExecutionSteps.agentId, agent.id),
              eq(agentExecutionSteps.kind, 'agent-step'),
            ),
            orderBy: [desc(agentExecutionSteps.createdAt)],
            limit: 6,
          }),
        ] as const),
      ),
    );

    for (const provider of providerRows) {
      const existingTypes = providerTypesByAgentId.get(provider.agentId) ?? [];
      existingTypes.push(provider.providerType);
      providerTypesByAgentId.set(provider.agentId, existingTypes);
    }

    const runtimeMemoryByAgentId = new Map(
      await Promise.all(
        agentRows.map(async (agent) => [
          agent.id,
          await withTimeout(
            getAgentRuntimeMemory(agent.id),
            ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
            `Admin runtime memory read timed out for ${agent.id}`,
          ).catch((error) => {
            console.error(`[AdminReadModel] Failed to load runtime memory for agent ${agent.id}:`, error);
            return null;
          }),
        ] as const),
      ),
    );
    const latestThreadDetailsByAgentId = new Map(
      await Promise.all(
        agentRows.map(async (agent) => {
          const threadMessages = await withTimeout(
            listThreadMessages(input.workspaceBasePath, agent.id, {
              page: 0,
              perPage: 8,
            }),
            ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
            `Admin latest thread details read timed out for ${agent.id}`,
          ).catch((error) => {
            console.error(`[AdminReadModel] Failed to load latest thread details for agent ${agent.id}:`, error);
            return {
              items: [],
              hasMore: false,
            };
          });
          const messages = threadMessages.items;
          let preview: string | null = null;
          let toolBadge: ReturnType<typeof extractLatestMessageToolBadge> = null;

          for (const message of messages) {
            if (message.role !== 'assistant') {
              continue;
            }

            preview ??= extractLatestMessagePreview(message.content);
            toolBadge ??= extractLatestMessageToolBadge(message.content);

            if (preview) {
              break;
            }
          }

          return [
            agent.id,
            {
              preview,
              toolBadge,
            },
          ] as const;
        }),
      ),
    );
    const longTermMemoryStateByAgentId = new Map(
      await Promise.all(
        agentRows.map(async (agent) => [
          agent.id,
          await withTimeout(
            readLongTermMemoryState(db, agent.id),
            ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
            `Admin LTM state read timed out for ${agent.id}`,
          ).catch((error) => {
            console.error(`[AdminReadModel] Failed to load LTM state for agent ${agent.id}:`, error);
            return null;
          }),
        ] as const),
      ),
    );
    const runtimeLtmSnapshotByAgentId = new Map(
      await Promise.all(
        agentRows.map(async (agent) => {
          const loadedAgent = registry.get(agent.id);
          const snapshot = loadedAgent?.runtime.longTermMemory
            ? await withTimeout(
              loadedAgent.runtime.longTermMemory.readSnapshot(),
              ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
              `Admin runtime LTM snapshot timed out for ${agent.id}`,
            ).catch((error) => {
              console.error(`[AdminReadModel] Failed to load runtime LTM snapshot for agent ${agent.id}:`, error);
              return null;
            })
            : null;
          return [agent.id, snapshot] as const;
        }),
      ),
    );

    return agentRows.map((agent) => {
      const loadedAgent = registry.get(agent.id);
      const runnerSnapshot = loadedAgent?.runner.getSnapshot() ?? null;
      const role = agent.roleId ? (roleMap.get(agent.roleId) ?? null) : null;
      const modelProfile = llmProfileMap.get(agent.modelProfileId);
      const omModelProfile = llmProfileMap.get(agent.omModelProfileId);
      const recentSteps = recentStepsByAgentId.get(agent.id) ?? [];
      const lastStep = recentSteps[0] ?? null;
      const runtimeMemory = runtimeMemoryByAgentId.get(agent.id) ?? null;
      const longTermMemoryState = longTermMemoryStateByAgentId.get(agent.id) ?? null;
      const runtimeLtmSnapshot = runtimeLtmSnapshotByAgentId.get(agent.id) ?? null;
      const latestThreadDetails = latestThreadDetailsByAgentId.get(agent.id) ?? null;
      const averageStepIntervalMs = recentSteps.length >= 2
        ? Math.round(
            recentSteps
              .slice(0, 6)
              .map((step, index, items) => {
                if (index === items.length - 1) {
                  return null;
                }

                return Math.max(step.createdAt - items[index + 1].createdAt, 0);
              })
              .filter((value): value is number => value !== null)
              .reduce((total, value, _index, values) => total + value / values.length, 0),
          )
        : null;
      const executionState = agent.executionState;

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
        overview: {
          lastStepAt: lastStep?.createdAt ?? null,
          lastStepContextTokens: lastStep
            ? lastStep.inputTokens
            : null,
          lastStepPreview: latestThreadDetails?.preview ?? null,
          lastToolBadge: latestThreadDetails?.toolBadge ?? null,
          lastStepTokens: lastStep
            ? lastStep.inputTokens + lastStep.cachedInputTokens + lastStep.outputTokens
            : null,
          lastStepCostUsd: lastStep?.costUsd ?? null,
          averageStepIntervalMs,
          unreadNotificationCount: unreadNotificationCountByAgentId.get(agent.id) ?? 0,
          om: runtimeMemory
            ? {
                generationCount: runtimeMemory.generationCount,
                checkpointGeneration: runtimeMemory.checkpointGeneration,
                recentRawTokenCount: runtimeMemory.metrics.recentRawTokenCount,
                recentRawTokenLimit: runtimeMemory.metrics.recentRawTokenLimit,
                overflowTokenCount: runtimeMemory.metrics.overflowTokenCount,
                overflowTokenLimit: runtimeMemory.metrics.observationTriggerTokenLimit,
                observationTokenCount: runtimeMemory.metrics.observationTokenCount,
                observationTokenLimit: runtimeMemory.metrics.reflectionTriggerTokenLimit,
                reflectionTokenCount: runtimeMemory.metrics.reflectionTokenCount,
                reflectionTokenLimit: runtimeMemory.metrics.reflectionBudget,
                checkpointTokenCount: runtimeMemory.metrics.checkpointTokenCount,
              }
            : null,
          ltm: {
            running: executionState === 'idle' ? (runtimeLtmSnapshot?.running ?? false) : false,
            queued: executionState === 'idle' ? (runtimeLtmSnapshot?.queued ?? false) : false,
            packageCount: longTermMemoryState?.packages.length ?? 0,
          },
        },
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
    const executionState = agent.executionState;
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
    return listThreadMessages(input.workspaceBasePath, params.agentId, {
      page: params.page,
      perPage: params.perPage,
    });
  }

  async function listAgentLongTermMemoryThreadMessages(params: {
    agentId: string;
    page: number;
    perPage: number;
  }) {
    return listThreadMessages(input.workspaceBasePath, params.agentId, {
      page: params.page,
      perPage: params.perPage,
      threadId: toMastraSafeIdentifier(`${params.agentId}_long_term_memory`),
    });
  }

  async function getAgentRuntimeMemory(agentId: string) {
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
    });

    if (!agent) {
      return null;
    }

    const loadedAgent = getInternalAgentRegistry().get(agentId);
    const mastraAgentId = toMastraSafeIdentifier(agentId);
    const agentDatabasePath = path.resolve(input.workspaceBasePath, agentId, 'database.db');
    const client: ClosableLibsqlClient = createClient({
      url: `file:${agentDatabasePath}`,
    });
    const conversationStore = new LibsqlConversationStore({
      client,
      tablePrefix: mastraAgentId,
    });

    try {
      const agentWorkspaceRoot = path.resolve(input.workspaceBasePath, agentId);
      const agentWorkspaceDir = agent.workspaceFilesystem?.basePath
        ? path.resolve(agentWorkspaceRoot, agent.workspaceFilesystem.basePath)
        : path.resolve(agentWorkspaceRoot, 'workspace');
      const agentContextPath = path.resolve(agentWorkspaceDir, 'AGENT_CONTEXT.md');
      const agentContext = await readFile(agentContextPath, 'utf8')
        .then((content) => content.trim() || null)
        .catch(() => null);
      const workingMemory = (await conversationStore.read({
        threadId: mastraAgentId,
        resourceId: mastraAgentId,
      }))?.workingMemory ?? null;
      const customState = await readCheckpointedOmState(db, agentId);
      const ltmRecall = await readLongTermMemoryRecallSnapshot(db, agentId);
      const reflection = customState
        ? customState.activeReflectionBlocks
          .map((block) => typeof block.text === 'string' ? block.text.trim() : '')
          .filter(Boolean)
          .join('\n')
        || customState.observationBlocks
          .filter((block) => block.reflectedGeneration !== null)
          .map((block) => block.text.trim())
          .filter(Boolean)
          .join('\n')
        : '';
      const observations = customState
        ? customState.observationBlocks
          .filter((block) => block.reflectedGeneration === null)
          .map((block) => block.text.trim())
          .filter(Boolean)
          .join('\n')
        : '';
      const settings = await systemSettings.getSettings();
      const metricsSnapshot = customState?.latestMetrics;
      const generationCount = customState?.checkpointGeneration ?? 0;
      const updatedAt = metricsSnapshot?.updatedAt
        ? Date.parse(metricsSnapshot.updatedAt)
        : null;
      const lastObservedAt = metricsSnapshot?.latestThreadMessageAt
        ? Date.parse(metricsSnapshot.latestThreadMessageAt)
        : null;
      const runtimeLtmSnapshot = loadedAgent?.runtime.longTermMemory
        ? await withTimeout(
          loadedAgent.runtime.longTermMemory.readSnapshot(),
          ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
          `Agent runtime memory LTM snapshot timed out for ${agentId}`,
        ).catch(() => null)
        : null;
      const persistedLtmState = await withTimeout(
        readLongTermMemoryState(db, agentId),
        ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
        `Agent runtime memory persisted LTM state timed out for ${agentId}`,
      ).catch(() => null);
      const ltm = (runtimeLtmSnapshot
        ? {
            ...runtimeLtmSnapshot,
            running: agent.executionState === 'idle' ? runtimeLtmSnapshot.running : false,
            queued: agent.executionState === 'idle' ? runtimeLtmSnapshot.queued : false,
          }
        : null) ?? (persistedLtmState
        ? {
            running: false,
            queued: false,
            lastRunAt: persistedLtmState.lastRunAt ? Date.parse(persistedLtmState.lastRunAt) : null,
            lastRunError: persistedLtmState.lastRunError,
            lastRunErrorAt: persistedLtmState.lastRunErrorAt ? Date.parse(persistedLtmState.lastRunErrorAt) : null,
            lastWrittenPackageId: persistedLtmState.lastWrittenPackageId,
            lastWrittenAt: persistedLtmState.lastWrittenAt ? Date.parse(persistedLtmState.lastWrittenAt) : null,
            packageCount: persistedLtmState.packages.length,
          }
        : null);

      return {
        workingMemory: formatWorkingMemoryValue(workingMemory),
        agentContext,
        executionState: agent.executionState as 'idle' | 'running' | 'absent',
        lastExecutionError: agent.lastExecutionError ?? null,
        lastExecutionErrorAt: agent.lastExecutionErrorAt ?? null,
        observations,
        reflection,
        generationCount,
        updatedAt,
        lastObservedAt,
        checkpointGeneration: customState?.checkpointGeneration ?? null,
        checkpointSummary: customState?.checkpointSummary?.text ?? null,
        checkpointUpdatedAt: customState?.checkpointSummary?.updatedAt
          ? Date.parse(customState.checkpointSummary.updatedAt)
          : null,
        ltmRecall: ltmRecall
          ? {
              status: ltmRecall.status,
              query: ltmRecall.query,
            resultIds: ltmRecall.resultIds,
            resultCount: ltmRecall.resultCount,
            resultScores: ltmRecall.resultScores,
            graphHit: ltmRecall.graphHit,
            stepsJson: ltmRecall.stepsJson,
            updatedAt: Date.parse(ltmRecall.updatedAt),
            lastInitAt: ltmRecall.lastInitAt ? Date.parse(ltmRecall.lastInitAt) : null,
            searchMode: ltmRecall.searchMode,
            topK: ltmRecall.topK,
            graphTopK: ltmRecall.graphTopK,
            graphThreshold: ltmRecall.graphThreshold,
            graphRandomWalkSteps: ltmRecall.graphRandomWalkSteps,
            indexPaths: ltmRecall.indexPaths,
            workspaceFileCount: ltmRecall.workspaceFileCount,
            memoryFileCount: ltmRecall.memoryFileCount,
            checkpointFileCount: ltmRecall.checkpointFileCount,
            error: ltmRecall.error,
          }
        : null,
      ltm,
      metrics: {
        rawMessageCount: metricsSnapshot?.rawMessageCount ?? 0,
        recentRawMessageCount: metricsSnapshot?.recentRawMessageCount ?? 0,
        recentRawTokenCount: metricsSnapshot?.recentRawTokenCount ?? 0,
        recentRawTokenLimit: settings.checkpointedOmRecentRawTokens,
        overflowMessageCount: metricsSnapshot?.overflowMessageCount ?? 0,
        overflowTokenCount: metricsSnapshot?.overflowTokenCount ?? 0,
        observationTriggerTokenLimit: settings.checkpointedOmRawObservationBatchTokens,
        activeObservationBlockCount: metricsSnapshot?.activeObservationBlockCount
          ?? customState?.observationBlocks.filter((block) => block.reflectedGeneration === null).length
          ?? 0,
        observationTokenCount: metricsSnapshot?.observationTokenCount
          ?? customState?.observationBlocks.filter((block) => block.reflectedGeneration === null)
            .reduce((total, block) => total + block.tokenCount, 0)
          ?? 0,
        reflectionTriggerTokenLimit: settings.checkpointedOmObservationReflectionBatchTokens,
        activeReflectionBlockCount: metricsSnapshot?.activeReflectionBlockCount
          ?? customState?.activeReflectionBlocks.length
          ?? 0,
        reflectionTokenCount: metricsSnapshot?.reflectionTokenCount
          ?? customState?.activeReflectionBlocks.reduce((total, block) => total + block.tokenCount, 0)
          ?? 0,
        reflectionBudget: Math.max(
          0,
          settings.checkpointedOmTotalContextTokens
            - settings.checkpointedOmRecentRawTokens
            - settings.checkpointedOmRawObservationBatchTokens
            - settings.checkpointedOmObservationReflectionBatchTokens,
        ),
        checkpointTokenCount: metricsSnapshot?.checkpointTokenCount ?? customState?.checkpointSummary?.tokenCount ?? 0,
        checkpointSummaryUpToGeneration: metricsSnapshot?.checkpointSummaryUpToGeneration
          ?? customState?.checkpointSummary?.upToGeneration
          ?? null,
        latestThreadMessageAt: metricsSnapshot?.latestThreadMessageAt
          ? Date.parse(metricsSnapshot.latestThreadMessageAt)
          : null,
      },
      };
    } finally {
      await closeLibsqlClient(client);
    }
  }

  async function debugAgentLongTermMemoryRecallSearch(
    agentId: string,
    input: AgentLongTermMemoryRecallDebugSearchInput,
  ) {
    const loadedAgent = getInternalAgentRegistry().get(agentId);

    if (!loadedAgent) {
      throw new Error(`Agent is not loaded: ${agentId}`);
    }

    if (!loadedAgent.runtime.longTermMemoryRecall) {
      throw new Error(`Long-term memory recall is not available for agent: ${agentId}`);
    }

    const result = await loadedAgent.runtime.longTermMemoryRecall.debugSearch(input);

    return {
      ...result,
      lastInitAt: result.lastInitAt ? new Date(result.lastInitAt).getTime() : null,
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
    listAgentLongTermMemoryThreadMessages,
    getAgentRuntimeMemory,
    debugAgentLongTermMemoryRecallSearch,
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
    threadId?: string;
  },
) {
  try {
    const mastraAgentId = input.threadId ?? toMastraSafeIdentifier(agentId);
    const agentDatabasePath = path.resolve(workspaceBasePath, agentId, 'database.db');
    const client: ClosableLibsqlClient = createClient({
      url: `file:${agentDatabasePath}`,
    });
    const conversationStore = new LibsqlConversationStore({
      client,
      tablePrefix: mastraAgentId,
    });

    try {
      const messages = await conversationStore.listMessages({
        threadId: mastraAgentId,
        limit: (input.perPage * (input.page + 1)) + 1,
        order: 'desc',
      });
      const pageStart = input.page * input.perPage;
      const pageEnd = pageStart + input.perPage;
      const pagedMessages = messages.slice(pageStart, pageEnd);
      const mergedMessages = mergeToolLogMessages([...pagedMessages].reverse());

      return {
        items: mergedMessages
        .reverse()
        .map((message) => ({
          id: message.id,
          role: message.role,
          createdAt: new Date(message.createdAt).getTime(),
          threadId: message.threadId,
          resourceId: mastraAgentId,
          type: null,
          content: {
            parts: [
              ...message.parts.map((part: RuntimeStoredMessagePart) =>
                part.type === 'text'
                  ? {
                      type: 'text',
                      text: part.text,
                    }
                  : part),
              ...(Array.isArray(message.metadata?.toolResults)
                ? message.metadata.toolResults.map((toolResult: unknown) => ({
                    type: 'tool-invocation',
                    toolInvocation: {
                      ...(typeof toolResult === 'object' && toolResult !== null ? toolResult : {}),
                      state: 'result',
                    },
                  }))
                : []),
            ],
            ...(Array.isArray(message.metadata?.toolInvocations)
              ? {
                  toolInvocations: message.metadata.toolInvocations,
                }
              : {}),
          },
        })),
        hasMore: messages.length > pageEnd,
      };
    } finally {
      await closeLibsqlClient(client);
    }
  } catch (error) {
    console.error(`[AdminReadModel] Failed to load recent thread messages for agent ${agentId}:`, error);
    return {
      items: [],
      hasMore: false,
    };
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

function mergeToolLogMessages(messages: Array<{
  id: string;
  role: string;
  threadId: string;
  createdAt: string;
  parts: RuntimeStoredMessagePart[];
  metadata?: Record<string, unknown>;
}>) {
  const merged: typeof messages = [];

  for (const message of messages) {
    const previousMessage = merged[merged.length - 1];

    if (
      previousMessage?.role === 'assistant'
      && message.role === 'tool'
      && Array.isArray(previousMessage.metadata?.toolInvocations)
      && previousMessage.metadata.toolInvocations.length > 0
      && Array.isArray(message.metadata?.toolResults)
      && message.metadata.toolResults.length > 0
    ) {
      merged[merged.length - 1] = {
        ...previousMessage,
        metadata: {
          ...previousMessage.metadata,
          toolResults: message.metadata.toolResults,
        },
      };
      continue;
    }

    merged.push(message);
  }

  return merged;
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
