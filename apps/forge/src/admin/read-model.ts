import path from 'node:path';

import { desc, eq, sql } from 'drizzle-orm';
import { createClient } from '@libsql/client';
import {
  communicationConversations,
  communicationMessages,
  initializeCommunicationDatabase,
} from '@mastra-engine/core';

import type { Database } from '../database/index.js';
import { agents, agentExecutionSteps, agentProviders, agentSchedules } from '../database/schema.js';
import { getInternalAgentRegistry } from '../agents/internal-agent-registry.js';
import { createMicroErpReadModel } from '../micro-erp/read-model.js';
import { createCompanyPayables } from '../finance/company-payables.js';
import { createCapabilityStore } from '../capabilities/store.js';
import { forgeCustomToolIds } from '../capabilities/catalog.js';
import { decryptSecret } from '../encryption/crypto.js';
import { createAgentNotificationStore } from '../notifications/store.js';
import { createSystemIntegrationStore } from '../system-integrations/store.js';

const RECENT_STEP_LIMIT = 10;
const RECENT_CASH_MOVEMENT_LIMIT = 10;
const RECENT_NOTIFICATION_LIMIT = 10;
const RECENT_CONVERSATION_LIMIT = 5;
const RECENT_CONVERSATION_MESSAGE_LIMIT = 5;

export function createAdminReadModel(input: {
  db: Database;
  workspaceBasePath: string;
}) {
  const db = input.db;
  const finance = createMicroErpReadModel(db);
  const payables = createCompanyPayables(db);
  const capabilities = createCapabilityStore(db);
  const notifications = createAgentNotificationStore(db);
  const integrations = createSystemIntegrationStore(db);

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
    const [agentRows, functionRows, providerRows] = await Promise.all([
      db.query.agents.findMany({
        orderBy: (fields, { asc }) => [asc(fields.name)],
      }),
      capabilities.listFunctions(),
      db.query.agentProviders.findMany(),
    ]);
    const registry = getInternalAgentRegistry();
    const functionMap = new Map(functionRows.map((row) => [row.functionId, row]));
    const providerTypesByAgentId = new Map<string, string[]>();

    for (const provider of providerRows) {
      const existingTypes = providerTypesByAgentId.get(provider.agentId) ?? [];
      existingTypes.push(provider.providerType);
      providerTypesByAgentId.set(provider.agentId, existingTypes);
    }

    return agentRows.map((agent) => {
      const loadedAgent = registry.get(agent.id);
      const agentFunction = agent.functionId ? (functionMap.get(agent.functionId) ?? null) : null;

      return {
        agentId: agent.id,
        name: agent.name,
        description: agent.description ?? undefined,
        executionState: agent.executionState,
        functionId: agent.functionId,
        functionName: agentFunction?.name ?? null,
        model: agent.model,
        omModel: agent.omModel ?? undefined,
        loaded: Boolean(loadedAgent),
        runner: loadedAgent?.runner.getSnapshot() ?? null,
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
      roleRows,
      providerRows,
      recentSteps,
      agentScheduleRows,
      activeContract,
      recentNotifications,
      recentConversations,
    ] =
      await Promise.all([
        capabilities.listFunctions(),
        capabilities.listRoles(),
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
        listRecentConversations(input.workspaceBasePath, agentId),
      ]);
    const registry = getInternalAgentRegistry();
    const loadedAgent = registry.get(agentId);
    const functionMap = new Map(functions.map((row) => [row.functionId, row]));
    const roleMap = new Map(roleRows.map((row) => [row.roleId, row]));
    const agentFunction = agent.functionId ? (functionMap.get(agent.functionId) ?? null) : null;
    const role = agentFunction?.roleId ? (roleMap.get(agentFunction.roleId) ?? null) : null;
    const heartbeat = agentScheduleRows.find((schedule) => schedule.kind === 'heartbeat') ?? null;

    return {
      agentId: agent.id,
      name: agent.name,
      description: agent.description ?? undefined,
      instructions: agent.instructions,
      executionState: agent.executionState,
      model: agent.model,
      omModel: agent.omModel ?? undefined,
      function: agentFunction
        ? {
            functionId: agentFunction.functionId,
            name: agentFunction.name,
            description: agentFunction.description,
            roleId: agentFunction.roleId,
            roleName: role?.name ?? null,
          }
        : null,
      loaded: Boolean(loadedAgent),
      runner: loadedAgent?.runner.getSnapshot() ?? null,
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
      activeContract,
      schedules: agentScheduleRows
        .filter((schedule) => schedule.kind === 'agent')
        .map(toScheduleSummary),
      heartbeat: heartbeat ? toScheduleSummary(heartbeat) : null,
      recentExecutionSteps: recentSteps.map((step) => ({
        stepId: step.id,
        kind: step.kind,
        modelKey: step.modelKey,
        inputTokens: step.inputTokens,
        cachedInputTokens: step.cachedInputTokens,
        outputTokens: step.outputTokens,
        costUsd: step.costUsd,
        createdAt: step.createdAt,
      })),
      recentNotifications,
      recentConversations,
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
      if (!agentFunction.roleId) {
        continue;
      }

      functionCountByRoleId.set(
        agentFunction.roleId,
        (functionCountByRoleId.get(agentFunction.roleId) ?? 0) + 1,
      );
    }

    const toolMap = new Map(toolPermissions.map((row) => [row.roleId, row.toolIds]));
    const workflowMap = new Map(workflowPermissions.map((row) => [row.roleId, row.workflowIds]));

    return {
      availableToolIds: forgeCustomToolIds,
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
    const items = await integrations.listIntegrations();

    return items.map((integration) => ({
      providerType: integration.providerType,
      isEnabled: integration.isEnabled,
      config: integration.config,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
    }));
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

  return {
    getDashboard,
    listAgents,
    getAgent,
    listFunctions,
    listRoles,
    listSystemIntegrations,
    getFinance,
  };
}

async function listRecentConversations(workspaceBasePath: string, agentId: string) {
  try {
    const agentDatabasePath = path.resolve(workspaceBasePath, agentId, 'database.db');
    const client = createClient({
      url: `file:${agentDatabasePath}`,
    });
    const db = await initializeCommunicationDatabase(client);
    const rows = await db.query.communicationConversations.findMany({
      orderBy: [desc(communicationConversations.updatedAt)],
      limit: RECENT_CONVERSATION_LIMIT,
      with: {
        contact: true,
        messages: {
          orderBy: [desc(communicationMessages.createdAt)],
          limit: RECENT_CONVERSATION_MESSAGE_LIMIT,
        },
      },
    });

    return rows.map((conversation) => ({
      conversationId: conversation.conversationId,
      provider: conversation.provider,
      name: conversation.name ?? undefined,
      contactSlug: conversation.contactSlug ?? undefined,
      contactDisplayName: conversation.contact?.displayName ?? undefined,
      updatedAt: conversation.updatedAt,
      messages: [...conversation.messages]
        .reverse()
        .map((message) => ({
          messageId: message.messageId,
          content: message.content,
          unread: message.unread === 1,
          authorDisplayName: message.authorDisplayName ?? undefined,
          createdAt: message.createdAt,
        })),
    }));
  } catch {
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
