import { z } from 'zod';

import type { RuntimeActionDefinition } from '../../core/actions.js';

import type { WorkspaceCommandRequest, WorkspaceGateway } from './workspace.js';

export type WorkspaceActionPackOptions = {
  name?: string;
  description?: string;
};

export function createWorkspaceActionDefinitions(
  gateway: WorkspaceGateway,
  options: WorkspaceActionPackOptions = {},
): Array<RuntimeActionDefinition<Record<string, unknown>, unknown>> {
  return [{
    name: options.name ?? 'workspace_execute_command',
    description: options.description ?? 'Execute a command in the configured workspace gateway.',
    inputSchema: z.object({
      command: z.string().min(1),
      cwd: z.string().min(1).optional(),
      env: z.record(z.string(), z.string()).optional(),
      headers: z.record(z.string(), z.string()).optional(),
      timeoutMs: z.number().int().positive().optional(),
    }),
    async execute(input) {
      return gateway.execute(input as WorkspaceCommandRequest);
    },
  }];
}
