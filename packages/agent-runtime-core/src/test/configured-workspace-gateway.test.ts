import { describe, expect, it } from 'vitest';

import { ConfiguredWorkspaceGateway } from '../integrations/gateways/configured-workspace-gateway.js';

describe('configured workspace gateway', () => {
  it('applies default cwd, env and timeout while preserving request overrides', async () => {
    const receivedRequests: Array<Record<string, unknown>> = [];
    const gateway = new ConfiguredWorkspaceGateway({
      base: {
        async execute(request) {
          receivedRequests.push(request);

          return {
            exitCode: 0,
            stdout: '',
            stderr: '',
          };
        },
      },
      cwd: '/tmp/project',
      env: {
        NODE_ENV: 'production',
      },
      timeoutMs: 5000,
    });

    await gateway.execute({
      command: 'pwd',
    });
    await gateway.execute({
      command: 'env',
      cwd: '/tmp/override',
      env: {
        DEBUG: '1',
      },
      timeoutMs: 1000,
    });

    expect(receivedRequests[0]).toMatchObject({
      command: 'pwd',
      cwd: '/tmp/project',
      env: {
        NODE_ENV: 'production',
      },
      timeoutMs: 5000,
    });
    expect(receivedRequests[1]).toMatchObject({
      command: 'env',
      cwd: '/tmp/override',
      env: {
        NODE_ENV: 'production',
        DEBUG: '1',
      },
      timeoutMs: 1000,
    });
  });

  it('forwards background process operations with configured defaults', async () => {
    const gateway = new ConfiguredWorkspaceGateway({
      base: {
        async execute() {
          return {
            exitCode: 0,
            stdout: '',
            stderr: '',
          };
        },
        async startBackground(request) {
          expect(request.cwd).toBe('/tmp/project');
          expect(request.timeoutMs).toBe(5000);
          expect(request.env).toEqual({
            NODE_ENV: 'production',
          });
          return { pid: '123' };
        },
        async getProcessOutput(request) {
          expect(request).toEqual({
            pid: '123',
            tail: 10,
          });
          return {
            pid: '123',
            running: true,
            exitCode: null,
            stdout: '',
            stderr: '',
          };
        },
        async killProcess(pid) {
          expect(pid).toBe('123');
          return {
            pid,
            running: false,
            exitCode: 0,
            stdout: '',
            stderr: '',
          };
        },
      },
      cwd: '/tmp/project',
      env: {
        NODE_ENV: 'production',
      },
      timeoutMs: 5000,
    });

    expect(await gateway.startBackground({
      command: 'npm run dev',
    })).toEqual({ pid: '123' });
    expect(await gateway.getProcessOutput({
      pid: '123',
      tail: 10,
    })).toEqual({
      pid: '123',
      running: true,
      exitCode: null,
      stdout: '',
      stderr: '',
    });
    expect(await gateway.killProcess('123')).toEqual({
      pid: '123',
      running: false,
      exitCode: 0,
      stdout: '',
      stderr: '',
    });
  });
});

  it('sets HOME to workspaceRoot when provided', async () => {
    const receivedRequests: Array<Record<string, unknown>> = [];
    const gateway = new ConfiguredWorkspaceGateway({
      base: {
        async execute(request) {
          receivedRequests.push(request);
          return { exitCode: 0, stdout: '', stderr: '' };
        },
      },
      cwd: '/agent/workspace',
      workspaceRoot: '/agent/workspace/sandbox',
    });

    await gateway.execute({ command: 'echo $HOME' });

    expect(receivedRequests[0]).toMatchObject({
      command: 'echo $HOME',
      cwd: '/agent/workspace',
      env: {
        HOME: '/agent/workspace/sandbox',
      },
    });
  });

  it('does not override HOME when workspaceRoot is not set', async () => {
    const receivedRequests: Array<Record<string, unknown>> = [];
    const gateway = new ConfiguredWorkspaceGateway({
      base: {
        async execute(request) {
          receivedRequests.push(request);
          return { exitCode: 0, stdout: '', stderr: '' };
        },
      },
      cwd: '/agent/workspace',
    });

    await gateway.execute({
      command: 'echo $HOME',
      env: { CUSTOM: 'value' },
    });

    expect(receivedRequests[0].env).toEqual({ CUSTOM: 'value' });
    expect(receivedRequests[0].env).not.toHaveProperty('HOME');
  });

  it('exposes workspaceRoot property', () => {
    const gateway = new ConfiguredWorkspaceGateway({
      base: { execute: async () => ({ exitCode: 0, stdout: '', stderr: '' }) },
      workspaceRoot: '/agent/workspace',
    });

    expect(gateway.workspaceRoot).toBe('/agent/workspace');
  });

  it('workspaceRoot is undefined when not provided', () => {
    const gateway = new ConfiguredWorkspaceGateway({
      base: { execute: async () => ({ exitCode: 0, stdout: '', stderr: '' }) },
    });

    expect(gateway.workspaceRoot).toBeUndefined();
  });
