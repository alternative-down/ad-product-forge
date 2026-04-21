import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AgentRuntime } from '../core/runtime.js';
import { FilesystemRuntimeSnapshotStore } from '../integrations/persistence/filesystem-runtime-snapshot-store.js';
import { FakeStepModelAdapter } from '../integrations/testing/fake-model.js';

describe('runtime snapshot persistence', () => {
  it('restores runtime state from a saved snapshot', async () => {
    const runtime = new AgentRuntime({
      runtimeId: 'runtime-1',
      model: new FakeStepModelAdapter(() => ({
        segments: [{ kind: 'message', text: 'first step' }],
        actionRequests: [],
        continuation: 'stop',
      })),
    });

    await runtime.dispatch({
      id: 'input-1',
      type: 'message',
      payload: { text: 'hello' },
    });
    await runtime.run();

    const restoredRuntime = new AgentRuntime({
      runtimeId: 'runtime-1',
      model: new FakeStepModelAdapter(() => ({
        segments: [{ kind: 'message', text: 'second step' }],
        actionRequests: [],
        continuation: 'stop',
      })),
    });
    restoredRuntime.restoreSnapshot(runtime.getSnapshot());

    expect(restoredRuntime.getSnapshot().steps).toHaveLength(1);
    expect(restoredRuntime.getSnapshot().steps[0]?.modelResponse.segments[0]?.text).toBe('first step');
  });

  it('writes and reads snapshots from the filesystem', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'agent-runtime-core-snapshots-'));
    const store = new FilesystemRuntimeSnapshotStore({ basePath });
    const runtime = new AgentRuntime({
      runtimeId: 'runtime-1',
      model: new FakeStepModelAdapter(() => ({
        segments: [{ kind: 'message', text: 'snapshot step' }],
        actionRequests: [],
        continuation: 'stop',
      })),
    });

    await runtime.dispatch({
      id: 'input-1',
      type: 'message',
      payload: { text: 'hello' },
    });
    await runtime.run();
    await store.write(runtime.getSnapshot());

    const snapshot = await store.read('runtime-1');

    expect(snapshot?.runtimeId).toBe('runtime-1');
    expect(snapshot?.steps).toHaveLength(1);
  });
});
