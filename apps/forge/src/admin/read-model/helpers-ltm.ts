import type { Database } from '../../database/index';
import {
  createAgentLongTermMemoryStore,
  type LongTermMemoryState,
} from '../../agents/agent-long-term-memory-store';

export type LongTermMemoryRecallSnapshot = Awaited<
  ReturnType<ReturnType<typeof createAgentLongTermMemoryStore>['readRecallState']>
>['snapshot'];

export async function readLongTermMemoryRecallSnapshot(
  db: Database,
  agentId: string,
) {
  const state = await createAgentLongTermMemoryStore(db, {
    agentId,
  }).readRecallState();

  return state.snapshot;
}

export async function readLongTermMemoryState(
  db: Database,
  agentId: string,
): Promise<LongTermMemoryState> {
  const state = await createAgentLongTermMemoryStore(db, {
    agentId,
  }).readState();

  return state satisfies LongTermMemoryState;
}
