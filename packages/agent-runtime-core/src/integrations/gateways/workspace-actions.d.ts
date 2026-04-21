import type { RuntimeActionDefinition } from '../../core/actions.js';
import type { WorkspaceGateway } from './workspace.js';
export type WorkspaceActionPackOptions = {
    name?: string;
    description?: string;
};
export declare function createWorkspaceActionDefinitions(gateway: WorkspaceGateway, options?: WorkspaceActionPackOptions): Array<RuntimeActionDefinition<Record<string, unknown>, unknown>>;
