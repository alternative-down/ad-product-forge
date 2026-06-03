import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

import type {
  WorkspaceBackgroundCommandRequest,
  WorkspaceBackgroundCommandResult,
  WorkspaceCommandRequest,
  WorkspaceCommandResult,
  WorkspaceGateway,
  WorkspaceProcessOutputRequest,
  WorkspaceProcessOutputResult,
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
  private readonly backgroundProcesses = new Map<string, BackgroundProcessState>();

  constructor(options: LocalBashWorkspaceGatewayOptions = {}) {
    this.root = options.root != null ? path.resolve(options.root) : undefined;
    this.pathAliases = (options.pathAliases ?? []).map((alias) => path.resolve(alias));
    this.shellPath = options.shellPath ?? '/bin/bash';
    this.env = options.env ?? {};
  }

  async execute(request: WorkspaceCommandRequest): Promise<WorkspaceCommandResult> {
    const resolved = this.resolveRequest(request);

    if (resolved.error) {
      return resolved.error;
    }

    return this.waitForProcess(
      this.spawnProcess({
        command: request.command,
        cwd: resolved.cwd,
        env: resolved.env,
        timeoutMs: request.timeoutMs,
      }),
    );
  }

  async startBackground(
    request: WorkspaceBackgroundCommandRequest,
  ): Promise<WorkspaceBackgroundCommandResult> {
    const resolved = this.resolveRequest(request);

    if (resolved.error) {
      throw new Error(resolved.error.stderr);
    }

    const processState = this.spawnProcess({
      command: request.command,
      cwd: resolved.cwd,
      env: resolved.env,
      timeoutMs: request.timeoutMs,
    });

    this.backgroundProcesses.set(processState.pid, processState);

    return {
      pid: processState.pid,
    };
  }

  async getProcessOutput(
    request: WorkspaceProcessOutputRequest,
  ): Promise<WorkspaceProcessOutputResult> {
    const processState = this.backgroundProcesses.get(request.pid);

    if (!processState) {
      return {
        pid: request.pid,
        running: false,
        exitCode: null,
        stdout: '',
        stderr: '',
      };
    }

    if (request.wait === true && processState.exitCode === null) {
      await processState.completion;
    }

    return {
      pid: processState.pid,
      running: processState.exitCode === null,
      exitCode: processState.exitCode,
      stdout: applyTail(processState.stdout, request.tail),
      stderr: applyTail(processState.stderr, request.tail),
    };
  }

  async killProcess(pid: string): Promise<WorkspaceProcessOutputResult | null> {
    const processState = this.backgroundProcesses.get(pid);

    if (!processState) {
      return null;
    }

    this.killChild(processState.child);
    await processState.completion;

    return {
      pid: processState.pid,
      running: false,
      exitCode: processState.exitCode,
      stdout: processState.stdout,
      stderr: processState.stderr,
    };
  }

  private resolveRequest(request: WorkspaceCommandRequest):
    | {
        cwd: string;
        env: Record<string, string>;
        error?: undefined;
      }
    | {
        cwd?: undefined;
        env?: undefined;
        error: WorkspaceCommandResult;
      } {
    let cwd: string;

    try {
      cwd = this.resolveCwd(request.cwd);
    } catch (error) {
      return {
        error: {
          exitCode: 1,
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
        },
      };
    }

    return {
      cwd,
      env: {
        ...buildBaseProcessEnv(this.shellPath),
        ...this.env,
        ...(request.env ?? {}),
      },
    };
  }

  private spawnProcess(input: {
    command: string;
    cwd: string;
    env: Record<string, string>;
    timeoutMs?: number;
  }) {
    const child = spawn(this.shellPath, ['-lc', input.command], {
      cwd: input.cwd,
      env: input.env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const pid = String(child.pid ?? randomProcessId());
    const processState: BackgroundProcessState = {
      pid,
      child,
      stdout: '',
      stderr: '',
      exitCode: null,
      completion: Promise.resolve(),
    };
    const timeout = input.timeoutMs != null
      ? setTimeout(() => {
          this.killChild(child);
        }, input.timeoutMs)
      : undefined;

    child.stdout!.on('data', (chunk: Buffer | string) => {
      processState.stdout += chunk.toString();
    });
    child.stderr!.on('data', (chunk: Buffer | string) => {
      processState.stderr += chunk.toString();
    });
    processState.completion = new Promise<void>((resolve) => {
      child.on('error', (error) => {
        if (timeout) {
          clearTimeout(timeout);
        }

        processState.exitCode = 1;
        if (!processState.stderr) {
          processState.stderr = error.message;
        }
        this.backgroundProcesses.delete(pid);
        resolve();
      });
      child.on('close', (code, signal) => {
        if (timeout) {
          clearTimeout(timeout);
        }

        processState.exitCode = signal ? 124 : (code ?? 1);
        this.backgroundProcesses.delete(pid);
        resolve();
      });
    });

    return processState;
  }

  private async waitForProcess(
    processState: BackgroundProcessState,
  ): Promise<WorkspaceCommandResult> {
    await processState.completion;

    return {
      exitCode: processState.exitCode ?? 1,
      stdout: processState.stdout,
      stderr: processState.stderr,
    };
  }

  private killChild(child: ChildProcess) {
    if (process.platform === 'win32') {
      child.kill('SIGTERM');
      return;
    }

    try {
      process.kill(-child.pid!, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }

  private resolveCwd(cwd: string | undefined) {
    if (cwd == null) {
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

    if (this.root == null) {
      return resolvedCwd;
    }

    if (!isWithinRoot(this.root, resolvedCwd)) {
      throw new Error(`Workspace cwd must stay within root: ${resolvedCwd}`);
    }

    return resolvedCwd;
  }
}

function buildBaseProcessEnv(shellPath: string) {
  return Object.fromEntries(
    Object.entries({
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME,
      USER: process.env.USER,
      LOGNAME: process.env.LOGNAME,
      SHELL: process.env.SHELL ?? shellPath,
      LANG: process.env.LANG,
      TMPDIR: process.env.TMPDIR,
      TERM: process.env.TERM,
    }).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0,
    ),
  );
}

type BackgroundProcessState = {
  pid: string;
  child: ChildProcess;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  completion: Promise<void>;
};

function applyTail(output: string, tail: number | undefined) {
  if (tail === undefined || tail === 0) {
    return output;
  }

  const lines = output.split('\n');
  return lines.slice(-Math.abs(tail)).join('\n');
}

function randomProcessId() {
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}

function isWithinRoot(root: string, targetPath: string) {
  const relativePath = path.relative(root, targetPath);

  return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}
