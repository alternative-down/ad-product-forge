import type { RuntimeActionDefinition } from '../../core/actions.js';

export type McpTransport =
  | {
    type: 'stdio';
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }
  | {
    type: 'streamable-http';
    url: string;
    headers?: Record<string, string>;
  };

export type McpJsonSchema =
  | boolean
  | {
    type?: string | string[];
    description?: string;
    enum?: unknown[];
    const?: unknown;
    properties?: Record<string, McpJsonSchema>;
    required?: string[];
    items?: McpJsonSchema;
    additionalProperties?: boolean | McpJsonSchema;
  };

export type McpToolDescriptor = {
  name: string;
  description?: string;
  inputSchema?: McpJsonSchema;
};

export interface McpSession {
  listTools(): Promise<McpToolDescriptor[]>;
  callTool(name: string, input: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}

export interface McpGateway {
  createSession(transport: McpTransport): Promise<McpSession>;
}

export type McpRuntimeActionOptions = {
  namePrefix?: string;
};

export type McpRuntimeActionFactory = {
  createActionDefinitions(
    session: McpSession,
    options?: McpRuntimeActionOptions,
  ): Promise<Array<RuntimeActionDefinition<Record<string, unknown>, unknown>>>;
};
