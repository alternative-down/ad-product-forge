import { errorMsg } from '../agents/error-formatting';

import type { Database } from '../database/client';
import { llmModelPrices } from '../database/schema';
import { forgeDebug } from '@forge-runtime/core';

export type LlmModelPriceStore = Awaited<ReturnType<typeof createLlmModelPriceStore>>;
export function createLlmModelPriceStore(db: Database) {
  async function listPrices() {
    try {
      return await db.query.llmModelPrices.findMany({
        orderBy: (fields, { asc }) => [asc(fields.modelKey)],
      });
    } catch (err) {
      forgeDebug({
        scope: 'llm',
        level: 'error',
        message: 'Failed to list LLM model prices',
        context: { error: errorMsg(err) },
      });
      throw err;
    }
  }

  async function upsertPrice(input: {
    modelKey: string;
    inputPerMillionUsd: number;
    inputCachePerMillionUsd?: number;
    outputPerMillionUsd: number;
  }) {
    const now = Date.now();
    try {
      await db
        .insert(llmModelPrices)
        .values({
          modelKey: input.modelKey,
          inputPerMillionUsd: input.inputPerMillionUsd,
          inputCachePerMillionUsd: input.inputCachePerMillionUsd ?? 0,
          outputPerMillionUsd: input.outputPerMillionUsd,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: llmModelPrices.modelKey,
          set: {
            inputPerMillionUsd: input.inputPerMillionUsd,
            inputCachePerMillionUsd: input.inputCachePerMillionUsd ?? 0,
            outputPerMillionUsd: input.outputPerMillionUsd,
            updatedAt: now,
          },
        });
    } catch (err) {
      forgeDebug({
        scope: 'llm',
        level: 'error',
        message: 'Failed to upsert LLM model price',
        context: { modelKey: input.modelKey, error: errorMsg(err) },
      });
      throw err;
    }

    return {
      modelKey: input.modelKey,
      inputPerMillionUsd: input.inputPerMillionUsd,
      inputCachePerMillionUsd: input.inputCachePerMillionUsd,
      outputPerMillionUsd: input.outputPerMillionUsd,
    };
  }

  return {
    listPrices,
    upsertPrice,
  };
}
