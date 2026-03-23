import { eq } from 'drizzle-orm';

import type { Database } from './index';
import { llmModelPrices } from './schema';

const MODEL_PRICES = [
  {
    modelKey: 'account-oauth/openai-codex/gpt-5.4',
    inputPerMillionUsd: 2.5,
    inputCachePerMillionUsd: 0.25,
    outputPerMillionUsd: 15,
  },
  {
    modelKey: 'account-oauth/openai-codex/gpt-5.4-nano',
    inputPerMillionUsd: 0.1,
    inputCachePerMillionUsd: 0.01,
    outputPerMillionUsd: 0.4,
  },
  {
    modelKey: 'account-oauth/openai-codex/gpt-5.4-mini',
    inputPerMillionUsd: 0.4,
    inputCachePerMillionUsd: 0.04,
    outputPerMillionUsd: 3.2,
  },
  {
    modelKey: 'account-oauth/openai-codex/gpt-5.3-codex',
    inputPerMillionUsd: 1.75,
    inputCachePerMillionUsd: 0.175,
    outputPerMillionUsd: 14,
  },
  {
    modelKey: 'account-oauth/claude-code/claude-opus-4-6',
    inputPerMillionUsd: 5,
    inputCachePerMillionUsd: 0.5,
    outputPerMillionUsd: 25,
  },
  {
    modelKey: 'account-oauth/claude-code/claude-sonnet-4-6',
    inputPerMillionUsd: 3,
    inputCachePerMillionUsd: 0.3,
    outputPerMillionUsd: 15,
  },
  {
    modelKey: 'account-oauth/claude-code/claude-haiku-4-5',
    inputPerMillionUsd: 1,
    inputCachePerMillionUsd: 0.1,
    outputPerMillionUsd: 5,
  },
  {
    modelKey: 'minimax-coding-plan/MiniMax-M2.5',
    inputPerMillionUsd: 0.3,
    inputCachePerMillionUsd: 0.06,
    outputPerMillionUsd: 1.2,
  },
] as const;

export async function seedModelPrices(db: Database) {
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
