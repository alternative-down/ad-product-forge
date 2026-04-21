import {
  McpSessionRegistry,
  SdkMcpGateway,
  type McpRuntimeActionOptions,
  type RuntimeActionDefinition,
} from 'agent-runtime-core/integrations';

import { forgeMcpServerSchema, type ForgeMcpServerConfig } from './contracts.js';
import { createTool, type Tool } from './tools.js';

export type ForgeMcpToolsetOptions = {
  servers: ForgeMcpServerConfig[];
  runtimeActionOptions?: Omit<McpRuntimeActionOptions, 'session'>;
};

export class ForgeMcpToolset {
  private readonly gateway = new SdkMcpGateway();
  private readonly sessions = new McpSessionRegistry({
    gateway: this.gateway,
  });
  private readonly servers: ForgeMcpServerConfig[];
  private readonly runtimeActionOptions: Omit<McpRuntimeActionOptions, 'session'>;

  constructor(options: ForgeMcpToolsetOptions) {
    this.servers = options.servers.map((server) => forgeMcpServerSchema.parse(server));
    this.runtimeActionOptions = options.runtimeActionOptions ?? {};
  }

  async createRuntimeActions(): Promise<Array<RuntimeActionDefinition<Record<string, unknown>, unknown>>> {
    const definitions = await Promise.all(this.servers.map((server) => {
      return this.sessions.getActionDefinitions(
        this.buildSessionKey(server),
        mapServerToTransport(server),
        this.runtimeActionOptions,
      );
    }));

    return definitions.flat();
  }

  async createTools(): Promise<Record<string, Tool<Record<string, unknown>, unknown>>> {
    const toolEntries = await Promise.all(this.servers.map(async (server) => {
      const session = await this.sessions.getSession(
        this.buildSessionKey(server),
        mapServerToTransport(server),
      );
      const tools = await session.listTools();

      return tools.map((tool) => [
        tool.name,
        createTool({
          id: tool.name,
          description: tool.description?.trim() || `Call MCP tool ${tool.name}.`,
          inputSchema: {
            parse(input: unknown) {
              return input as Record<string, unknown>;
            },
          },
          execute(input) {
            return session.callTool(tool.name, input);
          },
        }),
      ] as const);
    }));

    return Object.fromEntries(toolEntries.flat());
  }

  async dispose() {
    await this.sessions.disposeAll();
  }

  private buildSessionKey(server: ForgeMcpServerConfig) {
    return `${server.id}:${server.name}`;
  }
}

function mapServerToTransport(server: ForgeMcpServerConfig) {
  if (server.transport === 'stdio') {
    return {
      type: 'stdio' as const,
      command: server.command,
      args: server.args,
      env: server.env,
    };
  }

  return {
    type: 'streamable-http' as const,
    url: server.url,
    headers: server.headers,
  };
}
