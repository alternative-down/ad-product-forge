export type WorkspaceCommandRequest = {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export type WorkspaceCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type WorkspaceBackgroundCommandRequest = WorkspaceCommandRequest;

export type WorkspaceBackgroundCommandResult = {
  pid: string;
};

export type WorkspaceProcessOutputRequest = {
  pid: string;
  tail?: number;
  wait?: boolean;
};

export type WorkspaceProcessOutputResult = {
  pid: string;
  running: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

export interface WorkspaceGateway {
  execute(request: WorkspaceCommandRequest): Promise<WorkspaceCommandResult>;
  startBackground?(request: WorkspaceBackgroundCommandRequest): Promise<WorkspaceBackgroundCommandResult>;
  getProcessOutput?(request: WorkspaceProcessOutputRequest): Promise<WorkspaceProcessOutputResult>;
  killProcess?(pid: string): Promise<WorkspaceProcessOutputResult | null>;
}
