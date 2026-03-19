import type { ObservationDebugEvent } from '@mastra/memory/processors';
import type { LibSQLStore } from '@mastra/libsql';
import { createObservationalMemory } from '@mastra-engine/core';

import type { Database } from '../database/index.js';
import { createAgentContractStore } from './agent-contract-store.js';

export function createTrackedObservationalMemory(config: {
  db: Database;
  agentId: string;
  modelKey: string;
  storage: LibSQLStore;
}) {
  const store = createAgentContractStore(config.db);

  return createObservationalMemory({
    storage: config.storage,
    model: config.modelKey,
    onDebugEvent(event) {
      void recordObservationUsage(store, config.agentId, config.modelKey, event);
    },
  });
}

async function recordObservationUsage(
  store: ReturnType<typeof createAgentContractStore>,
  agentId: string,
  modelKey: string,
  event: ObservationDebugEvent,
) {
  if (event.type !== 'observation_complete' && event.type !== 'reflection_complete') {
    return;
  }

  const inputTokens = event.usage?.inputTokens ?? 0;
  const outputTokens = event.usage?.outputTokens ?? 0;

  if (inputTokens <= 0 && outputTokens <= 0) {
    return;
  }

  try {
    const contract = await store.getRunnableContract(agentId);

    if (!contract) {
      return;
    }

    const modelPrice = await store.getModelPrice(modelKey);
    let costUsd = 0;

    if (modelPrice) {
      costUsd =
        (inputTokens / 1_000_000) * modelPrice.inputPerMillionUsd +
        (outputTokens / 1_000_000) * modelPrice.outputPerMillionUsd;
    }

    await store.recordAgentStep({
      agentId,
      contractId: contract.id,
      modelKey,
      kind: 'om',
      inputTokens,
      cachedInputTokens: 0,
      outputTokens,
      costUsd,
    });
  } catch (error) {
    console.error(`[TrackedObservationalMemory] Failed to record OM usage for ${agentId}:`, error);
  }
}
