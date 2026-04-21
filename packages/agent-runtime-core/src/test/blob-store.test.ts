import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { InMemoryBlobStore } from '../integrations/assets/in-memory-blob-store.js';
import { FilesystemBlobStore } from '../integrations/persistence/filesystem-blob-store.js';

describe('blob stores', () => {
  it('stores and reads blobs in memory', async () => {
    const store = new InMemoryBlobStore();

    await store.write({
      id: 'audio-1',
      mimeType: 'audio/wav',
      bytes: new Uint8Array([1, 2, 3]),
      createdAt: '2026-04-19T13:00:00.000Z',
    });
    const blob = await store.read('audio-1');

    expect(blob?.mimeType).toBe('audio/wav');
    expect(blob?.bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('persists blobs on disk', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'agent-runtime-core-blobs-'));
    const store = new FilesystemBlobStore({ basePath });

    await store.write({
      id: 'image-1',
      mimeType: 'image/png',
      bytes: new Uint8Array([7, 8, 9]),
      createdAt: '2026-04-19T13:00:00.000Z',
    });
    const blob = await store.read('image-1');

    expect(blob?.mimeType).toBe('image/png');
    expect(blob?.bytes).toEqual(new Uint8Array([7, 8, 9]));
  });
});
