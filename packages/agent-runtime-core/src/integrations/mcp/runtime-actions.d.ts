import type { RuntimeActionDefinition } from '../../core/actions.js';
import type { McpRuntimeActionOptions, McpSession } from './contracts.js';
export declare function createMcpActionDefinitions(session: McpSession, options?: McpRuntimeActionOptions): Promise<Array<RuntimeActionDefinition<Record<string, unknown>, unknown>>>;
