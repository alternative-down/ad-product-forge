import type { WorkspaceCommandRequest, WorkspaceCommandResult, WorkspaceGateway } from './workspace.js';
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
export declare class InMemoryWorkspaceCommandRecorder implements WorkspaceCommandRecorder {
    private readonly events;
    record(event: WorkspaceCommandEvent): Promise<void>;
    list(): WorkspaceCommandEvent[];
}
export type RecordingWorkspaceGatewayOptions = {
    base: WorkspaceGateway;
    recorder: WorkspaceCommandRecorder;
};
export declare class RecordingWorkspaceGateway implements WorkspaceGateway {
    private readonly base;
    private readonly recorder;
    constructor(options: RecordingWorkspaceGatewayOptions);
    execute(request: WorkspaceCommandRequest): Promise<WorkspaceCommandResult>;
}
