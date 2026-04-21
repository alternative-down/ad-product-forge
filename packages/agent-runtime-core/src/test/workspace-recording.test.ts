import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  InMemoryWorkspaceCommandRecorder,
  RecordingWorkspaceGateway,
} from '../integrations/gateways/workspace-recording.js';
import { FilesystemWorkspaceCommandRecorder } from '../integrations/persistence/filesystem-workspace-command-recorder.js';

describe('workspace recording gateway', () => {
  it('records workspace command execution in memory', async () => {
    const recorder = new InMemoryWorkspaceCommandRecorder();
    const gateway = new RecordingWorkspaceGateway({
      recorder,
      base: {
        async execute() {
          return {
            exitCode: 0,
            stdout: 'ok',
            stderr: '',
          };
        },
      },
    });

    await gateway.execute({
      command: 'echo ok',
    });

    expect(recorder.list()).toHaveLength(1);
    expect(recorder.list()[0]?.command).toBe('echo ok');
  });

  it('persists workspace command events on disk', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'agent-runtime-core-workspace-recorder-'));
    const recorder = new FilesystemWorkspaceCommandRecorder({ basePath });

    await recorder.record({
      command: 'echo ok',
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
      durationMs: 1,
      recordedAt: new Date().toISOString(),
    });

    const reloadedRecorder = new FilesystemWorkspaceCommandRecorder({ basePath });
    const events = await reloadedRecorder.list();

    expect(events).toHaveLength(1);
    expect(events[0]?.stdout).toBe('ok');
  });
});
