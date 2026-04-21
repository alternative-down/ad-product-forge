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
export interface WorkspaceGateway {
    execute(request: WorkspaceCommandRequest): Promise<WorkspaceCommandResult>;
}
