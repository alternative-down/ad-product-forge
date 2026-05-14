import { eq } from 'drizzle-orm';


import type {Database} from '../database/schema';
import { llmModelPrices } from '../database/schema';
import { forgeDebug } from '@forge-runtime/core';

export function createLlmModelPriceStore(db: Database) {
  async function listPrices() {
    return await db.query.llmModelPrices.findMany({
      orderBy: (fields, { asc }) => [asc(fields.modelKey)],
    });
    } catch (err) {
    forgeDebug({ scope: 'llm', level: 'info', message: 'Failed to list LLM model prices', context: { error: err instanceof Error ? err.message : String(err) } });
    throw err;
      } else {
        await db.insert(llmModelPrices).values({
          modelKey: input.modelKey,
          inputPerMillionUsd: input.inputPerMillionUsd,
          inputCachePerMillionUsd: input.inputCachePerMillionUsd,
          outputPerMillionUsd: input.outputPerMillionUsd,
          createdAt: now,
          updatedAt: now,
        });
      } catch (err) {
        forgeDebug({ scope: 'llm', level: 'info', message: 'Failed to insert LLM model price', context: { modelKey: input.modelKey, error: err } });
        throw err;

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