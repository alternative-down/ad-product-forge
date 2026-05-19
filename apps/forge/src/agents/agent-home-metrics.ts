import path from 'node:path';

import { and, desc, eq, sql } from 'drizzle-orm';
import { createClient } from '@libsql/client';
import { LibsqlConversationStore, readOperationalMemoryState, toMastraSafeIdentifier, forgeDebug } from '@forge-runtime/core';

import type { Database } from '../database/schema';
import {
  agents,
  agentExecutionSteps,
  agentNotifications,
  agentProviders,
  agentRoles,
  llmProfiles,
} from '../database/schema';
import { createSystemSettingsStore } from '../system-settings/store';
import { createAgentLongTermMemoryStore } from './ltm/store';
import { migrateLegacyCheckpointedOmState } from './migrate-legacy-checkpointed-om';
import type { InternalAgentRunner } from './agent-runner';
import type { InternalAgentRuntime } from './runtime/types';

// Imports: extracted async helpers (extracted in phases 2-4)
import { readLatestThreadDetails, readAgentRuntimeMemory, buildAverageStepIntervalMs } from './agent-home-metrics-thread-helpers';

// Re-exports from helpers for backward compatibility
export { buildAverageStepIntervalMs } from './agent-home-metrics-thread-helpers';
export { formatStepIntervalLabel, computeIntervalConsistencyScore } from './agent-home-metrics-interval-helpers';
export { truncatePreview, extractLatestMessagePreview, extractLatestMessageToolBadge } from './agent-home-metrics-preview-helpers';
export { buildThreadToolInvocationParts } from './agent-home-metrics-tool-helpers';

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

import { withTimeout } from "../utils/async";

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
    agent.roleId !== null && agent.roleId !== undefined
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
      forgeDebug({ scope: 'agent-home-metrics', level: 'error', agentId: agent.id, message: 'Failed to load runtime memory', context: { error: error instanceof Error ? error.message : String(error) } });
      return null;
    }),
    withTimeout(
      readLatestThreadDetails(input.workspaceBasePath, agent.id),
      OBSERVABILITY_READ_TIMEOUT_MS,
      `Latest thread details read timed out for ${agent.id}`,
    ).catch((error) => {
      forgeDebug({ scope: 'agent-home-metrics', level: 'error', agentId: agent.id, message: 'Failed to load latest thread details', context: { error: error instanceof Error ? error.message : String(error) } });
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
      forgeDebug({ scope: 'agent-home-metrics', level: 'error', agentId: agent.id, message: 'Failed to load LTM state', context: { error: error instanceof Error ? error.message : String(error) } });
      return null;
    }),
    input.runtime?.longTermMemory
      ? withTimeout(
        Promise.resolve(input.runtime.longTermMemory.readSnapshot()),
        OBSERVABILITY_READ_TIMEOUT_MS,
        `Runtime LTM snapshot timed out for ${agent.id}`,
      ).catch((error) => {
        forgeDebug({ scope: 'agent-home-metrics', level: 'error', agentId: agent.id, message: 'Failed to load runtime LTM snapshot', context: { error: error instanceof Error ? error.message : String(error) } });
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
    providerTypes: providerRows.map((row: { providerType: string }) => row.providerType).sort(),
    overview: {
      lastStepAt: lastStep?.createdAt ?? null,
      lastStepContextTokens: lastStep?.inputTokens ?? null,
      lastStepPreview: latestThreadDetails.preview,
      lastToolBadge: latestThreadDetails.toolBadge,
      lastStepTokens: lastStep !== null && lastStep !== undefined
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


