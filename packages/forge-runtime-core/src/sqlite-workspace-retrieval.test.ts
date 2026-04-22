import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { FilesystemDocumentSource } from 'agent-runtime-core/integrations';

import { SqliteWorkspaceRetrieval } from './sqlite-workspace-retrieval.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })),
  );
});

describe('SqliteWorkspaceRetrieval', () => {
  it('persists embeddings in sqlite and updates only changed documents on refresh', async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), 'forge-sqlite-retrieval-'));
    temporaryDirectories.push(rootPath);
    const docsPath = path.join(rootPath, 'docs');
    const databasePath = path.join(rootPath, 'retrieval.db');

    await mkdir(docsPath, { recursive: true });
    await writeFile(path.join(docsPath, 'alpha.md'), 'alpha planning notes');
    await writeFile(path.join(docsPath, 'beta.md'), 'beta roadmap details');

    const retrieval = new SqliteWorkspaceRetrieval({
      databasePath,
      source: new FilesystemDocumentSource({
        roots: [docsPath],
      }),
      embedder: createTestEmbedder(),
    });

    await retrieval.refresh();

    const firstSearch = await retrieval.search('alpha', {
      topK: 2,
      mode: 'vector',
    });

    expect(firstSearch[0]?.id).toContain('alpha.md');

    retrieval.dispose();

    const reopened = new SqliteWorkspaceRetrieval({
      databasePath,
      source: new FilesystemDocumentSource({
        roots: [docsPath],
      }),
      embedder: createTestEmbedder(),
    });

    const persistedSearch = await reopened.search('beta', {
      topK: 2,
      mode: 'hybrid',
    });

    expect(persistedSearch[0]?.id).toContain('beta.md');

    await unlink(path.join(docsPath, 'beta.md'));
    await writeFile(path.join(docsPath, 'alpha.md'), 'gamma architecture notes');
    await writeFile(path.join(docsPath, 'delta.md'), 'delta launch checklist');

    await reopened.refresh();

    const afterRefresh = await reopened.search('gamma', {
      topK: 3,
      mode: 'hybrid',
    });
    const ids = afterRefresh.map((result) => path.basename(result.id));
    const stats = await reopened.getStats();
    const databaseBytes = (await readFile(databasePath)).byteLength;

    expect(ids).toContain('alpha.md');
    expect(ids).not.toContain('beta.md');
    expect(stats.activeIndexStats?.count).toBe(2);
    expect(databaseBytes).toBeGreaterThan(0);
  });

  it('builds graph edges in sqlite and returns graph context from persisted documents', async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), 'forge-sqlite-graph-'));
    temporaryDirectories.push(rootPath);
    const docsPath = path.join(rootPath, 'docs');
    const databasePath = path.join(rootPath, 'retrieval.db');

    await mkdir(path.join(docsPath, 'memory'), { recursive: true });
    await writeFile(path.join(docsPath, 'memory', 'alpha.md'), 'alpha system design and API contracts');
    await writeFile(path.join(docsPath, 'memory', 'beta.md'), 'beta implementation notes and API dependencies');
    await writeFile(path.join(docsPath, 'memory', 'gamma.md'), 'gamma release checklist and launch tasks');

    const retrieval = new SqliteWorkspaceRetrieval({
      databasePath,
      source: new FilesystemDocumentSource({
        roots: [docsPath],
      }),
      embedder: createTestEmbedder(),
    });

    await retrieval.refresh();

    const result = await retrieval.searchGraph({
      query: 'alpha api design',
      topK: 2,
      threshold: 0.2,
      randomWalkSteps: 20,
      includeSources: true,
    });

    expect(result.hit).toBe(true);
    expect(result.context).toContain('alpha.md');
    expect(result.context).toContain('beta.md');
    expect(result.sourcesCount).toBeGreaterThan(0);
    expect(result.sourcesJson).toContain('alpha.md');
  });
});

function createTestEmbedder() {
  return {
    async embed(input: { texts: string[] }) {
      const vectors = input.texts.map(embedText);

      return {
        vectors,
        dimensions: vectors[0]?.length ?? 0,
      };
    },
  };
}

function embedText(text: string) {
  const normalized = text.toLowerCase();

  if (normalized.includes('alpha')) {
    return [1, 0, 0];
  }

  if (normalized.includes('beta')) {
    return [0.92, 0.08, 0];
  }

  if (normalized.includes('gamma')) {
    return [0, 1, 0];
  }

  if (normalized.includes('delta')) {
    return [0, 0.95, 0.05];
  }

  return [0, 0, 1];
}
