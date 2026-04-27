import { forgeDebug } from '@forge-runtime/core';
import {
  isMemoryRecallText,
  splitMemoryRecallSegments,
  truncatePreview,
  toToolBadge,
  humanizeMemoryKey,
  formatWorkingMemoryValue,
  renderWorkingMemoryMarkdown,
  toScheduleSummary,
  extractLatestMessagePreview,
  extractLatestMessageToolBadge,
  parseProviderCredentials,
  mergeToolLogMessages,
  buildThreadToolInvocationParts,
  collectConversationParticipants,
} from './read-model/helpers';
import {
  closeLibsqlClient,
  listRecentConversations,
  listRecentInternalChatConversations,
  listRecentExternalConversations,
  listThreadMessages,
  withTimeout,
} from './read-model/conversation-helpers';
import { createAgentReadModel } from './read-model/agent';

import {
  readLongTermMemoryRecallSnapshot,
  readLongTermMemoryState,
} from './read-model/helpers';


import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { createClient } from '@libsql/client';
import {
  estimateMessageUnits,
  LibsqlConversationStore,
  readOperationalMemoryState,
  toMastraSafeIdentifier,
  type CommunicationMessageView,
  type CommunicationProviderMessage,
} from '@forge-runtime/core';

import type { Database } from '../database/index';
import {
  agents,
  agentHomeMetricSnapshots,
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
import type { AgentLongTermMemoryRecallDebugSearchInput } from '../agents/agent-long-term-memory-recall';
import {
  createAgentLongTermMemoryStore,
  type LongTermMemoryRecallSnapshot,
  type LongTermMemoryState,
} from '../agents/agent-long-term-memory-store';
import { migrateLegacyCheckpointedOmState } from '../agents/migrate-legacy-checkpointed-om';

const RECENT_STEP_LIMIT = 10;
const RECENT_CASH_MOVEMENT_LIMIT = 10;
const RECENT_NOTIFICATION_LIMIT = 10;
const RECENT_CONVERSATION_LIMIT = 10;
const ADMIN_OBSERVABILITY_READ_TIMEOUT_MS = 5_000;

type ClosableLibsqlClient = ReturnType<typeof createClient> & {
  close?: () => void | Promise<void>;
};

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
  const agentReadModel = createAgentReadModel({
    db,
    workspaceBasePath: input.workspaceBasePath,
    internalChat: input.internalChat,
  });

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
        lastExecutionError: agent.lastExecutionError ?? null,
        lastExecutionErrorAt: agent.lastExecutionErrorAt ?? null,
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
                reflectionTriggerTokenLimit: runtimeMemory.metrics.reflectionTriggerTokenLimit,
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
      await migrateLegacyCheckpointedOmState({
        db,
        agentId,
        threadId: mastraAgentId,
        conversationStore,
      });
      const agentWorkspaceRoot = path.resolve(input.workspaceBasePath, agentId);
      const agentWorkspaceDir = agent.workspaceFilesystem?.basePath
        ? path.resolve(agentWorkspaceRoot, agent.workspaceFilesystem.basePath)
        : path.resolve(agentWorkspaceRoot, 'workspace');
      const agentContextPath = path.resolve(agentWorkspaceDir, 'AGENT_CONTEXT.md');
      const agentContext = await readFile(agentContextPath, 'utf8')
        .then((content) => content.trim() || null)
        .catch((err) => { console.error("[safe-catch]", err); return null; });
      const workingMemory = (await conversationStore.read({
        threadId: mastraAgentId,
        resourceId: mastraAgentId,
      }))?.workingMemory ?? null;
      const ltmRecall = await readLongTermMemoryRecallSnapshot(db, agentId);
      const settings = await systemSettings.getSettings();
      const operationalMemoryState = await readOperationalMemoryState({
        threadId: mastraAgentId,
        store: conversationStore,
        recentTokenLimit: settings.checkpointedOmRecentRawTokens,
      });
      const checkpointSummaryMessage = operationalMemoryState.checkpointSummaryMessage;
      const checkpointSummaryText = checkpointSummaryMessage?.parts
        .filter((part: { type?: string; text?: string }): part is Extract<{ type?: string; text?: string }, { type: 'text' | 'reasoning' }> =>
          part.type === 'text' || part.type === 'reasoning')
        .map((part: { text?: string }) => part.text?.trim() ?? "")
        .filter(Boolean)
        .join('\n') ?? null;
      const reflection = operationalMemoryState.reflectionMessages
        .map((message) =>
          message.parts
            .filter((part: { type?: string; text?: string }): part is Extract<{ type?: string; text?: string }, { type: 'text' | 'reasoning' }> =>
              part.type === 'text' || part.type === 'reasoning')
            .map((part: { text?: string }) => part.text?.trim() ?? "")
            .filter(Boolean)
            .join('\n'))
        .filter(Boolean)
        .join('\n');
      const observations = operationalMemoryState.observationMessages
        .map((message) =>
          message.parts
            .filter((part: { type?: string; text?: string }): part is Extract<{ type?: string; text?: string }, { type: 'text' | 'reasoning' }> =>
              part.type === 'text' || part.type === 'reasoning')
            .map((part: { text?: string }) => part.text?.trim() ?? "")
            .filter(Boolean)
            .join('\n'))
        .filter(Boolean)
        .join('\n');
      const generationCount = checkpointSummaryMessage?.operationalMemoryGeneration ?? 0;
      const updatedAt = operationalMemoryState.metrics.latestThreadMessageAt
        ? Date.parse(operationalMemoryState.metrics.latestThreadMessageAt)
        : null;
      const lastObservedAt = operationalMemoryState.observationMessages.length
        ? Date.parse(operationalMemoryState.observationMessages.at(-1)?.createdAt ?? '')
        : null;
      const runtimeLtmSnapshot = loadedAgent?.runtime.longTermMemory
        ? await withTimeout(
          loadedAgent.runtime.longTermMemory.readSnapshot(),
          ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
          `Agent runtime memory LTM snapshot timed out for ${agentId}`,
        ).catch((err) => { console.error("[safe-catch]", err); return null; })
        : null;
      const persistedLtmState = await withTimeout(
        readLongTermMemoryState(db, agentId),
        ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
        `Agent runtime memory persisted LTM state timed out for ${agentId}`,
      ).catch((err) => { console.error("[safe-catch]", err); return null; });
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
        checkpointMessageId: checkpointSummaryMessage?.id ?? null,
        checkpointGeneration: checkpointSummaryMessage?.operationalMemoryGeneration ?? null,
        checkpointSummary: checkpointSummaryText,
        checkpointUpdatedAt: checkpointSummaryMessage?.createdAt
          ? Date.parse(checkpointSummaryMessage.createdAt)
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
        rawMessageCount: operationalMemoryState.metrics.rawMessageCount,
        recentRawMessageCount: operationalMemoryState.metrics.recentRawMessageCount,
        recentRawTokenCount: operationalMemoryState.metrics.recentRawTokenCount,
        recentRawTokenLimit: settings.checkpointedOmRecentRawTokens,
        overflowMessageCount: operationalMemoryState.metrics.overflowMessageCount,
        overflowTokenCount: operationalMemoryState.metrics.overflowTokenCount,
        observationTriggerTokenLimit: settings.checkpointedOmRawObservationBatchTokens,
        activeObservationBlockCount: operationalMemoryState.observationMessages.length,
        observationTokenCount: operationalMemoryState.metrics.observationTokenCount,
        reflectionTriggerTokenLimit: settings.checkpointedOmObservationReflectionBatchTokens,
        activeReflectionBlockCount: operationalMemoryState.reflectionMessages.length,
        reflectionTokenCount: operationalMemoryState.metrics.reflectionTokenCount,
        reflectionBudget: Math.max(
          0,
          settings.checkpointedOmTotalContextTokens
            - settings.checkpointedOmRecentRawTokens
            - settings.checkpointedOmRawObservationBatchTokens
            - settings.checkpointedOmObservationReflectionBatchTokens,
        ),
        checkpointTokenCount: operationalMemoryState.metrics.checkpointTokenCount,
        checkpointSummaryUpToGeneration: checkpointSummaryMessage?.operationalMemoryGeneration ?? null,
        latestThreadMessageAt: operationalMemoryState.metrics.latestThreadMessageAt
          ? Date.parse(operationalMemoryState.metrics.latestThreadMessageAt)
          : null,
      },
      };
    } finally {
      await closeLibsqlClient(client);
    }
  }

  async function getAgentOmDebugExport(agentId: string) {
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
    });

    if (!agent) {
      return null;
    }

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
      await migrateLegacyCheckpointedOmState({
        db,
        agentId,
        threadId: mastraAgentId,
        conversationStore,
      });
      const [messages, settings] = await Promise.all([
        conversationStore.listMessages({
          threadId: mastraAgentId,
          order: 'asc',
        }),
        systemSettings.getSettings(),
      ]);
      const operationalMemoryState = await readOperationalMemoryState({
        threadId: mastraAgentId,
        store: conversationStore,
        recentTokenLimit: settings.checkpointedOmRecentRawTokens,
      });

      return {
        agentId,
        threadId: mastraAgentId,
        tablePrefix: mastraAgentId,
        databasePath: agentDatabasePath,
        settings: {
          checkpointedOmTotalContextTokens: settings.checkpointedOmTotalContextTokens,
          checkpointedOmRecentRawTokens: settings.checkpointedOmRecentRawTokens,
          checkpointedOmRawObservationBatchTokens: settings.checkpointedOmRawObservationBatchTokens,
          checkpointedOmObservationReflectionBatchTokens: settings.checkpointedOmObservationReflectionBatchTokens,
        },
        checkpointedConversationState: null,
        checkpointedOmState: {
          checkpointGeneration: operationalMemoryState.checkpointSummaryMessage?.operationalMemoryGeneration ?? null,
          checkpointSummary: operationalMemoryState.checkpointSummaryMessage
            ? {
                text: operationalMemoryState.checkpointSummaryMessage.parts
                  .filter((part: { type?: string; text?: string }): part is Extract<{ type?: string; text?: string }, { type: 'text' | 'reasoning' }> =>
                    part.type === 'text' || part.type === 'reasoning')
                  .map((part: { text?: string }) => part.text?.trim() ?? "")
                  .filter(Boolean)
                  .join('\n'),
                tokenCount: operationalMemoryState.metrics.checkpointTokenCount,
                upToGeneration: operationalMemoryState.checkpointSummaryMessage.operationalMemoryGeneration ?? 0,
                updatedAt: operationalMemoryState.checkpointSummaryMessage.createdAt,
              }
            : null,
          observationBlocks: operationalMemoryState.observationMessages.map((message) => ({
            id: message.id,
            tokenCount: estimateMessageUnits(message),
            createdAt: message.createdAt,
            lastObservedAt: message.createdAt,
            reflectedGeneration: null,
            text: message.parts
              .filter((part: { type?: string; text?: string }): part is Extract<{ type?: string; text?: string }, { type: 'text' | 'reasoning' }> =>
                part.type === 'text' || part.type === 'reasoning')
              .map((part: { text?: string }) => part.text?.trim() ?? "")
              .filter(Boolean)
              .join('\n'),
          })),
          activeReflectionBlocks: operationalMemoryState.reflectionMessages.map((message) => ({
            recordId: message.id,
            generationCount: message.operationalMemoryGeneration ?? 0,
            tokenCount: estimateMessageUnits(message),
            createdAt: message.createdAt,
            text: message.parts
              .filter((part: { type?: string; text?: string }): part is Extract<{ type?: string; text?: string }, { type: 'text' | 'reasoning' }> =>
                part.type === 'text' || part.type === 'reasoning')
              .map((part: { text?: string }) => part.text?.trim() ?? "")
              .filter(Boolean)
              .join('\n'),
          })),
          latestMetrics: null,
        },
        thread: {
          messageCount: messages.length,
          messages,
        },
      };
    } finally {
      await closeLibsqlClient(client);
    }
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
    listAgentRecentConversations: agentReadModel.listAgentRecentConversations,
    listAgentExecutionSteps: agentReadModel.listAgentExecutionSteps,
    listAgentThreadMessages: agentReadModel.listAgentThreadMessages,
    listAgentLongTermMemoryThreadMessages: agentReadModel.listAgentLongTermMemoryThreadMessages,
    listRecentAgentHomeMetricSnapshots: agentReadModel.listRecentAgentHomeMetricSnapshots,
    getAgentRuntimeMemory,
    getAgentOmDebugExport,
    debugAgentLongTermMemoryRecallSearch: agentReadModel.debugAgentLongTermMemoryRecallSearch,
    listAgentConversationMessages: agentReadModel.listAgentConversationMessages,
    listRoles,
    listSystemIntegrations,
    getSystemSettings,
    getSystemLlm,
    getApplicationMigrations,
    getFinance,
    getFinanceContracts,
  };
}
