import { errorMsg } from '../error-formatting';
import { type ConversationStore, type WorkspaceEmbedderId } from '@forge-runtime/core';

import type { createAgentLongTermMemoryStore } from '../ltm/store';
import type { LtmRecallSearchMode } from '../ltm/recall/types';
import { createAgentLongTermMemoryRecall } from '../ltm/recall';
import { forgeDebug } from '@forge-runtime/core';

export async function createAgentRuntimeMemory(input: {
  agentId: string;
  mastraId: string;
  agentWorkspacePath: string;
  agentMemoryPath: string;
  ltmRecallScoreThreshold?: number;
  ltmRecallDocumentCount?: number;
  workspaceEmbedder?: WorkspaceEmbedderId;
  conversationStore: ConversationStore;
  checkpointedOmLimits: {
    recentRawTokens?: number;
  };
  persistenceStore: ReturnType<typeof createAgentLongTermMemoryStore>;
  readRuntimeMemorySettings?: () => Promise<{
    ltmRecallSearchMode: LtmRecallSearchMode;
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
    const longTermMemoryRecall = createAgentLongTermMemoryRecall({
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
    });

    await longTermMemoryRecall.initialize();

    return {
      longTermMemoryRecall,
    };
  } catch (err) {
    forgeDebug({
      scope: 'runtime-memory',
      level: 'error',
      message: 'createAgentRuntimeMemory failed',
      context: { error: errorMsg(err) },
    });
    throw err;
  }
}
