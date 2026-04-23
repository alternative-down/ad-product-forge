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

  it('creates filesystem workspace actions when a filesystem is provided', async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const actions = createWorkspaceActionDefinitions({
      async execute() {
        return {
          exitCode: 0,
          stdout: '',
          stderr: '',
        };
      },
    }, {
      filesystem: {
        async readFile(targetPath) {
          return `read:${targetPath}`;
        },
        async writeFile(targetPath, content) {
          writes.push({
            path: targetPath,
            content: String(content),
          });
        },
        async listDirectory(targetPath = '.') {
          if (targetPath === '.') {
            return [{
              name: 'src',
              path: '/workspace/src',
              isDirectory: true,
              size: 0,
            }];
          }

          return [{
            name: 'index.ts',
            path: '/workspace/src/index.ts',
            isDirectory: false,
            size: 12,
          }];
        },
      },
    });

    expect(actions.map((action) => action.name)).toEqual([
      'workspace_execute_command',
      'workspace_read_file',
      'workspace_write_file',
      'workspace_list_files',
      'workspace_grep_files',
    ]);

    const readResult = await actions[1]!.execute({
      path: 'README.md',
    }, {
      runtimeId: 'runtime-1',
      stepId: 'step-1',
      stepNumber: 1,
    });
    const writeResult = await actions[2]!.execute({
      path: 'notes/todo.md',
      content: 'hello',
    }, {
      runtimeId: 'runtime-1',
      stepId: 'step-1',
      stepNumber: 1,
    });
    const listResult = await actions[3]!.execute({
      recursive: true,
    }, {
      runtimeId: 'runtime-1',
      stepId: 'step-1',
      stepNumber: 1,
    });
    const grepResult = await actions[4]!.execute({
      pattern: 'read',
      maxResults: 5,
    }, {
      runtimeId: 'runtime-1',
      stepId: 'step-1',
      stepNumber: 1,
    });

    expect(readResult).toEqual({
      path: 'README.md',
      content: 'read:README.md',
    });
    expect(writeResult).toEqual({
      path: 'notes/todo.md',
      written: true,
    });
    expect(writes).toEqual([{
      path: 'notes/todo.md',
      content: 'hello',
    }]);
    expect(listResult).toEqual({
      entries: [
        {
          name: 'src',
          path: '/workspace/src',
          isDirectory: true,
          size: 0,
        },
        {
          name: 'index.ts',
          path: '/workspace/src/index.ts',
          isDirectory: false,
          size: 12,
        },
      ],
    });
    expect(grepResult).toEqual({
      matches: [{
        path: '/workspace/src/index.ts',
        line: 1,
        text: 'read:/workspace/src/index.ts',
      }],
    });
  });
});
