import type { Database } from '../database/client';
import { withDbErrorLogging } from '../database/error-logging';
import { llmModelPrices } from '../database/schema';

export type LlmModelPriceStore = Awaited<ReturnType<typeof createLlmModelPriceStore>>;
export function createLlmModelPriceStore(db: Database) {
  async function listPrices() {
    return await withDbErrorLogging({
      scope: 'llm',
      op: 'listPrices',
      verb: 'read',
      context: {},
      mode: 'return-empty-array',
      fn: async () => {
        const rows = await db.query.llmModelPrices.findMany({
          orderBy: (fields, { asc }) => [asc(fields.modelKey)],
        });
        return rows;
      },
    });
  }

  async function upsertPrice(input: {
    modelKey: string;
    inputPerMillionUsd: number;
    inputCachePerMillionUsd?: number;
    outputPerMillionUsd: number;
  }) {
    const now = Date.now();
    return await withDbErrorLogging({
      scope: 'llm',
      op: 'upsertPrice',
      verb: 'write',
      context: { modelKey: input.modelKey },
      fn: async () => {
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

        // Return value reflects STORED values, not input (#6047 fix).
        // inputCachePerMillionUsd defaults to 0 in DB; surface that to caller.
        return {
          modelKey: input.modelKey,
          inputPerMillionUsd: input.inputPerMillionUsd,
          inputCachePerMillionUsd: input.inputCachePerMillionUsd ?? 0,
          outputPerMillionUsd: input.outputPerMillionUsd,
        };
      },
    });
  }

  return {
    listPrices,
    upsertPrice,
  };
}
