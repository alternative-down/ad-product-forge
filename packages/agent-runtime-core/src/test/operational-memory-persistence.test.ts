import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FilesystemOperationalMemory } from '../integrations/memory/filesystem-operational-memory.js';

describe('filesystem operational memory', () => {
  it('persists raw entries and observations on disk', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'agent-runtime-core-om-'));
    const memory = new FilesystemOperationalMemory({
      basePath,
      recentReserveUnits: 3,
      observer: {
        async observe(request) {
          return {
            text: request.entries.map((entry) => entry.text).join('\n'),
          };
        },
      },
    });

    await memory.append({
      id: 'input-1',
      source: 'input',
      text: 'first input',
      createdAt: new Date().toISOString(),
      units: 2,
    });
    await memory.append({
      id: 'input-2',
      source: 'input',
      text: 'second input',
      createdAt: new Date().toISOString(),
      units: 2,
    });
    await memory.consolidate();

    const reloadedMemory = new FilesystemOperationalMemory({
      basePath,
      recentReserveUnits: 3,
      observer: {
        async observe() {
          return { text: 'unused' };
        },
      },
    });
    const snapshot = await reloadedMemory.getSnapshot();

    expect(snapshot.observations).toHaveLength(1);
    expect(snapshot.recentRaw).toHaveLength(1);
  });
});
