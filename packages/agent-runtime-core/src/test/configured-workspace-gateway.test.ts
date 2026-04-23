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
