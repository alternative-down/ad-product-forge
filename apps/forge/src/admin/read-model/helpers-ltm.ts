import type { Database } from '../../database/client';
import { createAgentLongTermMemoryStore, type LongTermMemoryState } from '../../agents/ltm/store';
import { forgeDebug } from '@forge-runtime/core';
import { serializeError } from '../../agents/agent-runner-error-formatting';

export type LongTermMemoryRecallSnapshot = Awaited<
  ReturnType<ReturnType<typeof createAgentLongTermMemoryStore>['readRecallState']>
>['snapshot'];

export async function readLongTermMemoryRecallSnapshot(
  db: Database,
  agentId: string,
): Promise<LongTermMemoryRecallSnapshot | null> {
  try {
    const state = await createAgentLongTermMemoryStore(db, {
      agentId,
    }).readRecallState();

    return state.snapshot;
  } catch (err) {
    forgeDebug({
      scope: 'helpers-ltm',
      level: 'error',
      message: '[helpers-ltm] readLongTermMemoryRecallSnapshot failed',
      context: { err: String(serializeError(err)) },
    });
    throw err;
  }
}

export async function readLongTermMemoryState(
  db: Database,
  agentId: string,
): Promise<LongTermMemoryState | null> {
  try {
    const state = await createAgentLongTermMemoryStore(db, {
      agentId,
    }).readState();

    return state;
  } catch (err) {
    forgeDebug({
      scope: 'helpers-ltm',
      level: 'error',
      message: '[helpers-ltm] readLongTermMemoryState failed',
      context: { err: String(serializeError(err)) },
    });
    throw err;
  }
}
