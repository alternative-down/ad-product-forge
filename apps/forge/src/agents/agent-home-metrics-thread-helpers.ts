import { forgeDebug, LibsqlConversationStore, readOperationalMemoryState, toMastraSafeIdentifier } from '@forge-runtime/core';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { eq } from 'drizzle-orm';
import { createSystemSettingsStore } from '../system-settings/store';
import { migrateLegacyCheckpointedOmState } from './migrate-legacy-checkpointed-om';
import { mergeToolLogMessages } from './agent-home-metrics-tool-helpers';
import { extractLatestMessagePreview, extractLatestMessageToolBadge } from './agent-home-metrics-preview-helpers';
import { buildThreadToolInvocationParts } from './agent-home-metrics-tool-helpers';
import type { Database } from '../database/schema';
import { agents } from '../database/schema';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { InternalAgentRuntime } from './runtime/types';

const _OBSERVABILITY_READ_TIMEOUT_MS = 5_000;

 
type ClosableLibsqlClient = Awaited<ReturnType<typeof createClient>> & {
  close?: () => void | Promise<void>;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type RuntimeStoredMessagePart = {
  type: string;
  text?: string;
  [key: string]: unknown;
};

export type ThreadDetails = {
  preview: string | null;
  toolBadge: { icon: string; label: string } | null;
};

async function closeLibsqlClient(client: ClosableLibsqlClient) {
  await client.close?.();
}

/**
 * Reads the most recent conversation messages from the agent's libsql database
 * and extracts the preview text and tool badge from the last assistant message.
 *
 * Opens a libsql client on the agent's database.db, queries the latest 8 messages
 * (merged for tool call/results), and extracts text preview + tool badge.
 * Silently returns `{ preview: null, toolBadge: null }` on any error.
 */
export async function readLatestThreadDetails(
  workspaceBasePath: string,
  agentId: string,
): Promise<ThreadDetails> {
  try {
    const threadId = toMastraSafeIdentifier(agentId);
    const agentDatabasePath = path.resolve(workspaceBasePath, agentId, 'database.db');
    const client: ClosableLibsqlClient = createClient({
      url: `file:${agentDatabasePath}`,
    });
    client.execute('PRAGMA foreign_keys = ON');
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

        if (preview !== undefined && preview !== null) {
          break;
        }
      }

      return { preview, toolBadge };
    } finally {
      await closeLibsqlClient(client);
    }
  } catch (error) {
    forgeDebug({
      scope: 'agent-home-metrics',
      level: 'error',
      agentId,
      message: 'Failed to load latest thread details',
      context: { error: error instanceof Error ? error.message : String(error) },
    });
    return { preview: null, toolBadge: null };
  }
}

export type RuntimeMemoryMetrics = {
  recentRawMessageCount: number;
  recentRawTokenCount: number;
  recentRawTokenLimit: number;
  overflowTokenCount: number;
  overflowTokenLimit: number;
  observationTokenCount: number;
  observationTriggerTokenLimit: number;
  reflectionTriggerTokenLimit: number;
  reflectionTokenCount: number;
  reflectionBudget: number;
  checkpointTokenCount: number;
};

export type RuntimeMemory = {
  generationCount: number;
  checkpointGeneration: number | null;
  metrics: RuntimeMemoryMetrics;
};

/**
 * Reads the agent's operational memory state from its libsql database.
 *
 * Opens the agent's database.db via libsql, migrates legacy state (non-fatal),
 * reads the operational memory state, and computes memory metrics from
 * system settings and runtime values.
 *
 * Returns null if the agent is not found or any read fails. Errors are logged
 * via forgeDebug and silenced to avoid surfacing in the home metrics page.
 */
export async function readAgentRuntimeMemory(
  db: Database,
  workspaceBasePath: string,
  agentId: string,
): Promise<RuntimeMemory | null> {
  let agent;
  try {
    agent = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
    });
  } catch (err) {
    forgeDebug({
      scope: 'agent-home-metrics',
      level: 'error',
      message: 'readAgentRuntimeMemory: read agent failed',
      context: { agentId, error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }

  if (!agent) {
    return null;
  }

  const systemSettings = createSystemSettingsStore(db);
  const mastraAgentId = toMastraSafeIdentifier(agentId);
  const agentDatabasePath = path.resolve(workspaceBasePath, agentId, 'database.db');
  const client: ClosableLibsqlClient = createClient({
    url: `file:${agentDatabasePath}`,
  });
  client.execute('PRAGMA foreign_keys = ON');
  const conversationStore = new LibsqlConversationStore({
    client,
    tablePrefix: mastraAgentId,
  });

  try {
    const settings = await systemSettings.getSettings();

    try {
      await migrateLegacyCheckpointedOmState({
        db,
        agentId,
        threadId: mastraAgentId,
        conversationStore,
      });
    } catch (error) {
      // Migration failure is non-fatal: state may already be up-to-date or in a compatible format
      forgeDebug({
        scope: 'agent-home-metrics',
        level: 'warn',
        agentId,
        message: 'Legacy checkpointed OM state migration failed',
        context: { error: error instanceof Error ? error.message : String(error) },
      });
    }

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
        overflowTokenCount: operationalMemoryState.metrics.overflowTokenCount,
        overflowTokenLimit: settings.checkpointedOmRawObservationBatchTokens,
        observationTokenCount: operationalMemoryState.metrics.observationTokenCount,
        observationTriggerTokenLimit: (settings as any).checkpointedOmObservationTriggerTokenLimit,
        reflectionTriggerTokenLimit: (settings as any).checkpointedOmReflectionTriggerTokenLimit,
        reflectionTokenCount: operationalMemoryState.metrics.reflectionTokenCount,
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
  } catch {
    return null;
  } finally {
    await closeLibsqlClient(client);
  }
}

/**
 * Computes the average interval in milliseconds between the 6 most recent agent steps.
 *
 * For a list of steps sorted newest-first, computes the time delta between each
 * consecutive pair (newest minus next newer), then averages those deltas.
 * Returns null if fewer than 2 steps are provided.
 *
 * Pure function — no I/O, no side effects.
 */
export function buildAverageStepIntervalMs(
  recentSteps: Array<{ createdAt: number }>,
): number | null {
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