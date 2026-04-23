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
  filesystem?: {
    readFile(path: string): Promise<Uint8Array | Buffer | string>;
    writeFile(path: string, data: Uint8Array | Buffer | string): Promise<void>;
    listDirectory(path?: string): Promise<Array<{
      name: string;
      path: string;
      isDirectory: boolean;
      size: number;
    }>>;
  };
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
  const readFileSchema = z.object({
    path: z.string().min(1).describe(
      'Workspace-relative or allowed absolute file path to read.',
    ),
  });
  const writeFileSchema = z.object({
    path: z.string().min(1).describe(
      'Workspace-relative or allowed absolute file path to write.',
    ),
    content: z.string().describe(
      'Full UTF-8 text content to write to the target file.',
    ),
  });
  const listFilesSchema = z.object({
    path: z.string().min(1).optional().describe(
      'Directory to list. Omit to use the workspace root.',
    ),
    recursive: z.boolean().optional().describe(
      'Set true to walk subdirectories recursively.',
    ),
    includeHidden: z.boolean().optional().describe(
      'Set true to include hidden entries that start with a dot.',
    ),
  });
  const grepFilesSchema = z.object({
    pattern: z.string().min(1).describe(
      'Text or regular expression pattern to search for inside readable text files.',
    ),
    path: z.string().min(1).optional().describe(
      'Directory root to search. Omit to search from the workspace root.',
    ),
    caseSensitive: z.boolean().optional().describe(
      'Set true for case-sensitive search. Default is false.',
    ),
    includeHidden: z.boolean().optional().describe(
      'Set true to include hidden files and directories.',
    ),
    maxResults: z.number().int().positive().max(500).optional().describe(
      'Maximum number of matching lines to return.',
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

  if (options.filesystem) {
    actions.push({
      name: 'workspace_read_file',
      description: 'Read a UTF-8 text file from the workspace or an explicitly allowed absolute path.',
      inputSchema: readFileSchema,
      async execute(input) {
        const request = readFileSchema.parse(input);
        const content = await options.filesystem!.readFile(request.path);

        return {
          path: request.path,
          content: typeof content === 'string' ? content : Buffer.from(content).toString('utf8'),
        };
      },
    });
    actions.push({
      name: 'workspace_write_file',
      description: 'Write a UTF-8 text file into the workspace or an explicitly allowed absolute path.',
      inputSchema: writeFileSchema,
      async execute(input) {
        const request = writeFileSchema.parse(input);

        await options.filesystem!.writeFile(request.path, request.content);

        return {
          path: request.path,
          written: true as const,
        };
      },
    });
    actions.push({
      name: 'workspace_list_files',
      description: 'List files and directories inside the workspace or another explicitly allowed path.',
      inputSchema: listFilesSchema,
      async execute(input) {
        const request = listFilesSchema.parse(input);
        const entries = await listWorkspaceEntries({
          filesystem: options.filesystem!,
          rootPath: request.path ?? '.',
          recursive: request.recursive ?? false,
          includeHidden: request.includeHidden ?? false,
        });

        return {
          entries,
        };
      },
    });
    actions.push({
      name: 'workspace_grep_files',
      description: 'Search readable text files in the workspace for matching lines.',
      inputSchema: grepFilesSchema,
      async execute(input) {
        const request = grepFilesSchema.parse(input);
        const matches = await grepWorkspaceFiles({
          filesystem: options.filesystem!,
          rootPath: request.path ?? '.',
          pattern: request.pattern,
          caseSensitive: request.caseSensitive ?? false,
          includeHidden: request.includeHidden ?? false,
          maxResults: request.maxResults ?? 50,
        });

        return {
          matches,
        };
      },
    });
  }

  return actions;
}

async function listWorkspaceEntries(input: {
  filesystem: NonNullable<WorkspaceActionPackOptions['filesystem']>;
  rootPath: string;
  recursive: boolean;
  includeHidden: boolean;
}): Promise<Array<{
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
}>> {
  const entries = await input.filesystem.listDirectory(input.rootPath);
  const filteredEntries = entries.filter((entry) => input.includeHidden || !entry.name.startsWith('.'));
  const normalizedEntries = filteredEntries.map((entry) => ({
    name: entry.name,
    path: entry.path,
    isDirectory: entry.isDirectory,
    size: entry.size,
  }));

  if (!input.recursive) {
    return normalizedEntries;
  }

  const nestedEntries = await Promise.all(filteredEntries
    .filter((entry) => entry.isDirectory)
    .map((entry) => listWorkspaceEntries({
      ...input,
      rootPath: entry.path,
    })));

  return [...normalizedEntries, ...nestedEntries.flat()];
}

async function grepWorkspaceFiles(input: {
  filesystem: NonNullable<WorkspaceActionPackOptions['filesystem']>;
  rootPath: string;
  pattern: string;
  caseSensitive: boolean;
  includeHidden: boolean;
  maxResults: number;
}): Promise<Array<{
  path: string;
  line: number;
  text: string;
}>> {
  const pattern = createSearchPattern(input.pattern, input.caseSensitive);
  const entries = await listWorkspaceEntries({
    filesystem: input.filesystem,
    rootPath: input.rootPath,
    recursive: true,
    includeHidden: input.includeHidden,
  });
  const matches: Array<{
    path: string;
    line: number;
    text: string;
  }> = [];

  for (const entry of entries) {
    if (entry.isDirectory) {
      continue;
    }

    const content = await safeReadTextFile(input.filesystem, entry.path);

    if (content === null) {
      continue;
    }

    const lines = content.split('\n');

    for (const [lineIndex, line] of lines.entries()) {
      if (!pattern.test(line)) {
        continue;
      }

      matches.push({
        path: entry.path,
        line: lineIndex + 1,
        text: line,
      });

      if (matches.length >= input.maxResults) {
        return matches;
      }
    }
  }

  return matches;
}

async function safeReadTextFile(
  filesystem: NonNullable<WorkspaceActionPackOptions['filesystem']>,
  targetPath: string,
) {
  try {
    const content = await filesystem.readFile(targetPath);
    const text = typeof content === 'string'
      ? content
      : Buffer.from(content).toString('utf8');

    return text.includes('\u0000') ? null : text;
  } catch {
    return null;
  }
}

function createSearchPattern(value: string, caseSensitive: boolean) {
  try {
    return new RegExp(value, caseSensitive ? 'g' : 'gi');
  } catch {
    return new RegExp(escapeRegExp(value), caseSensitive ? 'g' : 'gi');
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
