import { ForgeMcpToolset, type ForgeMcpServerConfig, type Tool } from '@forge-runtime/core';
import { getAgentMcpServers } from './store';

// Cache for MCP clients per agent
const agentMCPClients = new Map<string, ForgeMcpToolset>();

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
        const tools = await cachedClient.createTools();
        console.log(`[MCP] Loaded ${Object.keys(tools).length} tool(s) for agent ${agentId}`);
        return tools as Record<string, Tool<unknown, unknown>>;
      } catch (error) {
        console.warn(`[MCP] Cached client failed for agent ${agentId}, rebuilding client:`, error);
        await clearAgentMCPClient(agentId);
      }
    }

    const mcpClient = createAgentMCPClient(agentId, mcpServers);
    const tools = await mcpClient.createTools();

    agentMCPClients.set(agentId, mcpClient);
    console.log(`[MCP] Loaded ${Object.keys(tools).length} tool(s) for agent ${agentId}`);
    return tools as Record<string, Tool<unknown, unknown>>;
  } catch (error) {
    await clearAgentMCPClient(agentId);
    console.warn(`[MCP] Failed to get tools for agent ${agentId}:`, error);
    return {};
  }
}

function createAgentMCPClient(
  agentId: string,
  mcpServers: Awaited<ReturnType<typeof getAgentMcpServers>>,
) {
  return new ForgeMcpToolset({
    servers: mcpServers.map(({ server }) => mapServerConfig(server)),
  });
}

/**
 * Clear MCP client cache for an agent
 */
export async function clearAgentMCPClient(agentId: string): Promise<void> {
  const client = agentMCPClients.get(agentId);
  if (client) {
    await client.dispose();
    agentMCPClients.delete(agentId);
  }
}

function mapServerConfig(
  server: Awaited<ReturnType<typeof getAgentMcpServers>>[number]['server'],
): ForgeMcpServerConfig {
  if (server.transport === 'stdio') {
    return {
      id: server.id,
      name: server.name,
      transport: 'stdio',
      command: server.command || '',
      args: server.args ? JSON.parse(server.args) : [],
      env: server.envVars ? JSON.parse(server.envVars) : {},
    };
  }

  return {
    id: server.id,
    name: server.name,
    transport: 'http-stream',
    url: server.url || 'http://localhost:3000/mcp',
    headers: server.headers ? JSON.parse(server.headers) : undefined,
  };
}
