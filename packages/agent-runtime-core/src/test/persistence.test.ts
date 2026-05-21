import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { FilesystemContextNoteStore } from '../integrations/persistence/filesystem-context-note-store.js';
import { FilesystemLongTermMemoryStore } from '../integrations/persistence/filesystem-long-term-memory.js';
import { FilesystemRuntimeJournal } from '../integrations/persistence/filesystem-runtime-journal.js';

const createdPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdPaths
      .splice(0, createdPaths.length)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('filesystem persistence', () => {
  it('persists runtime journal snapshots on disk', async () => {
    const basePath = await createTempPath();
    const journal = new FilesystemRuntimeJournal({ basePath });

    await journal.appendInput('runtime-1', {
      id: 'input-1',
      type: 'event',
      payload: { text: 'hello' },
      receivedAt: '2026-01-01T00:00:00.000Z',
    });
    await journal.appendStep('runtime-1', {
      id: 'step-1',
      stepNumber: 1,
      inputs: [],
      context: [],
      modelResponse: {
        segments: [{ kind: 'message', text: 'ok' }],
        actionRequests: [],
        continuation: 'stop',
      },
      modelUsage: null,
      modelMetadata: null,
      actionResults: [],
      continuation: 'stop',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:01.000Z',
    });

    const snapshot = await journal.readSnapshot('runtime-1');

    expect(snapshot.inputs).toHaveLength(1);
    expect(snapshot.steps).toHaveLength(1);
  });

  it('persists context notes on disk', async () => {
    const basePath = await createTempPath();
    const store = new FilesystemContextNoteStore({ basePath });

    await store.set('runtime-1', {
      id: 'note-1',
      title: 'Focus',
      text: 'Keep the forge open until sunset.',
    });
    const notes = await store.list('runtime-1');

    expect(notes).toHaveLength(1);
    expect(notes[0]?.title).toBe('Focus');
  });

  it('persists long-term memory documents on disk', async () => {
    const basePath = await createTempPath();
    const store = new FilesystemLongTermMemoryStore({ basePath });

    await store.write({
      id: 'doc-1',
      text: 'The blacksmith prefers short, direct negotiations.',
      metadata: { category: 'preference' },
    });
    const documents = await store.list();

    expect(documents).toHaveLength(1);
    expect(documents[0]?.metadata?.category).toBe('preference');
  });
});

async function createTempPath() {
  const path = await mkdtemp(join(tmpdir(), 'agent-runtime-core-'));
  createdPaths.push(path);
  return path;
}
