import { describe, expect, it } from 'vitest';

import {
  RefreshableLongTermMemoryRecall,
  SourceBackedLongTermMemory,
} from '../integrations/memory/refreshable-long-term-memory.js';

describe('RefreshableLongTermMemoryRecall', () => {
  it('refreshes only when marked dirty', async () => {
    let refreshCount = 0;

    const recall = new RefreshableLongTermMemoryRecall({
      workspace: {
        async refresh() {
          refreshCount += 1;
        },
        async search(query: string) {
          return [
            {
              id: 'doc-1',
              text: query,
              score: 0.8,
            },
          ];
        },
      },
    });

    await recall.recall({ query: 'alpha', topK: 1 });
    await recall.recall({ query: 'alpha', topK: 1 });
    recall.markDirty('write:doc-1');
    await recall.recall({ query: 'alpha', topK: 1 });

    expect(refreshCount).toBe(2);
    expect(recall.getRefreshSnapshot().dirty).toBe(false);
  });
});

describe('SourceBackedLongTermMemory', () => {
  it('marks recall dirty on writes and removals', async () => {
    const documents = new Map<string, { id: string; text: string }>();
    let refreshCount = 0;
    const memory = new SourceBackedLongTermMemory({
      store: {
        async write(document) {
          documents.set(document.id, document);
        },
        async remove(documentId) {
          documents.delete(documentId);
        },
        async list() {
          return Array.from(documents.values());
        },
      },
      recall: new RefreshableLongTermMemoryRecall({
        workspace: {
          async refresh() {
            refreshCount += 1;
          },
          async search() {
            return Array.from(documents.values()).map((document) => ({
              id: document.id,
              text: document.text,
              score: 1,
            }));
          },
        },
      }),
    });

    await memory.write({
      id: 'doc-1',
      text: 'Forge runtime memory',
    });
    await memory.recall({
      query: 'forge',
      topK: 5,
    });
    await memory.remove('doc-1');
    await memory.recall({
      query: 'forge',
      topK: 5,
    });

    expect(refreshCount).toBe(2);
    expect(await memory.list()).toEqual([]);
  });
});
