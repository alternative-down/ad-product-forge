import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { RuntimeEventStream } from '../core/runtime-events.js';
import { createRuntimeHost } from '../integrations/hosts/runtime-host.js';
import { FilesystemRuntimeSnapshotStore } from '../integrations/persistence/filesystem-runtime-snapshot-store.js';
import { FakeStepModelAdapter } from '../integrations/testing/fake-model.js';

describe('runtime host persistence', () => {
  it('restores runtime state from the configured snapshot store', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'agent-runtime-core-host-'));
    const snapshotStore = new FilesystemRuntimeSnapshotStore({ basePath });
    const firstHost = createRuntimeHost({
      runtime: {
        runtimeId: 'host-1',
        model: new FakeStepModelAdapter(() => ({
          segments: [{ kind: 'message', text: 'first step' }],
          actionRequests: [],
          continuation: 'stop',
        })),
      },
      snapshotStore,
    });

    await firstHost.runtime.dispatch({
      id: 'input-1',
      type: 'message',
      payload: { text: 'hello' },
    });
    await firstHost.runtime.run();
    await firstHost.saveSnapshot();

    const secondHost = createRuntimeHost({
      runtime: {
        runtimeId: 'host-1',
        model: new FakeStepModelAdapter(() => ({
          segments: [{ kind: 'message', text: 'second step' }],
          actionRequests: [],
          continuation: 'stop',
        })),
      },
      snapshotStore,
    });

    const restored = await secondHost.restoreSnapshot();

    expect(restored).toBe(true);
    expect(secondHost.runtime.getSnapshot().steps).toHaveLength(1);
  });

  it('accepts actions, plugins and observers through host options', async () => {
    const observedStatuses: string[] = [];
    const host = createRuntimeHost({
      runtime: {
        runtimeId: 'host-configured',
        model: new FakeStepModelAdapter(() => ({
          segments: [{ kind: 'message', text: 'configured' }],
          actionRequests: [{
            name: 'echo_value',
            input: {
              value: 'hello',
            },
          }],
          continuation: 'stop',
        })),
      },
      actions: [{
        name: 'echo_value',
        description: 'Echo a value.',
        inputSchema: z.object({
          value: z.string(),
        }),
        execute(input) {
          return input.value;
        },
      }],
      plugins: [{
        name: 'plugin-note',
        provideContext() {
          return [{
            id: 'note-1',
            kind: 'note',
            title: 'Configured note',
            text: 'Injected by plugin.',
          }];
        },
      }],
      observers: [{
        name: 'status-observer',
        onStatusChanged(context) {
          observedStatuses.push(context.status);
        },
      }],
    });

    await host.runtime.dispatch({
      id: 'input-1',
      type: 'configured',
      payload: { text: 'hello' },
    });
    const result = await host.runtime.run();

    expect(result.steps[0]?.actionResults[0]?.output).toBe('hello');
    expect(result.steps[0]?.context.some((entry) => entry.id === 'note-1')).toBe(true);
    expect(observedStatuses).toContain('running');
  });

  it('can wire a runtime event stream directly from host options', async () => {
    const eventStream = new RuntimeEventStream();
    const host = createRuntimeHost({
      runtime: {
        runtimeId: 'host-events',
        model: new FakeStepModelAdapter(() => ({
          segments: [{ kind: 'message', text: 'evented' }],
          actionRequests: [],
          continuation: 'stop',
        })),
      },
      eventStream,
    });

    await host.runtime.dispatch({
      id: 'input-1',
      type: 'event',
      payload: { text: 'hello' },
    });
    await host.runtime.run();

    expect(host.eventStream).toBe(eventStream);
    expect(eventStream.drain().map((event) => event.type)).toContain('after-step');
  });

  it('can create a runtime event stream automatically from host options', async () => {
    const host = createRuntimeHost({
      runtime: {
        runtimeId: 'host-auto-events',
        model: new FakeStepModelAdapter(() => ({
          segments: [{ kind: 'message', text: 'evented' }],
          actionRequests: [],
          continuation: 'stop',
        })),
      },
      eventStream: true,
    });

    await host.runtime.dispatch({
      id: 'input-1',
      type: 'event',
      payload: { text: 'hello' },
    });
    await host.runtime.run();

    expect(host.eventStream).not.toBeNull();
    expect(host.eventStream?.drain().map((event) => event.type)).toContain('after-step');
  });

  it('can create a runtime message stream automatically from host options', async () => {
    const host = createRuntimeHost({
      runtime: {
        runtimeId: 'host-auto-messages',
        model: new FakeStepModelAdapter(() => ({
          segments: [{ kind: 'message', text: 'spoken output' }],
          actionRequests: [],
          continuation: 'stop',
        })),
      },
      messageStream: true,
    });

    await host.runtime.dispatch({
      id: 'input-1',
      type: 'message',
      payload: { text: 'hello' },
    });
    await host.runtime.run();

    const event = await host.messageStream?.next({ timeoutMs: 50 });

    expect(host.eventStream).not.toBeNull();
    expect(event?.text).toBe('spoken output');
  });
});
