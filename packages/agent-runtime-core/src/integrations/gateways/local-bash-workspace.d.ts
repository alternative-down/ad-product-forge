import type { WorkspaceCommandRequest, WorkspaceCommandResult, WorkspaceGateway } from './workspace.js';
export declare class LocalBashWorkspaceGateway implements WorkspaceGateway {
    execute(request: WorkspaceCommandRequest): Promise<WorkspaceCommandResult>;
}
