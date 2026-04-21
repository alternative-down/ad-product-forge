import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FilesystemWorldGateway } from '../examples/gateways/filesystem-world.js';

describe('filesystem world gateway', () => {
  it('persists events and commands on disk', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'agent-runtime-core-world-'));
    const world = new FilesystemWorldGateway({ basePath });

    await world.emitEvent({
      id: 'event-1',
      type: 'rumor',
      text: 'A caravan arrived.',
      actorId: 'npc-1',
      createdAt: new Date().toISOString(),
    });
    await world.applyCommand({
      type: 'move',
      actorId: 'npc-1',
      payload: {
        target: 'market',
      },
    });

    const reloadedWorld = new FilesystemWorldGateway({ basePath });
    const events = await reloadedWorld.readRecentEvents({ actorId: 'npc-1', limit: 5 });
    const commands = await reloadedWorld.readCommands();

    expect(events).toHaveLength(1);
    expect(commands).toHaveLength(1);
    expect(commands[0]?.type).toBe('move');
  });
});
