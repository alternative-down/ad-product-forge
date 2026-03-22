import { eq } from 'drizzle-orm';

import type { Database } from '../database/index';
import { llmModelPrices } from '../database/schema';

export function createLlmModelPriceStore(db: Database) {
  async function listPrices() {
    return db.query.llmModelPrices.findMany({
      orderBy: (fields, { asc }) => [asc(fields.modelKey)],
    });
  }

  async function upsertPrice(input: {
    modelKey: string;
    inputPerMillionUsd: number;
    inputCachePerMillionUsd: number;
    outputPerMillionUsd: number;
  }) {
    const now = Date.now();
    const existing = await db.query.llmModelPrices.findFirst({
      where: eq(llmModelPrices.modelKey, input.modelKey),
    });

    if (existing) {
      await db
        .update(llmModelPrices)
        .set({
          inputPerMillionUsd: input.inputPerMillionUsd,
          inputCachePerMillionUsd: input.inputCachePerMillionUsd,
          outputPerMillionUsd: input.outputPerMillionUsd,
          updatedAt: now,
        })
        .where(eq(llmModelPrices.modelKey, input.modelKey));
    } else {
      await db.insert(llmModelPrices).values({
        modelKey: input.modelKey,
        inputPerMillionUsd: input.inputPerMillionUsd,
        inputCachePerMillionUsd: input.inputCachePerMillionUsd,
        outputPerMillionUsd: input.outputPerMillionUsd,
        createdAt: now,
        updatedAt: now,
      });
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
