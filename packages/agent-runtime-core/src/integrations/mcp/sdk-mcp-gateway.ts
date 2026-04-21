import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import type { McpGateway, McpJsonSchema, McpSession, McpToolDescriptor, McpTransport } from './contracts.js';

export type SdkMcpGatewayOptions = {
  clientName?: string;
  clientVersion?: string;
};

export class SdkMcpGateway implements McpGateway {
  private readonly clientName: string;
  private readonly clientVersion: string;

  constructor(options: SdkMcpGatewayOptions = {}) {
    this.clientName = options.clientName ?? 'agent-runtime-core';
    this.clientVersion = options.clientVersion ?? '0.0.0';
  }

  async createSession(transport: McpTransport): Promise<McpSession> {
    const client = new Client({
      name: this.clientName,
      version: this.clientVersion,
    });
    const sdkTransport = createSdkTransport(transport);

    await client.connect(sdkTransport);

    return {
      listTools: async () => {
        const result = await client.listTools();

        return result.tools.map((tool: {
          name: string;
          description?: string;
          inputSchema?: unknown;
        }) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema as McpJsonSchema | undefined,
        }) satisfies McpToolDescriptor);
      },
      async callTool(name, input) {
        const result = await client.callTool({
          name,
          arguments: input,
        });

        return result;
      },
      async close() {
        await sdkTransport.close();
      },
    };
  }
}

function createSdkTransport(transport: McpTransport) {
  if (transport.type === 'stdio') {
    return new StdioClientTransport({
      command: transport.command,
      args: transport.args ?? [],
      env: transport.env,
    });
  }

  return new StreamableHTTPClientTransport(new URL(transport.url), {
    requestInit: transport.headers
      ? {
        headers: transport.headers,
      }
      : undefined,
  });
}
