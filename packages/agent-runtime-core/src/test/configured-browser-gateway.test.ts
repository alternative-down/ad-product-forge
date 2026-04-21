import { describe, expect, it } from 'vitest';

import { ConfiguredBrowserGateway } from '../integrations/gateways/configured-browser-gateway.js';

describe('configured browser gateway', () => {
  it('applies default session options and preserves request overrides', async () => {
    const receivedOptions: Array<Record<string, unknown>> = [];
    const gateway = new ConfiguredBrowserGateway({
      base: {
        async createSession(options) {
          receivedOptions.push(options ?? {});

          return {
            id: 'browser-session',
            async navigate() {},
            async click() {},
            async type() {},
            async snapshot() {
              return {
                url: 'https://example.com',
                title: 'Example',
                text: 'Example',
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
      userAgent: 'agent-runtime-core',
      viewport: {
        width: 1280,
        height: 720,
      },
      headers: {
        'x-default': '1',
      },
    });

    await gateway.createSession();
    await gateway.createSession({
      headers: {
        'x-request': '1',
      },
    });

    expect(receivedOptions[0]).toEqual({
      userAgent: 'agent-runtime-core',
      viewport: {
        width: 1280,
        height: 720,
      },
      headers: {
        'x-default': '1',
      },
    });
    expect(receivedOptions[1]).toEqual({
      userAgent: 'agent-runtime-core',
      viewport: {
        width: 1280,
        height: 720,
      },
      headers: {
        'x-default': '1',
        'x-request': '1',
      },
    });
  });
});
