/**
 * Agent List Read Model — Phase 3 of #2467
 * Extracted from admin/read-model/agents.ts
 * Contains: listAgents, getAgent
 *
 * Backward-compatible: agents.ts re-exports types and delegates to this module
 */

import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Agent, AgentExecutionStep } from '../../database/schema';
import { resolve } from 'node:path';
import {
  agentExecutionContracts,
  agentExecutionSteps,
  agentNotifications,
  agentMcpConfigs,
  agentProviders,
  agentSchedules,
  agents,
  mcpServerConfigs,
} from '../../database/schema';
import { decryptSecret } from '../../encryption/crypto';
import { parseProviderCredentials } from '../../communication/provider-loader';
import { closeLibsqlClient, listThreadMessages } from './conversation-helpers';
import {
  toScheduleSummary as toScheduleSummaryHelper,
  extractLatestMessagePreview,
  extractLatestMessageToolBadge,
  type ScheduleSummary,
} from './helpers';
import { withTimeoutAndLog } from '../../utils/async';
import { listAgentWorkspaceSkills } from '../../agents/workspace-skills';

import type { Database } from '../../database/index';
import { createSystemSettingsStore } from '../../system-settings/store';
import {
  calculateOperationalMemoryReflectionBudget,
  toMastraSafeIdentifier,
  readOperationalMemoryState,
  LibsqlConversationStore,
  forgeDebug,
} from '@forge-runtime/core';
import { type AgentExecutionState } from './agents-types';
import { errorMsg } from '../../agents/error-formatting';
import { ADMIN_OBSERVABILITY_READ_TIMEOUT_MS } from './constants';

const RECENT_STEP_LIMIT = 10;
const RECENT_NOTIFICATION_LIMIT = 10;

export interface AgentListItem {
  agentId: string;
  name: string;
  description: string | null;
  role: string | null;
  executionState: AgentExecutionState;
  lastExecutionError: string | null;
  lastExecutionErrorAt: number | null;
  roleName: string | null;
  modelProfile: string | null;
  omModelProfile: string | null;
  loaded: boolean;
  runner: unknown | null;
  providerTypes: unknown[];
  overview: {
    lastStepAt: number | null;
    lastStepContextTokens: number | null;
    lastStepPreview: string | null;
    lastToolBadge: string | null;
    lastStepTokens: number | null;
    lastStepCostUsd: number | null;
    averageStepIntervalMs: number | null;
    unreadNotificationCount: number;
    om: {
      generationCount: number;
      checkpointGeneration: number;
      recentRawTokenCount: number;
      recentRawTokenLimit: number;
      overflowTokenCount: number;
      overflowTokenLimit: number;
      observationTokenCount: number;
      reflectionTriggerTokenLimit: number;
      reflectionTokenCount: number;
      reflectionTokenLimit: number;
      checkpointTokenCount: number;
    } | null;
  };
  createdAt: number;
  updatedAt: number;
}

export interface AgentDetail {
  agentId: string;
  name: string;
  description: string | null;
  instructions: string;
  executionState: 'idle' | 'running' | 'absent';
  role: { roleId: string; name: string; description: string | null } | null;
  modelProfile: { profileId: string; name: string; modelKey: string } | null;
  omModelProfile: { profileId: string; name: string; modelKey: string } | null;
  workspace: {
    autoSync: boolean;
    bm25: boolean;
    embedder: string | null;
    filesystem: string | null;
    sandbox: string | null;
  };
  lastExecutionError: string | null;
  lastExecutionErrorAt: number | null;
  loaded: boolean;
  runner: unknown | null;
  providers: Array<{
    providerType: 'discord' | 'email';
    createdAt: number;
    editable: boolean;
    credentials: unknown;
  }>;
  mcpServers: Array<{
    configId: string | null;
    serverId: string;
    name: string;
    description?: string;
    transport: 'stdio' | 'http_streamable';
    command: string;
    argsText: string;
    envVarsText: string;
    url: string;
    headersText: string;
    isActive: boolean;
    createdAt: number;
    updatedAt: number;
  }>;
  recentExecutionSteps: Array<Omit<AgentExecutionStep, 'id'> & { stepId: string }>;
  recentNotifications: Array<{
    notificationId: string;
    content: string;
    timestamp: number;
    read: boolean;
  }>;
  githubProvisioning: unknown;
  skills: unknown[];
  activeContract: {
    contractId: string;
    agentId: string;
    agentName: string;
    startsAt: number;
    endsAt: number;
    weeklyValueUsd: number;
    spentUsd: number;
    spentPercent: number;
    autoRenew: boolean;
  } | null;
  schedules: ScheduleSummary[];
  heartbeat: ScheduleSummary | null;
}

