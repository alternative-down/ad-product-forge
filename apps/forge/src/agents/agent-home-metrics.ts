import path from 'node:path';

import { and, desc, eq, sql } from 'drizzle-orm';
import { createClient } from '@libsql/client';
import { LibsqlConversationStore, readOperationalMemoryState, toMastraSafeIdentifier, forgeDebug } from '@forge-runtime/core';

import type { Database } from '../database';
import {
  agents,
  agentExecutionSteps,
  agentNotifications,
  agentProviders,
  agentRoles,
  llmProfiles,
} from '../database/schema';
import { createSystemSettingsStore } from '../system-settings/store';
import { createAgentLongTermMemoryStore } from './agent-long-term-memory-store';
import { migrateLegacyCheckpointedOmState } from './migrate-legacy-checkpointed-om';
import type { InternalAgentRunner } from './agent-runner';
import type { InternalAgentRuntime } from './agent-runtime-types';

const OBSERVABILITY_READ_TIMEOUT_MS = 5_000;

type ClosableLibsqlClient = ReturnType<typeof createClient> & {
  close?: () => void | Promise<void>;
};

type RuntimeStoredMessagePart = {
  type: string;
  text?: string;
  [key: string]: unknown;
};

export type AgentHomeMetricSnapshot = {
  agentId: string;
  name: string;
  description?: string;
  executionState: 'idle' | 'running' | 'absent';
  lastExecutionError: string | null;
  lastExecutionErrorAt: number | null;
  roleId: string | null;
  roleName: string | null;
  modelProfile: {
    profileId: string;
    name: string;
    modelKey: string;
  } | null;
  omModelProfile: {
    profileId: string;
    name: string;
    modelKey: string;
  } | null;
  loaded: boolean;
  runner: ReturnType<InternalAgentRunner['getSnapshot']> | null;
  providerTypes: string[];
  overview: {
    lastStepAt: number | null;
    lastStepContextTokens: number | null;
    lastStepPreview: string | null;
    lastToolBadge: {
      icon: string;
      label: string;
    } | null;
    lastStepTokens: number | null;
    lastStepCostUsd: number | null;
    averageStepIntervalMs: number | null;
    unreadNotificationCount: number;
    om: {
      generationCount: number;
      checkpointGeneration: number | null;
      recentRawTokenCount: number;
      recentRawTokenLimit: number;
      overflowTokenCount: number;
      overflowTokenLimit: number;
      observationTokenCount: number;
      reflectionTriggerTokenLimit: number;
      reflectionTokenLimit: number;
      reflectionTokenCount: number;
      checkpointTokenCount: number;
    } | null;
    ltm: {
      running: boolean;
      queued: boolean;
      packageCount: number;
    };
  };
  createdAt: number;
  updatedAt: number;
  omTrace?: Array<{
    at: number;
    scope: string;
    phase: string;
    metrics?: Record<string, number | string | null>;
    detail?: Record<string, unknown> | null;
  }>;
};

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
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

export function truncatePreview(value: string) {
  return value.length > 220 ? `${value.slice(0, 217).trimEnd()}...` : value;
}

export function extractLatestMessagePreview(content: unknown) {
  if (!content || typeof content !== 'object') {
    return null;
  }

  const parts = Array.isArray((content as { parts?: unknown[] }).parts)
    ? (content as { parts: Array<Record<string, unknown>> }).parts
    : [];
  const textSegments = parts
    .filter((part) => part.type === 'text' || part.type === 'reasoning')
    .map((part) => String(part.text ?? '').trim())
    .filter(Boolean);

  if (textSegments.length === 0) {
    return null;
  }

  return truncatePreview(textSegments.join(' '));
}

