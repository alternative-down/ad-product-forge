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
    const result = await actions[0]!.execute(
      {
        command: 'pwd',
      },
      {
        runtimeId: 'runtime-1',
        stepId: 'step-1',
        stepNumber: 1,
      },
    );

    expect(calls).toEqual([
      {
        command: 'pwd',
      },
    ]);
    expect(typeof result).toBe('string');
    expect(result).toContain('done');
    expect(result).toContain('Exit code: 0');
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

    const backgroundResult = await actions[0]!.execute(
      {
        command: 'npm run dev',
        timeout: 60,
        background: true,
      },
      {
        runtimeId: 'runtime-1',
        stepId: 'step-1',
        stepNumber: 1,
      },
    );

    expect(typeof backgroundResult).toBe('string');
    expect(backgroundResult).toContain('Started background process with PID: 123');
  });

  it('creates filesystem workspace actions when a filesystem is provided', async () => {
    const writes: Array<{ path: string; content: string }> = [];
    // Track existing files
    const existingFiles = new Set(['test.txt', 'README.md']);

    const actions = createWorkspaceActionDefinitions(
      {
        async execute() {
          return {
            exitCode: 0,
            stdout: '',
            stderr: '',
          };
        },
      },
      {
        filesystem: {
          async readFile(targetPath) {
            if (targetPath === 'test.txt') return 'hello world';
            if (targetPath === 'README.md') return 'read:README.md';
            if (targetPath === '/workspace/src/index.ts') return 'read:/workspace/src/index.ts';
            if (existingFiles.has(targetPath)) return `read:${targetPath}`;
            throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
          },
          async writeFile(targetPath, content) {
            writes.push({
              path: targetPath,
              content: String(content),
            });
            existingFiles.add(targetPath);
          },
          async listDirectory(targetPath = '.') {
            if (targetPath === '.' || targetPath === '/workspace') {
              return [
                {
                  name: 'src',
                  path: '/workspace/src',
                  isDirectory: true,
                  size: 0,
                },
              ];
            }
            if (targetPath === '/workspace/src') {
              return [
                {
                  name: 'index.ts',
                  path: '/workspace/src/index.ts',
                  isDirectory: false,
                  size: 12,
                },
              ];
            }
            return [];
          },
        },
      },
    );

    expect(actions.map((action) => action.name)).toEqual([
      'workspace_execute_command',
      'workspace_read_file',
      'workspace_write_file',
      'workspace_edit_file',
      'workspace_list_files',
      'workspace_grep',
    ]);

    // Test read_file (index 1)
    const readResult = await actions[1]!.execute(
      {
        path: 'README.md',
      },
      {
        runtimeId: 'runtime-1',
        stepId: 'step-1',
        stepNumber: 1,
      },
    );
    expect(typeof readResult).toBe('string');
    expect(readResult).toContain('read:README.md');

    // Test write_file (index 2) - new file
    const writeResult = await actions[2]!.execute(
      {
        path: 'new-file.txt',
        content: 'hello',
      },
      {
        runtimeId: 'runtime-1',
        stepId: 'step-1',
        stepNumber: 1,
      },
    );
    expect(typeof writeResult).toBe('string');
    expect(writeResult).toContain('Wrote');
    expect(writes).toEqual([
      {
        path: 'new-file.txt',
        content: 'hello',
      },
    ]);

    // Test edit_file (index 3)
    const editResult = await actions[3]!.execute(
      {
        path: 'test.txt',
        old_string: 'hello',
        new_string: 'world',
      },
      {
        runtimeId: 'runtime-1',
        stepId: 'step-1',
        stepNumber: 1,
      },
    );
    expect(typeof editResult).toBe('string');
    expect(editResult).toContain('Replaced');

    // Test list_files (index 4)
    const listResult = await actions[4]!.execute(
      {
        maxDepth: 2,
      },
      {
        runtimeId: 'runtime-1',
        stepId: 'step-1',
        stepNumber: 1,
      },
    );
    expect(typeof listResult).toBe('string');
    expect(listResult).toContain('src');
    expect(listResult).toContain('index.ts');

    // Test grep (index 5)
    const grepResult = await actions[5]!.execute(
      {
        pattern: 'read',
        maxCount: 5,
      },
      {
        runtimeId: 'runtime-1',
        stepId: 'step-1',
        stepNumber: 1,
      },
    );
    expect(typeof grepResult).toBe('string');
    expect(grepResult).toContain('/workspace/src/index.ts');
  });

  it('supports tiktoken-based output truncation', async () => {
    const longOutput = 'line\n'.repeat(300);
    const actions = createWorkspaceActionDefinitions({
      async execute() {
        return {
          exitCode: 0,
          stdout: longOutput,
          stderr: '',
        };
      },
    });

    const result = await actions[0]!.execute(
      {
        command: 'long command',
        tail: 50,
      },
      {
        runtimeId: 'runtime-1',
        stepId: 'step-1',
        stepNumber: 1,
      },
    );

    expect(typeof result).toBe('string');
    expect(result).toContain('Exit code: 0');
  });

  it('handles read_file with offset and limit parameters', async () => {
    const multilineContent =
      'Line 0\nLine 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9';
    const actions = createWorkspaceActionDefinitions(
      {
        async execute() {
          return { exitCode: 0, stdout: '', stderr: '' };
        },
      },
      {
        filesystem: {
          async readFile() {
            return multilineContent;
          },
          async writeFile() {},
          async listDirectory() {
            return [];
          },
        },
      },
    );

    const result = await actions[1]!.execute(
      {
        path: 'multi.txt',
        offset: 2,
        limit: 3,
        showLineNumbers: true,
      },
      {
        runtimeId: 'runtime-1',
        stepId: 'step-1',
        stepNumber: 1,
      },
    );

    expect(typeof result).toBe('string');
    expect(result).toContain('Line 2');
    expect(result).toContain('Line 3');
    expect(result).toContain('Line 4');
    expect(result).not.toContain('Line 0');
  });
});
