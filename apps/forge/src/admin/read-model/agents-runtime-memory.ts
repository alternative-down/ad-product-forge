/**
 * agents-runtime-memory.ts
 *
 * Reads runtime memory state for an agent: working memory, operational memory,
 * long-term memory snapshots, checkpoint summary, and observability metrics.
 * Extracted from admin/read-model/agents.ts (#2264 phase 1).
 *
 * Extracted companions:
 * - agents-list.ts: getRuntimeMemoryForAgent() (~50 LOC, partial metrics only)
 * - agents.ts: getAgentRuntimeMemory() (~170 LOC, full rich state)
 *
 * This module unifies and replaces both with a single coherent implementation
 * that produces the full AgentRuntimeMemoryOutput shape.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { agents } from '../../database/schema';
import { createClient } from '@libsql/client';
import {
  LibsqlConversationStore,
  readOperationalMemoryState,
  toMastraSafeIdentifier,
  type CommunicationMessageView,
} from '@forge-runtime/core';
import { migrateLegacyCheckpointedOmState } from '../../agents/migrate-legacy-checkpointed-om';
import { readLongTermMemoryState, readLongTermMemoryRecallSnapshot } from './helpers-ltm';
import { formatWorkingMemoryValue, isTextPart } from './helpers';
import { createSystemSettingsStore } from '../../system-settings/store';
import { withTimeout } from '../../utils/async';
import { closeLibsqlClient } from './conversation-helpers';
import { forgeDebug } from '@forge-runtime/core';
import type { Database } from '../../database/index';
import type { InternalAgentRegistry } from '../../agents/internal-agent-registry';

import { ADMIN_OBSERVABILITY_READ_TIMEOUT_MS } from './constants';

// ─── Input / Output types ────────────────────────────────────────────────────

export interface AgentRuntimeMemoryInput {
  agentId: string;
}

export interface AgentRuntimeMemoryOutput {
  workingMemory: string | null;
  agentContext: string | null;
  executionState: 'idle' | 'running' | 'absent';
  lastExecutionError: string | null;
  lastExecutionErrorAt: number | null;
  observations: string;
  reflection: string;
  generationCount: number;
  updatedAt: number | null;
  lastObservedAt: number | null;
  checkpointMessageId: string | null;
  checkpointGeneration: number | null;
  checkpointSummary: string | null;
  checkpointUpdatedAt: number | null;
  ltmRecall: {
    status: string;
    query: string;
    resultIds: string[];
    resultCount: number;
    resultScores: number[];
    graphHit: boolean;
    stepsJson: string;
    error: string | null;
  } | null;
  ltm: {
    running: boolean;
    queued: boolean;
    lastRunAt: number | null;
    lastRunError: string | null;
    lastRunErrorAt: number | null;
    lastWrittenPackageId: string | null;
    lastWrittenAt: number | null;
    packageCount: number;
  } | null;
  metrics: {
    rawMessageCount: number;
    recentRawMessageCount: number;
    recentRawTokenCount: number;
    recentRawTokenLimit: number;
    overflowMessageCount: number;
    overflowTokenCount: number;
    observationTriggerTokenLimit: number;
    activeObservationBlockCount: number;
    observationTokenCount: number;
    reflectionTriggerTokenLimit: number;
    activeReflectionBlockCount: number;
    reflectionTokenCount: number;
    reflectionBudget: number;
    checkpointTokenCount: number;
    checkpointSummaryUpToGeneration: number | null;
    latestThreadMessageAt: number | null;
  };
}

// ─── Factory ────────────────────────────────────────────────────────────────

export interface AgentsRuntimeMemoryDeps {
  db: Database;
  registry: InternalAgentRegistry;
  workspaceBasePath: string;
}

type ClosableLibsqlClient = ReturnType<typeof createClient> & {
  close?: () => void | Promise<void>;
};

export function createAgentsRuntimeMemoryReadModel(
  deps: AgentsRuntimeMemoryDeps,
): { getAgentRuntimeMemory: (agentId: string) => Promise<AgentRuntimeMemoryOutput | null> } {

  async function getAgentRuntimeMemory(agentId: string): Promise<AgentRuntimeMemoryOutput | null> {
    const { db, registry, workspaceBasePath } = deps;
    const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
    if (!agent) return null;

    const loadedAgent = registry.get(agentId);
    const mastraAgentId = toMastraSafeIdentifier(agentId);
    const agentDatabasePath = resolve(workspaceBasePath, agentId, 'database.db');
    const client: ClosableLibsqlClient = createClient({ url: `file:${agentDatabasePath}` });
    client.execute('PRAGMA foreign_keys = ON');
    const conversationStore = new LibsqlConversationStore({ client, tablePrefix: mastraAgentId });

    try {
      await migrateLegacyCheckpointedOmState({ db, agentId, threadId: mastraAgentId, conversationStore });

      const agentWorkspaceRoot = resolve(workspaceBasePath, agentId);
      const agentWorkspaceDir = (agent.workspaceFilesystem?.basePath ?? '') !== ''
        ? resolve(agentWorkspaceRoot, agent.workspaceFilesystem.basePath)
        : resolve(agentWorkspaceRoot, 'workspace');

      let agentContext: string | null = null;
      try {
        agentContext = (await readFile(resolve(agentWorkspaceDir, 'context.txt'), 'utf8')).trim() ?? null;
      } catch (err) {
        forgeDebug({ scope: 'admin-read-model', level: 'error', message: '[safe-catch]', context: { err: err instanceof Error ? err.message : String(err) } });
        agentContext = null;
      }

      const workingMemory = (await conversationStore.read({ threadId: mastraAgentId, resourceId: mastraAgentId }))?.workingMemory ?? null;
      const ltmRecall = await readLongTermMemoryRecallSnapshot(db, agentId);
      const systemSettings = createSystemSettingsStore({ db });
      const settings = await systemSettings.getSettings();

      const operationalMemoryState = await readOperationalMemoryState({
        threadId: mastraAgentId,
        store: conversationStore,
        recentTokenLimit: settings.checkpointedOmRecentRawTokens,
      });

      const checkpointSummaryMessage = operationalMemoryState.checkpointSummaryMessage;
      const checkpointSummaryText = checkpointSummaryMessage?.parts
        .filter(isTextPart)
        .map((part) => part.text!.trim())
        .filter(Boolean)
        .join('\n') ?? null;

      const reflection = operationalMemoryState.reflectionMessages
        .map((message) =>
          message.parts
            .filter(isTextPart)
            .map((part: import("@forge-runtime/core").TextPart) => part.text!.trim())
            .filter(Boolean)
            .join('\n'))
        .filter(Boolean)
        .join('\n');

      const observations = operationalMemoryState.observationMessages
        .map((message) =>
          message.parts
            .filter(isTextPart)
            .map((part: import("@forge-runtime/core").TextPart) => part.text!.trim())
            .filter(Boolean)
            .join('\n'))
        .filter(Boolean)
        .join('\n');

      const generationCount = checkpointSummaryMessage?.operationalMemoryGeneration ?? 0;
      const updatedAt = (operationalMemoryState.metrics.latestThreadMessageAt ?? '') !== ''
        ? Date.parse(operationalMemoryState.metrics.latestThreadMessageAt!)
        : null;
      const lastObservedAt = operationalMemoryState.observationMessages.length
        ? Date.parse(operationalMemoryState.observationMessages.at(-1)?.createdAt!)
        : null;

      const runtimeLtmSnapshot: { running?: boolean; queued?: boolean } | null = loadedAgent?.runtime.longTermMemory !== undefined
        ? await withTimeout(
            loadedAgent.runtime.longTermMemory.readSnapshot(),
            ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
            `Agent runtime memory LTM snapshot timed out for ${agentId}`,
          ).catch((err) => { forgeDebug({ scope: 'admin-read-model', level: 'error', message: '[safe-catch]', context: { err: err instanceof Error ? err.message : String(err) } }); return null; })
        : null;

      const persistedLtmState = await withTimeout(
        readLongTermMemoryState(db, agentId),
        ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
        `Agent runtime memory persisted LTM state timed out for ${agentId}`,
      ).catch((err) => { forgeDebug({ scope: 'admin-read-model', level: 'error', message: '[safe-catch]', context: { err: err instanceof Error ? err.message : String(err) } }); return null; });

      const ltm = (runtimeLtmSnapshot !== null
        ? {
            ...runtimeLtmSnapshot,
            running: agent.executionState === 'idle' ? runtimeLtmSnapshot.running : false,
            queued: agent.executionState === 'idle' ? runtimeLtmSnapshot.queued : false,
          }
        : null) ?? (persistedLtmState
        ? {
            running: false,
            queued: false,
            lastRunAt: (persistedLtmState.lastRunAt ?? '') !== '' ? Date.parse(persistedLtmState.lastRunAt!) : null,
            lastRunError: persistedLtmState.lastRunError,
            lastRunErrorAt: (persistedLtmState.lastRunErrorAt ?? '') !== '' ? Date.parse(persistedLtmState.lastRunErrorAt!) : null,
            lastWrittenPackageId: persistedLtmState.lastWrittenPackageId,
            lastWrittenAt: (persistedLtmState.lastWrittenAt ?? '') !== '' ? Date.parse(persistedLtmState.lastWrittenAt!) : null,
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
        checkpointUpdatedAt: (checkpointSummaryMessage?.createdAt ?? '') !== ''
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
          latestThreadMessageAt: (operationalMemoryState.metrics.latestThreadMessageAt ?? '') !== ''
            ? Date.parse(operationalMemoryState.metrics.latestThreadMessageAt!)
            : null,
        },
      };
    } finally {
      await closeLibsqlClient(client);
    }
  }

  return { getAgentRuntimeMemory };
}
