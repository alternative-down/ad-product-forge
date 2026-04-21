import { describe, expect, it } from 'vitest';

import { InMemoryAvatarEventRecorder, RecordingAvatarGateway } from '../integrations/gateways/avatar-recording.js';

describe('avatar recording gateway', () => {
  it('records avatar actions', async () => {
    const recorder = new InMemoryAvatarEventRecorder();
    const gateway = new RecordingAvatarGateway({
      recorder,
      base: {
        async setExpression() {},
        async playAnimation() {},
        async move() {},
      },
    });

    await gateway.setExpression({ name: 'thinking' });
    await gateway.playAnimation({ name: 'talk' });

    expect(recorder.list().map((event) => event.type)).toEqual(['expression', 'animation']);
  });
});
