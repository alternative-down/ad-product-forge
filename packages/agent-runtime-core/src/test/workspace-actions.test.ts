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
});
