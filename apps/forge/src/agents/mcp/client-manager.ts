import { MCPClient } from '@mastra/mcp';
import type { MastraMCPServerDefinition } from '@mastra/mcp';
import { getAgentMcpServers } from './store';

// Cache for MCP clients per agent
const agentMCPClients = new Map<string, InstanceType<typeof MCPClient>>();

/**
 * Get MCP tools for an agent by connecting to all configured MCP servers
 * 
 * @param agentId - The agent ID
 * @returns Record of tool name to tool definition
 */
export async function getMCPToolsForAgent(agentId: string): Promise<Record<string, unknown>> {
  try {
    // Get MCP server configs for this agent
    const mcpServers = await getAgentMcpServers(agentId);
    
    if (mcpServers.length === 0) {
      return {};
    }
    
    console.log(`[MCP] Found ${mcpServers.length} MCP server(s) for agent ${agentId}`);
    
    // Get or create MCP client for this agent
    let mcpClient = agentMCPClients.get(agentId);
    
    if (!mcpClient) {
      // Create server definitions from config
      // MCPClient uses server name as key, not id
      const serverDefs: Record<string, MastraMCPServerDefinition> = {};
      
      for (const { server } of mcpServers) {
        if (server.transport === 'stdio') {
          serverDefs[server.name] = {
            command: server.command || '',
            args: server.args ? JSON.parse(server.args) : [],
            env: server.envVars ? JSON.parse(server.envVars) : {},
          };
        } else if (server.transport === 'http_streamable') {
          serverDefs[server.name] = {
            url: new URL(server.url || 'http://localhost:3000/mcp'),
            requestInit: server.headers ? {
              headers: JSON.parse(server.headers),
            } : undefined,
          };
        }
      }
      
      mcpClient = new MCPClient({ servers: serverDefs });
      agentMCPClients.set(agentId, mcpClient);
    }
    
    // Get all tools from the client
    // Tools are automatically namespaced as "serverName_toolName"
    const tools = await mcpClient.listTools();
    
    console.log(`[MCP] Loaded ${Object.keys(tools).length} tool(s) for agent ${agentId}`);
    
    return tools;
  } catch (error) {
    console.warn(`[MCP] Failed to get tools for agent ${agentId}:`, error);
    return {};
  }
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
