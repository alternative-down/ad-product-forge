import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from '../../database';
import {
  agentLongTermMemoryRecallStates,
  agentLongTermMemoryStates,
} from '../../database/schema';

const packageManifestSchema = z.object({
  packageId: z.string().min(1),
  checkpointGeneration: z.number().int().nonnegative(),
  fromGeneration: z.number().int().nonnegative().nullable(),
  toGeneration: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
  checkpointSummaryUpdatedAt: z.string().min(1),
  reflectionCount: z.number().int().nonnegative(),
  observationCount: z.number().int().nonnegative(),
});

const longTermMemoryStateSchema = z.object({
  version: z.literal(1),
  packages: z.array(packageManifestSchema),
  lastWrittenPackageId: z.string().min(1).nullable(),
  lastWrittenAt: z.string().min(1).nullable(),
  lastRunAt: z.string().min(1).nullable(),
  lastRunError: z.string().min(1).nullable(),
  lastRunErrorAt: z.string().min(1).nullable(),
  updatedAt: z.string().min(1),
});

const longTermMemoryRecallSnapshotSchema = z.object({
  status: z.enum(['hit', 'miss', 'error']),
  query: z.string(),
  resultIds: z.array(z.string()),
  resultCount: z.number(),
  resultScores: z.array(z.number()),
  graphHit: z.boolean(),
  stepsJson: z.string(),
  updatedAt: z.string(),
  lastInitAt: z.string().nullable(),
  searchMode: z.string(),
  topK: z.number(),
  graphTopK: z.number(),
  graphThreshold: z.number(),
  graphRandomWalkSteps: z.number(),
  indexPaths: z.array(z.string()),
  workspaceFileCount: z.number(),
  memoryFileCount: z.number(),
  checkpointFileCount: z.number(),
  error: z.string().nullable(),
});

const longTermMemoryRecallHistorySchema = z.object({
  recentFingerprints: z.array(z.string()),
  updatedAt: z.string(),
});

export type CheckpointPackageManifest = z.infer<typeof packageManifestSchema>;
export type LongTermMemoryState = z.infer<typeof longTermMemoryStateSchema>;
export type LongTermMemoryRecallSnapshot = z.infer<typeof longTermMemoryRecallSnapshotSchema>;
export type LongTermMemoryRecallHistory = z.infer<typeof longTermMemoryRecallHistorySchema>;

function createEmptyLongTermMemoryState(): LongTermMemoryState {
  const now = new Date().toISOString();

  return {
    version: 1,
    packages: [],
    lastWrittenPackageId: null,
    lastWrittenAt: null,
    lastRunAt: null,
    lastRunError: null,
    lastRunErrorAt: null,
    updatedAt: now,
  };
}

export function createAgentLongTermMemoryStore(db: Database, input: {
  agentId: string;
}) {
  async function readState() {
    const row = await db.query.agentLongTermMemoryStates.findFirst({
      where: eq(agentLongTermMemoryStates.agentId, input.agentId),
    });
    const parsed = longTermMemoryStateSchema.safeParse(row?.state);

    if (parsed.success) {
      return parsed.data;
    }

    const state = createEmptyLongTermMemoryState();
    await writeState(state);
    return state;
  }

  async function writeState(state: LongTermMemoryState) {
    const nextState = {
      ...state,
      updatedAt: new Date().toISOString(),
    } satisfies LongTermMemoryState;
    const now = Date.now();
    const existing = await db.query.agentLongTermMemoryStates.findFirst({
      where: eq(agentLongTermMemoryStates.agentId, input.agentId),
    });

    await db
      .insert(agentLongTermMemoryStates)
      .values({
        agentId: input.agentId,
        state: nextState,
        recallIndexStamp: existing?.recallIndexStamp ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: agentLongTermMemoryStates.agentId,
        set: {
          state: nextState,
          updatedAt: now,
        },
      });

    return nextState;
  }

  async function readRecallIndexStamp() {
    const row = await db.query.agentLongTermMemoryStates.findFirst({
      columns: {
        recallIndexStamp: true,
      },
      where: eq(agentLongTermMemoryStates.agentId, input.agentId),
    });

    return row?.recallIndexStamp ?? null;
  }

  async function writeRecallIndexStamp(reason: string) {
    const now = Date.now();
    const existing = await db.query.agentLongTermMemoryStates.findFirst({
      where: eq(agentLongTermMemoryStates.agentId, input.agentId),
    });
    const state = longTermMemoryStateSchema.safeParse(existing?.state).success
      ? longTermMemoryStateSchema.parse(existing?.state)
      : createEmptyLongTermMemoryState();

    await db
      .insert(agentLongTermMemoryStates)
      .values({
        agentId: input.agentId,
        state,
        recallIndexStamp: JSON.stringify({
          updatedAt: new Date().toISOString(),
          reason,
        }),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: agentLongTermMemoryStates.agentId,
        set: {
          recallIndexStamp: JSON.stringify({
            updatedAt: new Date().toISOString(),
            reason,
          }),
          updatedAt: now,
        },
      });
  }

  async function readRecallState() {
    const row = await db.query.agentLongTermMemoryRecallStates.findFirst({
      where: eq(agentLongTermMemoryRecallStates.agentId, input.agentId),
    });
    const snapshot = longTermMemoryRecallSnapshotSchema.safeParse(row?.snapshot);
    const history = longTermMemoryRecallHistorySchema.safeParse(row?.history);

    return {
      threadId: row?.threadId ?? null,
      resourceId: row?.resourceId ?? null,
      snapshot: snapshot.success ? snapshot.data : null,
      history: history.success ? history.data : null,
    };
  }

  async function writeRecallState(inputState: {
    threadId: string | null;
    resourceId?: string;
    snapshot: LongTermMemoryRecallSnapshot;
    history?: LongTermMemoryRecallHistory;
  }) {
    const now = Date.now();
    const existing = await db.query.agentLongTermMemoryRecallStates.findFirst({
      where: eq(agentLongTermMemoryRecallStates.agentId, input.agentId),
    });

    await db
      .insert(agentLongTermMemoryRecallStates)
      .values({
        agentId: input.agentId,
        threadId: inputState.threadId,
        resourceId: inputState.resourceId ?? null,
        snapshot: inputState.snapshot,
        history: inputState.history ?? existing?.history ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: agentLongTermMemoryRecallStates.agentId,
        set: {
          threadId: inputState.threadId,
          resourceId: inputState.resourceId ?? null,
          snapshot: inputState.snapshot,
          history: inputState.history ?? existing?.history ?? null,
          updatedAt: now,
        },
      });
  }

  async function clearRecallState() {
    await db
      .delete(agentLongTermMemoryRecallStates)
      .where(eq(agentLongTermMemoryRecallStates.agentId, input.agentId));
  }

  return {
    readState,
    writeState,
    readRecallIndexStamp,
    writeRecallIndexStamp,
    readRecallState,
    writeRecallState,
    clearRecallState,
  };
}
