import { describe, expect, it } from 'vitest';

import { AsyncEventChannel } from '../core/async-event-channel.js';

describe('async event channel', () => {
  it('delivers published events to listeners and queued readers', async () => {
    const channel = new AsyncEventChannel<string>();
    const seen: string[] = [];

    channel.subscribe((event) => {
      seen.push(event);
    });
    channel.publish('first');
    const nextEvent = await channel.next();

    expect(nextEvent).toBe('first');
    expect(seen).toEqual(['first']);
  });

  it('returns null for pending next readers after close', async () => {
    const channel = new AsyncEventChannel<string>();
    const nextEventPromise = channel.next();

    channel.close();

    await expect(nextEventPromise).resolves.toBeNull();
  });
});
