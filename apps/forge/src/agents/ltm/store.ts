import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from '../../database/client';
import { agentLongTermMemoryRecallStates, agentLongTermMemoryStates } from '../../database/schema';
import { withDbErrorLogging } from '../../database/error-logging';

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

export const longTermMemoryStateSchema = z.object({
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

export function createEmptyLongTermMemoryState(): LongTermMemoryState {
  const now = Date.now();

  return {
    version: 1,
    packages: [],
    lastWrittenPackageId: null,
    lastWrittenAt: null,
    lastRunAt: null,
    lastRunError: null,
    lastRunErrorAt: null,
    updatedAt: String(now),
  };
}

export function createAgentLongTermMemoryStore(
  db: Database,
  input: {
    agentId: string;
  },
) {
  async function readState() {
    return await withDbErrorLogging({
      scope: 'ltm',
      op: 'readState',
      verb: 'read',
      context: { agentId: input.agentId },
      fn: async () => {
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
      },
    });
  }

  async function writeState(state: LongTermMemoryState) {
    const now = Date.now();
    const nextState = {
      ...state,
      updatedAt: String(now),
    } satisfies LongTermMemoryState;

    const existing = await withDbErrorLogging({
      scope: 'ltm',
      op: 'writeState.query',
      verb: 'read',
      context: { agentId: input.agentId },
      fn: async () => {
        const row = await db.query.agentLongTermMemoryStates.findFirst({
          where: eq(agentLongTermMemoryStates.agentId, input.agentId),
        });
        return row ?? null;
      },
    });

    await withDbErrorLogging({
      scope: 'ltm',
      op: 'writeState',
      verb: 'write',
      context: { agentId: input.agentId },
      fn: async () => {
        await db
          .insert(agentLongTermMemoryStates)
          .values({
            agentId: input.agentId,
            state: JSON.stringify(nextState),
            recallIndexStamp: existing?.recallIndexStamp ?? null,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: agentLongTermMemoryStates.agentId,
            set: {
              state: JSON.stringify(nextState),
              updatedAt: now,
            },
          });
      },
    });

    return nextState;
  }

  async function readRecallIndexStamp() {
    return await withDbErrorLogging({
      scope: 'ltm',
      op: 'readRecallIndexStamp',
      verb: 'read',
      context: { agentId: input.agentId },
      fn: async () => {
        const row = await db.query.agentLongTermMemoryStates.findFirst({
          columns: {
            recallIndexStamp: true,
          },
          where: eq(agentLongTermMemoryStates.agentId, input.agentId),
        });

        return row?.recallIndexStamp ?? null;
      },
    });
  }

  async function writeRecallIndexStamp(reason: string) {
    const now = Date.now();

    const { existing, state } = await withDbErrorLogging({
      scope: 'ltm',
      op: 'writeRecallIndexStamp.query',
      verb: 'read',
      context: { agentId: input.agentId, reason },
      fn: async () => {
        const existingRow = await db.query.agentLongTermMemoryStates.findFirst({
          where: eq(agentLongTermMemoryStates.agentId, input.agentId),
        }) ?? null;
        const parsedState = longTermMemoryStateSchema.safeParse(existingRow?.state).success
          ? longTermMemoryStateSchema.parse(existingRow?.state)
          : createEmptyLongTermMemoryState();
        return { existing: existingRow, state: parsedState };
      },
    });

    await withDbErrorLogging({
      scope: 'ltm',
      op: 'writeRecallIndexStamp',
      verb: 'write',
      context: { agentId: input.agentId, reason },
      fn: async () => {
        await db
          .insert(agentLongTermMemoryStates)
          .values({
            agentId: input.agentId,
            state: JSON.stringify(state),
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
      },
    });
  }

  async function readRecallState() {
    return await withDbErrorLogging({
      scope: 'ltm',
      op: 'readRecallState',
      verb: 'read',
      context: { agentId: input.agentId },
      fn: async () => {
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
      },
    });
  }

  async function writeRecallState(inputState: {
    threadId: string | null;
    resourceId?: string;
    snapshot: LongTermMemoryRecallSnapshot;
    history?: LongTermMemoryRecallHistory;
  }) {
    const now = Date.now();

    const existing = await withDbErrorLogging({
      scope: 'ltm',
      op: 'writeRecallState.query',
      verb: 'read',
      context: { agentId: input.agentId },
      fn: async () => {
        const row = await db.query.agentLongTermMemoryRecallStates.findFirst({
          where: eq(agentLongTermMemoryRecallStates.agentId, input.agentId),
        });
        return row ?? null;
      },
    });

    await withDbErrorLogging({
      scope: 'ltm',
      op: 'writeRecallState',
      verb: 'write',
      context: { agentId: input.agentId },
      fn: async () => {
        await db
          .insert(agentLongTermMemoryRecallStates)
          .values({
            agentId: input.agentId,
            threadId: inputState.threadId ?? existing?.threadId ?? null,
            resourceId: inputState.resourceId ?? existing?.resourceId ?? null,
            snapshot: JSON.stringify(inputState.snapshot),
            history: JSON.stringify(inputState.history),
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: agentLongTermMemoryRecallStates.agentId,
            set: {
              threadId: inputState.threadId ?? existing?.threadId ?? null,
              resourceId: inputState.resourceId ?? existing?.resourceId ?? null,
              snapshot: JSON.stringify(inputState.snapshot),
              history: JSON.stringify(inputState.history),
              updatedAt: now,
            },
          });
      },
    });
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

// Extended interface including checkpointSummary (needed by computeCheckpointTimestamp in agent-ltm-checkpoint-io-helpers)
export interface CheckpointedOmCheckpointPackageInput {
  threadId: string;
  toGeneration: number;
  fromGeneration: number | null;
  reflections: Array<{ content: string; generatedAt?: number; createdAt?: number }>;
  observations: Array<{ content: string; generatedAt?: number; createdAt?: number }>;
  checkpointSummary: { text: string; updatedAt: number };
}

export interface CheckpointedOmPackageEntry {
  packageId: string;
  checkpointGeneration: number;
  fromGeneration: number | null;
  toGeneration: number;
  createdAt: string;
  checkpointSummaryUpdatedAt: string;
  reflectionCount: number;
  observationCount: number;
}
