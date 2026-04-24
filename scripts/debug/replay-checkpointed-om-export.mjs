import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { createClient } from '@libsql/client';
import { MockLanguageModelV3 } from 'ai/test';
import {
  LibsqlConversationStore,
  createCheckpointedOmCompatibilityObserver,
} from '@forge-runtime/core';
import { CheckpointedConversationMemory } from 'agent-runtime-core/integrations';

const exportPath = process.argv[2];

if (!exportPath) {
  console.error('Usage: node scripts/debug/replay-checkpointed-om-export.mjs <export-json-path>');
  process.exit(1);
}

const dump = JSON.parse(await readFile(exportPath, 'utf8'));
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'forge-om-replay-'));
const dbPath = path.join(tempDir, 'database.db');
const client = createClient({
  url: `file:${dbPath}`,
});
const conversationStore = new LibsqlConversationStore({
  client,
  tablePrefix: dump.tablePrefix,
});

let checkpointedOmState = dump.checkpointedOmState;
const checkpointAdvances = [];

try {
  await conversationStore.upsertThread({
    id: dump.threadId,
    createdAt: dump.thread.messages[0]?.createdAt ?? new Date(0).toISOString(),
    updatedAt: dump.thread.messages.at(-1)?.createdAt ?? new Date(0).toISOString(),
  });

  for (const message of dump.thread.messages) {
    await conversationStore.appendMessage(message);
  }

  if (dump.checkpointedConversationState) {
    await conversationStore.save(dump.checkpointedConversationState);
  }

  const conversationMemory = new CheckpointedConversationMemory({
    threadId: dump.threadId,
    store: conversationStore,
    stateStore: conversationStore,
    recentTokenLimit: dump.settings.checkpointedOmRecentRawTokens,
    overflowObservationTokenLimit: dump.settings.checkpointedOmRawObservationBatchTokens,
  });

  const omStateStore = {
    async loadState() {
      return checkpointedOmState;
    },
    async saveState(input) {
      checkpointedOmState = input.state;
    },
  };

  const compatibilityObserver = createCheckpointedOmCompatibilityObserver({
    threadId: dump.threadId,
    resourceId: dump.threadId,
    conversationStore,
    conversationMemory,
    stateStore: omStateStore,
    limits: {
      totalContextTokens: dump.settings.checkpointedOmTotalContextTokens,
      recentRawTokens: dump.settings.checkpointedOmRecentRawTokens,
      rawObservationBatchTokens: dump.settings.checkpointedOmRawObservationBatchTokens,
      observationReflectionBatchTokens: dump.settings.checkpointedOmObservationReflectionBatchTokens,
    },
    reflectionModel: new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{
          type: 'text',
          text: '<observations>Synthetic reflection block for OM replay debug.</observations>',
        }],
        finishReason: { raw: 'stop', unified: 'stop' },
        usage: {
          inputTokens: {
            total: 1,
            noCache: 1,
            cacheRead: 0,
            cacheWrite: 0,
          },
          outputTokens: {
            total: 1,
            text: 1,
            reasoning: 0,
          },
        },
        warnings: [],
      }),
    }),
    async onCheckpointAdvanced(input) {
      checkpointAdvances.push({
        fromGeneration: input.fromGeneration,
        toGeneration: input.toGeneration,
        checkpointSummary: input.checkpointSummary,
      });
    },
  });

  const beforeState = await conversationMemory.getState();

  await compatibilityObserver.onAfterStep?.({
    runtimeId: 'debug-runtime',
    record: {
      id: 'debug-step',
      stepNumber: 1,
      inputs: [],
      context: [],
      modelResponse: {
        segments: [],
        actionRequests: [],
        continuation: 'stop',
      },
      modelUsage: null,
      modelMetadata: null,
      actionResults: [],
      continuation: 'stop',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    },
    snapshot: {
      runtimeId: 'debug-runtime',
      status: 'idle',
      pendingInputs: [],
      lastActionResults: [],
      steps: [],
    },
  });

  const afterState = await conversationMemory.getState();

  console.log(JSON.stringify({
    input: {
      messageCount: dump.thread.messageCount,
      checkpointedConversationState: dump.checkpointedConversationState,
      checkpointedOmState: {
        checkpointGeneration: dump.checkpointedOmState?.checkpointGeneration ?? null,
        checkpointSummary: dump.checkpointedOmState?.checkpointSummary ?? null,
        observationBlocks: dump.checkpointedOmState?.observationBlocks?.length ?? 0,
        activeReflectionBlocks: dump.checkpointedOmState?.activeReflectionBlocks?.length ?? 0,
      },
    },
    replay: {
      beforeConversationState: beforeState,
      afterConversationState: afterState,
      checkpointedOmState,
      checkpointAdvances,
    },
  }, null, 2));
} finally {
  await client.close?.();
  await rm(tempDir, { recursive: true, force: true });
}
