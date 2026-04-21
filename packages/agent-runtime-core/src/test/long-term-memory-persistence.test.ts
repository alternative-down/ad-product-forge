import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FilesystemLongTermMemory } from '../integrations/memory/filesystem-long-term-memory.js';

describe('filesystem long-term memory', () => {
  const embedder = {
    async embed(input: { texts: string[] }) {
      return {
        vectors: input.texts.map((text) => [text.includes('forge') ? 1 : 0, text.length]),
        dimensions: 2,
      };
    },
  };

  it('persists documents and recalls them later', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'agent-runtime-core-ltm-'));
    const memory = new FilesystemLongTermMemory({
      basePath,
      embedder,
    });

    await memory.write({
      id: 'doc-1',
      text: 'Forge runtime notes about agent memory and retrieval.',
    });

    const results = await memory.recall({
      query: 'forge memory',
      topK: 3,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('doc-1');
  });

  it('removes documents and rebuilds recall indexes', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'agent-runtime-core-ltm-'));
    const memory = new FilesystemLongTermMemory({
      basePath,
      embedder,
    });

    await memory.write({
      id: 'doc-1',
      text: 'Forge runtime notes about agent memory and retrieval.',
    });
    await memory.remove('doc-1');

    const results = await memory.recall({
      query: 'forge memory',
      topK: 3,
    });

    expect(results).toEqual([]);
  });
});
