import path from 'node:path';

import { Bash, type IFileSystem, ReadWriteFs } from 'just-bash';

import type {
  WorkspaceCommandRequest,
  WorkspaceCommandResult,
  WorkspaceGateway,
} from './workspace.js';

export type LocalBashWorkspaceGatewayOptions = {
  fs?: IFileSystem;
  root?: string;
};

export class LocalBashWorkspaceGateway implements WorkspaceGateway {
  private readonly bash: Bash;
  private readonly root: string | undefined;

  constructor(options: LocalBashWorkspaceGatewayOptions = {}) {
    const filesystem = options.fs ?? (options.root
      ? new ReadWriteFs({
        root: path.resolve(options.root),
      })
      : undefined);

    this.bash = new Bash({
      fs: filesystem,
    });
    this.root = options.root ? path.resolve(options.root) : undefined;
  }

  async execute(request: WorkspaceCommandRequest): Promise<WorkspaceCommandResult> {
    const timeoutController = request.timeoutMs ? new AbortController() : undefined;
    const timeout = request.timeoutMs
      ? setTimeout(() => timeoutController?.abort(), request.timeoutMs)
      : undefined;

    try {
      const result = await this.bash.exec(request.command, {
        cwd: this.resolveVirtualCwd(request.cwd),
        env: request.env,
        signal: timeoutController?.signal,
      });

      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error) {
      if (timeout) {
        clearTimeout(timeout);
      }

      const failed = error as Error & {
        code?: number | string;
        stdout?: string;
        stderr?: string;
        name?: string;
      };

      if (failed.name === 'AbortError') {
        return {
          exitCode: 124,
          stdout: failed.stdout ?? '',
          stderr: failed.stderr ?? 'Command timed out',
        };
      }

      return {
        exitCode: typeof failed.code === 'number' ? failed.code : 1,
        stdout: failed.stdout ?? '',
        stderr: failed.stderr ?? '',
      };
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private resolveVirtualCwd(cwd: string | undefined) {
    if (!cwd || !this.root) {
      return cwd;
    }

    const resolvedCwd = path.resolve(cwd);
    const relativeCwd = path.relative(this.root, resolvedCwd);

    if (relativeCwd.startsWith('..') || path.isAbsolute(relativeCwd)) {
      throw new Error(`Workspace cwd must stay within root: ${resolvedCwd}`);
    }

    if (!relativeCwd || relativeCwd === '.') {
      return '/';
    }

    return `/${relativeCwd.split(path.sep).join('/')}`;
  }
}
