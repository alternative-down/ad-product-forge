import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FilesystemBrowserSessionRecorder } from '../integrations/persistence/filesystem-browser-session-recorder.js';

describe('filesystem browser session recorder', () => {
  it('persists browser session events on disk', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'agent-runtime-core-browser-recorder-'));
    const recorder = new FilesystemBrowserSessionRecorder({ basePath });

    await recorder.record({
      sessionId: 'session-1',
      type: 'navigate',
      url: 'https://example.com',
      recordedAt: new Date().toISOString(),
    });

    const reloadedRecorder = new FilesystemBrowserSessionRecorder({ basePath });
    const events = await reloadedRecorder.list('session-1');

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('navigate');
  });
});
