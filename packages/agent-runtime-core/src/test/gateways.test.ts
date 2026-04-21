import { describe, expect, it } from 'vitest';

import { LocalBashWorkspaceGateway } from '../integrations/gateways/local-bash-workspace.js';

describe('LocalBashWorkspaceGateway', () => {
  it('executes a bash command and captures stdout', async () => {
    const gateway = new LocalBashWorkspaceGateway();
    const result = await gateway.execute({
      command: 'printf hello',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hello');
  });
});
