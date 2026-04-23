import { describe, expect, it } from 'vitest';

import { createWorkspaceActionDefinitions } from '../integrations/gateways/workspace-actions.js';

describe('createWorkspaceActionDefinitions', () => {
  it('creates runtime actions that call the workspace gateway', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const actions = createWorkspaceActionDefinitions({
      async execute(request) {
        calls.push(request);
        return {
          exitCode: 0,
          stdout: 'done',
          stderr: '',
        };
      },
    });
    const result = await actions[0]!.execute({
      command: 'pwd',
    }, {
      runtimeId: 'runtime-1',
      stepId: 'step-1',
      stepNumber: 1,
    });

    expect(calls).toEqual([{
      command: 'pwd',
    }]);
    expect(result).toEqual({
      exitCode: 0,
      stdout: 'done',
      stderr: '',
    });
  });

  it('supports timeout in seconds and background process actions', async () => {
    const actions = createWorkspaceActionDefinitions({
      async execute() {
        return {
          exitCode: 0,
          stdout: 'done',
          stderr: '',
        };
      },
      async startBackground(request) {
        expect(request.timeoutMs).toBe(60_000);
        return {
          pid: '123',
        };
      },
      async getProcessOutput() {
        return {
          pid: '123',
          running: true,
          exitCode: null,
          stdout: 'line-1\nline-2',
          stderr: '',
        };
      },
      async killProcess() {
        return {
          pid: '123',
          running: false,
          exitCode: 0,
          stdout: 'done',
          stderr: '',
        };
      },
    });

    expect(actions.map((action) => action.name)).toEqual([
      'workspace_execute_command',
      'workspace_get_process_output',
      'workspace_kill_process',
    ]);

    const backgroundResult = await actions[0]!.execute({
      command: 'npm run dev',
      timeout: 60,
      background: true,
    }, {
      runtimeId: 'runtime-1',
      stepId: 'step-1',
      stepNumber: 1,
    });

    expect(backgroundResult).toEqual({
      pid: '123',
    });
  });
});
