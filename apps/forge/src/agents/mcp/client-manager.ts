import { MCPClient } from '@mastra/mcp';
import type { MastraMCPServerDefinition } from '@mastra/mcp';
import type { Tool } from '@mastra/core/tools';
import { getAgentMcpServers } from './store';

// Cache for MCP clients per agent
const agentMCPClients = new Map<string, InstanceType<typeof MCPClient>>();

/**
 * Get MCP tools for an agent by connecting to all configured MCP servers
 * 
 * @param agentId - The agent ID
 * @returns Record of tool name to tool definition
 */
export async function getMCPToolsForAgent(
  agentId: string,
): Promise<Record<string, Tool<unknown, unknown>>> {
  try {
    const mcpServers = await getAgentMcpServers(agentId);

    if (mcpServers.length === 0) {
      return {};
    }

    console.log(`[MCP] Found ${mcpServers.length} MCP server(s) for agent ${agentId}`);

    const cachedClient = agentMCPClients.get(agentId);

    if (cachedClient) {
      try {
        const tools = await cachedClient.listTools();
        console.log(`[MCP] Loaded ${Object.keys(tools).length} tool(s) for agent ${agentId}`);
        return tools;
      } catch (error) {
        console.warn(`[MCP] Cached client failed for agent ${agentId}, rebuilding client:`, error);
        clearAgentMCPClient(agentId);
      }
    }

    const mcpClient = createAgentMCPClient(agentId, mcpServers);
    const tools = await mcpClient.listTools();

    agentMCPClients.set(agentId, mcpClient);
    console.log(`[MCP] Loaded ${Object.keys(tools).length} tool(s) for agent ${agentId}`);
    return tools;
  } catch (error) {
    clearAgentMCPClient(agentId);
    console.warn(`[MCP] Failed to get tools for agent ${agentId}:`, error);
    return {};
  }
}

function createAgentMCPClient(
  agentId: string,
  mcpServers: Awaited<ReturnType<typeof getAgentMcpServers>>,
) {
  const serverDefs: Record<string, MastraMCPServerDefinition> = {};
  const serverIds: string[] = [];

  for (const { server } of mcpServers) {
    serverIds.push(server.id);

    if (server.transport === 'stdio') {
      serverDefs[server.name] = {
        command: server.command || '',
        args: server.args ? JSON.parse(server.args) : [],
        env: server.envVars ? JSON.parse(server.envVars) : {},
      };
      continue;
    }

    if (server.transport === 'http_streamable') {
      serverDefs[server.name] = {
        url: new URL(server.url || 'http://localhost:3000/mcp'),
        requestInit: server.headers
          ? {
              headers: JSON.parse(server.headers),
            }
          : undefined,
      };
    }
  }

  serverIds.sort();

  return new MCPClient({
    id: `forge-agent:${agentId}:${serverIds.join(',')}`,
    servers: serverDefs,
  });
}

/**
 * Clear MCP client cache for an agent
 */
export function clearAgentMCPClient(agentId: string): void {
  const client = agentMCPClients.get(agentId);
  if (client) {
    client.disconnect();
    agentMCPClients.delete(agentId);
  }
}
