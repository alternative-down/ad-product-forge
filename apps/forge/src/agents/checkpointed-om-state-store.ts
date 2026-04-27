import { eq } from 'drizzle-orm';
import type { CheckpointedOmState, CheckpointedOmStateStore } from '@forge-runtime/core';
import { forgeDebug } from '@forge-runtime/core';
import { z } from 'zod';

import type { Database } from '../database';
import { agentCheckpointedOmStates } from '../database/schema';

const checkpointedOmCheckpointSummarySchema = z.object({
  text: z.string().min(1),
  tokenCount: z.number().int().nonnegative(),
  upToGeneration: z.number().int().nonnegative(),
  updatedAt: z.string().min(1),
});

const checkpointedOmObservationBlockSchema = z.object({
  id: z.string().min(1),
  tokenCount: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
  lastObservedAt: z.string().min(1),
  reflectedGeneration: z.number().int().nonnegative().nullable(),
  text: z.string().min(1),
  sourceMessageIds: z.array(z.string().min(1)),
});

const checkpointedOmReflectionBlockSchema = z.object({
  recordId: z.string().min(1),
  generationCount: z.number().int().nonnegative(),
  tokenCount: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
  text: z.string().min(1),
});

const checkpointedOmMetricsSnapshotSchema = z.object({
  rawMessageCount: z.number().int().nonnegative(),
  recentRawMessageCount: z.number().int().nonnegative(),
  recentRawTokenCount: z.number().int().nonnegative(),
  recentRawTokenLimit: z.number().int().nonnegative(),
  overflowMessageCount: z.number().int().nonnegative(),
  overflowTokenCount: z.number().int().nonnegative(),
  observationTriggerTokenLimit: z.number().int().nonnegative(),
  activeObservationBlockCount: z.number().int().nonnegative(),
  observationTokenCount: z.number().int().nonnegative(),
  reflectionTriggerTokenLimit: z.number().int().nonnegative(),
  activeReflectionBlockCount: z.number().int().nonnegative(),
  reflectionTokenCount: z.number().int().nonnegative(),
  reflectionBudget: z.number().int().nonnegative(),
  checkpointTokenCount: z.number().int().nonnegative(),
  checkpointSummaryUpToGeneration: z.number().int().nonnegative().nullable(),
  latestThreadMessageAt: z.string().min(1).nullable(),
  updatedAt: z.string().min(1),
});

const checkpointedOmStateSchema = z.object({
  version: z.literal(1),
  checkpointGeneration: z.number().int().nonnegative().nullable(),
  checkpointSummary: checkpointedOmCheckpointSummarySchema.nullable(),
  observationBlocks: z.array(checkpointedOmObservationBlockSchema),
  activeReflectionBlocks: z.array(checkpointedOmReflectionBlockSchema),
  latestMetrics: checkpointedOmMetricsSnapshotSchema.nullable(),
}) satisfies z.ZodType<CheckpointedOmState>;

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

    if (!row) {
      return createEmptyCheckpointedOmState();
    }

    const parsedState = checkpointedOmStateSchema.safeParse(row.state);

    if (parsedState.success) {
      return parsedState.data;
    }

    const repairedState = createEmptyCheckpointedOmState();

    await db
      .update(agentCheckpointedOmStates)
      .set({
        state: repairedState,
        updatedAt: Date.now(),
      })
      .where(eq(agentCheckpointedOmStates.agentId, input.agentId));

    forgeDebug({
      scope: 'checkpointed-om-state-store',
      level: 'warn',
      agentId: input.agentId,
      message: 'Repaired invalid persisted OM state',
      context: {
        parseError: parsedState.error?.message,
        recoveredKeys: Object.keys(repairedState),
      },
    });

    return repairedState;
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
    const validatedState = checkpointedOmStateSchema.parse(storeInput.state);

    await db
      .insert(agentCheckpointedOmStates)
      .values({
        agentId: input.agentId,
        threadId: storeInput.threadId,
        resourceId: storeInput.resourceId,
        state: validatedState,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: agentCheckpointedOmStates.agentId,
        set: {
          threadId: storeInput.threadId,
          resourceId: storeInput.resourceId,
          state: validatedState,
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
