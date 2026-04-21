import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { FilesystemDocumentSource } from '../integrations/retrieval/filesystem-document-source.js';
import { InMemoryBm25Index } from '../integrations/retrieval/in-memory-bm25-index.js';
import { InMemoryVectorIndex } from '../integrations/retrieval/in-memory-vector-index.js';
import { RefreshableRetrievalWorkspace } from '../integrations/retrieval/refreshable-retrieval-workspace.js';

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((tempPath) => {
    return rm(tempPath, { recursive: true, force: true });
  }));
});

describe('RefreshableRetrievalWorkspace', () => {
  it('loads files from the filesystem and serves search results', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-runtime-core-retrieval-'));

    tempPaths.push(tempDir);

    await writeFile(path.join(tempDir, 'alpha.md'), 'alpha project architecture');
    await writeFile(path.join(tempDir, 'beta.md'), 'beta product roadmap');

    const workspace = new RefreshableRetrievalWorkspace({
      source: new FilesystemDocumentSource({
        roots: [tempDir],
        includeExtensions: ['.md'],
      }),
      keywordIndex: new InMemoryBm25Index(),
      vectorIndex: new InMemoryVectorIndex(),
      embedder: {
        async embed(request) {
          return {
            dimensions: 2,
            vectors: request.texts.map((text) => {
              return text.includes('alpha') ? [1, 0] : [0, 1];
            }),
          };
        },
      },
    });

    await workspace.refresh();

    expect(workspace.listDocuments()).toHaveLength(2);
    const results = await workspace.search('alpha', { topK: 1 });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toContain('alpha.md');
  });
});
