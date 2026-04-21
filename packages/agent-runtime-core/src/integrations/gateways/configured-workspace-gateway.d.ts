import type { WorkspaceCommandRequest, WorkspaceCommandResult, WorkspaceGateway } from './workspace.js';
export type ConfiguredWorkspaceGatewayOptions = {
    base: WorkspaceGateway;
    cwd?: string;
    env?: Record<string, string>;
    timeoutMs?: number;
};
export declare class ConfiguredWorkspaceGateway implements WorkspaceGateway {
    private readonly base;
    private readonly cwd;
    private readonly env;
    private readonly timeoutMs;
    constructor(options: ConfiguredWorkspaceGatewayOptions);
    execute(request: WorkspaceCommandRequest): Promise<WorkspaceCommandResult>;
}
