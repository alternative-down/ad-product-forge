import { eq } from 'drizzle-orm';
import type { CheckpointedOmState, CheckpointedOmStateStore } from '@mastra-engine/core';

import type { Database } from '../database';
import { agentCheckpointedOmStates } from '../database/schema';

function createEmptyCheckpointedOmState(): CheckpointedOmState {
  return {
    version: 1,
    checkpointGeneration: null,
    checkpointSummary: null,
    observationBlocks: [],
    activeReflectionBlocks: [],
    latestMetrics: null,
  };
}

export function createAgentCheckpointedOmStateStore(
  db: Database,
  input: {
    agentId: string;
  },
): CheckpointedOmStateStore & {
  readState(): Promise<CheckpointedOmState>;
} {
  async function readState() {
    const row = await db.query.agentCheckpointedOmStates.findFirst({
      where: eq(agentCheckpointedOmStates.agentId, input.agentId),
    });

    return row?.state ?? createEmptyCheckpointedOmState();
  }

  async function loadState() {
    return readState();
  }

  async function saveState(storeInput: {
    threadId: string;
    resourceId: string;
    state: CheckpointedOmState;
  }) {
    const now = Date.now();

    await db
      .insert(agentCheckpointedOmStates)
      .values({
        agentId: input.agentId,
        threadId: storeInput.threadId,
        resourceId: storeInput.resourceId,
        state: storeInput.state,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: agentCheckpointedOmStates.agentId,
        set: {
          threadId: storeInput.threadId,
          resourceId: storeInput.resourceId,
          state: storeInput.state,
          updatedAt: now,
        },
      });
  }

  return {
    readState,
    loadState,
    saveState,
  };
}
