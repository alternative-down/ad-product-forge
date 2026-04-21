import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  InMemorySpeechSynthesisRecorder,
  RecordingTextToSpeechGateway,
} from '../integrations/gateways/speech-recording.js';
import { FilesystemSpeechSynthesisRecorder } from '../integrations/persistence/filesystem-speech-synthesis-recorder.js';

describe('speech recording gateway', () => {
  it('records synthesized speech in memory', async () => {
    const recorder = new InMemorySpeechSynthesisRecorder();
    const gateway = new RecordingTextToSpeechGateway({
      recorder,
      base: {
        async synthesize() {
          return {
            mimeType: 'audio/mpeg',
            bytes: new Uint8Array([1, 2, 3]),
          };
        },
      },
    });

    await gateway.synthesize({
      text: 'hello world',
    });

    expect(recorder.list()).toHaveLength(1);
    expect(recorder.list()[0]?.size).toBe(3);
  });

  it('persists synthesized speech events on disk', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'agent-runtime-core-speech-recorder-'));
    const recorder = new FilesystemSpeechSynthesisRecorder({ basePath });

    await recorder.record({
      text: 'hello world',
      mimeType: 'audio/mpeg',
      size: 3,
      recordedAt: new Date().toISOString(),
    });

    const reloadedRecorder = new FilesystemSpeechSynthesisRecorder({ basePath });
    const events = await reloadedRecorder.list();

    expect(events).toHaveLength(1);
    expect(events[0]?.mimeType).toBe('audio/mpeg');
  });
});
