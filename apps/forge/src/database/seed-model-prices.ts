import { eq } from 'drizzle-orm';

import type { Database } from './index.js';
import { llmModelPrices } from './schema.js';

const MODEL_PRICES = [
  {
    modelKey: 'account-oauth/openai-codex/gpt-5.2-codex',
    inputPerMillionUsd: 1.5,
    inputCachePerMillionUsd: 0.375,
    outputPerMillionUsd: 6,
  },
  {
    modelKey: 'account-oauth/openai-codex/gpt-5.1-codex-max',
    inputPerMillionUsd: 1.25,
    inputCachePerMillionUsd: 0.125,
    outputPerMillionUsd: 10,
  },
  {
    modelKey: 'account-oauth/openai-codex/gpt-5.1-codex',
    inputPerMillionUsd: 1.25,
    inputCachePerMillionUsd: 0.125,
    outputPerMillionUsd: 10,
  },
  {
    modelKey: 'account-oauth/openai-codex/gpt-5.1-codex-mini',
    inputPerMillionUsd: 0.25,
    inputCachePerMillionUsd: 0.025,
    outputPerMillionUsd: 2,
  },
  {
    modelKey: 'account-oauth/openai-codex/gpt-5-codex',
    inputPerMillionUsd: 1.25,
    inputCachePerMillionUsd: 0.125,
    outputPerMillionUsd: 10,
  },
  {
    modelKey: 'account-oauth/claude-max/claude-opus-4-1',
    inputPerMillionUsd: 15,
    inputCachePerMillionUsd: 1.5,
    outputPerMillionUsd: 75,
  },
  {
    modelKey: 'account-oauth/claude-max/claude-opus-4-0',
    inputPerMillionUsd: 15,
    inputCachePerMillionUsd: 1.5,
    outputPerMillionUsd: 75,
  },
  {
    modelKey: 'account-oauth/claude-max/claude-sonnet-4-0',
    inputPerMillionUsd: 3,
    inputCachePerMillionUsd: 0.3,
    outputPerMillionUsd: 15,
  },
  {
    modelKey: 'account-oauth/claude-max/claude-3-7-sonnet-latest',
    inputPerMillionUsd: 3,
    inputCachePerMillionUsd: 0.3,
    outputPerMillionUsd: 15,
  },
  {
    modelKey: 'account-oauth/claude-max/claude-3-5-sonnet-latest',
    inputPerMillionUsd: 3,
    inputCachePerMillionUsd: 0.3,
    outputPerMillionUsd: 15,
  },
  {
    modelKey: 'account-oauth/claude-max/claude-3-5-haiku-latest',
    inputPerMillionUsd: 0.8,
    inputCachePerMillionUsd: 0.08,
    outputPerMillionUsd: 4,
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
