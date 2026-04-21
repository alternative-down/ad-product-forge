import type {
  WorkspaceCommandRequest,
  WorkspaceCommandResult,
  WorkspaceGateway,
} from './workspace.js';

export type ConfiguredWorkspaceGatewayOptions = {
  base: WorkspaceGateway;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
};

export class ConfiguredWorkspaceGateway implements WorkspaceGateway {
  private readonly base: WorkspaceGateway;
  private readonly cwd: string | undefined;
  private readonly env: Record<string, string>;
  private readonly timeoutMs: number | undefined;

  constructor(options: ConfiguredWorkspaceGatewayOptions) {
    this.base = options.base;
    this.cwd = options.cwd;
    this.env = options.env ?? {};
    this.timeoutMs = options.timeoutMs;
  }

  async execute(request: WorkspaceCommandRequest): Promise<WorkspaceCommandResult> {
    return this.base.execute({
      ...request,
      cwd: request.cwd ?? this.cwd,
      env: {
        ...this.env,
        ...(request.env ?? {}),
      },
      timeoutMs: request.timeoutMs ?? this.timeoutMs,
    });
  }
}
