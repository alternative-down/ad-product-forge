import {
  type ConversationStore,
  type WorkspaceEmbedderId,
} from '@forge-runtime/core';

import type { createAgentLongTermMemoryStore } from './ltm/store';
import { createAgentLongTermMemoryRecall } from './ltm/recall';

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
  const longTermMemoryRecall = input.longTermMemory
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
}
