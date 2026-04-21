import { describe, expect, it } from 'vitest';

import { PlaywrightBrowserGateway } from '../integrations/gateways/playwright-browser.js';

describe('PlaywrightBrowserGateway', () => {
  it('creates a gateway instance', () => {
    const gateway = new PlaywrightBrowserGateway();

    expect(gateway).toBeInstanceOf(PlaywrightBrowserGateway);
  });
});

