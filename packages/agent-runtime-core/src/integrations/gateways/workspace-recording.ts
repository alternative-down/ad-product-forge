import type {
  WorkspaceCommandRequest,
  WorkspaceCommandResult,
  WorkspaceGateway,
} from './workspace.js';

export type WorkspaceCommandEvent = {
  command: string;
  cwd?: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  recordedAt: string;
};

export interface WorkspaceCommandRecorder {
  record(event: WorkspaceCommandEvent): Promise<void> | void;
}

export class InMemoryWorkspaceCommandRecorder implements WorkspaceCommandRecorder {
  private readonly events: WorkspaceCommandEvent[] = [];

  async record(event: WorkspaceCommandEvent): Promise<void> {
    this.events.push(event);
  }

  list() {
    return [...this.events];
  }
}

export type RecordingWorkspaceGatewayOptions = {
  base: WorkspaceGateway;
  recorder: WorkspaceCommandRecorder;
};

export class RecordingWorkspaceGateway implements WorkspaceGateway {
  private readonly base: WorkspaceGateway;
  private readonly recorder: WorkspaceCommandRecorder;

  constructor(options: RecordingWorkspaceGatewayOptions) {
    this.base = options.base;
    this.recorder = options.recorder;
  }

  async execute(request: WorkspaceCommandRequest): Promise<WorkspaceCommandResult> {
    const startedAt = Date.now();
    const result = await this.base.execute(request);

    await this.recorder.record({
      command: request.command,
      cwd: request.cwd,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: Date.now() - startedAt,
      recordedAt: new Date().toISOString(),
    });

    return result;
  }
}
