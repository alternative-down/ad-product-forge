import { describe, expect, it } from 'vitest';

import {
  InMemoryBrowserSessionRecorder,
  RecordingBrowserGateway,
} from '../integrations/gateways/browser-recording.js';

describe('browser recording gateway', () => {
  it('records browser session activity', async () => {
    const recorder = new InMemoryBrowserSessionRecorder();
    const gateway = new RecordingBrowserGateway({
      recorder,
      base: {
        async createSession() {
          return {
            id: 'session-1',
            async navigate() {},
            async click() {},
            async type() {},
            async snapshot() {
              return {
                url: 'https://example.com',
                title: 'Example',
                text: 'Example body',
              };
            },
            async screenshot() {
              return {
                mimeType: 'image/png',
                bytes: new Uint8Array([1, 2, 3]),
              };
            },
            async close() {},
          };
        },
      },
    });
    const session = await gateway.createSession();

    await session.navigate('https://example.com');
    await session.snapshot();
    await session.close();

    const events = recorder.list('session-1');

    expect(events.map((event) => event.type)).toEqual(['navigate', 'snapshot', 'close']);
  });
});
