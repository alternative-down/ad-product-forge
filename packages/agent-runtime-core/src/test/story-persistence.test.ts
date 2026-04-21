import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FilesystemStoryEventStore } from '../examples/persistence/filesystem-story-event-store.js';

describe('filesystem story event store', () => {
  it('persists and reads story events in chronological order', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'agent-runtime-core-story-events-'));
    const store = new FilesystemStoryEventStore({ basePath });

    await store.append({
      id: 'story-2',
      text: 'The guild accepted the order.',
      createdAt: '2026-04-19T10:01:00.000Z',
    });
    await store.append({
      id: 'story-1',
      text: 'The blacksmith reopened the shop.',
      createdAt: '2026-04-19T10:00:00.000Z',
    });

    const events = await store.list();
    const recent = await store.readRecent(1);

    expect(events.map((event) => event.id)).toEqual(['story-1', 'story-2']);
    expect(recent.map((event) => event.id)).toEqual(['story-2']);
  });
});
