import path from 'node:path';

import { z } from 'zod';

import { countTokens, getEncoder } from '../../token-counter.js';

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
  /**
   * Root workspace path — used to normalize output (e.g., strip absolute host paths
   * from command output so agents see only workspace-relative paths).
   */
  workspaceRoot?: string;
  filesystem?: {
    readFile(path: string): Promise<Uint8Array | Buffer | string>;
    writeFile(path: string, data: Uint8Array | Buffer | string): Promise<void>;
    /**
     * Root workspace path — used to normalize paths returned by listDirectory
     * so they are relative to the workspace root (not absolute host paths).
     */
    listDirectory(path?: string): Promise<
      Array<{
        name: string;
        path: string;
        isDirectory: boolean;
        size: number;
      }>
    >;
  };
};

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_MAX_OUTPUT_TOKENS = 8000;
const DEFAULT_TAIL_LINES = 100;
const MAX_PATTERN_LENGTH = 1000;

function normalizeOutputPaths(output: string, workspaceRoot?: string): string {
  if (!workspaceRoot) return output;

  // Normalize workspace root (resolve ~ and ..)
  const normalizedRoot = path.resolve(workspaceRoot);

  // Replace all occurrences of the absolute workspace root path with '.'
  let result = output.split(normalizedRoot).join('.');

  // Also try the parent of the workspace root (for paths that include parent directories)
  // This handles cases like /tmp/agent-workspace-xxx/workspace
  const parentOfRoot = path.dirname(normalizedRoot);
  if (parentOfRoot !== normalizedRoot) {
    result = result.split(parentOfRoot + '/').join('./');
    result = result.split(parentOfRoot + '\\').join('\\');
  }

  return result;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Convert content to string
 */
function toString(content: Uint8Array | Buffer | string, encoding?: string): string {
  if (typeof content === 'string') return content;
  if (encoding === 'base64') return Buffer.from(content).toString('base64');
  if (encoding === 'hex') return Buffer.from(content).toString('hex');
  return Buffer.from(content).toString('utf8');
}

/**
 * Truncate output based on token limit using tiktoken
 */
function truncateOutput(
  output: string,
  tail: number | undefined,
  tokenLimit: number | undefined,
): string {
  let result = output;

  // Apply tail first
  if (tail && tail > 0) {
    const lines = result.split('\n');
    if (lines.length > tail) {
      result = lines.slice(-tail).join('\n');
    }
  }

  // Apply token limit using tiktoken
  const currentTokens = countTokens(result);
  const limit = tokenLimit ?? DEFAULT_MAX_OUTPUT_TOKENS;

  if (currentTokens > limit) {
    try {
      const encoder = getEncoder();
      const allTokens = encoder.encode(result);
      const truncatedTokens = allTokens.slice(-limit);
      result = `[output truncated: showing last ~${limit} of ~${allTokens.length} tokens]\n${encoder.decode(truncatedTokens)}`;
    } catch {
      // Fallback to char-based truncation
      const charLimit = limit * 4;
      result = `[output truncated: showing last ~${limit} tokens]\n${result.slice(-charLimit)}`;
    }
  }

  return result;
}

/**
 * Format content with line numbers
 */
function formatWithLineNumbers(content: string, startLine: number = 1): string {
  return content
    .split('\n')
    .map((line, i) => `${String(startLine + i).padStart(6)}  ${line}`)
    .join('\n');
}

/**
 * Read a slice of content by line range
 */
function sliceContent(content: string, offset: number, limit?: number): string {
  const lines = content.split('\n');
  const startLine = Math.min(offset, lines.length);
  const endLine = limit ? Math.min(offset + limit, lines.length) : lines.length;
  return lines.slice(startLine, endLine).join('\n');
}

/**
 * Check if filename matches pattern
 */
function matchesPattern(name: string, pattern: string): boolean {
  try {
    const regex = new RegExp(pattern);
    return regex.test(name);
  } catch {
    return name.includes(pattern);
  }
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

export function createWorkspaceActionDefinitions(
  gateway: WorkspaceGateway,
  options: WorkspaceActionPackOptions = {},
): Array<RuntimeActionDefinition<Record<string, unknown>, unknown>> {
  const actions: Array<RuntimeActionDefinition<Record<string, unknown>, unknown>> = [];

  // =============================================================================
  // workspace_execute_command
  // =============================================================================

  const executeCommandSchema = z.object({
    command: z
      .string()
      .describe(
        'The shell command to execute (e.g., "npm install", "ls -la src/", "cat file.txt | grep error")',
      ),
    timeout: z
      .number()
      .optional()
      .describe('Maximum execution time in seconds. Example: 60 for 1 minute.'),
    cwd: z.string().optional().describe('Working directory for the command'),
    tail: z
      .number()
      .optional()
      .describe(
        `Limit output to the last N lines. Defaults to ${DEFAULT_TAIL_LINES}. Use 0 for no limit.`,
      ),
    background: z
      .boolean()
      .optional()
      .describe(
        'Run the command in the background. Returns a PID immediately instead of waiting for completion.',
      ),
  });

  actions.push({
    name: options.name ?? 'workspace_execute_command',
    description: `Execute a shell command in the workspace. Returns command output or PID for background processes.

Use cwd instead of "cd ... &&". Examples:
- Simple: { command: "ls -la" }
- With timeout: { command: "npm install", timeout: 60 }
- With cwd: { command: "npm test", cwd: "/app" }
- Background: { command: "npm run dev", background: true }
- With tail: { command: "npm run dev", tail: 50 }`,
    inputSchema: executeCommandSchema,
    async execute(input) {
      const request = executeCommandSchema.parse(input);
      const tailLines = request.tail ?? DEFAULT_TAIL_LINES;

      if (request.background) {
        if (!gateway.startBackground) {
          throw new Error('Workspace gateway does not support background processes');
        }

        const result = await gateway.startBackground({
          command: request.command,
          cwd: request.cwd,
          timeoutMs: request.timeout ? request.timeout * 1000 : undefined,
        } satisfies WorkspaceBackgroundCommandRequest);

        return `Started background process with PID: ${result.pid}\nCommand: ${request.command}`;
      }

      const result = await gateway.execute({
        command: request.command,
        cwd: request.cwd,
        timeoutMs: request.timeout ? request.timeout * 1000 : undefined,
      } satisfies WorkspaceCommandRequest);

      const combinedOutput = result.stdout + (result.stderr ? `\n${result.stderr}` : '');
      const normalizedOutput = normalizeOutputPaths(combinedOutput, options.workspaceRoot);
      return (
        truncateOutput(normalizedOutput, tailLines, undefined) + `\n\nExit code: ${result.exitCode}`
      );
    },
  });

  // =============================================================================
  // workspace_get_process_output
  // =============================================================================

  if (gateway.getProcessOutput) {
    const processOutputSchema = z.object({
      pid: z.string().describe('The process ID returned when the background command was started'),
      tail: z
        .number()
        .optional()
        .describe(`Number of lines to return. Defaults to ${DEFAULT_TAIL_LINES}.`),
      wait: z
        .boolean()
        .optional()
        .describe('If true, block until the process exits and return the final output.'),
    });

    actions.push({
      name: 'workspace_get_process_output',
      description: `Get the current output (stdout, stderr) and status of a background process by its PID.

Use this after starting a background command with execute_command (background: true) to check if the process is still running and read its output.`,
      inputSchema: processOutputSchema,
      async execute(input) {
        const request = processOutputSchema.parse(input);
        const tailLines = request.tail ?? DEFAULT_TAIL_LINES;
        const result = await gateway.getProcessOutput!(
          request satisfies WorkspaceProcessOutputRequest,
        );

        const stdout = truncateOutput(result.stdout ?? '', tailLines, undefined);
        const stderr = truncateOutput(result.stderr ?? '', tailLines, undefined);

        let output = '';
        if (stdout) output += `=== STDOUT ===\n${stdout}\n`;
        if (stderr) output += `=== STDERR ===\n${stderr}\n`;
        output += `Status: ${result.running ? 'running' : `exited (code: ${result.exitCode})`}`;

        return output;
      },
    });
  }

  // =============================================================================
  // workspace_kill_process
  // =============================================================================

  if (gateway.killProcess) {
    const killProcessSchema = z.object({
      pid: z.string().describe('The process ID of the background process to kill'),
    });

    actions.push({
      name: 'workspace_kill_process',
      description: `Kill a background process by its PID.

Use this to stop a long-running background process that was started with execute_command (background: true).`,
      inputSchema: killProcessSchema,
      async execute(input) {
        const request = killProcessSchema.parse(input);
        const result = await gateway.killProcess!(request.pid);

        if (!result) {
          return `Process ${request.pid} was not found or had already exited.`;
        }

        const stdout = truncateOutput(result.stdout ?? '', DEFAULT_TAIL_LINES, undefined);
        const stderr = truncateOutput(result.stderr ?? '', DEFAULT_TAIL_LINES, undefined);

        let output = `Process ${request.pid} has been terminated.\n`;
        if (stdout) output += `\n=== STDOUT ===\n${stdout}`;
        if (stderr) output += `\n=== STDERR ===\n${stderr}`;
        output += `\nExit code: ${result.exitCode ?? 'unknown'}`;

        return output;
      },
    });
  }

  // =============================================================================
  // FILESYSTEM TOOLS
  // =============================================================================

  if (options.filesystem) {
    // workspace_read_file
    const readFileSchema = z.object({
      path: z.string().describe('The path to the file to read (e.g., "/data/config.json")'),
      encoding: z
        .enum(['utf-8', 'utf8', 'base64', 'hex'])
        .optional()
        .default('utf-8')
        .describe('File encoding (default: utf-8)'),
      offset: z
        .number()
        .optional()
        .default(0)
        .describe('Starting line number (0-based index, default: 0)'),
      limit: z
        .number()
        .optional()
        .describe(
          'Maximum number of lines to read. If not provided, reads all lines from offset to end.',
        ),
      showLineNumbers: z
        .boolean()
        .optional()
        .default(true)
        .describe('Whether to prefix each line with its line number (default: true)'),
    });

    actions.push({
      name: 'workspace_read_file',
      description: `Read the contents of a file from the workspace filesystem.

Supports reading specific line ranges with offset/limit and different encodings.

Examples:
- Basic: { path: "/data/config.json" }
- Without line numbers: { path: "/data/config.json", showLineNumbers: false }
- With offset/limit: { path: "/data/config.json", offset: 10, limit: 50 }
- Base64: { path: "/data/binary.bin", encoding: "base64" }`,
      inputSchema: readFileSchema,
      async execute(input) {
        const request = readFileSchema.parse(input);

        try {
          const content = await options.filesystem!.readFile(request.path);
          const strContent = toString(content, request.encoding);

          // Apply offset/limit for text encodings
          let finalContent = strContent;
          if (
            (request.encoding === 'utf-8' || request.encoding === 'utf8' || !request.encoding) &&
            (request.offset || request.limit)
          ) {
            finalContent = sliceContent(strContent, request.offset ?? 0, request.limit);
          }

          const formatted = request.showLineNumbers
            ? formatWithLineNumbers(finalContent, (request.offset ?? 0) + 1)
            : finalContent;

          return formatted;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return `${request.path}: not found`;
          }
          const message = error instanceof Error ? error.message : String(error);
          return `Error reading ${request.path}: ${message}`;
        }
      },
    });

    // workspace_write_file
    const writeFileSchema = z.object({
      path: z.string().describe('The path where to write the file (e.g., "/data/output.txt")'),
      content: z.string().describe('The content to write to the file'),
      overwrite: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'If false (default), writing to an existing file will fail. If true, will overwrite.',
        ),
    });

    actions.push({
      name: 'workspace_write_file',
      description: `Write content to a file in the workspace filesystem.

If the file already exists, the write will fail by default unless overwrite is set to true.

Examples:
- Basic: { path: "/data/output.txt", content: "Hello world" }
- Overwrite: { path: "/data/output.txt", content: "New content", overwrite: true }`,
      inputSchema: writeFileSchema,
      async execute(input) {
        const request = writeFileSchema.parse(input);

        try {
          // Check if file exists (only if not overwriting)
          if (!request.overwrite) {
            try {
              await options.filesystem!.readFile(request.path);
              return `Error: File ${request.path} already exists. Use overwrite: true to replace it.`;
            } catch (readError) {
              if ((readError as NodeJS.ErrnoException).code !== 'ENOENT') {
                return `Error: File ${request.path} already exists. Use overwrite: true to replace it.`;
              }
            }
          }

          await options.filesystem!.writeFile(request.path, request.content);
          const size = Buffer.byteLength(request.content, 'utf-8');
          return `Wrote ${size} bytes to ${request.path}`;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return `Error writing ${request.path}: ${message}`;
        }
      },
    });

    // workspace_edit_file
    const editFileSchema = z.object({
      path: z.string().describe('The path to the file to edit'),
      old_string: z
        .string()
        .describe('The exact text to find and replace. Must be unique in the file.'),
      new_string: z.string().describe('The text to replace old_string with'),
      replace_all: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'If true, replace all occurrences. If false (default), old_string must be unique.',
        ),
    });

    actions.push({
      name: 'workspace_edit_file',
      description: `Edit a file by replacing specific text. The old_string must match exactly and be unique in the file.

Usage:
- Read the file first to get the exact text to replace.
- Include enough surrounding context (multiple lines) to make old_string unique.
- Use replace_all only when intentionally replacing all occurrences.

Examples:
- Basic: { path: "/data/config.json", old_string: "old value", new_string: "new value" }
- Multiple: { path: "/data/config.json", old_string: "DEBUG=true", new_string: "DEBUG=false", replace_all: true }`,
      inputSchema: editFileSchema,
      async execute(input) {
        const request = editFileSchema.parse(input);

        try {
          const rawContent = await options.filesystem!.readFile(request.path);
          const content = toString(rawContent);

          if (!content.includes(request.old_string)) {
            return `Error: old_string not found in ${request.path}. Make sure to include the exact text including whitespace and newlines.`;
          }

          let replacements = 0;
          let result: string;

          if (request.replace_all) {
            result = content.split(request.old_string).join(request.new_string);
            replacements = content.split(request.old_string).length - 1;
          } else {
            const index = content.indexOf(request.old_string);
            if (content.indexOf(request.old_string, index + 1) !== -1) {
              return `Error: old_string appears multiple times. Use replace_all: true or include more context to make it unique.`;
            }
            result =
              content.slice(0, index) +
              request.new_string +
              content.slice(index + request.old_string.length);
            replacements = 1;
          }

          await options.filesystem!.writeFile(request.path, result);
          return `Replaced ${replacements} occurrence${replacements !== 1 ? 's' : ''} in ${request.path}`;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return `Error: File ${request.path} not found`;
          }
          const message = error instanceof Error ? error.message : String(error);
          return `Error editing ${request.path}: ${message}`;
        }
      },
    });

    // workspace_list_files
    const listFilesSchema = z.object({
      path: z.string().optional().default('.').describe('Directory path to list'),
      maxDepth: z
        .number()
        .optional()
        .default(1)
        .describe(
          'Maximum depth for recursive listing. 1 = current directory only, 2 = one level deep, etc.',
        ),
      showHidden: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include hidden files (files starting with ".")'),
      dirsOnly: z.boolean().optional().default(false).describe('Only list directories, not files'),
      exclude: z
        .array(z.string())
        .optional()
        .describe('Array of patterns to exclude from results (e.g., ["node_modules", "*.log"])'),
      extension: z
        .string()
        .optional()
        .describe('Only list files with this extension (e.g., "ts", "js", "json")'),
      pattern: z.string().optional().describe('Filter files by regex pattern in their name'),
    });

    actions.push({
      name: 'workspace_list_files',
      description: `List files and directories in the workspace filesystem.

Options:
- path: Directory to list (default: ".")
- maxDepth: Maximum depth for recursive listing (default: 1)
- showHidden: Include hidden files (default: false)
- dirsOnly: Only list directories (default: false)
- exclude: Patterns to exclude
- extension: Filter by file extension
- pattern: Regex pattern to filter file names

Examples:
- Basic: { path: "/src" }
- Recursive with depth: { path: "/src", maxDepth: 3 }
- Only directories: { path: "/src", dirsOnly: true }
- TypeScript files: { path: "/src", extension: "ts" }
- Filter by pattern: { path: "/src", pattern: "^test" }`,
      inputSchema: listFilesSchema,
      async execute(input) {
        const request = listFilesSchema.parse(input);

        try {
          const entries = await listWorkspaceEntries({
            filesystem: options.filesystem!,
            rootPath: request.path ?? '.',
            maxDepth: request.maxDepth ?? 1,
            showHidden: request.showHidden ?? false,
            dirsOnly: request.dirsOnly ?? false,
            exclude: request.exclude ?? [],
            extension: request.extension,
            pattern: request.pattern,
          });

          if (entries.length === 0) {
            return `No files found in ${request.path ?? '.'}`;
          }

          const lines = entries.map((entry) => {
            const prefix = entry.isDirectory ? '📁 ' : '📄 ';
            const size = entry.size > 0 ? ` (${entry.size} bytes)` : '';
            return `${prefix}${entry.path}${size}`;
          });

          return lines.join('\n') + `\n\n--- ${entries.length} entries`;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return `Error listing ${request.path ?? '.'}: ${message}`;
        }
      },
    });

    // workspace_grep
    const grepSchema = z.object({
      pattern: z.string().describe('Regex pattern to search for'),
      path: z
        .string()
        .optional()
        .default('.')
        .describe('File, directory, or glob pattern to search within (default: ".")'),
      contextLines: z
        .number()
        .optional()
        .default(0)
        .describe('Number of lines of context to include before and after each match (default: 0)'),
      maxCount: z.number().optional().describe('Maximum total matches to return'),
      caseSensitive: z
        .boolean()
        .optional()
        .default(true)
        .describe('Whether the search is case-sensitive (default: true)'),
      includeHidden: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include hidden files and directories (default: false)'),
    });

    actions.push({
      name: 'workspace_grep',
      description: `Search file contents using a regex pattern. Returns matching lines with file paths and line numbers.

Usage:
- Basic search: { pattern: "TODO" }
- Regex: { pattern: "function\\\\s+\\\\w+\\\\(" }
- Multiple terms: { pattern: "TODO|FIXME" }
- Case-insensitive: { pattern: "error", caseSensitive: false }
- With context: { pattern: "function", contextLines: 2 }
- In directory: { pattern: "TODO", path: "src" }`,
      inputSchema: grepSchema,
      async execute(input) {
        const request = grepSchema.parse(input);

        if (request.pattern.length > MAX_PATTERN_LENGTH) {
          return `Error: Pattern too long (${request.pattern.length} chars, max ${MAX_PATTERN_LENGTH}).`;
        }

        let regex: RegExp;
        try {
          regex = new RegExp(request.pattern, request.caseSensitive ? 'g' : 'gi');
        } catch (e) {
          return `Error: Invalid regex pattern: ${(e as Error).message}`;
        }

        const matches: string[] = [];
        let totalMatches = 0;

        async function searchInFile(filePath: string): Promise<boolean> {
          try {
            const rawContent = await options.filesystem!.readFile(filePath);
            const content = toString(rawContent);
            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];

              if (regex.test(line)) {
                totalMatches++;

                if (request.maxCount && totalMatches >= request.maxCount) {
                  if (request.contextLines > 0) {
                    const start = Math.max(0, i - request.contextLines);
                    const end = Math.min(lines.length, i + request.contextLines + 1);
                    const context = lines.slice(start, end).join('\n');
                    matches.push(`--- ${filePath}:${i + 1} ---\n${context}\n---`);
                  } else {
                    matches.push(`${filePath}:${i + 1}: ${line}`);
                  }
                  return false;
                }

                if (request.contextLines > 0) {
                  const start = Math.max(0, i - request.contextLines);
                  const end = Math.min(lines.length, i + request.contextLines + 1);
                  const context = lines.slice(start, end).join('\n');
                  matches.push(`--- ${filePath}:${i + 1} ---\n${context}\n---`);
                } else {
                  matches.push(`${filePath}:${i + 1}: ${line}`);
                }
              }
            }

            return true;
          } catch {
            return false;
          }
        }

        async function walkSearch(dir: string, depth: number = 0): Promise<void> {
          if (depth > 10) return;

          try {
            const items = await options.filesystem!.listDirectory(dir);

            for (const item of items) {
              if (!request.includeHidden && item.name.startsWith('.')) continue;

              const fullPath = item.path;

              if (item.isDirectory) {
                await walkSearch(fullPath, depth + 1);
              } else {
                await searchInFile(fullPath);
              }
            }
          } catch {
            // Skip inaccessible directories
          }
        }

        await walkSearch(request.path ?? '.');

        if (matches.length === 0) {
          return `No matches found for "${request.pattern}"`;
        }

        const footer = `--- ${totalMatches} match${totalMatches !== 1 ? 'es' : ''} found`;
        const output = matches.join('\n') + '\n' + footer;

        return truncateOutput(output, undefined, DEFAULT_MAX_OUTPUT_TOKENS);
      },
    });
  }

  return actions;
}

