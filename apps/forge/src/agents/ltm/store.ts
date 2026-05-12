import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from '../../database/schema';
import {
  agentLongTermMemoryRecallStates,
  agentLongTermMemoryStates,
} from '../../database/schema';
import { forgeDebug } from '@forge-runtime/core';

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
  const now = Date.now();

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
    try {
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
    } catch (err) {
      forgeDebug({ scope: 'ltm', level: 'info', message: 'Failed to read LTM state', context: { agentId: input.agentId, error: err } });
      throw err;
    }
  }

  async function writeState(state: LongTermMemoryState) {
    const nextState = {
      ...state,
      updatedAt: Date.now(),
    } satisfies LongTermMemoryState;
    const now = Date.now();
    let existing: typeof agentLongTermMemoryStates.$inferSelect | null = null;

    try {
      existing = await db.query.agentLongTermMemoryStates.findFirst({
        where: eq(agentLongTermMemoryStates.agentId, input.agentId),
      });
    } catch (err) {
      forgeDebug({ scope: 'ltm', level: 'info', message: 'Failed to query LTM state for write', context: { agentId: input.agentId, error: err } });
      throw err;
    }

    try {
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
    } catch (err) {
      forgeDebug({ scope: 'ltm', level: 'info', message: 'Failed to write LTM state', context: { agentId: input.agentId, error: err } });
      throw err;
    }

    return nextState;
  }

  async function readRecallIndexStamp() {
    try {
      const row = await db.query.agentLongTermMemoryStates.findFirst({
        columns: {
          recallIndexStamp: true,
        },
        where: eq(agentLongTermMemoryStates.agentId, input.agentId),
      });

      return row?.recallIndexStamp ?? null;
    } catch (err) {
      forgeDebug({ scope: 'ltm', level: 'info', message: 'Failed to read recall index stamp', context: { agentId: input.agentId, error: err } });
      throw err;
    }
  }

  async function writeRecallIndexStamp(reason: string) {
    const now = Date.now();
    let existing: typeof agentLongTermMemoryStates.$inferSelect | null = null;
    let state: LongTermMemoryState;

    try {
      existing = await db.query.agentLongTermMemoryStates.findFirst({
        where: eq(agentLongTermMemoryStates.agentId, input.agentId),
      });
      state = longTermMemoryStateSchema.safeParse(existing?.state).success
        ? longTermMemoryStateSchema.parse(existing?.state)
        : createEmptyLongTermMemoryState();
    } catch (err) {
      forgeDebug({ scope: 'ltm', level: 'info', message: 'Failed to query LTM state for recall index write', context: { agentId: input.agentId, error: err } });
      throw err;
    }

    try {
      await db
        .insert(agentLongTermMemoryStates)
        .values({
          agentId: input.agentId,
          state,
          recallIndexStamp: JSON.stringify({
            updatedAt: now,
            reason,
          }),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: agentLongTermMemoryStates.agentId,
          set: {
            recallIndexStamp: JSON.stringify({
              updatedAt: now,
              reason,
            }),
            updatedAt: now,
          },
        });
    } catch (err) {
      forgeDebug({ scope: 'ltm', level: 'info', message: 'Failed to write recall index stamp', context: { agentId: input.agentId, reason, error: err } });
      throw err;
    }
  }

  async function readRecallState() {
    try {
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
    } catch (err) {
      forgeDebug({ scope: 'ltm', level: 'info', message: 'Failed to read recall state', context: { agentId: input.agentId, error: err } });
      throw err;
    }
  }

  async function writeRecallState(inputState: {
    threadId: string | null;
    resourceId?: string;
    snapshot: LongTermMemoryRecallSnapshot;
    history?: LongTermMemoryRecallHistory;
  }) {
    const now = Date.now();
    let existing: typeof agentLongTermMemoryRecallStates.$inferSelect | null = null;

    try {
      existing = await db.query.agentLongTermMemoryRecallStates.findFirst({
        where: eq(agentLongTermMemoryRecallStates.agentId, input.agentId),
      });
    } catch (err) {
      forgeDebug({ scope: 'ltm', level: 'info', message: 'Failed to query LTM recall state for write', context: { agentId: input.agentId, error: err } });
      throw err;
    }

    try {
      await db
        .insert(agentLongTermMemoryRecallStates)
        .values({
          agentId: input.agentId,
          threadId: inputState.threadId ?? existing?.threadId ?? null,
          resourceId: inputState.resourceId ?? existing?.resourceId ?? null,
          snapshot: inputState.snapshot,
          history: inputState.history,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: agentLongTermMemoryRecallStates.agentId,
          set: {
            threadId: inputState.threadId ?? existing?.threadId ?? null,
            resourceId: inputState.resourceId ?? existing?.resourceId ?? null,
            snapshot: inputState.snapshot,
            history: inputState.history,
            updatedAt: now,
          },
        });
    } catch (err) {
      forgeDebug({ scope: 'ltm', level: 'info', message: 'Failed to write LTM recall state', context: { agentId: input.agentId, error: err } });
      throw err;
    }
  }

  return {
    readState,
    writeState,
    readRecallIndexStamp,
    writeRecallIndexStamp,
    readRecallState,
    writeRecallState,
  };
}