export function extractLatestMessageToolBadge(content: unknown) {
  if (!content || typeof content !== 'object') {
    return null;
  }

  const parts = Array.isArray((content as { parts?: unknown[] }).parts)
    ? (content as { parts: Array<Record<string, unknown>> }).parts
    : [];
  const toolCallPart = parts.find((part) => part.type === 'tool-call');

  if (!toolCallPart || typeof toolCallPart.toolName !== 'string') {
    return null;
  }

  if (toolCallPart.toolName === 'send_message') {
    return { icon: '✉️', label: 'Mensagem' };
  }

  if (toolCallPart.toolName.startsWith('workspace_')) {
    return { icon: '🛠️', label: 'Workspace' };
  }

  if (toolCallPart.toolName.startsWith('github_')) {
    return { icon: '🐙', label: 'GitHub' };
  }

  if (toolCallPart.toolName.startsWith('search_')) {
    return { icon: '🔎', label: 'Busca' };
  }

  return null;
}

export function mergeToolLogMessages(messages: Array<{
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

export function buildThreadToolInvocationParts(metadata: Record<string, unknown> | undefined) {
  const toolInvocations = Array.isArray(metadata?.toolInvocations)
    ? metadata.toolInvocations
    : [];
  const toolResults = Array.isArray(metadata?.toolResults)
    ? metadata.toolResults
    : [];
  const resultIndexesByToolCallId = new Map<string, number>();
  const parts: Array<Record<string, unknown>> = [];
  const matchedResultIndexes = new Set<number>();

  for (const [index, toolResult] of toolResults.entries()) {
    if (
      typeof toolResult !== 'object'
      || toolResult === null
      || typeof toolResult.toolCallId !== 'string'
    ) {
      continue;
    }

    resultIndexesByToolCallId.set(toolResult.toolCallId, index);
  }

  for (const toolInvocation of toolInvocations) {
    if (
      typeof toolInvocation !== 'object'
      || toolInvocation === null
      || typeof toolInvocation.toolName !== 'string'
    ) {
      continue;
    }

    const toolCallId = typeof toolInvocation.toolCallId === 'string'
      ? toolInvocation.toolCallId
      : null;
    const toolResultIndex = toolCallId ? resultIndexesByToolCallId.get(toolCallId) : undefined;
    const toolResult = typeof toolResultIndex === 'number'
      ? toolResults[toolResultIndex]
      : null;

    if (typeof toolResultIndex === 'number') {
      matchedResultIndexes.add(toolResultIndex);
    }

    parts.push({
      type: 'tool-call',
      toolCallId,
      toolName: toolInvocation.toolName,
      args: toolInvocation.args,
      ...(toolResult ? { result: toolResult } : {}),
    });
  }

  for (const [index, toolResult] of toolResults.entries()) {
    if (matchedResultIndexes.has(index)) {
      continue;
    }

    parts.push({
      type: 'tool-result',
      ...(typeof toolResult === 'object' && toolResult !== null ? toolResult : { result: toolResult }),
    });
  }

  return parts;
}

async function readLatestThreadDetails(workspaceBasePath: string, agentId: string) {
  try {
    const threadId = toMastraSafeIdentifier(agentId);
    const agentDatabasePath = path.resolve(workspaceBasePath, agentId, 'database.db');
    const client: ClosableLibsqlClient = createClient({
      url: `file:${agentDatabasePath}`,
    });
    const conversationStore = new LibsqlConversationStore({
      client,
      tablePrefix: threadId,
    });

    try {
      const messages = await conversationStore.listMessages({
        threadId,
        limit: 8,
        order: 'desc',
      });
      const mergedMessages = mergeToolLogMessages([...messages].reverse()).reverse();
      let preview: string | null = null;
      let toolBadge: { icon: string; label: string } | null = null;

      for (const message of mergedMessages) {
        if (message.role !== 'assistant') {
          continue;
        }

        const content = {
          parts: [
            ...message.parts.map((part) =>
              part.type === 'text' || part.type === 'reasoning'
                ? {
                    type: part.type,
                    text: part.text,
                  }
                : part),
            ...buildThreadToolInvocationParts(message.metadata),
          ],
        };

        preview ??= extractLatestMessagePreview(content);
        toolBadge ??= extractLatestMessageToolBadge(content);

        if (preview) {
          break;
        }
      }

      return {
        preview,
        toolBadge,
      };
    } finally {
      await closeLibsqlClient(client);
    }
  } catch (error) {
    forgeDebug({ scope: 'agent-home-metrics', level: 'error', agentId, message: 'Failed to load latest thread details', context: { error } });
    return {
      preview: null,
      toolBadge: null,
    };
  }
}

async function readAgentRuntimeMemory(db: Database, workspaceBasePath: string, agentId: string) {
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
  });

  if (!agent) {
    return null;
  }

  const systemSettings = createSystemSettingsStore(db);
  const mastraAgentId = toMastraSafeIdentifier(agentId);
  const agentDatabasePath = path.resolve(workspaceBasePath, agentId, 'database.db');
  const client: ClosableLibsqlClient = createClient({
    url: `file:${agentDatabasePath}`,
  });
  const conversationStore = new LibsqlConversationStore({
    client,
    tablePrefix: mastraAgentId,
  });

  try {
    const settings = await systemSettings.getSettings();

    await migrateLegacyCheckpointedOmState({
      db,
      agentId,
      threadId: mastraAgentId,
      conversationStore,
    });

    const operationalMemoryState = await readOperationalMemoryState({
      threadId: mastraAgentId,
      store: conversationStore,
      recentTokenLimit: settings.checkpointedOmRecentRawTokens,
    });
    const checkpointSummaryMessage = operationalMemoryState.checkpointSummaryMessage;

    return {
      generationCount: checkpointSummaryMessage?.operationalMemoryGeneration ?? 0,
      checkpointGeneration: checkpointSummaryMessage?.operationalMemoryGeneration ?? null,
      metrics: {
        recentRawMessageCount: operationalMemoryState.metrics.recentRawMessageCount,
        recentRawTokenCount: operationalMemoryState.metrics.recentRawTokenCount,
        recentRawTokenLimit: settings.checkpointedOmRecentRawTokens,
        overflowMessageCount: operationalMemoryState.metrics.overflowMessageCount,
        overflowTokenCount: operationalMemoryState.metrics.overflowTokenCount,
        observationCount: operationalMemoryState.observationMessages.length,
        observationTokenCount: operationalMemoryState.metrics.observationTokenCount,
        observationTriggerTokenLimit: settings.checkpointedOmRawObservationBatchTokens,
        reflectionCount: operationalMemoryState.reflectionMessages.length,
        reflectionTokenCount: operationalMemoryState.metrics.reflectionTokenCount,
        reflectionTriggerTokenLimit: settings.checkpointedOmObservationReflectionBatchTokens,
        reflectionBudget: Math.max(
          0,
          settings.checkpointedOmTotalContextTokens
            - settings.checkpointedOmRecentRawTokens
            - settings.checkpointedOmRawObservationBatchTokens
            - settings.checkpointedOmObservationReflectionBatchTokens,
        ),
        checkpointTokenCount: operationalMemoryState.metrics.checkpointTokenCount,
      },
    };
  } finally {
    await closeLibsqlClient(client);
  }
}

