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
    command: z.string().min(1).describe(
      'Shell command text executed by the real host/container shell. '
      + 'The command runs exactly as written. Prefer using the cwd field instead of prefixing the command with "cd ... &&".',
    ),
    timeout: z.number().positive().optional().describe(
      'Maximum execution time in seconds. Omit for the tool default.',
    ),
    cwd: z.string().min(1).optional().describe(
      'Absolute or workspace-relative working directory. '
      + 'If omitted, the command starts in the configured workspace root. '
      + 'Absolute paths outside the workspace only work when that path is explicitly allowed by the agent workspace configuration.',
    ),
    env: z.record(z.string(), z.string()).optional().describe(
      'Extra environment variables merged on top of the process environment. '
      + 'Basic variables such as PATH and HOME are already present.',
    ),
    headers: z.record(z.string(), z.string()).optional().describe(
      'Optional request headers for gateways that use them. The local shell gateway ignores this field.',
    ),
    background: z.boolean().optional().describe(
      'Set true to start a long-running command in the background. '
      + 'Then use workspace_get_process_output and workspace_kill_process with the returned pid.',
    ),
  });
  const processOutputSchema = z.object({
    pid: z.string().min(1).describe(
      'Background process id returned by workspace_execute_command when background is true.',
    ),
    tail: z.number().int().optional().describe(
      'Optional number of trailing characters to return from stdout and stderr.',
    ),
    wait: z.boolean().optional().describe(
      'Set true to wait for the process to finish before returning output.',
    ),
  });
  const killProcessSchema = z.object({
    pid: z.string().min(1).describe(
      'Background process id returned by workspace_execute_command when background is true.',
    ),
  });
  const actions: Array<RuntimeActionDefinition<Record<string, unknown>, unknown>> = [{
    name: options.name ?? 'workspace_execute_command',
    description: options.description ?? [
      'Execute a real shell command on the host/container environment.',
      '',
      'Path rules:',
      '  - If cwd is omitted, execution starts in the agent workspace root.',
      '  - Use cwd to change directories instead of writing "cd ... &&" in the command.',
      '  - Relative cwd values resolve from the workspace root.',
      '  - Absolute cwd values outside the workspace only work when that path is explicitly allowed for this agent.',
      '  - If a path does not exist, the shell command fails normally.',
      '',
      'Environment:',
      '  - This is a real shell, not a virtual wrapper.',
      '  - It uses the real tools available in the running environment.',
      '  - Basic variables such as PATH and HOME are already present.',
      '',
      'Examples:',
      '  command: "npm install && npm run build"',
      '  command: "grep -n \\"TODO\\" src/index.ts", cwd: "/app/workspaces/<agent>/workspace"',
      '  command: "git status", cwd: "/absolute/allowed/path"',
      '',
      'Use timeout in seconds to limit execution time.',
      'Set background to true for long-running processes and inspect them later with workspace_get_process_output.',
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
      description: 'Get stdout, stderr, exit status, and optional tail for a background process previously started with workspace_execute_command(background=true).',
      inputSchema: processOutputSchema,
      async execute(input) {
        return gateway.getProcessOutput!(processOutputSchema.parse(input) satisfies WorkspaceProcessOutputRequest);
      },
    });
    actions.push({
      name: 'workspace_kill_process',
      description: 'Kill a background process previously started with workspace_execute_command(background=true) and return the final collected output.',
      inputSchema: killProcessSchema,
      async execute(input) {
        return gateway.killProcess!(killProcessSchema.parse(input).pid);
      },
    });
  }

  return actions;
}
