import type { AgentDetail } from '@/lib/admin-api';

export type McpForm = {
  configId?: string;
  serverId?: string;
  name: string;
  description: string;
  transport: 'stdio' | 'http_streamable';
  command: string;
  argsText: string;
  envVarsText: string;
  url: string;
  headersText: string;
  isActive: boolean;
};

export function createEmptyMcpForm(): McpForm {
  return {
    name: '',
    description: '',
    transport: 'stdio',
    command: '',
    argsText: '',
    envVarsText: '',
    url: '',
    headersText: '',
    isActive: true,
  };
}

export function createMcpForm(server: AgentDetail['mcpServers'][number]): McpForm {
  return {
    configId: server.configId,
    serverId: server.serverId,
    name: server.name,
    description: server.description ?? '',
    transport: server.transport,
    command: server.command,
    argsText: server.argsText,
    envVarsText: server.envVarsText,
    url: server.url,
    headersText: server.headersText,
    isActive: server.isActive,
  };
}