export function buildAverageStepIntervalMs(recentSteps: Array<{ createdAt: number }>) {
  if (recentSteps.length < 2) {
    return null;
  }

  return Math.round(
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
  );
}

export async function readAgentHomeMetricSnapshot(input: {
  db: Database;
  workspaceBasePath: string;
  agentId: string;
  runtime: InternalAgentRuntime | null;
  runnerSnapshot: ReturnType<InternalAgentRunner['getSnapshot']> | null;
}) {
  const agent = await input.db.query.agents.findFirst({
    where: eq(agents.id, input.agentId),
  });

  if (!agent) {
    return null;
  }

  const [role, modelProfile, omModelProfile, providerRows, unreadNotificationRows, recentSteps, runtimeMemory, latestThreadDetails, longTermMemoryState, runtimeLtmSnapshot] = await Promise.all([
    agent.roleId
      ? input.db.query.agentRoles.findFirst({
        where: eq(agentRoles.id, agent.roleId),
      })
      : Promise.resolve(null),
    input.db.query.llmProfiles.findFirst({
      where: eq(llmProfiles.id, agent.modelProfileId),
    }),
    input.db.query.llmProfiles.findFirst({
      where: eq(llmProfiles.id, agent.omModelProfileId),
    }),
    input.db.query.agentProviders.findMany({
      where: eq(agentProviders.agentId, agent.id),
    }),
    input.db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(agentNotifications)
      .where(and(
        eq(agentNotifications.agentId, agent.id),
        sql`${agentNotifications.readAt} is null`,
      )),
    input.db.query.agentExecutionSteps.findMany({
      where: and(
        eq(agentExecutionSteps.agentId, agent.id),
        eq(agentExecutionSteps.kind, 'agent-step'),
      ),
      orderBy: [desc(agentExecutionSteps.createdAt)],
      limit: 6,
    }),
    withTimeout(
      readAgentRuntimeMemory(input.db, input.workspaceBasePath, agent.id),
      OBSERVABILITY_READ_TIMEOUT_MS,
      `Agent runtime memory read timed out for ${agent.id}`,
    ).catch((error) => {
      forgeDebug({ scope: 'agent-home-metrics', level: 'error', agentId: agent.id, message: 'Failed to load runtime memory', context: { error } });
      return null;
    }),
    withTimeout(
      readLatestThreadDetails(input.workspaceBasePath, agent.id),
      OBSERVABILITY_READ_TIMEOUT_MS,
      `Latest thread details read timed out for ${agent.id}`,
    ).catch((error) => {
      forgeDebug({ scope: 'agent-home-metrics', level: 'error', agentId: agent.id, message: 'Failed to load latest thread details', context: { error } });
      return {
        preview: null,
        toolBadge: null,
      };
    }),
    withTimeout(
      createAgentLongTermMemoryStore(input.db, {
        agentId: agent.id,
      }).readState(),
      OBSERVABILITY_READ_TIMEOUT_MS,
      `Long-term memory state read timed out for ${agent.id}`,
    ).catch((error) => {
      forgeDebug({ scope: 'agent-home-metrics', level: 'error', agentId: agent.id, message: 'Failed to load LTM state', context: { error } });
      return null;
    }),
    input.runtime?.longTermMemory
      ? withTimeout(
        Promise.resolve(input.runtime.longTermMemory.readSnapshot()),
        OBSERVABILITY_READ_TIMEOUT_MS,
        `Runtime LTM snapshot timed out for ${agent.id}`,
      ).catch((error) => {
        forgeDebug({ scope: 'agent-home-metrics', level: 'error', agentId: agent.id, message: 'Failed to load runtime LTM snapshot', context: { error } });
        return null;
      })
      : Promise.resolve(null),
  ]);

  const lastStep = recentSteps[0] ?? null;
  const executionState = agent.executionState as 'idle' | 'running' | 'absent';

  return {
    agentId: agent.id,
    name: agent.name,
    description: agent.description ?? undefined,
    executionState,
    lastExecutionError: agent.lastExecutionError ?? null,
    lastExecutionErrorAt: agent.lastExecutionErrorAt ?? null,
    roleId: agent.roleId,
    roleName: role?.name ?? null,
    modelProfile: modelProfile
      ? {
          profileId: modelProfile.id,
          name: modelProfile.name,
          modelKey: modelProfile.modelKey,
        }
      : null,
    omModelProfile: omModelProfile
      ? {
          profileId: omModelProfile.id,
          name: omModelProfile.name,
          modelKey: omModelProfile.modelKey,
        }
      : null,
    loaded: Boolean(input.runtime),
    runner: input.runnerSnapshot,
    providerTypes: providerRows.map((row) => row.providerType).sort(),
    overview: {
      lastStepAt: lastStep?.createdAt ?? null,
      lastStepContextTokens: lastStep?.inputTokens ?? null,
      lastStepPreview: latestThreadDetails.preview,
      lastToolBadge: latestThreadDetails.toolBadge,
      lastStepTokens: lastStep
        ? lastStep.inputTokens + lastStep.cachedInputTokens + lastStep.outputTokens
        : null,
      lastStepCostUsd: lastStep?.costUsd ?? null,
      averageStepIntervalMs: buildAverageStepIntervalMs(recentSteps),
      unreadNotificationCount: ((unreadNotificationRows as unknown) as { count: number }[])[0]?.count ?? 0,
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
  } satisfies AgentHomeMetricSnapshot;
}
