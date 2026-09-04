import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from '../../database/client';
import { agentLongTermMemoryRecallStates } from '../../database/schema';
import { withDbErrorLogging } from '../../database/error-logging';

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

export type LongTermMemoryRecallSnapshot = z.infer<typeof longTermMemoryRecallSnapshotSchema>;
export type LongTermMemoryRecallHistory = z.infer<typeof longTermMemoryRecallHistorySchema>;

export function createAgentLongTermMemoryStore(
  db: Database,
  input: {
    agentId: string;
  },
) {
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
    readRecallState,
    writeRecallState,
  };
}
