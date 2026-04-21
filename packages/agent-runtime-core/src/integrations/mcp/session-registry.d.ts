import type { RuntimeActionDefinition } from '../../core/actions.js';
import type { McpGateway, McpRuntimeActionOptions, McpSession, McpTransport } from './contracts.js';
export type McpSessionRegistryOptions = {
    gateway: McpGateway;
};
export declare class McpSessionRegistry {
    private readonly gateway;
    private readonly sessions;
    constructor(options: McpSessionRegistryOptions);
    getSession(key: string, transport: McpTransport): Promise<McpSession>;
    getActionDefinitions(key: string, transport: McpTransport, options?: McpRuntimeActionOptions): Promise<Array<RuntimeActionDefinition<Record<string, unknown>, unknown>>>;
    disposeSession(key: string): Promise<void>;
    disposeAll(): Promise<void>;
}
