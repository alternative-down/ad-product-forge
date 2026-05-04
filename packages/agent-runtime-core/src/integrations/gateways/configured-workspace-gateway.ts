import type {
  WorkspaceBackgroundCommandRequest,
  WorkspaceBackgroundCommandResult,
  WorkspaceCommandRequest,
  WorkspaceCommandResult,
  WorkspaceGateway,
  WorkspaceProcessOutputRequest,
  WorkspaceProcessOutputResult,
} from './workspace.js';

export type ConfiguredWorkspaceGatewayOptions = {
  base: WorkspaceGateway;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  /** Root workspace path — used to normalize paths and provide workspace isolation info */
  workspaceRoot?: string;
};

export class ConfiguredWorkspaceGateway implements WorkspaceGateway {
  private readonly base: WorkspaceGateway;
  private readonly cwd: string | undefined;
  private readonly env: Record<string, string>;
  private readonly timeoutMs: number | undefined;
  readonly workspaceRoot: string | undefined;

  constructor(options: ConfiguredWorkspaceGatewayOptions) {
    this.base = options.base;
    this.cwd = options.cwd;
    this.env = options.env ?? {};
    this.timeoutMs = options.timeoutMs;
    this.workspaceRoot = options.workspaceRoot;
  }

  private buildEnv(requestEnv?: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = {
      ...this.env,
      ...(requestEnv ?? {}),
    };
    // Override HOME to point to the workspace root, preventing access to host home
    if (this.workspaceRoot) {
      env.HOME = this.workspaceRoot;
    }
    return env;
  }

  async execute(request: WorkspaceCommandRequest): Promise<WorkspaceCommandResult> {
    return this.base.execute({
      ...request,
      cwd: request.cwd ?? this.cwd,
      env: this.buildEnv(request.env),
      timeoutMs: request.timeoutMs ?? this.timeoutMs,
    });
  }

  async startBackground(request: WorkspaceBackgroundCommandRequest): Promise<WorkspaceBackgroundCommandResult> {
    if (!this.base.startBackground) {
      throw new Error('Workspace gateway does not support background processes');
    }

    return this.base.startBackground({
      ...request,
      cwd: request.cwd ?? this.cwd,
      env: this.buildEnv(request.env),
      timeoutMs: request.timeoutMs ?? this.timeoutMs,
    });
  }

  async getProcessOutput(request: WorkspaceProcessOutputRequest): Promise<WorkspaceProcessOutputResult> {
    if (!this.base.getProcessOutput) {
      throw new Error('Workspace gateway does not support process output inspection');
    }

    return this.base.getProcessOutput(request);
  }

  async killProcess(pid: string): Promise<WorkspaceProcessOutputResult | null> {
    if (!this.base.killProcess) {
      throw new Error('Workspace gateway does not support background process termination');
    }

    return this.base.killProcess(pid);
  }
}