export interface AgentListReadModel {
  listAgents: () => Promise<AgentListItem[]>;
  getAgent: (agentId: string) => Promise<AgentDetail | null>;
}

export interface AgentListReadModelDeps {
  db: Database;
  registry: {
    get(agentId: string): unknown;
    size: number;
  };
  workspaceBasePath: string;
}

type RuntimeMemoryOutput = {
  generationCount: number;
  checkpointGeneration: number;
  metrics: {
    recentRawTokenCount: number;
    recentRawTokenLimit: number;
    overflowTokenCount: number;
    observationTriggerTokenLimit: number;
    observationTokenCount: number;
    reflectionTriggerTokenLimit: number;
    reflectionTokenCount: number;
    reflectionBudget: number;
    checkpointTokenCount: number;
  };
} | null;

// Workspace skills parallel map — populated in listAgents
const skillsByAgentId = new Map<string, Awaited<ReturnType<typeof listAgentWorkspaceSkills>>>();

export function createAgentListReadModel(deps: AgentListReadModelDeps): AgentListReadModel {
  const { db, registry, workspaceBasePath } = deps;
  const systemSettings = createSystemSettingsStore(db);

  async function getRuntimeMemoryForAgent(agentId: string): Promise<RuntimeMemoryOutput> {
    const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
    if (!agent) return null;

    const mastraAgentId = toMastraSafeIdentifier(agentId);
    const agentDatabasePath = resolve(workspaceBasePath, agentId, 'database.db');

    // eslint-disable-next-line no-dynamic-imports/no-dynamic-imports
    const { createClient } = await import('@libsql/client');
    let client: Awaited<ReturnType<typeof import('@libsql/client').createClient>> | null = null;
    try {
      client = createClient({ url: `file:${agentDatabasePath}` });
      client.execute('PRAGMA foreign_keys = ON');
    } catch (err) {
      forgeDebug({
        scope: 'agents-list',
        level: 'debug',
        message: 'createClient failed: ' + errorMsg(err),
      });
      return null;
    }

    try {
      const conversationStore = new LibsqlConversationStore({
        client: client,
        tablePrefix: mastraAgentId,
      });
      const settings = await systemSettings.getSettings();

      const operationalMemoryState = await readOperationalMemoryState({
        threadId: mastraAgentId,
        store: conversationStore,
        recentTokenLimit: settings.checkpointedOmRecentRawTokens,
      });
      const checkpointSummaryMessage = operationalMemoryState.checkpointSummaryMessage;
      const generationCount = checkpointSummaryMessage?.operationalMemoryGeneration ?? 0;

      const rawMetrics = operationalMemoryState.metrics;
      const recentRawLimit = settings.checkpointedOmRecentRawTokens ?? 0;
      const observationTriggerLimit = settings.checkpointedOmRawObservationBatchTokens ?? 0;
      const reflectionTriggerLimit = settings.checkpointedOmObservationReflectionBatchTokens ?? 0;
      const totalTokens = settings.checkpointedOmTotalContextTokens ?? 0;
      return {
        generationCount,
        checkpointGeneration: checkpointSummaryMessage?.operationalMemoryGeneration ?? 0,
        metrics: {
          recentRawTokenCount: rawMetrics?.recentRawTokenCount ?? 0,
          recentRawTokenLimit: recentRawLimit,
          overflowTokenCount: rawMetrics?.overflowTokenCount ?? 0,
          observationTriggerTokenLimit: observationTriggerLimit,
          observationTokenCount: rawMetrics?.observationTokenCount ?? 0,
          reflectionTriggerTokenLimit: reflectionTriggerLimit,
          reflectionTokenCount: rawMetrics?.reflectionTokenCount ?? 0,
          reflectionBudget: calculateOperationalMemoryReflectionBudget({
            totalContextTokens: totalTokens,
            recentRawTokens: recentRawLimit,
            rawObservationBatchTokens: observationTriggerLimit,
            observationReflectionBatchTokens: reflectionTriggerLimit,
          }),
          checkpointTokenCount: rawMetrics?.checkpointTokenCount ?? 0,
        },
      };
    } finally {
      await closeLibsqlClient(client);
    }
  }

  // ── Codification: L#NN-XXX sub-concern decomposition ────────────────────────
  // Phase 1 of #6239: listAgents decomposed into 6 single-concern helpers (5 loaders + 1 builder). The
  // coordinator below calls each helper in order and assembles the result.
  // Phase 2 of #6239: getAgent decomposed into 4 single-concern helpers (3 loaders + 1 builder). The
  // getAgent coordinator below calls each helper in order and assembles the result.
  // Phase 3 of #6239: data-access helpers extracted (loadAgentRows, loadUnreadNotificationCounts,
  // loadAllRoles, loadAllProfiles). loadAgentListRowsAndMetadata remains as a thin aggregator that
  // composes the four data-access helpers in a single Promise.all.
  // Phase 4 (#6239) deferred to a future cycle (L735 cast cleanup).

  async function loadAgentRows(): Promise<Awaited<ReturnType<typeof db.query.agents.findMany>>> {
    return await db.query.agents.findMany({ orderBy: (fields, { asc }) => [asc(fields.name)] });
  }

  async function loadUnreadNotificationCounts(): Promise<
    Array<{ agentId: string; count: number }>
  > {
    return await db
      .select({ agentId: agentNotifications.agentId, count: sql<number>`count(*)` })
      .from(agentNotifications)
      .where(sql`${agentNotifications.readAt} is null`)
      .groupBy(agentNotifications.agentId)
      .all();
  }

  async function loadAllRoles(): Promise<Awaited<ReturnType<typeof db.query.agentRoles.findMany>>> {
    return await db.query.agentRoles.findMany();
  }

  async function loadAllProfiles(): Promise<
    Awaited<ReturnType<typeof db.query.llmProfiles.findMany>>
  > {
    return await db.query.llmProfiles.findMany();
  }

  async function loadAgentListRowsAndMetadata(): Promise<{
    agentRows: Awaited<ReturnType<typeof db.query.agents.findMany>>;
    notificationMap: Map<string, number>;
    roleMap: Map<string, { id: string; name: string | null }>;
    profileMap: Map<string, { id: string; name: string | null }>;
  }> {
    const [agentRows, unreadNotificationRows, allRoles, allProfiles] = await Promise.all([
      loadAgentRows(),
      loadUnreadNotificationCounts(),
      loadAllRoles(),
      loadAllProfiles(),
    ]);
    return {
      agentRows,
      notificationMap: new Map(unreadNotificationRows.map((row) => [row.agentId, row.count])),
      roleMap: new Map(allRoles.map((r) => [r.id, r])),
      profileMap: new Map(allProfiles.map((p) => [p.id, p])),
    };
  }

  async function loadRecentStepsByAgentId(
    agentIds: string[],
  ): Promise<Map<string, Awaited<ReturnType<typeof db.query.agentExecutionSteps.findMany>>>> {
    const allRecentSteps =
      agentIds.length > 0
        ? await db.query.agentExecutionSteps.findMany({
            where: and(
              inArray(agentExecutionSteps.agentId, agentIds),
              eq(agentExecutionSteps.kind, 'agent-step'),
            ),
            orderBy: [desc(agentExecutionSteps.createdAt)],
          })
        : [];
    const recentStepsByAgentId = new Map<string, typeof allRecentSteps>();
    for (const step of allRecentSteps) {
      const existing = recentStepsByAgentId.get(step.agentId) ?? [];
      if (existing.length < 6) existing.push(step);
      recentStepsByAgentId.set(step.agentId, existing);
    }
    return recentStepsByAgentId;
  }

  async function loadRuntimeMemoryByAgentId(
    agentRows: { id: string }[],
  ): Promise<Map<string, Awaited<ReturnType<typeof getRuntimeMemoryForAgent>> | null>> {
    return new Map(
      await Promise.all(
        agentRows.map(
          async (agent) =>
            [
              agent.id,
              await withTimeoutAndLog({
                scope: 'admin-read-model-agents-list',
                op: 'runtimeMemoryByAgent',
                promise: getRuntimeMemoryForAgent(agent.id),
                timeoutMs: ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
                timeoutMessage: `Admin runtime memory read timed out for ${agent.id}`,
                fallback: null,
              }),
            ] as const,
        ),
      ),
    );
  }

  async function loadLatestThreadDetailsByAgentId(
    agentRows: { id: string }[],
  ): Promise<Map<string, { preview: string | null; toolBadge: string | null }>> {
    return new Map(
      await Promise.all(
        agentRows.map(async (agent) => {
          const threadMessages = await withTimeoutAndLog({
            scope: 'admin-read-model-agents-list',
            op: 'latestThreadDetails',
            promise: listThreadMessages(workspaceBasePath, agent.id, { page: 0, perPage: 8 }),
            timeoutMs: ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
            timeoutMessage: `Admin latest thread details read timed out for ${agent.id}`,
            fallback: {
              items: [],
              hasMore: false,
            },
          });

          let preview: string | null = null;
          let toolBadge: string | null = null;

          for (const message of threadMessages.items) {
            if (message.role !== 'assistant') continue;
            const content = message.content;
            preview ??= extractLatestMessagePreview(content);
            const tb = extractLatestMessageToolBadge(content);
            toolBadge ??= tb ? (tb.label ?? null) : null;
            if ((preview ?? '') !== '') break;
          }

          return [agent.id, { preview, toolBadge }] as const;
        }),
      ),
    );
  }

  function buildAgentListItem(
    agent: Awaited<ReturnType<typeof db.query.agents.findMany>>[number],
    ctx: {
      notificationMap: Map<string, number>;
      roleMap: Map<string, { id: string; name: string | null }>;
      profileMap: Map<string, { id: string; name: string | null }>;
      recentStepsByAgentId: Map<
        string,
        Awaited<ReturnType<typeof db.query.agentExecutionSteps.findMany>>
      >;
      runtimeMemoryByAgentId: Map<
        string,
        Awaited<ReturnType<typeof getRuntimeMemoryForAgent>> | null
      >;
      latestThreadDetailsByAgentId: Map<
        string,
        { preview: string | null; toolBadge: string | null }
      >;
    },
  ): AgentListItem {
    const agentTyped = agent as Agent;
    const loadedAgent = registry.get(agent.id) as
      | { runner?: { getSnapshot: () => unknown } }
      | undefined;
    const runnerSnapshot = loadedAgent?.runner?.getSnapshot?.() ?? null;
    const recentSteps = ctx.recentStepsByAgentId.get(agent.id) ?? [];
    const runtimeMemory = ctx.runtimeMemoryByAgentId.get(agent.id) ?? null;
    const latestThreadDetails = ctx.latestThreadDetailsByAgentId.get(agent.id) ?? {
      preview: null,
      toolBadge: null,
    };
    const executionState = agent.executionState ?? 'absent';

    const averageStepIntervalMs =
      recentSteps.length >= 2
        ? Math.round(
            recentSteps
              .slice(0, 6)
              .map((step, index, items) => {
                if (index === items.length - 1) return null;
                return Math.max(step.createdAt - items[index + 1].createdAt, 0);
              })
              .filter((v) => v !== null)
              .reduce((sum, v, _, arr) => sum + (v as number) / arr.length, 0),
          )
        : null;

    const firstStep = recentSteps[0] as
      | {
          createdAt?: number;
          inputTokens?: number;
          cachedInputTokens?: number;
          outputTokens?: number;
          costUsd?: number | null;
        }
      | undefined;
    const lastStepTokens = firstStep
      ? (firstStep.inputTokens ?? 0) +
        ((firstStep as AgentExecutionStep).cachedInputTokens ?? 0) +
        (firstStep.outputTokens ?? 0)
      : null;

    return {
      agentId: agent.id,
      name: agent.name ?? '',
      description: agent.description ?? null,
      role: agentTyped.roleId ?? null,
      executionState,
      lastExecutionError: agent.lastExecutionError ?? null,
      lastExecutionErrorAt: agent.lastExecutionErrorAt ?? null,
      roleName: (() => {
        const roleId = agentTyped.roleId;
        return roleId != null ? (ctx.roleMap.get(roleId)?.name ?? null) : null;
      })(),
      modelProfile: (() => {
        const id = agentTyped.modelProfileId;
        return id != null ? (ctx.profileMap.get(id)?.name ?? null) : null;
      })(),
      omModelProfile: (() => {
        const id = agentTyped.omModelProfileId;
        return id != null ? (ctx.profileMap.get(id)?.name ?? null) : null;
      })(),
      loaded: Boolean(loadedAgent),
      runner: runnerSnapshot,
      providerTypes: [],
      overview: {
        lastStepAt: firstStep?.createdAt ?? null,
        lastStepContextTokens: firstStep?.inputTokens ?? null,
        lastStepPreview: latestThreadDetails.preview,
        lastToolBadge: latestThreadDetails.toolBadge,
        lastStepTokens,
        lastStepCostUsd: firstStep?.costUsd ?? null,
        averageStepIntervalMs,
        unreadNotificationCount: ctx.notificationMap.get(agent.id) ?? 0,
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
      },
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    } as AgentListItem;
  }

  async function listAgents(): Promise<AgentListItem[]> {
    const { agentRows, notificationMap, roleMap, profileMap } =
      await loadAgentListRowsAndMetadata();
    const agentIds = agentRows.map((a) => a.id);

    const [recentStepsByAgentId, runtimeMemoryByAgentId, latestThreadDetailsByAgentId] =
      await Promise.all([
        loadRecentStepsByAgentId(agentIds),
        loadRuntimeMemoryByAgentId(agentRows),
        loadLatestThreadDetailsByAgentId(agentRows),
      ]);

    const ctx = {
      notificationMap,
      roleMap,
      profileMap,
      recentStepsByAgentId,
      runtimeMemoryByAgentId,
      latestThreadDetailsByAgentId,
    };

    return await Promise.all(agentRows.map((agent) => buildAgentListItem(agent, ctx)));
  }

  async function loadAgentAndDetailData(agentId: string): Promise<{
    agentMcpRows: Awaited<ReturnType<typeof db.query.agentMcpConfigs.findMany>>;
    agentScheduleRows: Awaited<ReturnType<typeof db.query.agentSchedules.findMany>>;
    recentSteps: Awaited<ReturnType<typeof db.query.agentExecutionSteps.findMany>>;
    recentNotifications: Awaited<ReturnType<typeof db.query.agentNotifications.findMany>>;
    activeContractRows: Awaited<ReturnType<typeof db.query.agentExecutionContracts.findMany>>;
    allRoles: { id: string; name: string; description: string | null }[];
    allProfiles: { id: string; name: string; modelKey: string }[];
  }> {
    const [
      agentMcpRows,
      agentScheduleRows,
      recentSteps,
      recentNotifications,
      activeContractRows,
      allRoles,
      allProfiles,
    ] = await Promise.all([
      db.query.agentMcpConfigs.findMany({ where: eq(agentMcpConfigs.agentId, agentId) }),
      db.query.agentSchedules.findMany({ where: eq(agentSchedules.agentId, agentId) }),
      db.query.agentExecutionSteps.findMany({
        where: eq(agentExecutionSteps.agentId, agentId),
        orderBy: desc(agentExecutionSteps.createdAt),
        limit: RECENT_STEP_LIMIT,
      }),
      db.query.agentNotifications.findMany({
        where: eq(agentNotifications.agentId, agentId),
        orderBy: desc(agentNotifications.createdAt),
        limit: RECENT_NOTIFICATION_LIMIT,
      }),
      db.query.agentExecutionContracts.findMany({
        where: eq(agentExecutionContracts.agentId, agentId),
      }),
      db.query.agentRoles.findMany({ columns: { id: true, name: true, description: true } }),
      db.query.llmProfiles.findMany({ columns: { id: true, name: true, modelKey: true } }),
    ]);
    return {
      agentMcpRows,
      agentScheduleRows,
      recentSteps,
      recentNotifications,
      activeContractRows,
      allRoles,
      allProfiles,
    };
  }

  async function loadMcpServerRowsForAgent(
    agentMcpRows: Awaited<ReturnType<typeof db.query.agentMcpConfigs.findMany>>,
  ): Promise<Awaited<ReturnType<typeof db.query.mcpServerConfigs.findMany>>> {
    const mcpServerIds = agentMcpRows.map((r) => r.serverId).filter(Boolean);
    if (mcpServerIds.length === 0) return [];
    return await db.query.mcpServerConfigs.findMany({
      where: inArray(mcpServerConfigs.id, mcpServerIds),
    });
  }

  function buildMcpServerSummaries(
    agentMcpRows: Awaited<ReturnType<typeof db.query.agentMcpConfigs.findMany>>,
    agentMcpServerRows: Awaited<ReturnType<typeof db.query.mcpServerConfigs.findMany>>,
  ): Array<{
    configId: string | null;
    serverId: string;
    name: string;
    description: string | undefined;
    transport: 'stdio' | 'http_streamable';
    command: string;
    argsText: string;
    envVarsText: string;
    url: string;
    headersText: string;
    isActive: boolean;
    createdAt: number;
    updatedAt: number;
  }> {
    const serverIdToLink = new Map(agentMcpRows.map((link) => [link.serverId, link]));
    return agentMcpServerRows.map((server) => {
      const link = serverIdToLink.get(server.id);
      return {
        configId: link?.id ?? null,
        serverId: server.id,
        name: server.name,
        description: server.description ?? undefined,
        transport: server.transport as 'stdio' | 'http_streamable',
        command: server.command ?? '',
        argsText: server.args ?? '',
        envVarsText: server.envVars ?? '',
        url: server.url ?? '',
        headersText: server.headers ?? '',
        isActive: link?.isActive === 1,
        createdAt: server.createdAt,
        updatedAt: server.updatedAt,
      };
    });
  }

  async function calculateSpentUsd(
    activeContractRows: Awaited<ReturnType<typeof db.query.agentExecutionContracts.findMany>>,
    agentId: string,
  ): Promise<number> {
    if (activeContractRows.length === 0) return 0;
    const currentPeriodStart = new Date();
    currentPeriodStart.setDate(currentPeriodStart.getDate() - (currentPeriodStart.getDay() + 7));
    const steps = await db.query.agentExecutionSteps.findMany({
      where: and(
        eq(agentExecutionSteps.agentId, agentId),
        gte(agentExecutionSteps.createdAt, currentPeriodStart.getTime()),
      ),
      columns: { costUsd: true },
    });
    return steps.reduce((sum, s) => sum + (s.costUsd ?? 0), 0);
  }

  interface BuildAgentDetailCtx {
    agent: Agent;
    agentTyped: Agent;
    runnerSnapshot: unknown;
    agentMcpRows: Awaited<ReturnType<typeof db.query.agentMcpConfigs.findMany>>;
    mcpServers: ReturnType<typeof buildMcpServerSummaries>;
    activeContractRow:
      | Awaited<ReturnType<typeof db.query.agentExecutionContracts.findMany>>[number]
      | null;
    spentUsd: number;
    recentSteps_: Array<Omit<AgentExecutionStep, 'id'> & { stepId: string }>;
    recentNotifications_: Array<{
      notificationId: string;
      content: string;
      timestamp: number;
      read: boolean;
    }>;
    agentScheduleRows: Awaited<ReturnType<typeof db.query.agentSchedules.findMany>>;
    heartbeat: Awaited<ReturnType<typeof db.query.agentSchedules.findMany>>[number] | undefined;
    roleMap: Map<string, { name: string; description: string | null }>;
    profileMap: Map<string, { name: string; modelKey: string }>;
    githubProvisioning: null;
    skillsByAgentId: Map<string, Awaited<ReturnType<typeof listAgentWorkspaceSkills>>>;
    providers: AgentDetail['providers'];
  }

  // L#NN-50 #18 v6 BLOCK detection: `as unknown as AgentDetail` cast KEEP (Phase 1 decision,
  // Veritas CR 4567062953 Option B). Cast at complex-interface assembly requires wrapper OR
  // interface change — both out of scope for Phase 2 atomic decomposition.
  function buildAgentDetail(ctx: BuildAgentDetailCtx): AgentDetail {
    const roleMap = ctx.roleMap;
    const profileMap = ctx.profileMap;
    const agentRoleId = ctx.agentTyped.roleId;
    const agentModelProfileId = ctx.agentTyped.modelProfileId;
    const agentOmModelProfileId = ctx.agentTyped.omModelProfileId;
    return {
      agentId: ctx.agent.id,
      name: ctx.agent.name ?? '',
      description: ctx.agent.description ?? null,
      instructions: ctx.agent.instructions,
      executionState: ctx.agent.executionState ?? 'absent',
      role:
        agentRoleId !== null
          ? {
              roleId: agentRoleId,
              name: roleMap.get(agentRoleId)?.name ?? '',
              description: roleMap.get(agentRoleId)?.description ?? null,
            }
          : null,
      modelProfile:
        agentModelProfileId !== null
          ? {
              profileId: agentModelProfileId,
              name: profileMap.get(agentModelProfileId)?.name ?? '',
              modelKey: profileMap.get(agentModelProfileId)?.modelKey ?? '',
            }
          : null,
      omModelProfile:
        agentOmModelProfileId !== null
          ? {
              profileId: agentOmModelProfileId,
              name: profileMap.get(agentOmModelProfileId)?.name ?? '',
              modelKey: profileMap.get(agentOmModelProfileId)?.modelKey ?? '',
            }
          : null,
      workspace: {
        autoSync: ctx.agent.workspaceAutoSync === 1,
        bm25: ctx.agent.workspaceBm25 === 1,
        embedder: ctx.agent.workspaceEmbedder ?? null,
        filesystem: ctx.agent.workspaceFilesystem ?? null,
        sandbox: ctx.agent.workspaceSandbox ?? null,
      },
      lastExecutionError: ctx.agent.lastExecutionError ?? null,
      lastExecutionErrorAt: ctx.agent.lastExecutionErrorAt ?? null,
      loaded: Boolean(ctx.agentTyped),
      runner: ctx.runnerSnapshot,
      providers: ctx.providers,
      mcpServers: ctx.mcpServers,
      recentExecutionSteps: ctx.recentSteps_,
      recentNotifications: ctx.recentNotifications_,
      githubProvisioning: ctx.githubProvisioning,
      skills: ctx.skillsByAgentId.get(ctx.agent.id) ?? [],
      activeContract:
        ctx.activeContractRow !== null && ctx.activeContractRow !== undefined
          ? {
              contractId: ctx.activeContractRow.id,
              agentId: ctx.activeContractRow.agentId,
              agentName: ctx.agent.name ?? '',
              startsAt: ctx.activeContractRow.startsAt,
              endsAt: ctx.activeContractRow.endsAt,
              weeklyValueUsd: ctx.activeContractRow.budgetUsd,
              spentUsd: ctx.spentUsd,
              spentPercent:
                ctx.activeContractRow.budgetUsd > 0
                  ? (ctx.spentUsd / ctx.activeContractRow.budgetUsd) * 100
                  : 0,
              autoRenew: Boolean(ctx.activeContractRow.autoRenew),
            }
          : null,
      schedules: ctx.agentScheduleRows
        .filter((schedule) => schedule.kind === 'agent')
        .map((row): ScheduleSummary => toScheduleSummaryHelper(row)),
      heartbeat: ctx.heartbeat ? toScheduleSummaryHelper(ctx.heartbeat) : null,
    } as AgentDetail;
  }

  async function getAgent(agentId: string): Promise<AgentDetail | null> {
    const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
    if (!agent) return null;

    // L#NN-50 #35: extract structural-typed alias for `(agent as Agent).X` cluster (3 sites)
    const agentTyped = agent as Agent;
    const loadedAgent = registry.get(agentId) as
      | { runner?: { getSnapshot: () => unknown } }
      | undefined;
    const runnerSnapshot = loadedAgent?.runner?.getSnapshot?.() ?? null;

    const {
      agentMcpRows,
      agentScheduleRows,
      recentSteps,
      recentNotifications,
      activeContractRows,
      allRoles,
      allProfiles,
    } = await loadAgentAndDetailData(agentId);

    const agentMcpServerRows = await loadMcpServerRowsForAgent(agentMcpRows);
    const mcpServers = buildMcpServerSummaries(agentMcpRows, agentMcpServerRows);
    const spentUsd = await calculateSpentUsd(activeContractRows, agentId);
    const providerRows = await db.query.agentProviders.findMany({
      where: eq(agentProviders.agentId, agentId),
    });
    const providers: AgentDetail['providers'] = providerRows.flatMap((provider) => {
      if (provider.providerType !== 'discord' && provider.providerType !== 'email') {
        return [];
      }

      const providerType = provider.providerType;
      const credentials = parseProviderCredentials(
        providerType,
        JSON.parse(decryptSecret(provider.encryptedCredentials)),
      );
      return [
        {
          providerType,
          createdAt: provider.createdAt,
          editable: true,
          credentials,
        },
      ];
    });

    const recentSteps_ = recentSteps.map((step) => {
      const { id, ...rest } = step;
      return { ...rest, stepId: id };
    });

    const recentNotifications_ = recentNotifications.map((n) => ({
      notificationId: n.id,
      content: n.content,
      timestamp: n.createdAt,
      read: n.readAt !== null,
    }));

    const heartbeat = agentScheduleRows.find((s) => s.kind === 'heartbeat');
    const roleMap = new Map(allRoles.map((r) => [r.id, r]));
    const profileMap = new Map(allProfiles.map((p) => [p.id, p]));
    const activeContractRow = activeContractRows[0] ?? null;

    return buildAgentDetail({
      agent,
      agentTyped,
      runnerSnapshot,
      agentMcpRows,
      mcpServers,
      activeContractRow,
      spentUsd,
      recentSteps_,
      recentNotifications_,
      agentScheduleRows,
      heartbeat,
      roleMap,
      profileMap,
      githubProvisioning: null,
      skillsByAgentId,
      providers,
    });
  }

  return { listAgents, getAgent };
}
