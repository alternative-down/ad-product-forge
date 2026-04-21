import { describe, expect, it } from 'vitest';

import { InMemoryBm25Index } from '../integrations/retrieval/in-memory-bm25-index.js';

describe('InMemoryBm25Index', () => {
  it('returns the most relevant document first', async () => {
    const index = new InMemoryBm25Index();

    await index.index([
      {
        id: 'doc-1',
        text: 'Blacksmith prices iron swords and shields.',
      },
      {
        id: 'doc-2',
        text: 'Bakery bread and pastries are sold every morning.',
      },
      {
        id: 'doc-3',
        text: 'Blacksmith iron supplier offers iron bulk discounts for blacksmith orders.',
      },
    ]);

    const results = await index.search('blacksmith iron', { topK: 2 });

    expect(results).toHaveLength(2);
    expect(results[0]?.id).toBe('doc-3');
    expect(results[1]?.id).toBe('doc-1');
  });
});
