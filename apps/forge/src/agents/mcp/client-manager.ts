/**
 * MCP Client Manager
 * 
 * Manages connections to MCP servers for agents.
 * Uses @modelcontextprotocol/sdk for MCP protocol implementation.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Tool as MCPTool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { InternalCoreTool } from '@mastra/core/tools';
import type { JSONSchema7 } from 'json-schema';
import type { McpServerConfig } from '../../database/schema';
import { getAgentMcpServers } from './store';

interface ConnectionState {
  client: Client;
  transport: StdioClientTransport | StreamableHTTPClientTransport;
  tools: Map<string, MCPTool>;
  connected: boolean;
}

/**
 * Extract text content from MCP tool result
 */
function extractTextContent(result: CallToolResult): string {
  if (!result.content || result.content.length === 0) {
    return '';
  }
  
  const parts: string[] = [];
  for (const content of result.content) {
    if (content.type === 'text') {
      parts.push(content.text);
    } else if (content.type === 'image') {
      parts.push(`[Image: ${content.mimeType}]`);
    } else if (content.type === 'resource') {
      parts.push(`[Resource: ${content.resource?.mimeType || 'unknown'}]`);
    }
  }
  
  return parts.join('\n');
}

/**
 * MCP Client Manager - manages MCP server connections per agent
 */
export class MCPClientManager {
  private static instance: MCPClientManager;
  private connections: Map<string, Map<string, ConnectionState>> = new Map();

  private constructor() {}

  static getInstance(): MCPClientManager {
    if (!MCPClientManager.instance) {
      MCPClientManager.instance = new MCPClientManager();
    }
    return MCPClientManager.instance;
  }

  async connectToServer(
    agentId: string,
    serverConfig: McpServerConfig
  ): Promise<void> {
    const { id: serverId, transport, command, args, envVars, url, headers } = serverConfig;

    if (!this.connections.has(agentId)) {
      this.connections.set(agentId, new Map());
    }
    const agentConnections = this.connections.get(agentId)!;

    if (agentConnections.has(serverId)) {
      await this.disconnectFromServer(agentId, serverId);
    }

    let transportInstance: StdioClientTransport | StreamableHTTPClientTransport;

    if (transport === 'stdio') {
      if (!command) {
        throw new Error(`command is required for stdio transport`);
      }
      transportInstance = new StdioClientTransport({
        command,
        args: args ? JSON.parse(args) : [],
        env: envVars ? JSON.parse(envVars) : undefined,
      });
    } else {
      // http_streamable
      if (!url) {
        throw new Error(`URL is required for http_streamable transport`);
      }
      const opts: { requestInit?: RequestInit } = {};
      if (headers) {
        opts.requestInit = { headers: JSON.parse(headers) };
      }
      transportInstance = new StreamableHTTPClientTransport(
        new URL(url),
        opts
      );
    }

    const client = new Client({
      name: `forge-agent-${agentId}`,
      version: '1.0.0',
    }, {
      capabilities: {},
    });

    await client.connect(transportInstance as any);
    const { tools } = await client.listTools();
    const toolsMap = new Map<string, MCPTool>();
    for (const tool of tools) {
      toolsMap.set(tool.name, tool);
    }

    agentConnections.set(serverId, {
      client,
      transport: transportInstance,
      tools: toolsMap,
      connected: true,
    });
  }

  async disconnectFromServer(agentId: string, serverId: string): Promise<void> {
    const agentConnections = this.connections.get(agentId);
    if (!agentConnections) return;

    const state = agentConnections.get(serverId);
    if (!state) return;

    try {
      await state.client.close();
    } catch {
      // Ignore close errors
    }

    agentConnections.delete(serverId);
  }

  getAgentTools(agentId: string): InternalCoreTool[] {
    const agentConnections = this.connections.get(agentId);
    if (!agentConnections) return [];

    const tools: InternalCoreTool[] = [];

    for (const [serverId, state] of agentConnections.entries()) {
      if (!state.connected) continue;

      for (const [toolName, mcpTool] of state.tools.entries()) {
        const fullToolName = `${serverId}_${toolName}`;
        
        tools.push({
          id: fullToolName,
          name: fullToolName,
          description: mcpTool.description || `MCP tool from ${serverId}`,
          inputSchema: mcpTool.inputSchema as JSONSchema7,
          execute: async (params: Record<string, unknown>): Promise<string> => {
            try {
              const result = await this.executeTool(agentId, serverId, toolName, params);
              return extractTextContent(result);
            } catch (error) {
              return `Error: ${error instanceof Error ? error.message : String(error)}`;
            }
          },
        } as unknown as InternalCoreTool);
      }
    }

    return tools;
  }

  async executeTool(
    agentId: string,
    serverId: string,
    toolName: string,
    params: Record<string, unknown>
  ): Promise<CallToolResult> {
    const agentConnections = this.connections.get(agentId);
    if (!agentConnections) {
      throw new Error(`No MCP connections for agent ${agentId}`);
    }

    const state = agentConnections.get(serverId);
    if (!state) {
      throw new Error(`No connection to MCP server ${serverId} for agent ${agentId}`);
    }

    const result = await state.client.callTool({ name: toolName, arguments: params });
    return result as CallToolResult;
  }

  async reloadAgentConnections(agentId: string): Promise<void> {
    const agentConnections = this.connections.get(agentId);
    if (agentConnections) {
      for (const serverId of agentConnections.keys()) {
        await this.disconnectFromServer(agentId, serverId);
      }
    }

    const servers = await getAgentMcpServers(agentId);
    for (const { server } of servers) {
      await this.connectToServer(agentId, server);
    }
  }

  hasActiveConnections(agentId: string): boolean {
    const agentConnections = this.connections.get(agentId);
    if (!agentConnections) return false;

    for (const state of agentConnections.values()) {
      if (state.connected) return true;
    }
    return false;
  }

  async cleanupAgent(agentId: string): Promise<void> {
    const agentConnections = this.connections.get(agentId);
    if (!agentConnections) return;

    for (const serverId of agentConnections.keys()) {
      await this.disconnectFromServer(agentId, serverId);
    }

    this.connections.delete(agentId);
  }
}

export const getMCPClientManager = () => MCPClientManager.getInstance();