// =============================================================================
// HELPERS
// =============================================================================

async function listWorkspaceEntries(
  input: {
    filesystem: NonNullable<WorkspaceActionPackOptions['filesystem']>;
    rootPath: string;
    maxDepth: number;
    showHidden: boolean;
    dirsOnly: boolean;
    exclude: string[];
    extension?: string;
    pattern?: string;
  },
  currentDepth: number = 0,
): Promise<Array<{ name: string; path: string; isDirectory: boolean; size: number }>> {
  const entries = await input.filesystem.listDirectory(input.rootPath);
  const filteredEntries = entries.filter((entry) => {
    // Filter hidden
    if (!input.showHidden && entry.name.startsWith('.')) return false;

    // Filter dirs only
    if (input.dirsOnly && !entry.isDirectory) return false;

    // Filter by extension
    if (input.extension) {
      const ext = entry.name.split('.').pop();
      if (ext !== input.extension) return false;
    }

    // Filter by pattern
    if (input.pattern && !matchesPattern(entry.name, input.pattern)) return false;

    // Filter by exclude patterns
    for (const excludePattern of input.exclude) {
      if (entry.name === excludePattern || matchesPattern(entry.name, excludePattern)) {
        return false;
      }
    }

    return true;
  });

  const result: Array<{ name: string; path: string; isDirectory: boolean; size: number }> = [];

  for (const entry of filteredEntries) {
    result.push({
      name: entry.name,
      path: entry.path,
      isDirectory: entry.isDirectory,
      size: entry.size,
    });

    // Recurse if needed
    if (entry.isDirectory && currentDepth < input.maxDepth - 1) {
      const nestedEntries = await listWorkspaceEntries(
        {
          ...input,
          rootPath: entry.path,
        },
        currentDepth + 1,
      );
      result.push(...nestedEntries);
    }
  }

  return result;
}
