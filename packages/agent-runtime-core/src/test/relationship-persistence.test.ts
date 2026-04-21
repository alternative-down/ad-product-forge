import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FilesystemRelationshipStore } from '../examples/persistence/filesystem-relationship-store.js';

describe('filesystem relationship store', () => {
  it('persists and reads relationship records', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'agent-runtime-core-relationships-'));
    const store = new FilesystemRelationshipStore({ basePath });

    await store.upsert({
      sourceId: 'npc-1',
      targetId: 'npc-2',
      kind: 'trust',
      value: 0.9,
      summary: 'Reliable trade partner',
      updatedAt: '2026-04-19T10:00:00.000Z',
    });
    await store.upsert({
      sourceId: 'npc-2',
      targetId: 'npc-1',
      kind: 'fear',
      value: 0.2,
      summary: 'Keeps distance after a dispute',
      updatedAt: '2026-04-19T10:01:00.000Z',
    });

    const between = await store.readBetween({
      sourceId: 'npc-1',
      targetId: 'npc-2',
    });
    const forActor = await store.readForActor('npc-1');

    expect(between).toHaveLength(1);
    expect(between[0]?.kind).toBe('trust');
    expect(forActor).toHaveLength(2);
  });
});
