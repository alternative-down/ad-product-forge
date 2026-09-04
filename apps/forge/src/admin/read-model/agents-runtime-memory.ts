/**
 * agents-runtime-memory.ts
 *
 * Reads runtime memory state for an agent: working memory, operational memory,
 * checkpoint summary and observability metrics.
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
  calculateOperationalMemoryReflectionBudget,
  LibsqlConversationStore,
  readOperationalMemoryState,
  toMastraSafeIdentifier,
} from '@forge-runtime/core';
import { errorMsg } from '../../agents/error-formatting';
import { migrateLegacyCheckpointedOmState } from '../../agents/migrate-legacy-checkpointed-om';
import { formatWorkingMemoryValue } from './helpers';
import type { ConversationMessage, ConversationMessagePart } from 'agent-runtime-core/integrations';
import { createSystemSettingsStore } from '../../system-settings/store';
import { AGENT_CONTEXT_FILE_PATH } from '../../utils/constants';
import { closeLibsqlClient } from './conversation-helpers';
import { adminReadModelDebug } from './agents-detail-debug';
import type { Database } from '../../database/index';
import type { InternalAgentRegistry } from '../../agents/internal-agent-registry';

import type { WorkspaceFilesystemConfig } from '../../database/schema';

// ─── Input / Output types ────────────────────────────────────────────────────

type RuntimeTextPart =
  | { type: 'text'; text: string }
  | {
      type: 'reasoning';
      text: string;
      providerMetadata?: { anthropic?: { signature?: string; redactedData?: string } };
    };

function isRuntimeTextPart(part: ConversationMessagePart): part is RuntimeTextPart {
  return part.type === 'text' || part.type === 'reasoning';
}

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

export function createAgentsRuntimeMemoryReadModel(deps: AgentsRuntimeMemoryDeps): {
  getAgentRuntimeMemory: (agentId: string) => Promise<AgentRuntimeMemoryOutput | null>;
} {
  async function getAgentRuntimeMemory(agentId: string): Promise<AgentRuntimeMemoryOutput | null> {
    const { db, registry, workspaceBasePath } = deps;
    const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
    if (!agent) return null;

    const mastraAgentId = toMastraSafeIdentifier(agentId);
    const agentDatabasePath = resolve(workspaceBasePath, agentId, 'database.db');
    const client: ClosableLibsqlClient = createClient({ url: `file:${agentDatabasePath}` });
    client.execute('PRAGMA foreign_keys = ON');
    const conversationStore = new LibsqlConversationStore({ client, tablePrefix: mastraAgentId });

    try {
      await migrateLegacyCheckpointedOmState({
        db,
        agentId,
        threadId: mastraAgentId,
        conversationStore,
      });

      const agentWorkspaceRoot = resolve(workspaceBasePath, agentId);
      const parsedWs =
        agent.workspaceFilesystem != null
          ? (JSON.parse(agent.workspaceFilesystem) as WorkspaceFilesystemConfig)
          : null;
      const agentWorkspaceDir =
        parsedWs?.basePath != null && parsedWs.basePath !== ''
          ? resolve(agentWorkspaceRoot, parsedWs.basePath)
          : resolve(agentWorkspaceRoot, 'workspace');

      let agentContext: string | null = null;
      try {
        agentContext =
          (await readFile(resolve(agentWorkspaceDir, AGENT_CONTEXT_FILE_PATH), 'utf8')).trim() ||
          null;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          adminReadModelDebug('error', 'Failed to read agent context', {
            error: errorMsg(err),
            agentId,
          });
        }
        agentContext = null;
      }

      const workingMemory =
        (await conversationStore.read({ threadId: mastraAgentId, resourceId: mastraAgentId }))
          ?.workingMemory ?? null;
      const systemSettings = createSystemSettingsStore(db);
      const settings = await systemSettings.getSettings();

      const operationalMemoryState = await readOperationalMemoryState({
        threadId: mastraAgentId,
        store: conversationStore,
        recentTokenLimit: settings.checkpointedOmRecentRawTokens,
      });

      const checkpointSummaryMessage = operationalMemoryState.checkpointSummaryMessage;
      const checkpointSummaryText =
        checkpointSummaryMessage != null
          ? checkpointSummaryMessage.parts
              .filter(isRuntimeTextPart)
              .map((part: RuntimeTextPart) => part.text.trim())
              .filter(Boolean)
              .join('\n')
          : null;
      const reflection = operationalMemoryState.reflectionMessages
        .map((message: ConversationMessage) =>
          message.parts
            .filter(isRuntimeTextPart)
            .map((part: RuntimeTextPart) => part.text.trim())
            .filter(Boolean)
            .join('\n'),
        )
        .filter(Boolean)
        .join('\n');

      const observations = operationalMemoryState.observationMessages
        .map((message: ConversationMessage) =>
          message.parts
            .filter(isRuntimeTextPart)
            .map((part: RuntimeTextPart) => part.text.trim())
            .filter(Boolean)
            .join('\n'),
        )
        .filter(Boolean)
        .join('\n');

      const generationCount = checkpointSummaryMessage?.operationalMemoryGeneration ?? 0;
      const updatedAt =
        ((operationalMemoryState.metrics.latestThreadMessageAt ?? '') as string) !== ''
          ? Date.parse((operationalMemoryState.metrics.latestThreadMessageAt ?? '') as string)
          : null;
      const lastObservedAt =
        operationalMemoryState.observationMessages.length !== 0
          ? Date.parse(operationalMemoryState.observationMessages.at(-1)?.createdAt ?? '')
          : null;

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
        checkpointUpdatedAt:
          (checkpointSummaryMessage?.createdAt ?? '') !== ''
            ? Date.parse(
                (checkpointSummaryMessage as { createdAt?: string } | null)?.createdAt ?? '',
              )
            : null,
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
          reflectionBudget: calculateOperationalMemoryReflectionBudget({
            totalContextTokens: settings.checkpointedOmTotalContextTokens,
            recentRawTokens: settings.checkpointedOmRecentRawTokens,
            rawObservationBatchTokens: settings.checkpointedOmRawObservationBatchTokens,
            observationReflectionBatchTokens:
              settings.checkpointedOmObservationReflectionBatchTokens,
          }),
          checkpointTokenCount: operationalMemoryState.metrics.checkpointTokenCount,
          checkpointSummaryUpToGeneration:
            checkpointSummaryMessage?.operationalMemoryGeneration ?? null,
          latestThreadMessageAt:
            (operationalMemoryState.metrics.latestThreadMessageAt ?? '') !== ''
              ? Date.parse((operationalMemoryState.metrics.latestThreadMessageAt ?? '') as string)
              : null,
        },
      };
    } finally {
      await closeLibsqlClient(client);
    }
  }

  return { getAgentRuntimeMemory };
}
