import { eq } from 'drizzle-orm';

import type { Database } from './index.js';
import { llmModelPrices } from './schema.js';

const MODEL_PRICES = [
  {
    modelKey: 'account-oauth/claude-max/claude-opus-4-1',
    inputPerMillionUsd: 15,
    inputCachePerMillionUsd: 1.5,
    outputPerMillionUsd: 75,
  },
] as const;

export async function syncModelPrices(db: Database) {
  const now = Date.now();

  for (const modelPrice of MODEL_PRICES) {
    const existingModelPrice = await db.query.llmModelPrices.findFirst({
      where: eq(llmModelPrices.modelKey, modelPrice.modelKey),
    });

    if (existingModelPrice) {
      await db
        .update(llmModelPrices)
        .set({
          inputPerMillionUsd: modelPrice.inputPerMillionUsd,
          inputCachePerMillionUsd: modelPrice.inputCachePerMillionUsd,
          outputPerMillionUsd: modelPrice.outputPerMillionUsd,
          updatedAt: now,
        })
        .where(eq(llmModelPrices.modelKey, modelPrice.modelKey));

      continue;
    }

    await db.insert(llmModelPrices).values({
      modelKey: modelPrice.modelKey,
      inputPerMillionUsd: modelPrice.inputPerMillionUsd,
      inputCachePerMillionUsd: modelPrice.inputCachePerMillionUsd,
      outputPerMillionUsd: modelPrice.outputPerMillionUsd,
      createdAt: now,
      updatedAt: now,
    });
  }
}
