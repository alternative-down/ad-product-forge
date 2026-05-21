import { serializeError } from '../agent-runner-error-formatting';
import { type ConversationStore, type WorkspaceEmbedderId } from '@forge-runtime/core';

import type { createAgentLongTermMemoryStore } from '../ltm/store';
import { createAgentLongTermMemoryRecall } from '../ltm/recall';
import { forgeDebug } from '@forge-runtime/core';

export async function createAgentRuntimeMemory(input: {
  agentId: string;
  mastraId: string;
  agentWorkspacePath: string;
  agentModel: unknown;
  omModel?: unknown;
  agentMemoryPath: string;
  longTermMemory?: boolean;
  memoryLastMessagesFullEnabled?: boolean;
  memoryLastMessagesCount?: number;
  tokenCountFilterEnabled?: boolean;
  tokenCountFilterLimit?: number;
  checkpointedOmEnabled?: boolean;
  checkpointedOmRecentRawTokens?: number;
  ltmRecallScoreThreshold?: number;
  ltmRecallDocumentCount?: number;
  workspaceEmbedder?: WorkspaceEmbedderId;
  conversationStore: ConversationStore;
  checkpointedOmLimits: {
    recentRawTokens?: number;
  };
  persistenceStore: ReturnType<typeof createAgentLongTermMemoryStore>;
  readRuntimeMemorySettings?: () => Promise<{
    ltmRecallSearchMode: 'hybrid' | 'vector' | 'bm25';
    ltmRecallWorkspaceTopK: number;
    ltmRecallGraphTopK: number;
    ltmRecallGraphThreshold: number;
    ltmRecallGraphRandomWalkSteps: number;
    ltmRecallGraphIncludeSources: boolean;
    ltmRecallScoreThreshold: number;
    ltmRecallDocumentCount: number;
  }>;
}) {
  try {
    const longTermMemoryRecall =
      input.longTermMemory !== null && input.longTermMemory !== undefined
        ? createAgentLongTermMemoryRecall({
            agentId: input.agentId,
            agentWorkspacePath: input.agentWorkspacePath,
            agentMemoryPath: input.agentMemoryPath,
            workspaceEmbedder: input.workspaceEmbedder,
            mastraId: input.mastraId,
            scoreThreshold: input.ltmRecallScoreThreshold,
            documentCount: input.ltmRecallDocumentCount,
            conversationStore: input.conversationStore,
            recentRawTokens: input.checkpointedOmLimits.recentRawTokens,
            persistenceStore: input.persistenceStore,
            readRuntimeMemorySettings: input.readRuntimeMemorySettings,
          })
        : null;

    await longTermMemoryRecall?.initialize();

    return {
      longTermMemoryRecall,
    };
  } catch (err) {
    forgeDebug({
      scope: 'runtime-memory',
      level: 'error',
      message: 'createAgentRuntimeMemory failed',
      context: { error: serializeError(err) },
    });
    throw err;
  }
}
