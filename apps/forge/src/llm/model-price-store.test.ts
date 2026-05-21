import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('createLlmModelPriceStore', () => {
  // Mock DB interface
  function createMockDb(
    initialPrices?: Array<{
      modelKey: string;
      inputPerMillionUsd: number;
      inputCachePerMillionUsd: number;
      outputPerMillionUsd: number;
    }>,
  ) {
    const prices = new Map(
      (initialPrices ?? []).map((p) => [
        p.modelKey,
        { ...p, createdAt: Date.now(), updatedAt: Date.now() },
      ]),
    );

    return {
      query: {
        llmModelPrices: {
          findMany: vi.fn(async () =>
            [...prices.values()].sort((a, b) => a.modelKey.localeCompare(b.modelKey)),
          ),
          findFirst: vi.fn(
            async ({
              where,
            }: {
              where: (fields: {
                modelKey: { eq: (val: string) => { toSQL: () => string } };
              }) => unknown;
            }) => {
              const fn = where as (fields: {
                modelKey: { eq: (val: string) => unknown };
              }) => boolean;
              return [...prices.values()].find((p) => p.modelKey === 'matched');
            },
          ),
        },
      },
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve()),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => Promise.resolve()),
      })),
      prices,
    };
  }

  describe('listPrices', () => {
    it('returns all prices sorted by modelKey', async () => {
      const db = createMockDb([
        {
          modelKey: 'gpt-4',
          inputPerMillionUsd: 2,
          inputCachePerMillionUsd: 1,
          outputPerMillionUsd: 8,
        },
        {
          modelKey: 'claude-3',
          inputPerMillionUsd: 3,
          inputCachePerMillionUsd: 1.5,
          outputPerMillionUsd: 15,
        },
      ]);
      const { createLlmModelPriceStore } = await import('./model-price-store.js');
      const store = createLlmModelPriceStore(
        db as unknown as import('../database/index.js').Database,
      );
      const result = await store.listPrices();
      // @ts-ignore — drizzle callback parameter (noImplicitAny limitation)
      expect(result.map((p) => p.modelKey)).toEqual(['claude-3', 'gpt-4']);
    });

    it('returns empty array when no prices exist', async () => {
      const db = createMockDb();
      const { createLlmModelPriceStore } = await import('./model-price-store.js');
      const store = createLlmModelPriceStore(
        db as unknown as import('../database/index.js').Database,
      );
      const result = await store.listPrices();
      expect(result).toEqual([]);
    });
  });

  describe('upsertPrice', () => {
    it('creates a new price when modelKey does not exist', async () => {
      const db = createMockDb();
      const { createLlmModelPriceStore } = await import('./model-price-store.js');
      const store = createLlmModelPriceStore(
        db as unknown as import('../database/index.js').Database,
      );
      const result = await store.upsertPrice({
        modelKey: 'gpt-4',
        inputPerMillionUsd: 2,
        inputCachePerMillionUsd: 1,
        outputPerMillionUsd: 8,
      });
      expect(result.modelKey).toBe('gpt-4');
      expect(result.inputPerMillionUsd).toBe(2);
    });

    it('returns the correct shape on insert', async () => {
      const db = createMockDb();
      const { createLlmModelPriceStore } = await import('./model-price-store.js');
      const store = createLlmModelPriceStore(
        db as unknown as import('../database/index.js').Database,
      );
      const result = await store.upsertPrice({
        modelKey: 'new-model',
        inputPerMillionUsd: 5,
        inputCachePerMillionUsd: 2,
        outputPerMillionUsd: 20,
      });
      expect(result).toEqual({
        modelKey: 'new-model',
        inputPerMillionUsd: 5,
        inputCachePerMillionUsd: 2,
        outputPerMillionUsd: 20,
      });
    });
  });
});
