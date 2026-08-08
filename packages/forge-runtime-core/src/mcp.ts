import { z } from 'zod';
import {
  McpSessionRegistry,
  SdkMcpGateway,
  type McpRuntimeActionOptions,
  type RuntimeActionDefinition,
} from 'agent-runtime-core/integrations';

import { forgeDebug } from './debug.js';
import { errorMsg } from './error-formatting.js';
import { forgeMcpServerSchema, type ForgeMcpServerConfig } from './contracts.js';
import { createTool, type Tool } from './tools.js';

export type ForgeMcpToolsetOptions = {
  servers: ForgeMcpServerConfig[];
  runtimeActionOptions?: Omit<McpRuntimeActionOptions, 'session'>;
};

export class ForgeMcpToolset {
  private readonly gateway = new SdkMcpGateway();
  // The gateway is a stateless factory: each session owns its own SDK transport,
  // and sessions.disposeAll() cascades to session.close() which closes the
  // transport. The gateway itself holds no resources (no timers, no clients),
  // so it does not require an explicit dispose. See #6309 Finding 3.
  private readonly sessions = new McpSessionRegistry({
    gateway: this.gateway,
  });
  private readonly servers: ForgeMcpServerConfig[];
  private readonly runtimeActionOptions: Omit<McpRuntimeActionOptions, 'session'>;

  constructor(options: ForgeMcpToolsetOptions) {
    this.servers = options.servers.map((server) => forgeMcpServerSchema.parse(server));
    this.runtimeActionOptions = options.runtimeActionOptions ?? {};
  }

  async createRuntimeActions(): Promise<
    Array<RuntimeActionDefinition<Record<string, unknown>, unknown>>
  > {
    const definitions = await Promise.all(
      this.servers.map((server) => {
        return this.sessions.getActionDefinitions(
          this.buildSessionKey(server),
          mapServerToTransport(server),
          this.runtimeActionOptions,
        );
      }),
    );

    return definitions.flat();
  }

  async createTools(): Promise<Record<string, Tool<Record<string, unknown>, unknown>>> {
    const toolEntries = await Promise.all(
      this.servers.map(async (server) => {
        const session = await this.getSessionWithLogging(server);
        const tools = await this.listToolsWithLogging(session, server);

        return tools.map(
          (tool) =>
            [
              tool.name,
              createTool({
                id: tool.name,
                description: tool.description?.trim() ?? `Call MCP tool ${tool.name}.`,
                inputSchema: z.object({}).passthrough(),
                execute: (input: Record<string, unknown>) =>
                  this.callToolWithLogging(session, tool.name, input, server),
              }),
            ] as const,
        );
      }),
    );

    return Object.fromEntries(toolEntries.flat());
  }

  async dispose() {
    await this.sessions.disposeAll();
  }

  private buildSessionKey(server: ForgeMcpServerConfig) {
    return `${server.id}:${server.name}`;
  }

  private async getSessionWithLogging(server: ForgeMcpServerConfig) {
    try {
      return await this.sessions.getSession(
        this.buildSessionKey(server),
        mapServerToTransport(server),
      );
    } catch (err) {
      forgeDebug({
        scope: 'mcp-toolset',
        level: 'error',
        message: `getSession failed for ${server.name}`,
        serverId: server.id,
        serverName: server.name,
        error: errorMsg(err),
      });
      throw err;
    }
  }

  private async listToolsWithLogging(
    session: Awaited<ReturnType<typeof this.sessions.getSession>>,
    server: ForgeMcpServerConfig,
  ) {
    try {
      return await session.listTools();
    } catch (err) {
      forgeDebug({
        scope: 'mcp-toolset',
        level: 'error',
        message: `listTools failed for ${server.name}`,
        serverId: server.id,
        serverName: server.name,
        error: errorMsg(err),
      });
      throw err;
    }
  }

  private async callToolWithLogging(
    session: Awaited<ReturnType<typeof this.sessions.getSession>>,
    toolName: string,
    input: Record<string, unknown>,
    server: ForgeMcpServerConfig,
  ) {
    try {
      return await session.callTool(toolName, input);
    } catch (err) {
      forgeDebug({
        scope: 'mcp-toolset',
        level: 'error',
        message: `callTool ${toolName} failed for ${server.name}`,
        serverId: server.id,
        serverName: server.name,
        toolName,
        inputKeys: Object.keys(input),
        error: errorMsg(err),
      });
      throw err;
    }
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
