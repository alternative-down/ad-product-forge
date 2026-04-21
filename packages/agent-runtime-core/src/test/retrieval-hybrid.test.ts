import { describe, expect, it } from 'vitest';

import { InMemoryBm25Index } from '../integrations/retrieval/in-memory-bm25-index.js';
import { InMemoryHybridRetrievalEngine } from '../integrations/retrieval/in-memory-hybrid-retrieval.js';
import { InMemoryVectorIndex } from '../integrations/retrieval/in-memory-vector-index.js';

describe('InMemoryHybridRetrievalEngine', () => {
  it('combines keyword and vector retrieval', async () => {
    const keywordIndex = new InMemoryBm25Index();
    const vectorIndex = new InMemoryVectorIndex();

    await keywordIndex.index([
      { id: 'doc-1', text: 'blacksmith iron swords' },
      { id: 'doc-2', text: 'bakery pastries every morning' },
    ]);
    await vectorIndex.index([
      { id: 'doc-1', text: 'blacksmith iron swords', vector: [1, 0] },
      { id: 'doc-2', text: 'bakery pastries every morning', vector: [0, 1] },
    ]);

    const engine = new InMemoryHybridRetrievalEngine({
      keywordIndex,
      vectorIndex,
      async queryEmbedder(query) {
        if (query.includes('blacksmith')) {
          return [1, 0];
        }

        return [0, 1];
      },
    });

    const results = await engine.search('blacksmith iron', { topK: 2 });

    expect(results[0]?.id).toBe('doc-1');
  });
});
