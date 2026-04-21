import type { WorkspaceCommandEvent, WorkspaceCommandRecorder } from '../gateways/workspace-recording.js';
export type FilesystemWorkspaceCommandRecorderOptions = {
    basePath: string;
};
export declare class FilesystemWorkspaceCommandRecorder implements WorkspaceCommandRecorder {
    private readonly basePath;
    constructor(options: FilesystemWorkspaceCommandRecorderOptions);
    record(event: WorkspaceCommandEvent): Promise<void>;
    list(): Promise<WorkspaceCommandEvent[]>;
    private writeEvents;
    private getFilePath;
}
