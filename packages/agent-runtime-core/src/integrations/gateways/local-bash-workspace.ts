import { spawn } from 'node:child_process';
import path from 'node:path';

import type {
  WorkspaceCommandRequest,
  WorkspaceCommandResult,
  WorkspaceGateway,
} from './workspace.js';

export type LocalBashWorkspaceGatewayOptions = {
  root?: string;
  pathAliases?: string[];
  shellPath?: string;
  env?: Record<string, string>;
};

export class LocalBashWorkspaceGateway implements WorkspaceGateway {
  private readonly root: string | undefined;
  private readonly pathAliases: string[];
  private readonly shellPath: string;
  private readonly env: Record<string, string>;

  constructor(options: LocalBashWorkspaceGatewayOptions = {}) {
    this.root = options.root ? path.resolve(options.root) : undefined;
    this.pathAliases = (options.pathAliases ?? []).map((alias) => path.resolve(alias));
    this.shellPath = options.shellPath ?? '/bin/bash';
    this.env = options.env ?? {};
  }

  async execute(request: WorkspaceCommandRequest): Promise<WorkspaceCommandResult> {
    let cwd: string;

    try {
      cwd = this.resolveCwd(request.cwd);
    } catch (error) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
      };
    }

    const env = {
      PATH: process.env.PATH ?? '',
      ...this.env,
      ...(request.env ?? {}),
    };

    return new Promise<WorkspaceCommandResult>((resolve) => {
      const child = spawn(this.shellPath, ['-lc', request.command], {
        cwd,
        env,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let resolved = false;
      const timeout = request.timeoutMs
        ? setTimeout(() => {
          if (process.platform === 'win32') {
            child.kill('SIGTERM');
          } else {
            try {
              process.kill(-child.pid!, 'SIGTERM');
            } catch {
              child.kill('SIGTERM');
            }
          }
        }, request.timeoutMs)
        : undefined;

      child.stdout.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });
      child.on('error', (error) => {
        if (resolved) {
          return;
        }

        resolved = true;
        if (timeout) {
          clearTimeout(timeout);
        }

        resolve({
          exitCode: 1,
          stdout,
          stderr: stderr || error.message,
        });
      });
      child.on('close', (code, signal) => {
        if (resolved) {
          return;
        }

        resolved = true;
        if (timeout) {
          clearTimeout(timeout);
        }

        resolve({
          exitCode: signal ? 124 : (code ?? 1),
          stdout,
          stderr,
        });
      });
    });
  }

  private resolveCwd(cwd: string | undefined) {
    if (!cwd) {
      return this.root ?? process.cwd();
    }

    const resolvedCwd = path.isAbsolute(cwd)
      ? path.resolve(cwd)
      : path.resolve(this.root ?? process.cwd(), cwd);

    for (const aliasRoot of this.pathAliases) {
      if (isWithinRoot(aliasRoot, resolvedCwd)) {
        return resolvedCwd;
      }
    }

    if (!this.root) {
      return resolvedCwd;
    }

    if (!isWithinRoot(this.root, resolvedCwd)) {
      throw new Error(`Workspace cwd must stay within root: ${resolvedCwd}`);
    }

    return resolvedCwd;
  }
}

function isWithinRoot(root: string, targetPath: string) {
  const relativePath = path.relative(root, targetPath);

  return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}
