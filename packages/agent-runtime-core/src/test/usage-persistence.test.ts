import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FilesystemUsageMeter } from '../integrations/usage/filesystem-usage-meter.js';

describe('filesystem usage meter', () => {
  it('persists usage records on disk', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'agent-runtime-core-usage-'));
    const meter = new FilesystemUsageMeter({ basePath });

    await meter.record({
      runtimeId: 'runtime-1',
      stepId: 'step-1',
      provider: 'minimax',
      modelId: 'MiniMax-M2.7',
      inputTokens: 10,
      outputTokens: 5,
      recordedAt: new Date().toISOString(),
    });

    const reloadedMeter = new FilesystemUsageMeter({ basePath });
    const records = await reloadedMeter.list('runtime-1');

    expect(records).toHaveLength(1);
    expect(records[0]?.provider).toBe('minimax');
  });
});
