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
});
