import { z } from 'zod';

import type { RuntimeActionDefinition } from '../../core/actions.js';

import type {
  WorkspaceBackgroundCommandRequest,
  WorkspaceCommandRequest,
  WorkspaceGateway,
  WorkspaceProcessOutputRequest,
} from './workspace.js';

export type WorkspaceActionPackOptions = {
  name?: string;
  description?: string;
};

export function createWorkspaceActionDefinitions(
  gateway: WorkspaceGateway,
  options: WorkspaceActionPackOptions = {},
): Array<RuntimeActionDefinition<Record<string, unknown>, unknown>> {
  const executeCommandSchema = z.object({
    command: z.string().min(1),
    timeout: z.number().positive().optional(),
    cwd: z.string().min(1).optional(),
    env: z.record(z.string(), z.string()).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    background: z.boolean().optional(),
  });
  const processOutputSchema = z.object({
    pid: z.string().min(1),
    tail: z.number().int().optional(),
    wait: z.boolean().optional(),
  });
  const killProcessSchema = z.object({
    pid: z.string().min(1),
  });
  const actions: Array<RuntimeActionDefinition<Record<string, unknown>, unknown>> = [{
    name: options.name ?? 'workspace_execute_command',
    description: options.description ?? [
      'Execute a shell command in the configured workspace gateway.',
      '',
      'Examples:',
      '  "npm install && npm run build"',
      '  "ls -la src/"',
      '  "cat file.txt | grep error"',
      '',
      'Use timeout in seconds to limit execution time.',
      'Set background to true for long-running processes and use workspace_get_process_output later.',
    ].join('\n'),
    inputSchema: executeCommandSchema,
    async execute(input) {
      const request = executeCommandSchema.parse(input);

      if (request.background) {
        if (!gateway.startBackground) {
          throw new Error('Workspace gateway does not support background processes');
        }

        return gateway.startBackground({
          command: request.command,
          cwd: request.cwd,
          env: request.env,
          headers: request.headers,
          timeoutMs: request.timeout ? request.timeout * 1000 : undefined,
        } satisfies WorkspaceBackgroundCommandRequest);
      }

      return gateway.execute({
        command: request.command,
        cwd: request.cwd,
        env: request.env,
        headers: request.headers,
        timeoutMs: request.timeout ? request.timeout * 1000 : undefined,
      } satisfies WorkspaceCommandRequest);
    },
  }];

  if (gateway.getProcessOutput && gateway.killProcess) {
    actions.push({
      name: 'workspace_get_process_output',
      description: 'Get stdout, stderr, status, and optional tail for a background process by PID.',
      inputSchema: processOutputSchema,
      async execute(input) {
        return gateway.getProcessOutput!(processOutputSchema.parse(input) satisfies WorkspaceProcessOutputRequest);
      },
    });
    actions.push({
      name: 'workspace_kill_process',
      description: 'Kill a background process by PID and return the final collected output.',
      inputSchema: killProcessSchema,
      async execute(input) {
        return gateway.killProcess!(killProcessSchema.parse(input).pid);
      },
    });
  }

  return actions;
}
