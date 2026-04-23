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
    command: z.string().min(1).describe('Shell command text.'),
    timeout: z.number().positive().optional().describe(
      'Max execution time in seconds.',
    ),
    cwd: z.string().min(1).optional().describe(
      'Working directory. Relative paths use the workspace root. Absolute paths must be allowed.',
    ),
    env: z.record(z.string(), z.string()).optional().describe(
      'Extra environment variables.',
    ),
    headers: z.record(z.string(), z.string()).optional().describe(
      'Optional gateway headers.',
    ),
    background: z.boolean().optional().describe(
      'Run in background.',
    ),
  });
  const processOutputSchema = z.object({
    pid: z.string().min(1).describe(
      'Background process id.',
    ),
    tail: z.number().int().optional().describe(
      'Optional output tail length.',
    ),
    wait: z.boolean().optional().describe(
      'Wait for process exit.',
    ),
  });
  const killProcessSchema = z.object({
    pid: z.string().min(1).describe(
      'Background process id.',
    ),
  });
  const readFileSchema = z.object({
    path: z.string().min(1).describe(
      'File path to read.',
    ),
  });
  const writeFileSchema = z.object({
    path: z.string().min(1).describe(
      'File path to write.',
    ),
    content: z.string().describe(
      'Full UTF-8 file content.',
    ),
  });
  const listFilesSchema = z.object({
    path: z.string().min(1).optional().describe(
      'Directory to list.',
    ),
    recursive: z.boolean().optional().describe(
      'List recursively.',
    ),
    includeHidden: z.boolean().optional().describe(
      'Include hidden entries.',
    ),
  });
  const grepFilesSchema = z.object({
    pattern: z.string().min(1).describe(
      'Text or regex pattern.',
    ),
    path: z.string().min(1).optional().describe(
      'Directory root to search.',
    ),
    caseSensitive: z.boolean().optional().describe(
      'Case-sensitive search.',
    ),
    includeHidden: z.boolean().optional().describe(
      'Include hidden files.',
    ),
    maxResults: z.number().int().positive().max(500).optional().describe(
      'Max matching lines.',
    ),
  });
  const actions: Array<RuntimeActionDefinition<Record<string, unknown>, unknown>> = [{
    name: options.name ?? 'workspace_execute_command',
    description: options.description ?? 'Run a real shell command. Use cwd instead of "cd ... &&".',
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
      description: 'Read output from a background command.',
      inputSchema: processOutputSchema,
      async execute(input) {
        return gateway.getProcessOutput!(processOutputSchema.parse(input) satisfies WorkspaceProcessOutputRequest);
      },
    });
    actions.push({
      name: 'workspace_kill_process',
      description: 'Kill a background command and return its output.',
      inputSchema: killProcessSchema,
      async execute(input) {
        return gateway.killProcess!(killProcessSchema.parse(input).pid);
      },
    });
  }

  if (options.filesystem) {
    actions.push({
      name: 'workspace_read_file',
      description: 'Read a UTF-8 text file.',
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
      description: 'Write a UTF-8 text file.',
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
      description: 'List files and directories.',
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
      description: 'Search text files for matching lines.',
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
